import { AsyncLocalStorage } from 'node:async_hooks'
import { setMaxListeners } from 'node:events'
import type { RisorsePc, TipoRichiestaDrive } from '@shared/risorse'

/**
 * Quanto lavora SierraDeck su questo PC (0.69.0). «Ottimizziamo l'app perché i
 * PC girano lenti» (Nicholas, 12/10): prima di togliere giri bisogna poterli
 * contare, su ogni PC e non solo su quello davanti. Le richieste al Drive si
 * contano qui, in una finestra di 10 minuti; CPU e RAM le dà Electron. Il
 * risultato va nella Salute e nel battito, così ogni PC vede gli altri.
 */

/** La finestra su cui si contano le richieste al Drive. */
export const FINESTRA_RISORSE_MS = 10 * 60_000

/** Che richiesta è, da metodo e indirizzo dell'API di Google Drive. */
export function tipoRichiestaDrive(metodo: string, url: string): TipoRichiestaDrive {
  const m = metodo.toUpperCase()
  if (m === 'DELETE') return 'cancella'
  if (m === 'POST' || m === 'PATCH' || m === 'PUT') return 'scrittura'
  if (url.includes('alt=media')) return 'scarica'
  if (url.includes('/files?') || url.endsWith('/files')) return 'ricerca'
  return 'altro'
}

export type ContatoreDrive = {
  conta: (tipo: TipoRichiestaDrive, rifiutata: boolean) => void
  /** Le richieste dell'ultima finestra: al minuto, per tipo, e quante rifiutate (403/429). */
  riassunto: () => Pick<RisorsePc, 'driveAlMinuto' | 'drivePerTipo' | 'driveRifiutate'>
}

export function creaContatoreDrive(adesso: () => number = Date.now): ContatoreDrive {
  const voci: { il: number; tipo: TipoRichiestaDrive; rifiutata: boolean }[] = []
  const pota = (): void => {
    const da = adesso() - FINESTRA_RISORSE_MS
    while (voci.length > 0 && (voci[0]?.il ?? 0) < da) voci.shift()
    // Un tetto: anche con una tempesta di richieste la memoria resta piccola.
    if (voci.length > 20_000) voci.splice(0, voci.length - 20_000)
  }
  return {
    conta(tipo, rifiutata) {
      voci.push({ il: adesso(), tipo, rifiutata })
      pota()
    },
    riassunto() {
      pota()
      const perTipo: Partial<Record<TipoRichiestaDrive, number>> = {}
      for (const v of voci) perTipo[v.tipo] = (perTipo[v.tipo] ?? 0) + 1
      return {
        driveAlMinuto: Math.round((voci.length / (FINESTRA_RISORSE_MS / 60_000)) * 10) / 10,
        drivePerTipo: perTipo,
        driveRifiutate: voci.filter((v) => v.rifiutata).length
      }
    }
  }
}

/** Il contatore di questo processo: lo usano i client del Drive. */
export const contatoreDrive = creaContatoreDrive()

/**
 * Quanto può restare ferma una richiesta al Drive (0.86.2): niente intestazioni,
 * o nessun byte nuovo del corpo, per tanto così e la richiesta si interrompe.
 * Prima non c'era nessun tetto: una chiamata appesa (rete caduta a metà, un
 * proxy che non chiude) teneva il lavoro esclusivo del Drive per sempre, e
 * salvataggi, arrivi e ripristini restavano fermi fino al riavvio.
 */
export const TEMPO_LIMITE_DRIVE_MS = 60_000

/** L'errore di una richiesta rimasta ferma oltre il tetto. Transitorio: chi ritenta, ritenta. */
export class TempoScadutoDrive extends Error {
  constructor(ms: number) {
    super(`Drive: nessuna risposta da ${Math.round(ms / 1000)} s, richiesta interrotta`)
    this.name = 'TempoScadutoDrive'
  }
}

/**
 * Il segnale di annullamento del lavoro in corso (0.86.2). Il lavoro esclusivo
 * lo apre con `conSegnaleDrive` e ogni richiesta al Drive partita dentro lo
 * riceve, senza passarlo a mano per dieci livelli di chiamate: «Annulla» ferma
 * anche una richiesta appesa, non solo il file successivo.
 */
const ambitoSegnale = new AsyncLocalStorage<AbortSignal | undefined>()

export function conSegnaleDrive<T>(segnale: AbortSignal | undefined, fai: () => Promise<T>): Promise<T> {
  // Ogni richiesta in corso lo ascolta (sei alla volta, e qualcuna in piu'):
  // non e' una perdita di memoria, e Node non deve avvisare che lo sia.
  if (segnale !== undefined) setMaxListeners(0, segnale)
  return ambitoSegnale.run(segnale, fai)
}

/** Fuori dal segnale del lavoro: ciò che deve finire anche dopo «Annulla» (il manifesto). */
export function senzaSegnaleDrive<T>(fai: () => Promise<T>): Promise<T> {
  return ambitoSegnale.run(undefined, fai)
}

