import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { statoSkill, type SkillVoce, type PluginVoce } from '@shared/negozio'

/**
 * Il **negozio**, lato lettura: cosa c'è già e cosa si può installare.
 *
 * Non inventa niente — legge i file veri di Claude Code. Il catalogo dei plugin
 * sta nei «marketplace» scaricati (`~/.claude/plugins/marketplaces/<m>/
 * .claude-plugin/marketplace.json`); gli MCP di un progetto stanno in
 * `~/.claude.json` sotto `projects[cwd]`; le skill sono cartelle con dentro un
 * `SKILL.md`, a livello utente (`~/.claude/skills`) o di progetto
 * (`<cwd>/.claude/skills`). Qui si raccolgono e si normalizzano, così l'interfaccia
 * mostra a colpo d'occhio ciò che da terminale si guarderebbe con più comandi.
 *
 * Tutto tollerante ai file mancanti: una cartella che non c'è è «niente», non un
 * errore — un utente che non ha mai toccato plugin o MCP deve vedere un negozio
 * vuoto, non un guasto.
 */

export type Skill = SkillVoce

export type Agente = {
  nome: string
  descrizione: string
  /** Da dove arriva: personale (utente) o di progetto. */
  origine: 'utente' | 'progetto'
  percorso: string
  /** Quali strumenti può usare, se dichiarati nell'intestazione. */
  strumenti?: string
  /** Con quale modello gira, se dichiarato. */
  modello?: string
}

function leggiJson<T>(percorso: string): T | undefined {
  if (!existsSync(percorso)) return undefined
  try {
    return JSON.parse(readFileSync(percorso, 'utf8')) as T
  } catch {
    return undefined
  }
}

/**
 * Dove stanno i file di Claude Code su questo computer. Con
 * `CLAUDE_CONFIG_DIR` (lo usa chi tiene la configurazione altrove, e le
 * prove del negozio) **anche** `.claude.json` sta lì dentro, non nella home:
 * è così che si comporta Claude Code 2.1.294, provato.
 */
export function percorsiClaude(env: Record<string, string | undefined> = process.env, casa: string = homedir()): { radice: string; fileClaudeJson: string } {
  const dir = env.CLAUDE_CONFIG_DIR
  if (dir !== undefined && dir.trim() !== '') return { radice: dir, fileClaudeJson: join(dir, '.claude.json') }
  return { radice: join(casa, '.claude'), fileClaudeJson: join(casa, '.claude.json') }
}

/**
 * Le versioni nel catalogo dei marketplace scaricati (`id` → version o sha).
 * Serve per i plugin **installati**: il CLI 2.1.294 li toglie dall'elenco
 * dei disponibili, e senza questo non si saprebbe che c'è un aggiornamento.
 */
export function versioniCatalogo(radiceClaude: string): Map<string, { version?: string; sha?: string; description?: string }> {
  const fuori = new Map<string, { version?: string; sha?: string; description?: string }>()
  const noti = leggiJson<Record<string, { installLocation?: string }>>(
    join(radiceClaude, 'plugins', 'known_marketplaces.json')
  )
  if (noti === undefined) return fuori
  for (const [nomeMkt, dati] of Object.entries(noti)) {
    const dove = dati?.installLocation ?? join(radiceClaude, 'plugins', 'marketplaces', nomeMkt)
    const cat = leggiJson<{ plugins?: Array<{ name?: string; version?: string; source?: unknown; description?: unknown }> }>(
      join(dove, '.claude-plugin', 'marketplace.json')
    )
    for (const p of cat?.plugins ?? []) {
      if (typeof p?.name !== 'string') continue
      const src = p.source
      const sha = src !== null && typeof src === 'object' && typeof (src as { sha?: unknown }).sha === 'string' ? (src as { sha: string }).sha : undefined
      fuori.set(`${p.name}@${nomeMkt}`, {
        ...(typeof p.version === 'string' ? { version: p.version } : {}),
        ...(sha !== undefined ? { sha } : {}),
        ...(typeof p.description === 'string' && p.description !== '' ? { description: p.description } : {})
      })
    }
  }
  return fuori
}

