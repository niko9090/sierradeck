import { isAbsolute, join, resolve } from 'node:path'
import { dentro, type Giudizio } from './divieti'

/**
 * **La guardia dell'autopilota unico** (P3, 30/10/2026): il PreToolUse del
 * processo `claude` dell'orchestratore, per lui e per i suoi subagenti.
 *
 * Il processo gira nella cartella principale, con `acceptEdits`: senza
 * guardia l'orchestratore (o uno specialista che esce dalla sua copia)
 * potrebbe scrivere nel principale e unire da sé, scavalcando il cancello.
 *
 * Chi chiama lo dice il payload dell'hook, provato dal vivo con la CLI
 * 2.1.314: i subagenti portano `agent_id` (lo stesso id del task, e il loro
 * worktree è `<principale>/.claude/worktrees/agent-<id>`, ramo
 * `worktree-agent-<id>`) e `agent_type`, con `cwd` nel worktree; l'agente
 * principale non porta `agent_id`. `transcript_path` è quello della
 * sessione principale per tutti e due: non distingue.
 *
 * - l'orchestratore non scrive e non lancia comandi: legge e affida;
 * - nessuno scrive file del principale fuori da `.claude/worktrees/`;
 * - nessuno fa merge, commit, reset, checkout, rebase… nel principale, e
 *   nessuno fa push;
 * - un nuovo specialista parte solo se sul PC ce ne sono meno del tetto.
 */

export const STRUMENTI_SCRITTURA = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'] as const
export const STRUMENTI_SHELL = ['Bash', 'PowerShell'] as const
export const STRUMENTI_AGENTE = ['Agent', 'Task'] as const
/** Il matcher del PreToolUse dell'orchestratore. */
export const MATCHER_GUARDIA = [...STRUMENTI_SCRITTURA, ...STRUMENTI_SHELL, ...STRUMENTI_AGENTE].join('|')

/** Dove la CLI mette i worktree dei subagenti con `isolation: "worktree"`. */
export const CARTELLA_WORKTREE_SUBAGENTI = join('.claude', 'worktrees')

export type ContestoGuardia = {
  /** La cartella principale del workspace (il cwd dell'autopilota unico). */
  radice: string
  /** Gli specialisti al lavoro su tutto il PC (subagenti di ogni workspace). */
  specialistiSulPc: number
  /** Il tetto del PC: `min(posti, 4)`. */
  tettoPc: number
}

const o = (x: unknown): Record<string, unknown> => (typeof x === 'object' && x !== null && !Array.isArray(x) ? x as Record<string, unknown> : {})
const s = (x: unknown): string | undefined => (typeof x === 'string' && x.trim() !== '' ? x.trim() : undefined)

/** L'id del subagente che chiama; `undefined` per l'agente principale (l'orchestratore). */
export function agenteDelHook(corpo: Record<string, unknown>): string | undefined {
  return s(corpo.agent_id)
}

/** Dentro il principale ma fuori dai worktree dei subagenti. */
export function nelPrincipale(percorso: string, radice: string): boolean {
  return dentro(percorso, radice) && !dentro(percorso, join(radice, CARTELLA_WORKTREE_SUBAGENTI))
}

