/**
 * Il freno del Drive (k-65). Dal controllo di tutti i PC (06/11): 14-38
 * richieste al minuto per PC, e Google ne rifiutava decine; con il Drive pieno
 * («storageQuotaExceeded») SALVA e il salvataggio automatico ritentavano
 * decine di volte.
 *
 * Due cose, in un posto solo, che chi parla con il Drive consulta prima di
 * partire:
 * - **limite di velocità** (429, o 403 rateLimitExceeded): attesa che cresce,
 *   da 30 secondi a 10 minuti. Finché dura, i giri automatici stanno fermi.
 * - **spazio pieno** (403 storageQuotaExceeded): niente scritture né creazioni
 *   finché lo spazio non torna. Si ricontrolla di rado (30 minuti), o subito
 *   quando la quota dice che c'è di nuovo posto. Le letture continuano; i dati
 *   restano in locale e salgono al primo giro con spazio.
 *
 * Puro: l'orologio si passa da fuori, per i test.
 */

export const MESSAGGIO_DRIVE_PIENO = 'Drive pieno: libera spazio o svuota il cestino.'
/** Ogni quanto si riprova a scrivere, a Drive pieno. */
export const RICONTROLLO_PIENO_MS = 30 * 60_000
export const ATTESA_LIMITE_MIN_MS = 30_000
export const ATTESA_LIMITE_MAX_MS = 10 * 60_000

/** È l'errore «spazio del Drive finito»? (nel testo o nel motivo che Google dà) */
export function eSpazioPieno(testo: string): boolean {
  return /storageQuotaExceeded|storage quota has been exceeded/i.test(testo)
}

export type EventoFreno = 'pieno' | 'libero' | 'limite'

export type Freno = {
  /** Google ha detto «troppe richieste»: l'attesa cresce. */
  limiteRaggiunto: () => void
  /** Una richiesta è andata a buon fine. */
  tuttoBene: () => void
  /** Quanto resta da aspettare per i giri automatici (0 = via libera). */
  attesaMs: () => number
  /** Il Drive ha detto «spazio finito». */
  spazioPieno: () => void
  /** Il Drive ha scritto: lo spazio c'è. */
  spazioLibero: () => void
  /** Spazio pieno, e non è ancora ora di ricontrollare? */
  pieno: () => boolean
  /** Per i giri automatici: conviene saltare, per limite o per spazio pieno. */
  fermo: () => boolean
  /** Chi vuole saperlo (registro, avviso): una volta per cambiamento. */
  suCambio: (f: (e: EventoFreno) => void) => () => void
}

export function creaFreno(adesso: () => number = () => Date.now()): Freno {
  let colpi = 0
  let fino = 0
  let pienoDal: number | undefined
  const ascoltatori = new Set<(e: EventoFreno) => void>()
  const dici = (e: EventoFreno): void => {
    for (const f of ascoltatori) { try { f(e) } catch { /* un ascoltatore non ferma il Drive */ } }
  }
  return {
    limiteRaggiunto() {
      const ora = adesso()
      // Altri rifiuti dentro la stessa attesa non la allungano: contano una volta.
      if (ora < fino) return
      const attesa = Math.min(ATTESA_LIMITE_MIN_MS * 2 ** colpi, ATTESA_LIMITE_MAX_MS)
      colpi += 1
      fino = ora + attesa
      dici('limite')
    },
    tuttoBene() {
      if (adesso() >= fino) colpi = 0
    },
    attesaMs() {
      return Math.max(0, fino - adesso())
    },
    spazioPieno() {
      const primo = pienoDal === undefined
      pienoDal = adesso()
      if (primo) dici('pieno')
    },
    spazioLibero() {
      if (pienoDal === undefined) return
      pienoDal = undefined
      dici('libero')
    },
    pieno() {
      return pienoDal !== undefined && adesso() - pienoDal < RICONTROLLO_PIENO_MS
    },
    fermo() {
      return this.attesaMs() > 0 || this.pieno()
    },
    suCambio(f) {
      ascoltatori.add(f)
      return () => { ascoltatori.delete(f) }
    }
  }
}

/** Il freno del programma: uno solo, perché il Drive è uno solo. */
export const frenoDrive: Freno = creaFreno()

/**
 * Mette il freno attorno a un `fetch`: guarda le risposte (limite, spazio
 * pieno, scrittura riuscita) e, a Drive pieno, non manda neppure le scritture:
 * risponde da solo con lo stesso 403 che darebbe Google.
 */
export function conFreno(f: typeof fetch, freno: Freno = frenoDrive): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> => {
    const metodo = (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase()
    const scrittura = metodo === 'POST' || metodo === 'PUT' || metodo === 'PATCH'
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    // Solo il Drive: il rinnovo del token e il resto non c'entrano.
    const drive = url.includes('googleapis.com/') && url.includes('/drive/')
    if (drive && scrittura && freno.pieno()) {
      return new Response(JSON.stringify({ error: { code: 403, message: 'The user\'s Drive storage quota has been exceeded.', errors: [{ reason: 'storageQuotaExceeded' }] } }), { status: 403, headers: { 'Content-Type': 'application/json' } })
    }
    const r = await f(input, init)
    if (!drive) return r
    if (r.ok) {
      freno.tuttoBene()
      if (scrittura) freno.spazioLibero()
    } else if (r.status === 429) {
      freno.limiteRaggiunto()
    } else if (r.status === 403) {
      const testo = await r.clone().text().catch(() => '')
      if (eSpazioPieno(testo)) freno.spazioPieno()
      else if (/rateLimitExceeded|Quota exceeded for quota metric|per minute/i.test(testo)) freno.limiteRaggiunto()
    }
    return r
  }) as typeof fetch
}