/** Quando ogni marketplace è stato riletto dalla sua sorgente (nome → data ISO). */
export function marketplaceAggiornati(radiceClaude: string): Record<string, string> {
  const noti = leggiJson<Record<string, { lastUpdated?: unknown }>>(join(radiceClaude, 'plugins', 'known_marketplaces.json'))
  const fuori: Record<string, string> = {}
  for (const [nome, d] of Object.entries(noti ?? {})) if (typeof d?.lastUpdated === 'string') fuori[nome] = d.lastUpdated
  return fuori
}

/**
 * La chiave con cui `~/.claude.json` conosce una cartella.
 *
 * Claude Code la scrive come la riceve: sullo stesso PC la stessa cartella
 * sta due volte, `C:\\Users\\nikof` e `C:/Users/nikof`. Con un confronto
 * esatto la scheda MCP era vuota e «commuta» creava un ramo nuovo sotto una
 * chiave che Claude Code non guarda. Si prende la chiave esistente che
 * coincide a meno di barre, maiuscole e barra finale; nuova solo se nessuna.
 */
export function chiaveProgetto(projects: Record<string, unknown> | undefined, cwd: string): string {
  if (projects === undefined || projects[cwd] !== undefined) return cwd
  const norm = (p: string): string => p.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
  const voluta = norm(cwd)
  return Object.keys(projects).find((k) => norm(k) === voluta) ?? cwd
}

/**
 * Un valore YAML su una riga: fra doppi apici con le sequenze di JSON (come
 * le scrive il negozio, e come le legge Claude Code), fra apici semplici, o
 * nudo.
 */
function valoreYaml(v: string): string {
  const t = v.trim()
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    try {
      const x = JSON.parse(t) as unknown
      if (typeof x === 'string') return x
    } catch {
      // non e' JSON: si tolgono solo gli apici
    }
    return t.slice(1, -1)
  }
  if (t.length >= 2 && t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1).replace(/''/g, "'")
  return t
}

/** Legge nome e descrizione dall'intestazione YAML di un SKILL.md. */
function leggiSkillMd(percorso: string, nomeCartella: string): { nome: string; descrizione: string } {
  let nome = nomeCartella
  let descrizione = ''
  try {
    const testo = readFileSync(percorso, 'utf8')
    if (testo.startsWith('---')) {
      const fine = testo.indexOf('\n---', 3)
      const testa = fine === -1 ? testo.slice(3) : testo.slice(3, fine)
      for (const riga of testa.split('\n')) {
        const m = /^\s*(name|description)\s*:\s*(.+?)\s*$/.exec(riga)
        if (m === null) continue
        const val = valoreYaml(m[2] ?? '')
        if (m[1] === 'name') nome = val
        else descrizione = val
      }
    }
  } catch {
    // niente intestazione leggibile: resta il nome della cartella
  }
  return { nome, descrizione }
}

/**
 * Gli override delle skill (`skillOverrides`: on, name-only,
 * user-invocable-only, off), da tutti i file in cui Claude Code li legge:
 * l'utente, poi il progetto (`.claude/settings.json`), poi il locale
 * (`.claude/settings.local.json`), che vince. Prima si guardava solo il file
 * dell'utente: una skill spenta per il progetto si vedeva accesa.
 */
export function overrideSkill(radiceClaude: string, cwd?: string): Map<string, string> {
  const file = [join(radiceClaude, 'settings.json')]
  if (cwd !== undefined) file.push(join(cwd, '.claude', 'settings.json'), join(cwd, '.claude', 'settings.local.json'))
  const fuori = new Map<string, string>()
  for (const f of file) {
    const over = leggiJson<{ skillOverrides?: Record<string, unknown> }>(f)?.skillOverrides
    if (over === undefined || over === null || typeof over !== 'object') continue
    for (const [nome, val] of Object.entries(over)) if (typeof val === 'string') fuori.set(nome, val)
  }
  return fuori
}

function spenta(val: string | undefined): boolean {
  return val !== undefined && /^(off|disab)/i.test(val)
}

