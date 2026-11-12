import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, statfsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { MisureRequisiti } from './regole'

/**
 * **Cosa serve all'Aiutante per lavorare** (12/11), misurato su questo PC:
 * Claude Code (installato e con l'accesso fatto), git, Node.js e npm, e spazio
 * sul disco. Senza uno di questi un lavoro arriverebbe e fallirebbe a metà:
 * meglio dire 0 posti e scriverlo (nella finestra e nello storico degli errori).
 */

type Versione = { ok: true; versione: string } | { ok: false; motivo: string }

function versioneDi(comando: string, args: string[], shell = false): Promise<Versione> {
  return new Promise((ok) => {
    execFile(comando, args, { windowsHide: true, timeout: 20_000, shell }, (err, out) => {
      if (err !== null) ok({ ok: false, motivo: (err as NodeJS.ErrnoException).code === 'ENOENT' ? 'non installato (o non nel PATH)' : err.message.replace(/\s+/gu, ' ').slice(0, 160) })
      else ok({ ok: true, versione: String(out).trim().split(/\r?\n/u)[0]?.slice(0, 80) ?? '' })
    })
  })
}

/**
 * L'accesso a Claude Code: le credenziali che la CLI scrive dopo il login
 * (`.credentials.json` nella sua cartella), o una chiave nell'ambiente. Non è
 * una prova piena (un accesso scaduto si vede solo al primo lavoro), ma
 * distingue il caso più comune: un PC su cui nessuno ha mai fatto l'accesso.
 */
export function accessoClaude(env: NodeJS.ProcessEnv = process.env, esiste: (p: string) => boolean = existsSync): boolean {
  if ((env.ANTHROPIC_API_KEY ?? '').trim() !== '' || (env.CLAUDE_CODE_OAUTH_TOKEN ?? '').trim() !== '') return true
  const cartella = env.CLAUDE_CONFIG_DIR !== undefined && env.CLAUDE_CONFIG_DIR.trim() !== '' ? env.CLAUDE_CONFIG_DIR : join(homedir(), '.claude')
  return esiste(join(cartella, '.credentials.json'))
}

/** Lo spazio libero dove l'Aiutante lavora (la cartella si crea se manca). */
export function discoLibero(cartella: string): number | undefined {
  try {
    mkdirSync(cartella, { recursive: true })
    const s = statfsSync(cartella)
    return Number(s.bavail) * Number(s.bsize)
  } catch { return undefined }
}

export async function misuraRequisiti(p: { claude: string; cartellaLavoro: string }): Promise<MisureRequisiti> {
  const [claude, git, node, npm] = await Promise.all([
    versioneDi(p.claude, ['--version']),
    versioneDi('git', ['--version']),
    versioneDi('node', ['--version']),
    // npm su Windows è `npm.cmd`: passa dalla shell.
    versioneDi('npm', ['--version'], true)
  ])
  const disco = discoLibero(p.cartellaLavoro)
  return { claude, claudeAccesso: accessoClaude(), git, node, npm, ...(disco !== undefined ? { discoLibero: disco } : {}) }
}
