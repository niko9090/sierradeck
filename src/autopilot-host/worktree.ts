import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import type { FattiCloud } from '@shared/harness'

/**
 * Una cartella per chat: i **git worktree** dell'autopilota (T3, 0.36.0).
 *
 * Prima tutte le chat di una flotta lavoravano nella stessa cartella e si
 * pestavano i piedi sugli stessi file. Adesso, in un progetto git, ogni chat ha
 * il suo worktree accanto al progetto (`<progetto>.sierradeck-wt/<autopilota>-<chat>`)
 * sul suo ramo (`ap/<autopilota>/<chat>`), partito dal ramo principale.
 *
 * Il programma — non il modello — salva il lavoro di ogni chat a fine turno
 * (commit sul suo ramo) e lo unisce nel ramo principale della cartella di
 * lavoro, dove i criteri si misurano. Un conflitto non si risolve a caso: si
 * annulla l'unione e si dice alla chat di riallinearsi.
 */

export type EsitoGit = { codice: number; uscita: string }
export type Git = (args: string[], cwd: string) => EsitoGit

export const gitReale: Git = (args, cwd) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, timeout: 120_000 })
  return { codice: r.status ?? 1, uscita: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() }
}

/** La radice del repository che contiene `cwd`, o `undefined` se non e' git. */
export function radiceGit(git: Git, cwd: string): string | undefined {
  if (!existsSync(cwd)) return undefined
  const r = git(['rev-parse', '--show-toplevel'], cwd)
  return r.codice === 0 && r.uscita !== '' ? r.uscita.split(/\r?\n/)[0] : undefined
}

export function ramoCorrente(git: Git, cwd: string): string | undefined {
  const r = git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
  return r.codice === 0 && r.uscita !== '' && r.uscita !== 'HEAD' ? r.uscita.split(/\r?\n/)[0] : undefined
}

/** Un pezzo sicuro per nomi di cartelle e rami. */
function pezzo(x: string): string {
  return x.replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 40) || 'x'
}

/**
 * Dove sta il worktree di una chat e su quale ramo. Pura.
 *
 * Accanto al progetto e non dentro: dentro, il worktree finirebbe nell'indice
 * delle cartelle, nella sincronia del Drive e nei `git status` del progetto.
 * `sotto` e' la sottocartella del progetto in cui l'autopilota lavora, quando
 * non e' la radice del repository: la chat parte nello stesso punto.
 */
export function pianoWorktree(p: { radice: string; sotto?: string; autopilota: string; chat: string }): { cartellaRadice: string; cartella: string; ramo: string } {
  const cartellaRadice = join(`${p.radice}.sierradeck-wt`, `${pezzo(p.autopilota)}-${pezzo(p.chat)}`)
  return {
    cartellaRadice,
    cartella: p.sotto !== undefined && p.sotto !== '' && p.sotto !== '.' ? join(cartellaRadice, p.sotto) : cartellaRadice,
    ramo: `ap/${pezzo(p.autopilota)}/${pezzo(p.chat)}`
  }
}

/** Le cartelle dei worktree di un progetto: sono «sue», per i divieti. */
export function cartellaWorktreeDi(radice: string): string {
  return `${radice}.sierradeck-wt`
}

/**
 * Crea (o ritrova) il worktree di una chat. Torna la cartella in cui la chat
 * deve partire, o il motivo per cui non si e' potuto.
 */
export function creaWorktree(git: Git, p: { cwd: string; autopilota: string; chat: string; base: string }):
  { ok: true; cartella: string; ramo: string } | { ok: false; motivo: string } {
  const radice = radiceGit(git, p.cwd)
  if (radice === undefined) return { ok: false, motivo: 'la cartella non è un repository git' }
  const sotto = relative(radice, p.cwd)
  const piano = pianoWorktree({ radice, sotto, autopilota: p.autopilota, chat: p.chat })
  if (existsSync(piano.cartellaRadice)) return { ok: true, cartella: piano.cartella, ramo: piano.ramo }
  // Il ramo puo' esistere gia' (un worktree tolto a mano): si riusa invece di fallire.
  const esiste = git(['rev-parse', '--verify', '--quiet', `refs/heads/${piano.ramo}`], radice).codice === 0
  const r = esiste
    ? git(['worktree', 'add', piano.cartellaRadice, piano.ramo], radice)
    : git(['worktree', 'add', '-b', piano.ramo, piano.cartellaRadice, p.base], radice)
  if (r.codice !== 0) return { ok: false, motivo: `git worktree add non riuscito: ${r.uscita.slice(0, 300)}` }
  return { ok: true, cartella: piano.cartella, ramo: piano.ramo }
}

/** Il nome con cui l'autopilota firma i commit, se il progetto non ne ha uno. */
function firma(git: Git, cwd: string): string[] {
  const nome = git(['config', 'user.name'], cwd)
  return nome.codice === 0 && nome.uscita !== '' ? [] : ['-c', 'user.name=SierraDeck autopilota', '-c', 'user.email=autopilota@sierradeck.local']
}