/** Le skill di una cartella `skills/`: ogni sottocartella con un `SKILL.md`. */
function skillInCartella(cartellaSkills: string, origine: Skill['origine'], over: Map<string, string>, plugin?: { nome: string; acceso: boolean }): Skill[] {
  if (!existsSync(cartellaSkills)) return []
  const fuori: Skill[] = []
  let voci: string[]
  try {
    voci = readdirSync(cartellaSkills)
  } catch {
    return []
  }
  for (const nome of voci) {
    const md = join(cartellaSkills, nome, 'SKILL.md')
    if (!existsSync(md)) continue
    const { nome: n, descrizione } = leggiSkillMd(md, nome)
    // Le skill di un plugin non sentono `skillOverrides` (documentazione di
    // Claude Code): sono accese finché il plugin è acceso.
    const val = plugin === undefined ? over.get(n) : undefined
    const s: Skill = {
      nome: plugin === undefined ? n : `${plugin.nome}:${n}`,
      descrizione,
      origine,
      percorso: join(cartellaSkills, nome),
      abilitata: plugin === undefined ? !spenta(val) : plugin.acceso,
      ...(val !== undefined && !spenta(val) && val !== 'on' ? { override: val } : {}),
      ...(plugin !== undefined ? { plugin: plugin.nome } : {})
    }
    fuori.push({ ...s, stato: statoSkill(s) })
  }
  return fuori
}

/**
 * Le skill disponibili: personali (utente), del progetto corrente e, se si
 * passano i plugin installati, quelle che portano loro (in sola lettura:
 * si accendono e si spengono col plugin).
 */
export function skillDisponibili(radiceClaude: string, cwd?: string, plugin: PluginVoce[] = []): Skill[] {
  const over = overrideSkill(radiceClaude, cwd)
  const utente = skillInCartella(join(radiceClaude, 'skills'), 'utente', over)
  const progetto = cwd !== undefined ? skillInCartella(join(cwd, '.claude', 'skills'), 'progetto', over) : []
  const daPlugin = plugin
    .filter((p) => p.installato && p.percorso !== undefined)
    .flatMap((p) => skillInCartella(join(p.percorso as string, 'skills'), 'plugin', over, { nome: p.nome, acceso: p.abilitato }))
  return [...utente, ...progetto, ...daPlugin]
}

/** Legge le voci volute dall'intestazione YAML di un file agente. */
function leggiTestaAgente(percorso: string): { nome?: string; descrizione?: string; strumenti?: string; modello?: string } {
  const fuori: { nome?: string; descrizione?: string; strumenti?: string; modello?: string } = {}
  try {
    const testo = readFileSync(percorso, 'utf8')
    if (!testo.startsWith('---')) return fuori
    const fine = testo.indexOf('\n---', 3)
    const testa = fine === -1 ? testo.slice(3) : testo.slice(3, fine)
    for (const riga of testa.split('\n')) {
      const m = /^\s*(name|description|tools|model)\s*:\s*(.+?)\s*$/.exec(riga)
      if (m === null) continue
      const val = valoreYaml(m[2] ?? '')
      if (m[1] === 'name') fuori.nome = val
      else if (m[1] === 'description') fuori.descrizione = val
      else if (m[1] === 'tools') fuori.strumenti = val
      else if (m[1] === 'model') fuori.modello = val
    }
  } catch {
    // niente intestazione leggibile: resta il nome del file
  }
  return fuori
}

/** Gli agenti di una cartella `agents/`: ogni file `.md` è un agente. */
function agentiInCartella(cartella: string, origine: Agente['origine']): Agente[] {
  if (!existsSync(cartella)) return []
  let voci: string[]
  try {
    voci = readdirSync(cartella)
  } catch {
    return []
  }
  const fuori: Agente[] = []
  for (const file of voci) {
    if (!file.endsWith('.md')) continue
    const percorso = join(cartella, file)
    const t = leggiTestaAgente(percorso)
    fuori.push({
      nome: t.nome ?? file.replace(/\.md$/, ''),
      descrizione: t.descrizione ?? '',
      origine,
      percorso,
      ...(t.strumenti !== undefined ? { strumenti: t.strumenti } : {}),
      ...(t.modello !== undefined ? { modello: t.modello } : {})
    })
  }
  return fuori
}

/** Gli agenti (subagent) disponibili: personali (utente) e del progetto. */
export function agentiDisponibili(radiceClaude: string, cwd?: string): Agente[] {
  const utente = agentiInCartella(join(radiceClaude, 'agents'), 'utente')
  const progetto = cwd !== undefined ? agentiInCartella(join(cwd, '.claude', 'agents'), 'progetto') : []
  return [...utente, ...progetto]
}
