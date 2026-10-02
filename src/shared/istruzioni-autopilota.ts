/**
 * Le **istruzioni** che l'autopilota ha consegnato alle sue chat (0.41.0).
 *
 * Nicholas (02/10): «quello che scrive l'autopilota in chat vorrei vederlo in
 * un tab qui sotto così da capire meglio come ragiona e vedere se ha scritto
 * cose sbagliate, visto che nella chat adesso vedo solo: Leggi ed esegui le
 * istruzioni in .sierradeck/consegne/c-5.md».
 *
 * Dalla 0.38.1 un'istruzione lunga va in un file della cartella della chat e
 * nella chat si digita una riga sola. I file si puliscono dopo sette giorni,
 * quindi il testo **intero** si salva nel servizio al momento della consegna,
 * con il perché della mossa e l'esito: è la linguetta «Istruzioni» (PC, pagina
 * e app).
 *
 * Qui le regole pure: la forma di un'istruzione, come si aggiungono, come si
 * segna l'esito, come si raccontano, la nota «Correggi».
 */

export type EsitoIstruzione = 'in-coda' | 'consegnata' | 'partita' | 'non-partita' | 'persa'

export type Istruzione = {
  /** Unico per sempre: l'id della consegna (`c-N`) si ripete dopo un riavvio del servizio. */
  id: string
  /** L'id della consegna nella coda del servizio, per segnare l'esito. */
  consegna: string
  autopilotaId: string
  /** Quando l'autopilota l'ha decisa, ISO. */
  quando: string
  /** La chat di destinazione: l'id della chat governata e il suo titolo. */
  chatId: string
  chatTitolo: string
  /** Il testo intero, com'è arrivato (o arriverà) alla chat: anche quando nella chat si vede solo la riga corta. */
  testo: string
  /** Il perché della mossa del supervisore, quando c'è. */
  perche?: string
  esito: EsitoIstruzione
  /** Quando è cambiato l'esito, ISO. */
  esitoIl?: string
  /** `interrompi` è una consegna senza testo: si mostra lo stesso, è una mossa. */
  cosa: 'scrivi' | 'interrompi'
}

/** Quante istruzioni si tengono per autopilota: le più vecchie escono. */
export const ISTRUZIONI_MAX = 200
/** Il testo di un'istruzione si tiene intero fino a questo tetto (un obiettivo può essere un documento). */
export const TESTO_ISTRUZIONE_MAX = 200_000

export function nuovaIstruzione(c: {
  consegna: string
  autopilotaId: string
  chatId: string
  titolo: string
  testo: string
  cosa: 'scrivi' | 'interrompi'
  perche?: string
}, adesso: string): Istruzione {
  return {
    id: `${c.consegna}@${adesso}`,
    consegna: c.consegna,
    autopilotaId: c.autopilotaId,
    quando: adesso,
    chatId: c.chatId,
    chatTitolo: c.titolo,
    testo: c.testo.slice(0, TESTO_ISTRUZIONE_MAX),
    ...(c.perche !== undefined && c.perche.trim() !== '' ? { perche: c.perche.trim() } : {}),
    esito: 'in-coda',
    cosa: c.cosa
  }
}

/** Aggiunge in fondo, tenendo le ultime `ISTRUZIONI_MAX`. */
export function aggiungiIstruzione(lista: Istruzione[], nuova: Istruzione, max = ISTRUZIONI_MAX): Istruzione[] {
  return [...lista, nuova].slice(-max)
}

const ORDINE_ESITI: EsitoIstruzione[] = ['in-coda', 'consegnata', 'non-partita', 'partita']

/**
 * Segna l'esito dell'ultima istruzione con quella consegna. Un esito non
 * torna indietro: una «partita» non ridiventa «consegnata» per una conferma
 * arrivata in ritardo. «persa» vale solo per chi non è mai arrivato.
 */
export function segnaEsito(lista: Istruzione[], consegna: string, esito: EsitoIstruzione, quando: string): Istruzione[] {
  let i = -1
  for (let k = lista.length - 1; k >= 0; k -= 1) if (lista[k]?.consegna === consegna) { i = k; break }
  if (i < 0) return lista
  const prima = lista[i] as Istruzione
  if (esito === 'persa' && prima.esito !== 'in-coda') return lista
  if (esito !== 'persa' && ORDINE_ESITI.indexOf(esito) <= ORDINE_ESITI.indexOf(prima.esito) && !(prima.esito === 'non-partita' && esito === 'partita')) return lista
  const copia = [...lista]
  copia[i] = { ...prima, esito, esitoIl: quando }
  return copia
}

/** Dalla più recente. */
export function istruzioniRecenti(lista: Istruzione[]): Istruzione[] {
  return [...lista].sort((a, b) => b.quando.localeCompare(a.quando))
}

