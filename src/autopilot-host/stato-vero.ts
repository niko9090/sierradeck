import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Autopilota } from '@shared/autopilota'
import type { StatoVero } from './domande-doppie'
import type { Git } from './worktree'

/**
 * Lo stato vero contro cui si controlla una domanda prima che arrivi a
 * Nicholas (0.82.0).
 *
 * Il caso vero, 20/10: «Pubblico adesso una 0.81.1…?» quando la 0.81.1 era
 * già pubblicata e già installata. Il programma sapeva solo la versione in
 * uso; adesso guarda anche le release pubblicate (gh), i rami già nel ramo
 * principale e le chat già chiuse. Quello che non riesce a leggere resta
 * fuori: senza fatti, la domanda passa.
 */

/** Le versioni pubblicate di un progetto, o `undefined` se non si sa. */
export type LeggiRelease = (cwd: string) => Promise<string[] | undefined>

/** Dall'uscita JSON di `gh release list`: le release vere, senza bozze, senza la «v». */
export function versioniPubblicate(json: string): string[] | undefined {
  try {
    const righe: unknown = JSON.parse(json)
    if (!Array.isArray(righe)) return undefined
    return righe
      .filter((r): r is { tagName: string; isDraft?: boolean } => typeof r === 'object' && r !== null && typeof (r as { tagName?: unknown }).tagName === 'string')
      .filter((r) => r.isDraft !== true)
      .map((r) => r.tagName.replace(/^v/, ''))
  } catch {
    return undefined
  }
}

/** `gh release list` nella cartella del progetto. Mai un errore: senza gh, senza rete, `undefined`. */
export const ghRelease: LeggiRelease = (cwd) => new Promise((fatto) => {
  execFile('gh', ['release', 'list', '--limit', '50', '--json', 'tagName,isDraft'], { cwd, windowsHide: true, timeout: 20_000 }, (err, stdout) => {
    fatto(err !== null ? undefined : versioniPubblicate(String(stdout)))
  })
})

/**
 * Le release rilette al più ogni `perMs` per progetto: una domanda ogni tanto
 * non deve chiamare GitHub ogni volta. Una lista vecchia al più sbaglia per
 * difetto (una release appena uscita non c'è ancora), cioè lascia passare.
 */
export function releaseConMemoria(leggi: LeggiRelease, perMs: number, orologio: () => number = Date.now): LeggiRelease {
  const visti = new Map<string, { quando: number; versioni: string[] }>()
  return async (cwd) => {
    const v = visti.get(cwd)
    if (v !== undefined && orologio() - v.quando < perMs) return v.versioni
    const nuove = await leggi(cwd)
    if (nuove !== undefined) visti.set(cwd, { quando: orologio(), versioni: nuove })
    return nuove
  }
}

/** Il nome nel package.json del progetto, se c'è. */
export function nomePacchetto(cwd: string): string | undefined {
  try {
    const p: unknown = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'))
    const nome = typeof p === 'object' && p !== null ? (p as { name?: unknown }).name : undefined
    return typeof nome === 'string' ? nome : undefined
  } catch {
    return undefined
  }
}

/**
 * Lo stato vero di un autopilota. La versione installata vale solo se il
 * progetto è il programma stesso: «installo la 0.3.0?» di un altro progetto
 * non parla di SierraDeck.
 */
export function creaStatoVero(p: {
  versione?: string
  release?: LeggiRelease
  git?: Git
  nome?: (cwd: string) => string | undefined
}): (a: Autopilota) => Promise<StatoVero> {
  const nome = p.nome ?? nomePacchetto
  return async (a) => {
    const stato = statoDellaFlotta(a, p.git)
    if (p.versione !== undefined && p.versione !== '' && nome(a.cwd) === 'sierradeck') stato.versioneInstallata = p.versione
    if (p.release !== undefined) {
      const fuori = await p.release(a.cwd).catch(() => undefined)
      if (fuori !== undefined) stato.releasePubblicate = fuori
    }
    return stato
  }
}

/**
 * Le chat dell'autopilota e i loro rami. Un ramo è unito se la Revisione l'ha
 * approvato (l'unione è avvenuta) o se git dice che è già dentro il ramo
 * principale. 29/10: un ramo che git non trova più conta come unito: i rami
 * delle chat si tolgono dopo l'unione (o li toglie Nicholas), e non c'è più
 * niente da unire. Prima «non si sa» lasciava rami spariti ad aspettare la
 * Revisione.
 */
export function statoDellaFlotta(a: Autopilota, git: Git | undefined): StatoVero {
  const approvati = new Set(a.chats.filter((c) => c.approvata === true && c.ramo !== undefined).map((c) => c.ramo!))
  return {
    chat: a.chats.map((c) => ({ id: c.id, ...(c.ramo !== undefined ? { ramo: c.ramo } : {}), finita: c.stato === 'finita' })),
    ramoUnito: (ramo) => {
      if (approvati.has(ramo)) return true
      if (git === undefined || a.ramoBase === undefined) return undefined
      const r = git(['merge-base', '--is-ancestor', ramo, a.ramoBase], a.cwd)
      if (r.codice === 0) return true
      if (r.codice === 1) return false
      const presente = git(['rev-parse', '--verify', '--quiet', `refs/heads/${ramo}`], a.cwd)
      return presente.codice === 1 ? true : undefined
    }
  }
}
