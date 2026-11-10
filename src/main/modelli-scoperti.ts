import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { MODELLI_FISSI, modelloValido, unisciModelli, type Modello } from '@shared/modelli'

/**
 * I modelli che escono dopo la versione del programma.
 *
 * La fonte è l'API di Anthropic (`GET /v1/models`), che dice quali modelli
 * esistono davvero. Serve una credenziale: la chiave nell'ambiente
 * (`ANTHROPIC_API_KEY`) o, in mancanza, l'accesso già fatto da Claude Code su
 * questo computer. Senza né l'una né l'altra, o senza rete, resta l'elenco
 * fisso: la scoperta aggiunge, non toglie e non rompe mai niente.
 *
 * L'ultimo risultato sta in un file nella cartella dati, così al prossimo
 * avvio l'elenco c'è subito, anche senza rete.
 */

const URL_MODELLI = 'https://api.anthropic.com/v1/models?limit=100'
const VERSIONE_API = '2023-06-01'
/** Rinnovo quando va bene; ritentativo, più corto, quando fallisce. */
export const INTERVALLO_OK_MS = 6 * 60 * 60 * 1000
export const INTERVALLO_RITENTA_MS = 15 * 60 * 1000
const ATTESA_MS = 15_000

type Credenziale = { intestazioni: Record<string, string> }

/** Dove prendere la credenziale, nell'ordine; mai scritta né registrata. */
export function leggiCredenziale(env: NodeJS.ProcessEnv = process.env, casa: string = homedir()): Credenziale | undefined {
  const chiave = env.ANTHROPIC_API_KEY?.trim()
  if (chiave !== undefined && chiave !== '') return { intestazioni: { 'x-api-key': chiave } }
  try {
    const file = join(casa, '.claude', '.credentials.json')
    if (!existsSync(file)) return undefined
    const o = (JSON.parse(readFileSync(file, 'utf8')) as { claudeAiOauth?: { accessToken?: unknown } }).claudeAiOauth
    const t = typeof o?.accessToken === 'string' ? o.accessToken : ''
    if (t !== '') return { intestazioni: { authorization: `Bearer ${t}`, 'anthropic-beta': 'oauth-2025-04-20' } }
  } catch {
    // illeggibile: come se non ci fosse
  }
  return undefined
}

/** Gli id validi dalla risposta dell'API, nell'ordine in cui arrivano (i più nuovi prima). */
export function idDaRisposta(corpo: unknown): string[] {
  const dati = typeof corpo === 'object' && corpo !== null ? (corpo as { data?: unknown }).data : undefined
  if (!Array.isArray(dati)) return []
  const out: string[] = []
  for (const d of dati) {
    const id = typeof d === 'object' && d !== null ? (d as { id?: unknown }).id : undefined
    if (typeof id === 'string' && id.startsWith('claude-') && modelloValido(id) && !out.includes(id)) out.push(id)
  }
  return out
}

export type DipendenzeScoperta = {
  /** Il file della cache. */
  file: string
  /** Chiede gli id all'API: lancia se non riesce. */
  chiedi: () => Promise<string[]>
  leggiFile?: (f: string) => string | undefined
  scriviFile?: (f: string, t: string) => void
}

const leggiDisco = (f: string): string | undefined => {
  try { return existsSync(f) ? readFileSync(f, 'utf8') : undefined } catch { return undefined }
}
const scriviDisco = (f: string, t: string): void => {
  mkdirSync(dirname(f), { recursive: true })
  const tmp = `${f}.tmp`
  writeFileSync(tmp, t, 'utf8')
  renameSync(tmp, f)
}

export async function chiediAllApi(
  credenziale: Credenziale | undefined = leggiCredenziale(),
  fetchFn: typeof fetch = fetch
): Promise<string[]> {
  if (credenziale === undefined) throw new Error('nessuna credenziale')
  const r = await fetchFn(URL_MODELLI, {
    headers: { 'anthropic-version': VERSIONE_API, ...credenziale.intestazioni },
    signal: AbortSignal.timeout(ATTESA_MS)
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const ids = idDaRisposta(await r.json())
  if (ids.length === 0) throw new Error('elenco vuoto')
  return ids
}

/** Un elenco di modelli che si tiene aggiornato da solo. */
export function creaElencoModelli(d: DipendenzeScoperta) {
  const leggi = d.leggiFile ?? leggiDisco
  const scrivi = d.scriviFile ?? scriviDisco
  let scoperti: string[] = []
  try {
    const c = JSON.parse(leggi(d.file) ?? '{}') as { ids?: unknown }
    if (Array.isArray(c.ids)) scoperti = c.ids.filter((x): x is string => typeof x === 'string' && modelloValido(x))
  } catch {
    // cache rovinata: si riparte dall'elenco fisso
  }

  return {
    /** L'elenco di adesso: fisso + scoperti. Sempre disponibile, sincrono. */
    elenco(): Modello[] { return unisciModelli(scoperti, MODELLI_FISSI) },
    /** Un giro di scoperta. Dice se è riuscito; se no l'elenco non cambia. */
    async aggiorna(): Promise<boolean> {
      try {
        scoperti = await d.chiedi()
        try { scrivi(d.file, JSON.stringify({ ids: scoperti, il: new Date().toISOString() })) } catch { /* la cache è un di più */ }
        return true
      } catch {
        return false
      }
    }
  }
}

let istanza: ReturnType<typeof creaElencoModelli> | undefined

/** L'elenco di adesso per chiunque nel programma: quello vivo se la scoperta è partita, il fisso altrimenti. */
export function elencoModelliVivo(): Modello[] {
  return istanza?.elenco() ?? MODELLI_FISSI
}

/** Avvia la scoperta nel programma: subito, poi a intervalli (più corti dopo un fallimento). */
export function avviaScoperta(cartellaDati: string): ReturnType<typeof creaElencoModelli> {
  const e = creaElencoModelli({ file: join(cartellaDati, 'modelli-scoperti.json'), chiedi: () => chiediAllApi() })
  const giro = (): void => {
    void e.aggiorna().then((ok) => {
      const t = setTimeout(giro, ok ? INTERVALLO_OK_MS : INTERVALLO_RITENTA_MS)
      t.unref()
    })
  }
  istanza = e
  giro()
  return e
}
