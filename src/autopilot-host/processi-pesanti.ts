import { execFile } from 'node:child_process'
import * as os from 'node:os'
import { leggiProcessi, piuPesante, type PcCarico } from '@shared/guardia-pc'

/**
 * Il programma che consuma di più, per la riga «PC carico: aspetto» (0.85.1).
 * Solo lettura: `Get-Process` guarda, non chiude niente. Si chiama solo quando
 * il PC è già carico, una volta per episodio.
 */

const INTERVALLO_MS = 1000

const SCRIPT_MEMORIA = 'Get-Process | ForEach-Object { "$($_.ProcessName)|$($_.WorkingSet64)" }'
const SCRIPT_PROCESSORE = [
  '$a = Get-Process | ForEach-Object { "$($_.ProcessName)|$($_.CPU)" }',
  `Start-Sleep -Milliseconds ${INTERVALLO_MS}`,
  '$b = Get-Process | ForEach-Object { "$($_.ProcessName)|$($_.CPU)" }',
  '$a -join "`n"',
  '"---"',
  '$b -join "`n"'
].join('; ')

export function programmaPiuPesante(per: PcCarico['per']): Promise<string | undefined> {
  if (process.platform !== 'win32') return Promise.resolve(undefined)
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', per === 'memoria' ? SCRIPT_MEMORIA : SCRIPT_PROCESSORE],
      { windowsHide: true, timeout: 20_000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        if (err !== null) { resolve(undefined); return }
        if (per === 'memoria') { resolve(piuPesante('memoria', { dopo: leggiProcessi(stdout) })); return }
        const [prima = '', dopo = ''] = stdout.split(/^---\s*$/m)
        resolve(piuPesante('processore', { prima: leggiProcessi(prima), dopo: leggiProcessi(dopo), intervalloMs: INTERVALLO_MS, processori: os.cpus().length }))
      })
  })
}
