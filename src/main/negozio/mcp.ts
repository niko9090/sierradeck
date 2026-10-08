import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { scriviAtomico } from '@shared/scrittura-atomica'
import {
  statoMcp, comeMostrare, saluteDaMcpList, cosaCambia, motivoLeggibile,
  type McpVoce, type AmbitoMcp, type ConfigMcp, type SaluteMcp
} from '@shared/negozio'
import { chiaveProgetto } from './lettura'
import { esegui } from './cli'

/**
 * Il negozio, lato MCP (0.53.0).
 *
 * Prima si leggevano solo i server «locali» (`~/.claude.json` →
 * `projects[cartella].mcpServers`), e si spegnevano scrivendo
 * `disabledMcpjsonServers`: una chiave che vale **solo** per i server del file
 * `.mcp.json` del progetto. Provato con Claude Code 2.1.294: un server locale
 * «spento» così restava acceso, e la chat ne vedeva gli strumenti.
 *
 * Come stanno le cose davvero (documentazione e prove):
 * - tre posti: locale (`projects[cartella].mcpServers` in `.claude.json`),
 *   utente (`mcpServers` in cima a `.claude.json`), progetto (`.mcp.json`
 *   nella cartella, da approvare);
 * - spento per una cartella = `projects[cartella].disabledMcpServers`
 *   (quello che fa l'interruttore di `/mcp`);
 * - approvato o rifiutato (solo `.mcp.json`) = `enabledMcpjsonServers` /
 *   `disabledMcpjsonServers` in `.claude/settings.local.json` del progetto
 *   (Claude Code ce li sposta da solo se li trova in `.claude.json`);
 * - lo stato del collegamento lo dice `claude mcp list`, che li prova.
 *
 * Aggiungere e togliere passano dal CLI (`mcp add-json`, `mcp remove`); le
 * variabili e le intestazioni si cambiano nel file, toccando una sola voce.
 * I **valori** non escono mai da qui: si mostrano solo i nomi.
 */

export type EsitoMcp = { ok: boolean; messaggio?: string; fatto?: string }

type ConfigServer = {
  type?: string
  command?: string
  args?: unknown
  url?: string
  env?: Record<string, unknown>
  headers?: Record<string, unknown>
}

