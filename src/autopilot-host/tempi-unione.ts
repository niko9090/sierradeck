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

/** k-191e: la scadenza adattiva non scende mai sotto questo (una prova sana a volte ne vuole di più). */
export const PROVA_MIN_ADATTIVA_MS = 5 * 60_000
/** 24/11: quanto si aggiunge al minimo per ogni criterio da misurare nella prova. */
export const QUOTA_PER_CRITERIO_MS = 10_000
/** Quante prove recenti contano, e quante ne servono per fidarsi della mediana. */
export const PROVE_RICORDATE = 10
export const PROVE_MINIME_ADATTIVA = 3
/** Quante volte la mediana è ancora una prova normale. */
export const FATTORE_ADATTIVO = 4

/**
 * k-191e: la scadenza di una prova segue com'è fatto il workspace: `max(5 minuti, 4 × la mediana
 * delle ultime 10 prove)`, mai sopra il tetto (di serie 45 minuti). Una prova che dura 4 volte il normale
 * è già anomala e si ritenta subito invece di bloccare la fila per 45 minuti. Con meno di 3 prove
 * ricordate, o nessuna misura, vale il tetto. `piuTempo` (k-191a, ×1…×3 a ogni scadenza) allarga
 * anche questa: dopo una scadenza il tentativo dopo ha più tempo, fino al tetto.
 */
export function scadenzaAdattiva(durateMs: readonly number[], tettoMs: number, piuTempo = 1, criteri = 0): number {
  const buone = durateMs.filter((d) => Number.isFinite(d) && d >= 0).slice(-PROVE_RICORDATE)
  if (buone.length < PROVE_MINIME_ADATTIVA) return tettoMs
  const ordinate = [...buone].sort((a, b) => a - b)
  const meta = ordinate.length / 2
  const mediana = ordinate.length % 2 === 1 ? ordinate[Math.floor(meta)]! : (ordinate[meta - 1]! + ordinate[meta]!) / 2
  // 24/11: il minimo cresce con i criteri da misurare (~1 s l'uno solo per partire, di più i pesanti):
  // prove veloci di prima non dicono quanto ne vuole una con 55 criteri e un gradle a freddo.
  const minimo = PROVA_MIN_ADATTIVA_MS + Math.max(0, Math.floor(criteri)) * QUOTA_PER_CRITERIO_MS
  const base = Math.max(minimo, FATTORE_ADATTIVO * mediana)
  return Math.min(tettoMs, Math.round(base * Math.max(1, piuTempo)))
}

export type MisuraTempi = { attesaMs: number; esecuzioneMs: number }

/**
 * Esegue `corpo` con un tempo massimo. Alla scadenza il segnale scatta (i
 * comandi figli si fermano e rilasciano il turno dei pesanti) e `scaduta` è
 * `true`. `corpo` dice `iniziata()` quando smette di aspettare e comincia a
 * lavorare: i tempi si scrivono separati (attesa, esecuzione).
 */
export async function conScadenza<T>(
  corpo: (segnale: AbortSignal, iniziata: () => void, inFila: <R>(fai: () => Promise<R>) => Promise<R>) => Promise<T>,
  maxMs: number,
  opz: { ora?: () => number; scrivi?: (t: MisuraTempi & { scaduta: boolean }) => void; /** 25/11: chi sta sopra (la fila delle unioni) può far scadere la prova prima. */ segnale?: AbortSignal } = {}
): Promise<{ scaduta: false; valore: T } | { scaduta: true }> {
  const ora = opz.ora ?? (() => Date.now())
  const controllo = new AbortController()
  const t0 = ora()
  let t1: number | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let scattaScadenza = (): void => {}
  const scadenza = new Promise<'scaduta'>((ris) => { scattaScadenza = () => ris('scaduta') })
  // 25/11: l'unione sopra è scaduta: la prova si chiude come se fosse scaduta lei (segnale, pulizia, turno reso).
  if (opz.segnale?.aborted === true) scattaScadenza()
  else opz.segnale?.addEventListener('abort', () => { scattaScadenza() }, { once: true })
  /** Quanto tempo resta alla scadenza; il timer si ferma mentre il corpo aspetta in fila (`inFila`). */
  let resto = maxMs
  let partito = t0
  let inFilaMs = 0
  let inAttesa = 0
  let chiusa = false
  const avviaTimer = (): void => {
    if (chiusa) return
    partito = ora()
    timer = setTimeout(scattaScadenza, Math.max(0, resto))
    timer.unref?.()
  }
  avviaTimer()
  /** k-197c: l'attesa del turno del PC non è tempo della prova: la scadenza si ferma finché dura, poi riparte da dove era. */
  const inFila = async <R>(fai: () => Promise<R>): Promise<R> => {
    const da = ora()
    if (inAttesa === 0 && timer !== undefined) { clearTimeout(timer); timer = undefined; resto -= da - partito }
    inAttesa += 1
    try {
      return await fai()
    } finally {
      inAttesa -= 1
      inFilaMs += ora() - da
      if (inAttesa === 0 && timer === undefined) avviaTimer()
    }
  }
  const lavoro = corpo(controllo.signal, () => { t1 ??= ora() }, inFila)
  // Il corpo che finisce dopo la scadenza (o con un errore) non deve restare senza chi lo ascolta.
  lavoro.catch(() => {})
  let esito: { scaduta: false; valore: T } | { scaduta: true }
  try {
    const r = await Promise.race([lavoro, scadenza])
    if (r === 'scaduta') {
      controllo.abort()
      // 22/11: si torna solo a corpo chiuso (il segnale lo ferma): la prova non esce da chi la tiene
      // in conto mentre i suoi comandi girano ancora.
      await lavoro.catch(() => {})
      esito = { scaduta: true }
    } else esito = { scaduta: false, valore: r }
  } finally {
    chiusa = true
    if (timer !== undefined) clearTimeout(timer)
    const fine = ora()
    const inizio = t1 ?? fine
    try { opz.scrivi?.({ attesaMs: inizio - t0 + inFilaMs, esecuzioneMs: Math.max(0, fine - inizio - inFilaMs), scaduta: controllo.signal.aborted }) } catch { /* il registro non ferma l'unione */ }
  }
  return esito
}

