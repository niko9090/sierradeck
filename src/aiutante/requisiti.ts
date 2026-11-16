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

/** Il risultato grezzo di `execFile` (con la shell un comando mancante dà codice 1, non ENOENT). */
export type EsitoComando = { codice?: number | string | null; killed?: boolean; stderr?: string }

/** Il testo che chiude un motivo di timeout: index.ts lo usa per rimisurare presto. */
export const MOTIVO_TIMEOUT = 'non ha risposto in 20 s (PC occupato): riprovo'

/**
 * Il motivo, in italiano, per cui un comando di versione è fallito. Pura.
 * `chi` è il nome da mostrare («npm»), `comando` quello provato.
 */
export function motivoComandoFallito(chi: string, comando: string, e: EsitoComando): string {
  if (e.killed === true) return MOTIVO_TIMEOUT
  const errTesto = (e.stderr ?? '').replace(/\s+/gu, ' ').trim()
  if (e.codice === 'ENOENT' || /non (?:è )?riconosciut|not recognized|not found|command not found|impossibile trovare|cannot find/iu.test(errTesto)) {
    return chi === 'npm' || chi === 'node'
      ? 'non installato: installa Node.js LTS (porta npm), poi riavvia l\'Aiutante'
      : 'non installato (o non nel PATH): installalo, poi riavvia l\'Aiutante'
  }
  return `c'è ma \`${comando}\` esce con errore${errTesto !== '' ? `: ${errTesto.slice(0, 120)}` : ` (codice ${String(e.codice ?? '?')})`}`
}

function versioneDi(comando: string, args: string[], shell = false): Promise<Versione> {
  return new Promise((ok) => {
    execFile(comando, args, { windowsHide: true, timeout: 20_000, shell }, (err, out, errOut) => {
      if (err !== null) {
        const e = err as NodeJS.ErrnoException & { killed?: boolean }
        ok({ ok: false, motivo: motivoComandoFallito(comando === 'npm' ? 'npm' : comando, `${comando} ${args.join(' ')}`, { codice: e.code, killed: e.killed === true, stderr: String(errOut ?? '') }) })
      } else ok({ ok: true, versione: String(out).trim().split(/\r?\n/u)[0]?.slice(0, 80) ?? '' })
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
