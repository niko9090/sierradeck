import { execFile } from 'node:child_process'
import { mkdirSync, statfsSync } from 'node:fs'
import type { MisureRequisiti } from './regole'

/**
 * **Cosa serve all'Aiutante per lavorare** (12/11), misurato su questo PC:
 * Claude Code installato, git, Node.js e npm, e spazio sul disco. Senza uno
 * di questi un lavoro arriverebbe e fallirebbe a metà: meglio dire 0 posti
 * e scriverlo (nella finestra e nello storico degli errori). Che Claude
 * funzioni davvero (accesso fatto e non scaduto) lo prova `controllo-claude.ts`
 * (1.0.3): prima si guardava solo il file delle credenziali.
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
  return { claude, git, node, npm, ...(disco !== undefined ? { discoLibero: disco } : {}) }
}