function leggiOggetto(percorso: string): Record<string, unknown> | undefined {
  if (!existsSync(percorso)) return {}
  try {
    const v = JSON.parse(readFileSync(percorso, 'utf8')) as unknown
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

function oggetto(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function stringhe(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

/** Le scelte di approvazione dei server di `.mcp.json`, da ogni file in cui Claude Code le cerca. */
function approvazioni(radiceClaude: string, cwd: string, prog: Record<string, unknown>): { si: Set<string>; no: Set<string>; tutti: boolean } {
  const fonti = [
    prog,
    oggetto(leggiOggetto(join(radiceClaude, 'settings.json'))),
    oggetto(leggiOggetto(join(cwd, '.claude', 'settings.json'))),
    oggetto(leggiOggetto(join(cwd, '.claude', 'settings.local.json')))
  ]
  const si = new Set<string>()
  const no = new Set<string>()
  let tutti = false
  for (const f of fonti) {
    for (const n of stringhe(f.enabledMcpjsonServers)) si.add(n)
    for (const n of stringhe(f.disabledMcpjsonServers)) no.add(n)
    if (f.enableAllProjectMcpServers === true) tutti = true
  }
  return { si, no, tutti }
}

function voce(nome: string, ambito: AmbitoMcp, cfg: ConfigServer, config: ConfigMcp): McpVoce {
  const tipo = typeof cfg.type === 'string' ? cfg.type : typeof cfg.url === 'string' ? 'http' : 'stdio'
  const v: McpVoce = {
    nome,
    ambito,
    tipo,
    come: comeMostrare(cfg) || '?',
    variabili: Object.keys(oggetto(cfg.env)),
    intestazioni: Object.keys(oggetto(cfg.headers)),
    config,
    abilitato: config === 'attivo'
  }
  return { ...v, stato: statoMcp(v) }
}

/**
 * Tutti gli MCP che una chat aperta in `cwd` vedrebbe, con dove stanno e se
 * sono accesi. Un nome definito in più posti vale una volta sola, con la
 * precedenza di Claude Code: locale, poi progetto, poi utente.
 */
export function elencoMcp(radiceClaude: string, fileClaudeJson: string, cwd: string): McpVoce[] {
  const j = oggetto(leggiOggetto(fileClaudeJson))
  const progetti = oggetto(j.projects)
  const prog = oggetto(progetti[chiaveProgetto(progetti, cwd)])
  const spenti = new Set(stringhe(prog.disabledMcpServers))
  const fuori: McpVoce[] = []
  const visti = new Set<string>()
  const aggiungi = (nome: string, ambito: AmbitoMcp, cfg: unknown, config: ConfigMcp): void => {
    if (visti.has(nome)) return
    visti.add(nome)
    fuori.push(voce(nome, ambito, oggetto(cfg) as ConfigServer, config))
  }
  for (const [nome, cfg] of Object.entries(oggetto(prog.mcpServers))) aggiungi(nome, 'locale', cfg, spenti.has(nome) ? 'spento' : 'attivo')
  const mcpJson = oggetto(oggetto(leggiOggetto(join(cwd, '.mcp.json'))).mcpServers)
  if (Object.keys(mcpJson).length > 0) {
    const a = approvazioni(radiceClaude, cwd, prog)
    for (const [nome, cfg] of Object.entries(mcpJson)) {
      const config: ConfigMcp = spenti.has(nome) ? 'spento' : a.no.has(nome) ? 'rifiutato' : a.si.has(nome) || a.tutti ? 'attivo' : 'da-approvare'
      aggiungi(nome, 'progetto', cfg, config)
    }
  }
  for (const [nome, cfg] of Object.entries(oggetto(j.mcpServers))) aggiungi(nome, 'utente', cfg, spenti.has(nome) ? 'spento' : 'attivo')
  return fuori
}

/**
 * L'elenco con lo stato del collegamento: `claude mcp list` nella cartella li
 * prova uno per uno (circa 1-2 secondi; di più con server lenti). Quelli che
 * il CLI vede e i file no (dai plugin, dai connettori di claude.ai) si
 * aggiungono come «altro», in sola lettura.
 */
export function conSalute(voci: McpVoce[], testoList: string): McpVoce[] {
  const salute = saluteDaMcpList(testoList)
  const fuori = voci.map((v) => {
    const s = salute[v.nome]
    if (s === undefined) return v
    const conS: McpVoce = { ...v, salute: s.salute, ...(s.motivo !== undefined ? { motivo: s.motivo } : {}) }
    return { ...conS, stato: statoMcp(conS) }
  })
  for (const [nome, s] of Object.entries(salute)) {
    if (fuori.some((v) => v.nome === nome)) continue
    const v: McpVoce = {
      nome, ambito: 'altro', tipo: /^https?:/.test(s.come) ? 'http' : 'stdio', come: comeMostrare(/^https?:/.test(s.come) ? { url: s.come.replace(/\s*\(.*\)$/, '') } : { command: s.come }),
      variabili: [], intestazioni: [], config: s.salute === 'spento' ? 'spento' : 'attivo', abilitato: s.salute !== 'spento',
      salute: s.salute, ...(s.motivo !== undefined ? { motivo: s.motivo } : {})
    }
    fuori.push({ ...v, stato: statoMcp(v) })
  }
  return fuori
}

export async function elencoMcpConSalute(radiceClaude: string, fileClaudeJson: string, cwd: string): Promise<{ mcp: McpVoce[]; errore?: string }> {
  const voci = elencoMcp(radiceClaude, fileClaudeJson, cwd)
  const r = await esegui(['mcp', 'list'], 60_000, cwd)
  if (!r.ok && r.stdout.trim() === '') return { mcp: voci, errore: r.motivo ?? motivoLeggibile(r.stderr) }
  return { mcp: conSalute(voci, r.stdout) }
}

/** Un nome che il CLI accetta e che non può diventare un'opzione. */
const NOME_MCP = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/
const NOME_VARIABILE = /^[A-Za-z_][A-Za-z0-9_]*$/
const NOME_INTESTAZIONE = /^[A-Za-z0-9][A-Za-z0-9-]*$/

export function nomeMcpValido(n: string): boolean {
  return NOME_MCP.test(n)
}

export type NuovoMcp = {
  nome: string
  ambito: 'locale' | 'utente' | 'progetto'
  tipo: 'stdio' | 'http' | 'sse'
  comando?: string
  argomenti?: string[]
  url?: string
  variabili?: Record<string, string>
  intestazioni?: Record<string, string>
}

/** Dal modulo del negozio alla configurazione che `claude mcp add-json` vuole, controllata. */
export function configDaModulo(n: NuovoMcp): { ok: true; json: Record<string, unknown> } | { ok: false; messaggio: string } {
  if (!NOME_MCP.test(n.nome)) return { ok: false, messaggio: 'Il nome può avere lettere, numeri, trattini, punti e trattini bassi (fino a 64), e deve cominciare con una lettera o un numero.' }
  const variabili = n.variabili ?? {}
  const intestazioni = n.intestazioni ?? {}
  for (const k of Object.keys(variabili)) if (!NOME_VARIABILE.test(k)) return { ok: false, messaggio: `«${k}» non è un nome di variabile: lettere, numeri e trattino basso, senza spazi.` }
  for (const k of Object.keys(intestazioni)) if (!NOME_INTESTAZIONE.test(k)) return { ok: false, messaggio: `«${k}» non è un nome di intestazione HTTP: lettere, numeri e trattini.` }
  if (n.tipo === 'stdio') {
    const comando = (n.comando ?? '').trim()
    if (comando === '') return { ok: false, messaggio: 'Serve il comando che avvia il server (per esempio npx, node, uvx).' }
    return {
      ok: true,
      json: {
        type: 'stdio',
        command: comando,
        args: (n.argomenti ?? []).filter((a) => a !== ''),
        ...(Object.keys(variabili).length > 0 ? { env: variabili } : {})
      }
    }
  }
  const url = (n.url ?? '').trim()
  if (!/^https?:\/\/\S+$/i.test(url)) return { ok: false, messaggio: 'Serve l’indirizzo del server, che comincia con https:// (o http:// per uno sulla rete di casa).' }
  return { ok: true, json: { type: n.tipo, url, ...(Object.keys(intestazioni).length > 0 ? { headers: intestazioni } : {}) } }
}

const SCOPE_CLI: Record<NuovoMcp['ambito'], string> = { locale: 'local', utente: 'user', progetto: 'project' }

export async function aggiungiMcp(cwd: string, n: NuovoMcp): Promise<EsitoMcp> {
  const c = configDaModulo(n)
  if (!c.ok) return { ok: false, messaggio: c.messaggio }
  const r = await esegui(['mcp', 'add-json', '-s', SCOPE_CLI[n.ambito] ?? 'local', n.nome, JSON.stringify(c.json)], 30_000, cwd)
  if (!r.ok) return { ok: false, messaggio: r.motivo ?? motivoLeggibile(`${r.stderr}\n${r.stdout}`.trim()) }
  return { ok: true, fatto: cosaCambia('aggiungi-mcp') }
}

export async function togliMcp(cwd: string, nome: string, ambito: AmbitoMcp): Promise<EsitoMcp> {
  if (!NOME_MCP.test(nome)) return { ok: false, messaggio: 'nome non valido' }
  if (ambito === 'altro') return { ok: false, messaggio: 'Questo server arriva da un plugin o da claude.ai: si toglie spegnendo il plugin, o dalle impostazioni di claude.ai.' }
  const r = await esegui(['mcp', 'remove', '-s', SCOPE_CLI[ambito], nome], 30_000, cwd)
  if (!r.ok) return { ok: false, messaggio: r.motivo ?? motivoLeggibile(`${r.stderr}\n${r.stdout}`.trim()) }
  return { ok: true, fatto: cosaCambia('togli-mcp') }
}

/**
 * Accende o spegne un MCP per una cartella: `projects[cartella].disabledMcpServers`
 * dentro `.claude.json`, la stessa lista dell'interruttore di `/mcp`. Si cambia
 * quella sola chiave; il resto del file (decine di KB) resta identico.
 *
 * Accendendo si toglie anche il nome da `disabledMcpjsonServers` del
 * progetto, dove le versioni di prima lo scrivevano per sbaglio.
 */
export function commutaMcp(fileClaudeJson: string, cwd: string, nome: string, abilita: boolean): EsitoMcp {
  const j = leggiOggetto(fileClaudeJson)
  if (j === undefined) return { ok: false, messaggio: '.claude.json non leggibile: non lo tocco.' }
  const progetti = { ...oggetto(j.projects) }
  const chiave = chiaveProgetto(progetti, cwd)
  const prog = { ...oggetto(progetti[chiave]) }
  const spenti = new Set(stringhe(prog.disabledMcpServers))
  if (abilita) spenti.delete(nome)
  else spenti.add(nome)
  prog.disabledMcpServers = [...spenti]
  if (abilita && Array.isArray(prog.disabledMcpjsonServers)) {
    prog.disabledMcpjsonServers = stringhe(prog.disabledMcpjsonServers).filter((n) => n !== nome)
  }
  progetti[chiave] = prog
  j.projects = progetti
  return scriviAtomico(fileClaudeJson, `${JSON.stringify(j, null, 2)}\n`, 'negozio')
    ? { ok: true, fatto: cosaCambia(abilita ? 'attiva-mcp' : 'disattiva-mcp') }
    : { ok: false, messaggio: '.claude.json non salvato: guarda il registro.' }
}

/**
 * Approva o rifiuta un server del `.mcp.json` del progetto, dove lo mette
 * Claude Code: `.claude/settings.local.json` della cartella (personale, non
 * si condivide col progetto).
 */
export function approvaMcp(cwd: string, nome: string, approva: boolean): EsitoMcp {
  const file = join(cwd, '.claude', 'settings.local.json')
  const s = leggiOggetto(file)
  if (s === undefined) return { ok: false, messaggio: '.claude/settings.local.json non leggibile: non lo tocco.' }
  const si = new Set(stringhe(s.enabledMcpjsonServers))
  const no = new Set(stringhe(s.disabledMcpjsonServers))
  if (approva) { si.add(nome); no.delete(nome) } else { no.add(nome); si.delete(nome) }
  try {
    mkdirSync(dirname(file), { recursive: true })
  } catch {
    // se non si crea, lo dira' la scrittura qui sotto
  }
  s.enabledMcpjsonServers = [...si]
  s.disabledMcpjsonServers = [...no]
  return scriviAtomico(file, `${JSON.stringify(s, null, 2)}\n`, 'negozio')
    ? { ok: true, fatto: cosaCambia(approva ? 'approva-mcp' : 'rifiuta-mcp') }
    : { ok: false, messaggio: 'settings.local.json non salvato: guarda il registro.' }
}

/**
 * Le modifiche alle variabili o alle intestazioni: un valore nuovo, oppure
 * `null` per togliere la voce. Una voce che non c'è nelle modifiche resta
 * com'è — è così che si cambia una chiave senza dover riscrivere le altre,
 * che il telefono e la pagina non vedono mai.
 */
export type ModificheMcp = { variabili?: Record<string, string | null>; intestazioni?: Record<string, string | null> }

export function applicaModifiche(cfg: Record<string, unknown>, m: ModificheMcp): { ok: true; cfg: Record<string, unknown> } | { ok: false; messaggio: string } {
  const fuori = { ...cfg }
  const passa = (campo: 'env' | 'headers', mod: Record<string, string | null> | undefined, valido: RegExp, cosa: string): string | undefined => {
    if (mod === undefined) return undefined
    const att: Record<string, unknown> = { ...oggetto(fuori[campo]) }
    for (const [k, v] of Object.entries(mod)) {
      if (!valido.test(k)) return `«${k}» non è un nome di ${cosa} valido.`
      if (v === null) delete att[k]
      else att[k] = v
    }
    if (Object.keys(att).length === 0) delete fuori[campo]
    else fuori[campo] = att
    return undefined
  }
  const e1 = passa('env', m.variabili, NOME_VARIABILE, 'variabile')
  if (e1 !== undefined) return { ok: false, messaggio: e1 }
  const e2 = passa('headers', m.intestazioni, NOME_INTESTAZIONE, 'intestazione')
  if (e2 !== undefined) return { ok: false, messaggio: e2 }
  return { ok: true, cfg: fuori }
}

export function impostaVariabiliMcp(fileClaudeJson: string, cwd: string, nome: string, ambito: AmbitoMcp, m: ModificheMcp): EsitoMcp {
  if (ambito === 'altro') return { ok: false, messaggio: 'Questo server arriva da un plugin o da claude.ai: le sue impostazioni non stanno nei file di questo computer.' }
  const file = ambito === 'progetto' ? join(cwd, '.mcp.json') : fileClaudeJson
  const j = leggiOggetto(file)
  if (j === undefined) return { ok: false, messaggio: `${ambito === 'progetto' ? '.mcp.json' : '.claude.json'} non leggibile: non lo tocco.` }
  let contenitore: Record<string, unknown>
  let rimetti: (c: Record<string, unknown>) => void
  if (ambito === 'locale') {
    const progetti = { ...oggetto(j.projects) }
    const chiave = chiaveProgetto(progetti, cwd)
    const prog = { ...oggetto(progetti[chiave]) }
    contenitore = { ...oggetto(prog.mcpServers) }
    rimetti = (c) => { prog.mcpServers = c; progetti[chiave] = prog; j.projects = progetti }
  } else {
    contenitore = { ...oggetto(j.mcpServers) }
    rimetti = (c) => { j.mcpServers = c }
  }
  if (contenitore[nome] === undefined) return { ok: false, messaggio: `«${nome}» non c’è più in quel file: ricarica l’elenco.` }
  const a = applicaModifiche(oggetto(contenitore[nome]), m)
  if (!a.ok) return { ok: false, messaggio: a.messaggio }
  contenitore[nome] = a.cfg
  rimetti(contenitore)
  return scriviAtomico(file, `${JSON.stringify(j, null, 2)}\n`, 'negozio')
    ? { ok: true, fatto: cosaCambia('variabili-mcp') }
    : { ok: false, messaggio: 'File non salvato: guarda il registro.' }
}

export type { SaluteMcp }
