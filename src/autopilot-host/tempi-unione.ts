/**
 * **I tempi delle unioni** (07/11, 11/11). Devono stare uno dentro l'altro:
 * turno dei passi git < suite dei test < prova < fila delle unioni.
 *
 * Il 07/11, dalle 7:34 alle 12:28, ogni unione è scaduta: la prova durava al
 * più 15 minuti, ma una suite ne aveva 20 e un criterio poteva aspettare la
 * guardia del PC per 30. Adesso la prova contiene due misure della suite (con
 * il ramo e, se serve, senza), e la fila contiene la prova più il criterio del
 * compito. La guardia fa aspettare al più due minuti (`guardia-pc.ts`).
 */
export const PROVA_MAX_MS = 45 * 60_000
export const UNIONE_MAX_MS = 60 * 60_000

export type MisuraTempi = { attesaMs: number; esecuzioneMs: number }

/**
 * Esegue `corpo` con un tempo massimo. Alla scadenza il segnale scatta (i
 * comandi figli si fermano e rilasciano il turno dei pesanti) e `scaduta` è
 * `true`. `corpo` dice `iniziata()` quando smette di aspettare e comincia a
 * lavorare: i tempi si scrivono separati (attesa, esecuzione).
 */
export async function conScadenza<T>(
  corpo: (segnale: AbortSignal, iniziata: () => void) => Promise<T>,
  maxMs: number,
  opz: { ora?: () => number; scrivi?: (t: MisuraTempi & { scaduta: boolean }) => void } = {}
): Promise<{ scaduta: false; valore: T } | { scaduta: true }> {
  const ora = opz.ora ?? (() => Date.now())
  const controllo = new AbortController()
  const t0 = ora()
  let t1: number | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const scadenza = new Promise<'scaduta'>((ris) => { timer = setTimeout(() => ris('scaduta'), maxMs); timer.unref?.() })
  const lavoro = corpo(controllo.signal, () => { t1 ??= ora() })
  // Il corpo che finisce dopo la scadenza (o con un errore) non deve restare senza chi lo ascolta.
  lavoro.catch(() => {})
  let esito: { scaduta: false; valore: T } | { scaduta: true }
  try {
    const r = await Promise.race([lavoro, scadenza])
    if (r === 'scaduta') { controllo.abort(); esito = { scaduta: true } } else esito = { scaduta: false, valore: r }
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    const fine = ora()
    const inizio = t1 ?? fine
    try { opz.scrivi?.({ attesaMs: inizio - t0, esecuzioneMs: fine - inizio, scaduta: controllo.signal.aborted }) } catch { /* il registro non ferma l'unione */ }
  }
  return esito
}

/**
 * Quanto aspetta un'unione scaduta prima di riprovare (11/11): 30 secondi, poi
 * 2, 5 e 15 minuti, e da lì sempre 15. `passo` è l'attesa di base (30 s).
 * Mai fuori dalla fila: il 07/11 sette lavori finiti sono rimasti fuori dal
 * ramo principale perché dopo tre scadenze l'unione veniva tolta.
 */
export function attesaDopoScadenza(tentativi: number, passo: number): number {
  const volte = [1, 4, 10, 30]
  return passo * (volte[Math.min(Math.max(1, tentativi), volte.length) - 1] as number)
}
