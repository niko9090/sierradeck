import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Lo **scoping per chat**: quali plugin/skill/MCP spegnere per le chat di una
 * certa cartella, senza toccare la configurazione globale di nessun altro.
 *
 * Il meccanismo è `--settings` all'avvio della chat: è per singola sessione,
 * non scrive niente sui file dell'utente. Ma non do per scontato *come* Claude
 * Code fonda quelle chiavi (se le sostituisce o le mescola): per stare al
 * sicuro con entrambe le ipotesi, compongo le impostazioni **partendo dai
 * valori globali** e sovrappongo solo gli spegnimenti di questa chat — così la
 * mappa che passo è sempre completa, e non rischio di riaccendere o spegnere
 * altro per sbaglio. Se una chat non ha nessun override, non tocco niente:
 * nessuna lettura, nessun cambiamento rispetto a prima.
 *
 * La chiave è la **cartella** della chat (`cwd`): è l'unità con cui il Negozio
 * già distingue skill e MCP, ed è ciò che resta stabile fra un riavvio e
 * l'altro. Due chat nella stessa cartella condividono lo scope — per l'uso
 * normale è quello che ci si aspetta.
 */

export type ScopeChat = {
  /** id `nome@marketplace` dei plugin da spegnere per questa cartella. */
  pluginSpenti: string[]
  /** nomi delle skill da spegnere. */
  skillSpente: string[]
  /** nomi degli MCP (di progetto) da spegnere. */
  mcpSpenti: string[]
}

export function scopeVuoto(): ScopeChat {
  return { pluginSpenti: [], skillSpente: [], mcpSpenti: [] }
}

export function scopeInerte(s: ScopeChat): boolean {
  return s.pluginSpenti.length === 0 && s.skillSpente.length === 0 && s.mcpSpenti.length === 0
}

function listaStringhe(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x !== '') : []
}

function normalizza(v: unknown): ScopeChat {
  if (v === null || typeof v !== 'object') return scopeVuoto()
  const o = v as Record<string, unknown>
  return {
    pluginSpenti: listaStringhe(o.pluginSpenti),
    skillSpente: listaStringhe(o.skillSpente),
    mcpSpenti: listaStringhe(o.mcpSpenti)
  }
}

export type ScopeStore = {
  /** Lo scope di una cartella (vuoto se non ne ha uno). */
  leggi: (cwd: string) => ScopeChat
  /** Imposta (o azzera) lo scope di una cartella. */
  imposta: (cwd: string, scope: ScopeChat) => void
}

export function apriScopeStore(cartellaDati: string): ScopeStore {
  const file = join(cartellaDati, 'negozio-scope.json')

  const tutte = (): Record<string, ScopeChat> => {
    if (!existsSync(file)) return {}
    try {
      const dati: unknown = JSON.parse(readFileSync(file, 'utf8'))
      if (dati === null || typeof dati !== 'object') return {}
      const fuori: Record<string, ScopeChat> = {}
      for (const [cwd, v] of Object.entries(dati as Record<string, unknown>)) {
        const s = normalizza(v)
        if (!scopeInerte(s)) fuori[cwd] = s
      }
      return fuori
    } catch {
      return {}
    }
  }

  return {
    leggi(cwd) {
      return tutte()[cwd] ?? scopeVuoto()
    },
    imposta(cwd, scope) {
      const mappa = tutte()
      // Uno scope vuoto non è una voce: si toglie del tutto, così il file non
      // si riempie di cartelle senza niente da dire.
      if (scopeInerte(scope)) delete mappa[cwd]
      else mappa[cwd] = scope
      try {
        writeFileSync(file, JSON.stringify(mappa, null, 2), 'utf8')
      } catch (err) {
        console.error('[negozio] non ho potuto salvare lo scope della chat:', err)
      }
    }
  }
}

/**
 * Le chiavi di `--settings` che spengono ciò che lo scope indica, **partendo**
 * dai valori globali passati (così la mappa è completa a prescindere da come
 * Claude Code fonde). Restituisce un oggetto vuoto se non c'è niente da fare.
 */
export function componiScope(deps: {
  scope: ScopeChat
  enabledPluginGlobali: Record<string, boolean>
  skillOverridesGlobali: Record<string, string>
  mcpDisabilitatiProgetto: string[]
}): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const { scope } = deps
  if (scope.pluginSpenti.length > 0) {
    const ep: Record<string, boolean> = { ...deps.enabledPluginGlobali }
    for (const id of scope.pluginSpenti) ep[id] = false
    out.enabledPlugins = ep
  }
  if (scope.skillSpente.length > 0) {
    const so: Record<string, string> = { ...deps.skillOverridesGlobali }
    for (const n of scope.skillSpente) so[n] = 'off'
    out.skillOverrides = so
  }
  if (scope.mcpSpenti.length > 0) {
    // Le liste si fondono: unisco quelli già disabilitati nel progetto con i
    // nuovi, senza doppioni.
    out.disabledMcpjsonServers = [...new Set([...deps.mcpDisabilitatiProgetto, ...scope.mcpSpenti])]
  }
  return out
}

/**
 * Fonde le impostazioni dell'autopilota (gli hook, se c'è) con quelle dello
 * scope. Nessuna chiave in comune fra i due, quindi è una fusione piana.
 * Restituisce la stringa JSON per `--settings`, o `undefined` se non serve.
 */
export function fondiImpostazioni(autopilotaJson: string | undefined, scopeObj: Record<string, unknown>): string | undefined {
  let base: Record<string, unknown> = {}
  if (autopilotaJson !== undefined && autopilotaJson.trim() !== '') {
    try {
      const p: unknown = JSON.parse(autopilotaJson)
      if (p !== null && typeof p === 'object') base = p as Record<string, unknown>
    } catch {
      // Un JSON dell'autopilota illeggibile non deve trascinarsi dietro lo
      // scope: si riparte da quello, meglio di niente.
    }
  }
  const merged = { ...base, ...scopeObj }
  return Object.keys(merged).length > 0 ? JSON.stringify(merged) : undefined
}

/** Legge i valori globali che servono a `componiScope` dai file veri. */
export function leggiGlobaliPerScope(deps: {
  radiceClaude: string
  fileClaudeJson: string
  cwd: string
}): { enabledPluginGlobali: Record<string, boolean>; skillOverridesGlobali: Record<string, string>; mcpDisabilitatiProgetto: string[] } {
  const settings = leggiOgg(join(deps.radiceClaude, 'settings.json'))
  const claudeJson = leggiOgg(deps.fileClaudeJson)
  const progetti = claudeJson.projects
  const prog = progetti !== null && typeof progetti === 'object' && !Array.isArray(progetti)
    ? (progetti as Record<string, unknown>)[deps.cwd]
    : undefined
  const mcpDis = prog !== null && typeof prog === 'object'
    ? listaStringhe((prog as Record<string, unknown>).disabledMcpjsonServers)
    : []
  return {
    enabledPluginGlobali: soloBool(settings.enabledPlugins),
    skillOverridesGlobali: soloStr(settings.skillOverrides),
    mcpDisabilitatiProgetto: mcpDis
  }
}

function leggiOgg(percorso: string): Record<string, unknown> {
  if (!existsSync(percorso)) return {}
  try {
    const v: unknown = JSON.parse(readFileSync(percorso, 'utf8'))
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function soloBool(v: unknown): Record<string, boolean> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return {}
  const out: Record<string, boolean> = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) if (typeof val === 'boolean') out[k] = val
  return out
}

function soloStr(v: unknown): Record<string, string> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return {}
  const out: Record<string, string> = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) if (typeof val === 'string') out[k] = val
  return out
}
