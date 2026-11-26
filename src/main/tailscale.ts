import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { indirizziTailscaleDi } from '@shared/scoperta-pc'

/**
 * Gli indirizzi Tailscale **di adesso** di un PC, per nome (0.39.3).
 *
 * Il battito sul Drive ricorda gli indirizzi di quando e' stato scritto, ma
 * quelli di Tailscale possono cambiare: il 02/10 il battito del portatile
 * diceva 100.64.0.21, e Tailscale lo dava a 100.64.0.20. Si chiede a
 * `tailscale status --json` (il programma ufficiale, firmato), con un tetto di
 * tre secondi e una memoria di un minuto. Senza Tailscale installato: niente.
 */
let memoria: { quando: number; stato: unknown } | undefined

function eseguibile(): string | undefined {
  const candidati = [
    join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Tailscale', 'tailscale.exe'),
    join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Tailscale', 'tailscale.exe')
  ]
  return candidati.find((c) => existsSync(c))
}

function statoTailscale(): Promise<unknown> {
  if (memoria !== undefined && Date.now() - memoria.quando < 60_000) return Promise.resolve(memoria.stato)
  const exe = process.platform === 'win32' ? eseguibile() : 'tailscale'
  if (exe === undefined) return Promise.resolve(undefined)
  return new Promise((risolvi) => {
    try {
      execFile(exe, ['status', '--json'], { timeout: 3000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, out) => {
        let stato: unknown
        try { stato = err === null ? JSON.parse(out) : undefined } catch { stato = undefined }
        memoria = { quando: Date.now(), stato }
        risolvi(stato)
      })
    } catch {
      memoria = { quando: Date.now(), stato: undefined }
      risolvi(undefined)
    }
  })
}

/** `noti`: gli indirizzi del battito di quel PC, per riconoscerlo anche se su Tailscale ha un altro nome (0.57.1). */
export async function indirizziTailscale(nomePc: string, noti: string[] = []): Promise<string[]> {
  return indirizziTailscaleDi(await statoTailscale(), nomePc, noti).indirizzi
}

/**
 * 26/11: quel PC è in linea su Tailscale? Nicholas: «nei PC mi dice che gli
 * altri sono spenti», e il portatile era acceso (Tailscale: «active; direct»)
 * con SierraDeck chiuso. Si riconosce dagli indirizzi del suo battito o dai
 * suoi nomi (hostname, nome scelto), mai da nomi scritti qui. `undefined`:
 * Tailscale non c'è, non risponde, o quel PC non è nella sua rete. Non lancia mai.
 */
export async function inLineaSuTailscale(nomi: readonly (string | undefined)[], noti: string[] = []): Promise<boolean | undefined> {
  try {
    const stato = await statoTailscale()
    if (stato === undefined) return undefined
    const candidati = [...nomi.filter((n): n is string => typeof n === 'string' && n.trim() !== ''), '']
    for (const n of candidati) {
      const r = indirizziTailscaleDi(stato, n, noti)
      if (r.online !== undefined) return r.online
    }
    return undefined
  } catch { return undefined }
}
