import { execFile } from 'node:child_process'
import { RELEASE_RICORDATE, type Autopilota, type ReleaseUscita } from '@shared/autopilota'

/**
 * Le release uscite con la data (0.85.0, velocità misurata): senza, il Punto
 * non sa dire quando una richiesta di Nicholas è arrivata in una versione.
 * Il servizio le rilegge da GitHub ogni tanto e le salva nell'autopilota,
 * così PC, pagina e app le hanno senza chiamare GitHub.
 */

export type LeggiReleaseUscite = (cwd: string) => Promise<ReleaseUscita[] | undefined>

/** Ogni quanto si rileggono: una release al giorno, non serve di più. */
export const RILETTURA_RELEASE_MS = 10 * 60_000

/** Dall'uscita JSON di `gh release list`: le release vere (niente bozze), dalla più vecchia. */
export function releaseUsciteDaGh(json: string): ReleaseUscita[] | undefined {
  try {
    const righe: unknown = JSON.parse(json)
    if (!Array.isArray(righe)) return undefined
    return righe
      .filter((r): r is { tagName: string; isDraft?: boolean; publishedAt: string } => {
        if (typeof r !== 'object' || r === null) return false
        const o = r as Record<string, unknown>
        return typeof o.tagName === 'string' && o.isDraft !== true && typeof o.publishedAt === 'string' && !Number.isNaN(Date.parse(o.publishedAt))
      })
      .map((r) => ({ versione: r.tagName.replace(/^v/, ''), quando: new Date(Date.parse(r.publishedAt)).toISOString() }))
      .sort((x, y) => x.quando.localeCompare(y.quando))
      .slice(-RELEASE_RICORDATE)
  } catch {
    return undefined
  }
}

/** `gh release list` con la data. Mai un errore: senza gh o senza rete, `undefined`. */
export const ghReleaseUscite: LeggiReleaseUscite = (cwd) => new Promise((fatto) => {
  execFile('gh', ['release', 'list', '--limit', String(RELEASE_RICORDATE), '--json', 'tagName,isDraft,publishedAt'], { cwd, windowsHide: true, timeout: 20_000 }, (err, stdout) => {
    fatto(err !== null ? undefined : releaseUsciteDaGh(String(stdout)))
  })
})

/** L'autopilota con le release nuove, o `undefined` se non cambia niente (non si riscrive il file). */
export function conReleaseUscite(a: Autopilota, uscite: ReleaseUscita[]): Autopilota | undefined {
  const prima = JSON.stringify(a.releaseUscite ?? [])
  if (uscite.length === 0 || JSON.stringify(uscite) === prima) return undefined
  return { ...a, releaseUscite: uscite }
}
