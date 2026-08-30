import { existsSync, readFileSync } from 'node:fs'
import { scriviAtomico } from '@shared/scrittura-atomica'
import { join } from 'node:path'

/**
 * Il negozio, lato scrittura per skill e MCP: qui non c'è un CLID a cui delegare
 * come per i plugin, quindi si toccano i file — ma con le pinze.
 *
 * Una **skill** non si disattiva cancellandola: si mette in `skillOverrides` del
 * `settings.json` («off»). Un **MCP** di progetto si disattiva aggiungendolo a
 * `disabledMcpjsonServers` dentro `~/.claude.json`, sotto il progetto giusto.
 *
 * `~/.claude.json` è il file più delicato dell'utente (decine di KB, tutta la sua
 * configurazione): si legge, si cambia **una sola chiave**, si riscrive tutto il
 * resto identico. Se non è leggibile non si scrive: meglio un'azione che non
 * riesce che un file corrotto.
 */

export type EsitoAzione = { ok: boolean; messaggio?: string }

function leggiOggetto(percorso: string): Record<string, unknown> | undefined {
  if (!existsSync(percorso)) return {}
  try {
    const val = JSON.parse(readFileSync(percorso, 'utf8')) as unknown
    if (val === null || typeof val !== 'object' || Array.isArray(val)) return undefined
    return val as Record<string, unknown>
  } catch {
    return undefined
  }
}

/**
 * Qui dentro ci sono `~/.claude.json` e i `settings.json`: i file piu' delicati
 * che questo programma tocchi. Una scrittura interrotta a meta' — chiusura
 * brutale, disco pieno — li lasciava **troncati al posto di quelli di prima**,
 * cioe' faceva sparire in un colpo i server MCP, i permessi e la cronologia dei
 * progetti di Claude Code. Su temporaneo e poi rinomina: o c'e' tutto il
 * contenuto nuovo, o resta tutto quello vecchio.
 */
function scrivi(percorso: string, dati: unknown): boolean {
  return scriviAtomico(percorso, `${JSON.stringify(dati, null, 2)}\n`, 'negozio')
}

/**
 * Attiva o disattiva una skill senza toccarne i file: `skillOverrides[nome]`
 * diventa `'off'` per spegnerla, e si toglie del tutto per riaccenderla (così il
 * file non si riempie di voci morte).
 */
export function commutaSkill(radiceClaude: string, nome: string, abilita: boolean): EsitoAzione {
  const percorso = join(radiceClaude, 'settings.json')
  const s = leggiOggetto(percorso)
  if (s === undefined) return { ok: false, messaggio: 'settings.json non leggibile' }
  const over = (s.skillOverrides !== null && typeof s.skillOverrides === 'object' && !Array.isArray(s.skillOverrides)
    ? { ...(s.skillOverrides as Record<string, unknown>) }
    : {}) as Record<string, unknown>
  if (abilita) delete over[nome]
  else over[nome] = 'off'
  if (Object.keys(over).length === 0) delete s.skillOverrides
  else s.skillOverrides = over
  // **Si guarda se ha scritto davvero.** `scriviAtomico` non solleva mai — e'
  // il suo contratto, perche' chi lo chiama e' quasi sempre dentro un canale a
  // senso unico — quindi il `try`/`catch` che stava qui non poteva scattare, e
  // un salvataggio fallito tornava indietro come `ok: true`: il pannello
  // diceva fatto, e non era cambiato niente.
  return scrivi(percorso, s)
    ? { ok: true }
    : { ok: false, messaggio: 'settings.json non salvato: guarda il registro' }
}

/**
 * Attiva o disattiva un MCP di un progetto: `disabledMcpjsonServers` del progetto
 * dentro `~/.claude.json`. Si crea il ramo del progetto solo se serve, e non si
 * inventa nulla che non ci fosse già.
 */
export function commutaMcp(fileClaudeJson: string, cwd: string, nome: string, abilita: boolean): EsitoAzione {
  const j = leggiOggetto(fileClaudeJson)
  if (j === undefined) return { ok: false, messaggio: '.claude.json non leggibile' }
  const projects = (j.projects !== null && typeof j.projects === 'object' && !Array.isArray(j.projects)
    ? j.projects
    : {}) as Record<string, unknown>
  const prog = (projects[cwd] !== null && typeof projects[cwd] === 'object' && !Array.isArray(projects[cwd])
    ? { ...(projects[cwd] as Record<string, unknown>) }
    : {}) as Record<string, unknown>
  const disabilitati = new Set(Array.isArray(prog.disabledMcpjsonServers)
    ? (prog.disabledMcpjsonServers as unknown[]).filter((x): x is string => typeof x === 'string')
    : [])
  if (abilita) disabilitati.delete(nome)
  else disabilitati.add(nome)
  if (disabilitati.size === 0) delete prog.disabledMcpjsonServers
  else prog.disabledMcpjsonServers = [...disabilitati]
  projects[cwd] = prog
  j.projects = projects
  // Come sopra: e' il valore di ritorno a dire com'e' andata, non un'eccezione
  // che non arrivera' mai.
  return scrivi(fileClaudeJson, j)
    ? { ok: true }
    : { ok: false, messaggio: '.claude.json non salvato: guarda il registro' }
}
