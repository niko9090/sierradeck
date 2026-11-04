import { delimiter, join } from 'node:path'

/**
 * Node.js e Git: dove stanno, e come si installano quando mancano (0.91.0).
 *
 * Nicholas, 04/11: «io voglio che il sistema installi anche node.js e git se
 * non trovati». Prima si diceva soltanto che mancavano; ora il programma li
 * installa da solo con winget, all'avvio.
 *
 * Puro: chi chiama dà l'ambiente e il modo di guardare il disco.
 */

export type Runtime = {
  nome: 'Node.js' | 'Git'
  /** Il file che deve esserci nel PATH. */
  file: string
  /** L'id del pacchetto winget. */
  winget: string
  /** Gli ambiti da provare in ordine: Git si installa anche solo per l'utente, senza chiedere i permessi di amministratore. */
  ambiti: Array<'user' | 'machine' | undefined>
  /** Dove lo mettono gli installatori, se il PATH di questo processo non lo sa ancora. */
  cartelle: (env: Record<string, string | undefined>) => string[]
}

const sotto = (base: string | undefined, ...parti: string[]): string[] => (base !== undefined && base !== '' ? [join(base, ...parti)] : [])

export const RUNTIME: Runtime[] = [
  {
    nome: 'Node.js',
    file: 'node.exe',
    winget: 'OpenJS.NodeJS.LTS',
    // L'installatore di Node c'è solo per tutta la macchina: Windows chiede il sì per l'amministratore.
    ambiti: [undefined],
    cartelle: (env) => [...sotto(env.ProgramFiles, 'nodejs'), ...sotto(env.LOCALAPPDATA, 'Programs', 'nodejs')]
  },
  {
    nome: 'Git',
    file: 'git.exe',
    winget: 'Git.Git',
    ambiti: ['user', undefined],
    cartelle: (env) => [...sotto(env.LOCALAPPDATA, 'Programs', 'Git', 'cmd'), ...sotto(env.ProgramFiles, 'Git', 'cmd')]
  }
]

const cartelleDelPath = (env: Record<string, string | undefined>): string[] =>
  (env.Path ?? env.PATH ?? '').split(delimiter).map((c) => c.trim().replace(/^"|"$/g, '')).filter((c) => c !== '')

/** Dove sta il runtime: nel PATH, se no in una delle sue cartelle note; `undefined` se manca. */
export function doveSta(r: Runtime, env: Record<string, string | undefined>, esiste: (p: string) => boolean): { cartella: string; nelPath: boolean } | undefined {
  for (const c of cartelleDelPath(env)) if (esiste(join(c, r.file))) return { cartella: c, nelPath: true }
  for (const c of r.cartelle(env)) if (esiste(join(c, r.file))) return { cartella: c, nelPath: false }
  return undefined
}

export function runtimeMancanti(env: Record<string, string | undefined>, esiste: (p: string) => boolean): Runtime[] {
  return RUNTIME.filter((r) => doveSta(r, env, esiste) === undefined)
}

/**
 * Mette nel PATH di questo processo le cartelle dei runtime installati ma che
 * il PATH non conosce ancora (installati dopo che il processo è partito):
 * così i comandi lanciati da qui in poi li trovano senza riavviare.
 * Restituisce le cartelle aggiunte.
 */
export function aggiungiRuntimeAlPath(env: Record<string, string | undefined>, esiste: (p: string) => boolean): string[] {
  const aggiunte: string[] = []
  for (const r of RUNTIME) {
    const d = doveSta(r, env, esiste)
    if (d === undefined || d.nelPath) continue
    const chiave = env.Path !== undefined ? 'Path' : 'PATH'
    const prima = env[chiave] ?? ''
    env[chiave] = prima === '' ? d.cartella : `${prima}${delimiter}${d.cartella}`
    aggiunte.push(d.cartella)
  }
  return aggiunte
}

/** Gli argomenti di winget per installare un runtime, senza domande. */
export function argomentiWinget(r: Runtime, ambito: 'user' | 'machine' | undefined): string[] {
  return [
    'install', '--id', r.winget, '--exact', '--silent',
    '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity',
    ...(ambito !== undefined ? ['--scope', ambito] : [])
  ]
}