/** L'esito in parole, per la linguetta. */
export function testoEsito(e: EsitoIstruzione): { breve: string; titolo: string; tono: 'ok' | 'attesa' | 'guasto' } {
  switch (e) {
    case 'partita': return { breve: 'partita', titolo: 'Scritta nella chat, e la chat si è messa al lavoro', tono: 'ok' }
    case 'consegnata': return { breve: 'consegnata', titolo: 'Scritta nella chat; che sia partita non risulta ancora', tono: 'ok' }
    case 'non-partita': return { breve: 'non partita', titolo: 'Scritta nella chat, ma la chat non si è messa al lavoro nemmeno dopo i tentativi automatici', tono: 'guasto' }
    case 'persa': return { breve: 'mai arrivata', titolo: 'Il programma non l’ha mai scritta nella chat: dopo cinque tentativi è stata lasciata andare', tono: 'guasto' }
    case 'in-coda':
    default: return { breve: 'in coda', titolo: 'Decisa, aspetta di essere scritta nella chat', tono: 'attesa' }
  }
}

/**
 * Dai passi che il PC scrive nel registro (0.38.2) all'esito: `consegna c-5:
 * partita` e `consegna c-5: non partita (…)`. Solo quelli finali; gli altri
 * passi (ritirata, invio…) non cambiano niente.
 */
export function esitoDaPasso(passo: string): { consegna: string; esito: 'partita' | 'non-partita' } | undefined {
  const m = /consegna (\S+): (partita|non partita)\b/.exec(passo)
  if (m === null || m[1] === undefined || m[1] === '') return undefined
  return { consegna: m[1], esito: m[2] === 'partita' ? 'partita' : 'non-partita' }
}

/**
 * La nota «Correggi» su una consegna: va nel dialogo con l'autopilota, come
 * qualunque cosa gli scrivi, ma dice **a quale istruzione** si riferisce, con
 * l'ora, la chat e l'inizio del testo, così lui sa cosa correggere.
 */
export function notaCorreggi(i: Pick<Istruzione, 'quando' | 'chatTitolo' | 'testo'>, nota: string): string {
  const d = new Date(i.quando)
  const ora = Number.isNaN(d.getTime()) ? i.quando : d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  const inizio = i.testo.replace(/\s+/g, ' ').trim()
  const breve = inizio.length > 160 ? `${inizio.slice(0, 160)}…` : inizio
  return `Correzione sull’istruzione che hai mandato alle ${ora} alla chat «${i.chatTitolo}» («${breve}»):\n\n${nota.trim()}`
}

/** Un elenco arrivato da fuori (il servizio, la rete): solo le voci con la forma giusta. */
export function leggiIstruzioni(x: unknown): Istruzione[] {
  const elenco = Array.isArray(x) ? x : Array.isArray((x as { istruzioni?: unknown } | undefined)?.istruzioni) ? (x as { istruzioni: unknown[] }).istruzioni : []
  const fuori: Istruzione[] = []
  for (const v of elenco) {
    if (typeof v !== 'object' || v === null) continue
    const o = v as Record<string, unknown>
    if (typeof o.id !== 'string' || typeof o.quando !== 'string' || typeof o.testo !== 'string') continue
    const esito = ['in-coda', 'consegnata', 'partita', 'non-partita', 'persa'].includes(String(o.esito)) ? o.esito as EsitoIstruzione : 'in-coda'
    fuori.push({
      id: o.id, consegna: String(o.consegna ?? ''), autopilotaId: String(o.autopilotaId ?? ''), quando: o.quando,
      chatId: String(o.chatId ?? ''), chatTitolo: String(o.chatTitolo ?? ''), testo: o.testo,
      ...(typeof o.perche === 'string' ? { perche: o.perche } : {}),
      esito, ...(typeof o.esitoIl === 'string' ? { esitoIl: o.esitoIl } : {}),
      cosa: o.cosa === 'interrompi' ? 'interrompi' : 'scrivi'
    })
  }
  return fuori
}

/** Quanto prima di un'istruzione può stare la decisione che la spiega. */
export const PERCHE_ENTRO_MS = 3 * 60_000

/**
 * Il perché di un'istruzione del supervisore: l'ultima decisione annotata, se
 * è di poco prima. Chi manda un'istruzione annota sempre la decisione prima di
 * mandarla; una decisione vecchia spiegherebbe un'altra mossa.
 */
export function percheRecente(a: { decisioni: { quando: string; cosa: string }[] }, adesso: string): string | undefined {
  const ultima = a.decisioni[a.decisioni.length - 1]
  if (ultima === undefined) return undefined
  const t = Date.parse(ultima.quando)
  const ora = Date.parse(adesso)
  if (Number.isNaN(t) || Number.isNaN(ora) || ora - t > PERCHE_ENTRO_MS || t > ora + 1000) return undefined
  return ultima.cosa
}
