import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

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

export type PluginCatalogo = {
  nome: string
  descrizione: string
  autore?: string
  marketplace: string
}

export type ServitoreMcp = {
  nome: string
  /** Come è avviato: il comando o l'URL, per farlo vedere senza svelare troppo. */
  come: string
  abilitato: boolean
}

export type Skill = {
  nome: string
  descrizione: string
  /** Da dove arriva: personale (utente), di progetto, o portata da un plugin. */
  origine: 'utente' | 'progetto' | 'plugin'
  percorso: string
  /** Se è attiva: una in `skillOverrides` come «off» è installata ma spenta. */
  abilitata: boolean
}

function leggiJson<T>(percorso: string): T | undefined {
  if (!existsSync(percorso)) return undefined
  try {
    return JSON.parse(readFileSync(percorso, 'utf8')) as T
  } catch {
    return undefined
  }
}

/** Il catalogo: tutti i plugin offerti dai marketplace scaricati. */
export function catalogoPlugin(radiceClaude: string): PluginCatalogo[] {
  const noti = leggiJson<Record<string, { installLocation?: string }>>(
    join(radiceClaude, 'plugins', 'known_marketplaces.json')
  )
  if (noti === undefined) return []
  const fuori: PluginCatalogo[] = []
  for (const [nomeMkt, dati] of Object.entries(noti)) {
    const dove = dati.installLocation ?? join(radiceClaude, 'plugins', 'marketplaces', nomeMkt)
    const cat = leggiJson<{ plugins?: Array<{ name?: string; description?: string; author?: { name?: string } | string }> }>(
      join(dove, '.claude-plugin', 'marketplace.json')
    )
    for (const p of cat?.plugins ?? []) {
      if (typeof p.name !== 'string') continue
      const autore = typeof p.author === 'string' ? p.author : p.author?.name
      fuori.push({
        nome: p.name,
        descrizione: typeof p.description === 'string' ? p.description : '',
        ...(autore !== undefined ? { autore } : {}),
        marketplace: nomeMkt
      })
    }
  }
  return fuori
}

/** I marketplace conosciuti (nome → sorgente), per mostrarli e per aggiungerne. */
export function marketplaceNoti(radiceClaude: string): string[] {
  const noti = leggiJson<Record<string, unknown>>(join(radiceClaude, 'plugins', 'known_marketplaces.json'))
  return noti === undefined ? [] : Object.keys(noti)
}

/** Gli MCP configurati per un progetto, con se sono abilitati. */
export function mcpDiProgetto(fileClaudeJson: string, cwd: string): ServitoreMcp[] {
  const j = leggiJson<{ projects?: Record<string, {
    mcpServers?: Record<string, { command?: string; url?: string; type?: string }>
    enabledMcpjsonServers?: string[]
    disabledMcpjsonServers?: string[]
  }> }>(fileClaudeJson)
  const prog = j?.projects?.[cwd]
  if (prog?.mcpServers === undefined) return []
  const disabilitati = new Set(prog.disabledMcpjsonServers ?? [])
  return Object.entries(prog.mcpServers).map(([nome, cfg]) => ({
    nome,
    come: cfg.url ?? cfg.command ?? cfg.type ?? '?',
    abilitato: !disabilitati.has(nome)
  }))
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
        const val = (m[2] ?? '').replace(/^["']|["']$/g, '')
        if (m[1] === 'name') nome = val
        else descrizione = val
      }
    }
  } catch {
    // niente intestazione leggibile: resta il nome della cartella
  }
  return { nome, descrizione }
}

/** Le skill spente: i nomi che in `skillOverrides` valgono qualcosa di diverso
 * da attivo (per ora Claude Code usa «off»). Una skill assente qui è attiva. */
function skillSpente(radiceClaude: string): Set<string> {
  const s = leggiJson<{ skillOverrides?: Record<string, unknown> }>(join(radiceClaude, 'settings.json'))
  const over = s?.skillOverrides
  if (over === undefined) return new Set()
  const spente = new Set<string>()
  for (const [nome, val] of Object.entries(over)) {
    if (typeof val === 'string' && /off|disab/i.test(val)) spente.add(nome)
  }
  return spente
}

/** Le skill di una cartella `skills/`: ogni sottocartella con un `SKILL.md`. */
function skillInCartella(cartellaSkills: string, origine: Skill['origine'], spente: Set<string>): Skill[] {
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
    fuori.push({ nome: n, descrizione, origine, percorso: join(cartellaSkills, nome), abilitata: !spente.has(n) })
  }
  return fuori
}

/** Le skill disponibili: personali (utente) e del progetto corrente. */
export function skillDisponibili(radiceClaude: string, cwd?: string): Skill[] {
  const spente = skillSpente(radiceClaude)
  const utente = skillInCartella(join(radiceClaude, 'skills'), 'utente', spente)
  const progetto = cwd !== undefined ? skillInCartella(join(cwd, '.claude', 'skills'), 'progetto', spente) : []
  return [...utente, ...progetto]
}