/** Il segnale del lavoro in corso, se c'è. */
export function segnaleDrive(): AbortSignal | undefined {
  return ambitoSegnale.getStore()
}

const SENZA_CORPO = new Set([101, 204, 205, 304])

/**
 * `fetch` con il tetto di attesa e il segnale del lavoro. Il tempo vale per le
 * intestazioni e poi per ogni pezzo del corpo (un download lungo che procede
 * non si interrompe; uno fermo sì).
 */
export function conTempoLimite(f: typeof fetch, ms: number = TEMPO_LIMITE_DRIVE_MS): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> => {
    const ctl = new AbortController()
    const esterni = [init?.signal ?? undefined, segnaleDrive()].filter((s): s is AbortSignal => s !== undefined)
    const staccati: (() => void)[] = []
    for (const s of esterni) {
      if (s.aborted) { ctl.abort(s.reason); continue }
      const via = (): void => { ctl.abort(s.reason) }
      s.addEventListener('abort', via, { once: true })
      staccati.push(() => { s.removeEventListener('abort', via) })
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    let allaScadenza: ((e: Error) => void) | undefined
    const chiudi = (): void => {
      if (timer !== undefined) clearTimeout(timer)
      timer = undefined
      for (const s of staccati.splice(0)) s()
    }
    const arma = (): void => {
      if (timer !== undefined) clearTimeout(timer)
      timer = setTimeout(() => {
        const e = new TempoScadutoDrive(ms)
        ctl.abort(e)
        allaScadenza?.(e)
        chiudi()
      }, ms)
      timer.unref?.()
    }
    let r: Response
    try {
      r = await new Promise<Response>((risolvi, rifiuta) => {
        allaScadenza = rifiuta
        // Un `fetch` che ignora il segnale (un Drive finto) si ferma lo stesso.
        // Dopo le intestazioni `allaScadenza` ferma il corpo: «Annulla» vale anche li'.
        ctl.signal.addEventListener('abort', () => { allaScadenza?.(ctl.signal.reason instanceof Error ? ctl.signal.reason : new Error('Drive: richiesta annullata')) }, { once: true })
        if (ctl.signal.aborted) { rifiuta(ctl.signal.reason instanceof Error ? ctl.signal.reason : new Error('Drive: richiesta annullata')); return }
        arma()
        f(input, { ...(init ?? {}), signal: ctl.signal }).then(risolvi, rifiuta)
      })
    } catch (e) {
      chiudi()
      throw e
    }
    if (r.body === null || typeof r.body?.pipeThrough !== 'function' || SENZA_CORPO.has(r.status)) { chiudi(); return r }
    // Il corpo: ogni pezzo che arriva riarma il tempo; fermo troppo a lungo, si interrompe.
    let ctlCorpo: TransformStreamDefaultController<Uint8Array> | undefined
    allaScadenza = (e) => { try { ctlCorpo?.error(e) } catch { /* gia' chiuso */ } }
    arma()
    const corpo = r.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      start(c) { ctlCorpo = c },
      transform(pezzo, c) { arma(); c.enqueue(pezzo) },
      flush() { chiudi() }
    }))
    return new Response(corpo, { status: r.status, statusText: r.statusText, headers: r.headers })
  }) as typeof fetch
}

/**
 * `fetch` che conta ogni richiesta che parte davvero (anche i ritentativi).
 * Dalla 0.86.2 ogni richiesta ha anche il suo tetto di attesa e il segnale del
 * lavoro in corso (`conTempoLimite`): passa di qui tutto quello che va al Drive.
 */
export function conConteggio(f: typeof fetch, c: ContatoreDrive = contatoreDrive, tempoMs: number = TEMPO_LIMITE_DRIVE_MS): typeof fetch {
  const conTetto = conTempoLimite(f, tempoMs)
  return (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const tipo = tipoRichiestaDrive(init?.method ?? 'GET', url)
    try {
      const r = await conTetto(input, init)
      c.conta(tipo, r.status === 403 || r.status === 429)
      return r
    } catch (e) {
      c.conta(tipo, false)
      throw e
    }
  }) as typeof fetch
}

/** CPU e RAM dei processi di SierraDeck, da `app.getAppMetrics()` di Electron. */
export function cpuRamDa(metriche: { cpu: { percentCPUUsage: number }; memory: { workingSetSize: number } }[], core: number): Pick<RisorsePc, 'cpu' | 'ramMb' | 'processi'> {
  const cpu = metriche.reduce((s, m) => s + (m.cpu.percentCPUUsage || 0), 0)
  const kb = metriche.reduce((s, m) => s + (m.memory.workingSetSize || 0), 0)
  return {
    // percentCPUUsage è su un core: diviso per i core, è la parte del PC intero.
    cpu: Math.round((cpu / Math.max(1, core)) * 10) / 10,
    ramMb: Math.round(kb / 1024),
    processi: metriche.length
  }
}