const togliVirgolette = (x: string): string => x.replace(/^["']|["']$/gu, '')

/**
 * La cartella in cui gira un comando git: `git -C <dir>`, se no l'ultimo
 * `cd`/`Set-Location`/`pushd` prima di lui, se no il `cwd` dell'hook.
 */
export function cartellaDelGit(comando: string, pezzoGit: number, cwd: string): string {
  const prima = comando.slice(0, pezzoGit)
  let dir = cwd
  const re = /(?:^|[;&|]\s*|\b)(?:cd|Set-Location|sl|pushd|chdir)\s+(?:-Path\s+|-LiteralPath\s+|\/d\s+)?("[^"]+"|'[^']+'|[^\s;&|]+)/giu
  for (const m of prima.matchAll(re)) {
    const d = togliVirgolette(m[1]!)
    dir = isAbsolute(d) || /^[a-zA-Z]:/u.test(d) ? d : resolve(dir, d)
  }
  const c = /^git\s+(?:-c\s+\S+\s+)*-C\s+("[^"]+"|'[^']+'|\S+)/u.exec(comando.slice(pezzoGit))
  if (c !== null) {
    const d = togliVirgolette(c[1]!)
    dir = isAbsolute(d) || /^[a-zA-Z]:/u.test(d) ? d : resolve(dir, d)
  }
  return dir
}

const GIT_CHE_CAMBIA = /^(merge|commit|reset|checkout|switch|rebase|cherry-pick|revert|stash|am|apply|pull|restore|rm|mv|add|update-ref|clean)$/u

/** I comandi git di un comando di shell: il verbo e dove comincia. */
export function comandiGit(comando: string): { verbo: string; indice: number }[] {
  const fuori: { verbo: string; indice: number }[] = []
  const re = /(?:^|[;&|(]\s*|\n\s*)(git(?:\.exe)?)((?:\s+(?:-c\s+\S+|-C\s+(?:"[^"]+"|'[^']+'|\S+)|--no-pager|--git-dir=\S+|--work-tree=\S+))*)\s+([a-z][\w-]*)/giu
  for (const m of comando.matchAll(re)) {
    const indice = (m.index ?? 0) + m[0].indexOf(m[1]!)
    fuori.push({ verbo: m[3]!.toLowerCase(), indice })
  }
  return fuori
}

export function giudicaGuardiaOrchestratore(corpo: Record<string, unknown>, c: ContestoGuardia): Giudizio {
  const nome = s(corpo.tool_name) ?? ''
  const input = o(corpo.tool_input)
  const agente = agenteDelHook(corpo)
  const cwd = s(corpo.cwd) ?? c.radice

  if (agente === undefined) {
    if ((STRUMENTI_SCRITTURA as readonly string[]).includes(nome) || (STRUMENTI_SHELL as readonly string[]).includes(nome)) {
      return { ok: false, motivo: 'Sei l’orchestratore: non modifichi file e non lanci comandi. Leggi (Read, Grep, Glob) e affida il lavoro a uno specialista con Agent; per unire usa lo strumento unisci.' }
    }
    if ((STRUMENTI_AGENTE as readonly string[]).includes(nome) && c.specialistiSulPc >= c.tettoPc) {
      return { ok: false, motivo: `aspetta: troppi specialisti attivi sul PC (${c.specialistiSulPc} su ${c.tettoPc}). Riprova quando uno ha finito; intanto non rilanciare.` }
    }
    return { ok: true }
  }

  if ((STRUMENTI_SCRITTURA as readonly string[]).includes(nome)) {
    const bersaglio = s(input.file_path) ?? s(input.notebook_path) ?? s(input.path)
    if (bersaglio !== undefined) {
      const assoluto = isAbsolute(bersaglio) || /^[a-zA-Z]:/u.test(bersaglio) ? bersaglio : resolve(cwd, bersaglio)
      if (nelPrincipale(assoluto, c.radice)) {
        return { ok: false, motivo: `«${bersaglio}» è nella cartella principale: lavori solo nella tua copia (${cwd}). Usa percorsi relativi alla tua copia.` }
      }
    }
    return { ok: true }
  }

  if ((STRUMENTI_SHELL as readonly string[]).includes(nome)) {
    const comando = s(input.command) ?? ''
    for (const g of comandiGit(comando)) {
      if (g.verbo === 'push') return { ok: false, motivo: 'Niente push: il ramo lo unisce l’autopilota con il cancello.' }
      if (!GIT_CHE_CAMBIA.test(g.verbo)) continue
      const dir = cartellaDelGit(comando, g.indice, cwd)
      if (nelPrincipale(dir, c.radice)) {
        return { ok: false, motivo: `git ${g.verbo} nella cartella principale non si fa: lavori e fai commit solo nella tua copia (${cwd}); unisce l’autopilota.` }
      }
    }
  }
  return { ok: true }
}