/**
 * 25/11: quanto tempo, in tutto, la scadenza di un'unione resta ferma mentre aspetta il turno pesante del PC.
 * Oltre, l'attesa conta di nuovo: un turno che non si libera mai non tiene l'unione appesa per sempre.
 */
export const UNIONE_ATTESA_TURNO_MAX_MS = 4 * 60 * 60_000

/** Il tetto di un timer di Node (oltre ~24,8 giorni scatterebbe subito). */
const TIMER_MAX_MS = 2_000_000_000

export type ScadenzaFermabile = {
  /** Scatta alla scadenza: ferma la prova e le misure di questo tentativo. */
  segnale: AbortSignal
  /** Respinta con l'errore di `errore()` alla scadenza. */
  scaduta: Promise<never>
  /** Esegue `fai` con la scadenza ferma (l'attesa del turno pesante del PC non è tempo dell'unione). */
  inFila: <R>(fai: () => Promise<R>) => Promise<R>
  /** Il tentativo è finito: niente più scadenza. */
  chiudi: () => void
  /** Sta aspettando il turno adesso. */
  inAttesa: () => boolean
}

/**
 * **La scadenza dell'unione che non conta l'attesa del turno** (25/11). Prima i 60 minuti della fila contavano
 * anche l'attesa del turno pesante del PC (mentre la prova la fermava): a PC carico le unioni scadevano, tornavano
 * in fila e scadevano ancora, per ore. Come `conScadenza`, il tempo si ferma dentro `inFila`, al più
 * `pausaMaxMs` in tutto. Alla scadenza il segnale scatta e `scaduta` viene respinta con `errore()`.
 * `alCambio(true|false)` dice quando comincia e finisce un'attesa del turno (per lo stato).
 */
export function scadenzaFermabile(maxMs: number, errore: () => Error, opz: { pausaMaxMs?: number; alCambio?: (inAttesa: boolean) => void; ora?: () => number } = {}): ScadenzaFermabile {
  const ora = opz.ora ?? (() => Date.now())
  const controllo = new AbortController()
  let resto = Math.max(0, maxMs)
  let budget = Math.max(0, opz.pausaMaxMs ?? UNIONE_ATTESA_TURNO_MAX_MS)
  let partito = ora()
  let pausaDa = 0
  let attese = 0
  let chiusa = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let respingi: (e: Error) => void = () => {}
  const scaduta = new Promise<never>((_, no) => { respingi = no })
  scaduta.catch(() => {})
  const avvisa = (si: boolean): void => { try { opz.alCambio?.(si) } catch { /* lo stato non ferma l'unione */ } }
  const scatta = (): void => {
    if (chiusa) return
    chiusa = true
    if (timer !== undefined) clearTimeout(timer)
    const e = errore()
    controllo.abort()
    respingi(e)
  }
  const arma = (ms: number): void => {
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(scatta, Math.min(TIMER_MAX_MS, Math.max(0, ms)))
    timer.unref?.()
  }
  arma(resto)
  const inFila = async <R>(fai: () => Promise<R>): Promise<R> => {
    if (chiusa) return fai()
    if (attese === 0) {
      const t = ora()
      resto -= t - partito
      pausaDa = t
      // Ferma: scatta solo se l'attesa passa il tetto che resta.
      arma(resto + budget)
      avvisa(true)
    }
    attese += 1
    try {
      return await fai()
    } finally {
      attese -= 1
      if (attese === 0 && !chiusa) {
        const t = ora()
        budget = Math.max(0, budget - (t - pausaDa))
        partito = t
        arma(resto)
        avvisa(false)
      }
    }
  }
  return {
    segnale: controllo.signal,
    scaduta,
    inFila,
    chiudi: () => { chiusa = true; if (timer !== undefined) clearTimeout(timer) },
    inAttesa: () => attese > 0
  }
}

/**
 * Quanto aspetta un'unione scaduta prima di riprovare (11/11): 30 secondi, poi
 * 2, 5 e 15 minuti, e da lì sempre 15. `passo` è l'attesa di base (30 s).
 * 25/11: dopo `UNIONE_TENTATIVI_MAX` scadenze l'unione esce dalla fila con un esito e torna
 * da sola dopo un riposo lungo (`UNIONE_RIPOSO_MS`); chi la richiede prima riceve «in riposo fino alle HH:MM».
 */
export function attesaDopoScadenza(tentativi: number, passo: number): number {
  const volte = [1, 4, 10, 30]
  return passo * (volte[Math.min(Math.max(1, tentativi), volte.length) - 1] as number)
}
