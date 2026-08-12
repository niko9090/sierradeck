/**
 * Il Gestore va a ritirare quello che l'autopilota vuole far scrivere.
 *
 * L'autopilota non esegue più: coordina. Le istruzioni le mette in una coda nel
 * suo servizio, e da lì qualcuno deve portarle dentro una chat vera — quella
 * che si vede nel mosaico, dove il testo compare come se l'avessi digitato tu.
 * Quel qualcuno può essere solo il Gestore: è l'unico che ha le finestre.
 *
 * Il verso della comunicazione è obbligato. Il servizio è un processo a sé, e
 * fra i due c'è un server HTTP che il Gestore chiama e che non lo può chiamare
 * indietro. Quindi si passa a ritirare, spesso: un secondo e mezzo è
 * abbastanza da non farsi sentire in una conversazione dove ogni turno dura
 * minuti, e abbastanza poco da non far sembrare l'autopilota addormentato.
 */

export type Consegna = {
  id: string
  autopilotaId: string
  chatId: string
  cwd: string
  sessionId: string
  titolo: string
  cosa: 'scrivi' | 'interrompi'
  testo: string
}

/** Quanto spesso si passa a ritirare. */
export const ATTESA_RITIRO_MS = 1500

/**
 * Legge le consegne da un valore qualunque, senza mai sollevare.
 *
 * Il servizio è nostro, ma la risposta arriva da un altro processo attraverso
 * la rete: trattarla come sicura significherebbe che un giorno una risposta
 * malformata — un servizio vecchio rimasto vivo dopo un aggiornamento — farebbe
 * cadere il Gestore invece che una consegna.
 */
export function leggiConsegne(raw: unknown): Consegna[] {
  if (typeof raw !== 'object' || raw === null) return []
  const elenco = (raw as { consegne?: unknown }).consegne
  if (!Array.isArray(elenco)) return []
  const buone: Consegna[] = []
  for (const grezza of elenco) {
    if (typeof grezza !== 'object' || grezza === null) continue
    const c = grezza as Record<string, unknown>
    const testo = (nome: string): string => (typeof c[nome] === 'string' ? (c[nome] as string) : '')
    const cosa = c.cosa === 'interrompi' ? 'interrompi' : 'scrivi'
    const id = testo('id')
    const chatId = testo('chatId')
    const sessionId = testo('sessionId')
    if (id === '' || chatId === '' || sessionId === '') continue
    // Un'istruzione vuota farebbe premere invio dentro una chat senza dirle
    // niente: la chat ripartirebbe a vuoto e l'autopilota aspetterebbe una
    // risposta a una domanda che non ha fatto.
    if (cosa === 'scrivi' && testo('testo').trim() === '') continue
    buone.push({
      id,
      autopilotaId: testo('autopilotaId'),
      chatId,
      cwd: testo('cwd'),
      sessionId,
      titolo: testo('titolo'),
      cosa,
      testo: testo('testo')
    })
  }
  return buone
}

/**
 * A quale finestra tocca portare l'istruzione.
 *
 * Una sola, mai tutte: mandarla a ognuna vorrebbe dire che due finestre aprono
 * la stessa chat, o che la stessa istruzione viene scritta due volte dentro la
 * stessa conversazione — e l'autopilota si ritroverebbe due risposte a una
 * domanda sola, senza capire perché.
 *
 * Quella che ha già quella conversazione, se c'è: la chat è lì, e spostarla
 * altrove non serve a niente. Altrimenti la prima, che è dove comparirà.
 */
export function finestraPerConsegna(
  sessionId: string,
  chatPerFinestra: Map<number, { sessione?: string }[]>,
  vive: number[]
): number | undefined {
  for (const id of vive) {
    if ((chatPerFinestra.get(id) ?? []).some((c) => c.sessione === sessionId)) return id
  }
  return vive[0]
}

/**
 * Passa a ritirare finché non gli si dice di smettere.
 *
 * Un giro che fallisce non ferma i successivi: il servizio può essere spento,
 * in avvio, o appena caduto, e sono tutti casi normali — l'unica risposta
 * sensata è riprovare fra un secondo e mezzo.
 */
export function avviaRitiro(p: {
  chiedi: () => Promise<unknown>
  consegna: (c: Consegna) => void
  attesaMs?: number
}): () => void {
  let vivo = true
  const attesa = p.attesaMs ?? ATTESA_RITIRO_MS

  const giro = async (): Promise<void> => {
    while (vivo) {
      try {
        for (const c of leggiConsegne(await p.chiedi())) p.consegna(c)
      } catch {
        // Il servizio spento non è un guasto: è lo stato normale finché
        // nessuno ha creato un autopilota.
      }
      await new Promise((r) => setTimeout(r, attesa))
    }
  }
  void giro()

  return () => { vivo = false }
}
