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
  /**
   * Il workspace dove quella conversazione e' gia' salvata.
   *
   * Assente per una chat nuova, che nasce dove sei. Quando c'e', e' li' che il
   * lavoro deve andare: aprirne una seconda copia nel workspace che hai davanti
   * lascia due chat per la stessa conversazione, e quella con dentro il lavoro
   * in un posto che non stai guardando.
   */
  workspace?: string
}

/** Quanto spesso si passa a ritirare quando c'è lavoro: reattivo. */
export const ATTESA_RITIRO_MS = 1500
/**
 * Il tetto a cui si rallenta quando non c'è niente da ritirare.
 *
 * A vuoto — nessun autopilota, o tutti fermi — ritirare ogni 1,5s è un
 * round-trip HTTP che tiene svegli main e servizio 40 volte al minuto per
 * sentirsi dire «niente». Si rallenta piano fino a questo tetto e si torna
 * istantaneamente a 1,5s appena arriva una consegna: la reattività si paga solo
 * quando serve, e il primo ritiro dopo un periodo di quiete attende al più tanto.
 */
export const ATTESA_RITIRO_MAX_MS = 6000

/**
 * La consegna, con dentro il workspace dove deve andare.
 *
 * Due sorgenti, e l'ordine conta.
 *
 * 1. **Quella dell'autopilota**, che se la porta dalla nascita. È una
 *    decisione: chi lo ha avviato sapeva da dove, e quel «da dove» resta vero
 *    anche fra tre ore, quando starà guardando un altro workspace.
 * 2. **Dove la chat è già salvata**, cercandone la sessione. È un ripiego, e
 *    per gli autopiloti nati prima di questo campo è l'unica cosa che c'è.
 *
 * La deduzione da sola non bastava, ed è il difetto che tre rilasci non hanno
 * chiuso: per una chat che deve **nascere** quella sessione non è in nessun
 * layout, la ricerca torna a vuoto, e la conversazione compare nel workspace
 * che hai davanti — mentre l'autopilota lavora sotto gli occhi di chi stava
 * facendo altro.
 *
 * `cerca` non viene chiamata quando la decisione c'è già: legge il file dei
 * workspace, e questo percorso passa ogni secondo e mezzo.
 */
export function versoIlSuoWorkspace(
  c: Consegna,
  cerca: (sessionId: string) => string | undefined
): Consegna {
  if (c.workspace !== undefined) return c
  const dedotto = cerca(c.sessionId)
  return dedotto === undefined ? c : { ...c, workspace: dedotto }
}

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
      testo: testo('testo'),
      ...(testo('workspace') !== '' ? { workspace: testo('workspace') } : {})
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
 * Quanti id di consegne già scritte si ricordano.
 *
 * Serve solo a non riscrivere due volte la stessa istruzione quando la conferma
 * si perde e il servizio riconsegna. Cento è molto più di quante ne possano
 * essere in volo insieme, e non cresce.
 */
export const RICORDATE_MAX = 100

/**
 * Passa a ritirare finché non gli si dice di smettere.
 *
 * Un giro che fallisce non ferma i successivi: il servizio può essere spento,
 * in avvio, o appena caduto, e sono tutti casi normali — l'unica risposta
 * sensata è riprovare fra un secondo e mezzo.
 *
 * ## Perché si conferma
 *
 * Il servizio non svuota più la coda quando si ritira: aspetta di sapere che
 * l'istruzione è stata scritta davvero. Prima bastava una risposta persa per
 * strada, o il Gestore chiuso un istante dopo, per cancellare un'istruzione —
 * e l'autopilota restava fermo ad aspettare la risposta a un messaggio che
 * nessuno aveva mai scritto.
 *
 * Il prezzo è che la stessa consegna può arrivare due volte. Per questo si
 * ricordano gli id già scritti: consegnare due volte dentro una chat è peggio
 * che consegnare zero volte — la chat lavorerebbe due volte sullo stesso
 * ordine, e l'autopilota si troverebbe due risposte a una domanda sola.
 */
export function avviaRitiro(p: {
  chiedi: () => Promise<unknown>
  /** Torna `false` se non è stato possibile consegnarla: non si conferma. */
  consegna: (c: Consegna) => boolean | void
  /** Dice al servizio quali sono arrivate. Senza, si torna al vecchio «ritira e spera». */
  conferma?: (ids: string[]) => Promise<void>
  attesaMs?: number
  attesaMaxMs?: number
}): () => void {
  let vivo = true
  const base = p.attesaMs ?? ATTESA_RITIRO_MS
  const max = Math.max(base, p.attesaMaxMs ?? ATTESA_RITIRO_MAX_MS)
  // Si parte reattivi; si rallenta solo dopo aver trovato il vuoto.
  let attesa = base
  const gia: string[] = []

  const giro = async (): Promise<void> => {
    while (vivo) {
      let ricevute = 0
      try {
        const arrivate: string[] = []
        for (const c of leggiConsegne(await p.chiedi())) {
          ricevute += 1
          // Già scritta: la conferma non era arrivata, l'istruzione sì. Si
          // riconferma e basta — riscriverla la farebbe eseguire due volte.
          if (gia.includes(c.id)) { arrivate.push(c.id); continue }
          if (p.consegna(c) === false) continue
          gia.push(c.id)
          if (gia.length > RICORDATE_MAX) gia.splice(0, gia.length - RICORDATE_MAX)
          arrivate.push(c.id)
        }
        // La conferma va **dopo** la consegna, mai prima: confermare per poi
        // non riuscire a scrivere è esattamente il difetto che si sta chiudendo.
        if (arrivate.length > 0) await p.conferma?.(arrivate)
      } catch {
        // Il servizio spento non è un guasto: è lo stato normale finché
        // nessuno ha creato un autopilota. Conta come «vuoto»: si rallenta.
      }
      // Con lavoro in arrivo si torna subito a 1,5s; a vuoto si sale piano fino
      // al tetto — così durante il lavoro vero non si perde un colpo, e a riposo
      // non si martella il servizio.
      attesa = ricevute > 0 ? base : Math.min(max, Math.round(attesa * 1.5))
      await new Promise((r) => setTimeout(r, attesa))
    }
  }
  void giro()

  return () => { vivo = false }
}