/**
 * Salva il lavoro della chat con un commit sul suo ramo, se c'e' qualcosa.
 * Torna vero se ha fatto un commit.
 */
export function salvaLavoro(git: Git, cartella: string, messaggio: string): boolean {
  if (!existsSync(cartella)) return false
  if (git(['add', '-A'], cartella).codice !== 0) return false
  if (git(['diff', '--cached', '--quiet'], cartella).codice === 0) return false
  return git([...firma(git, cartella), 'commit', '-m', messaggio, '--no-verify'], cartella).codice === 0
}

export type EsitoUnione =
  | { ok: true; unito: boolean }
  | { ok: false; conflitto: boolean; file: string[]; motivo: string }

/**
 * Unisce il ramo di una chat nel ramo principale, nella cartella di lavoro.
 *
 * Solo se la cartella di lavoro e' sul ramo principale. Un conflitto annulla
 * l'unione (niente file a meta' nella cartella di Nicholas) e torna i file in
 * conflitto: e' la chat a riallinearsi, nel suo worktree.
 */
export function unisciRamo(git: Git, p: { cwd: string; ramo: string; base: string }): EsitoUnione {
  const radice = radiceGit(git, p.cwd)
  if (radice === undefined) return { ok: false, conflitto: false, file: [], motivo: 'non è un repository git' }
  const qui = ramoCorrente(git, radice)
  if (qui !== p.base) {
    return { ok: false, conflitto: false, file: [], motivo: `la cartella di lavoro è sul ramo «${qui ?? '?'}», non su «${p.base}»: non unisco` }
  }
  // Niente da unire se il ramo e' gia' contenuto.
  if (git(['merge-base', '--is-ancestor', p.ramo, 'HEAD'], radice).codice === 0) return { ok: true, unito: false }
  const r = git([...firma(git, radice), 'merge', '--no-ff', '--no-edit', p.ramo], radice)
  if (r.codice === 0) return { ok: true, unito: true }
  const inConflitto = git(['diff', '--name-only', '--diff-filter=U'], radice).uscita.split(/\r?\n/).filter((x) => x !== '')
  git(['merge', '--abort'], radice)
  return {
    ok: false,
    conflitto: inConflitto.length > 0,
    file: inConflitto,
    motivo: inConflitto.length > 0
      ? `conflitto su ${inConflitto.join(', ')}`
      : `unione non riuscita: ${r.uscita.slice(0, 300)}`
  }
}

/** Toglie il worktree di una chat e, se e' gia' unito, il suo ramo. */
export function togliWorktree(git: Git, p: { cwd: string; cartella: string; ramo: string }): void {
  const radice = radiceGit(git, p.cwd)
  if (radice === undefined) return
  // La cartella radice del worktree (la chat puo' lavorare in una sottocartella).
  let radiceWt = p.cartella
  while (dirname(radiceWt) !== radiceWt && basename(dirname(radiceWt)) !== basename(cartellaWorktreeDi(radice))) {
    radiceWt = dirname(radiceWt)
  }
  git(['worktree', 'remove', '--force', radiceWt], radice)
  git(['branch', '-d', p.ramo], radice)
  git(['worktree', 'prune'], radice)
}

/** Manda su il ramo principale (solo con il cloud). */
export function mandaSu(git: Git, cwd: string, ramo: string): EsitoGit {
  return git(['push', 'origin', ramo], cwd)
}

/**
 * I fatti per `rilevaCloud`: remoti git, script di package.json, file di
 * deploy nella radice e nei workflow. Non solleva mai: un progetto illeggibile
 * e' un progetto senza cloud riconosciuto.
 */
export function fattiCloud(git: Git, cwd: string): FattiCloud {
  const fatti: FattiCloud = { remoti: [], script: {}, file: [] }
  try {
    const radice = radiceGit(git, cwd) ?? cwd
    const r = git(['remote', '-v'], radice)
    if (r.codice === 0) {
      fatti.remoti = [...new Set(r.uscita.split(/\r?\n/).map((x) => x.split(/\s+/).slice(0, 2).join(' ')).filter((x) => x.trim() !== ''))]
    }
    for (const dove of [cwd, radice]) {
      const pkg = join(dove, 'package.json')
      if (!existsSync(pkg)) continue
      const scripts = (JSON.parse(readFileSync(pkg, 'utf8')) as { scripts?: Record<string, unknown> }).scripts ?? {}
      for (const [k, v] of Object.entries(scripts)) if (typeof v === 'string') fatti.script[k] = v
      break
    }
    if (existsSync(radice)) fatti.file.push(...readdirSync(radice))
    const wf = join(radice, '.github', 'workflows')
    if (existsSync(wf)) fatti.file.push(...readdirSync(wf).map((f) => join('.github', 'workflows', f)))
  } catch {
    // Un package.json rotto non ferma niente.
  }
  return fatti
}
