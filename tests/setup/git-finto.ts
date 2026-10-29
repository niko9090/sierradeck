import { afterAll, beforeAll } from 'vitest'
import { gitAsincronoReale, gitReale, type Git, type GitAsincrono } from '../../src/autopilot-host/worktree'

/**
 * **Git vero, ma sempre uguale** (0.85.1, suite veloce e ripetibile).
 *
 * I test che usano git davvero dipendevano dalla macchina e dall'orologio:
 * - la configurazione di sistema (fsmonitor, manutenzione automatica) poteva
 *   avviare processi in più e rallentare ogni comando;
 * - due commit nello stesso secondo hanno la stessa data, e `git log` li
 *   ordinava a caso (c-122, 23/10: il test passava o falliva a seconda del secondo).
 *
 * `usaGitFinto()`, chiamata in cima al file, mette per tutto il file:
 * - `GIT_CONFIG_NOSYSTEM=1`: niente configurazione di sistema;
 * - `-c core.fsmonitor=false -c gc.auto=0 -c maintenance.auto=false` per ogni
 *   git che parte, anche quelli lanciati dal programma provato (con le
 *   variabili `GIT_CONFIG_COUNT/KEY/VALUE`, l'equivalente di `-c`);
 * - una data d'autore e di commit fissa, che `gitFinto` / `gitAsincronoFinto`
 *   e `prossimaDataGit()` spostano avanti di un secondo a ogni comando:
 *   commit in ordine, sempre con le stesse date.
 * Alla fine del file le variabili tornano com'erano.
 */
const INIZIO_S = Math.floor(Date.parse('2026-01-05T09:00:00.000Z') / 1000)
let secondi = 0

const CONFIG: Array<[string, string]> = [['core.fsmonitor', 'false'], ['gc.auto', '0'], ['maintenance.auto', 'false']]

/** Le opzioni `-c` da mettere davanti agli argomenti di un git lanciato a mano. */
export const OPZIONI_GIT_FINTO: readonly string[] = CONFIG.flatMap(([k, v]) => ['-c', `${k}=${v}`])

/** La data git (secondi e fuso) del prossimo comando: ogni chiamata un secondo dopo. */
export function prossimaDataGit(): string {
  secondi += 1
  const data = `${INIZIO_S + secondi} +0000`
  process.env.GIT_AUTHOR_DATE = data
  process.env.GIT_COMMITTER_DATE = data
  return data
}

/**
 * Le variabili per un git lanciato a mano con `env` suo (da unire a
 * `process.env`). `altre`: configurazione in più, come altri `-c`.
 */
export function ambienteGitFinto(altre: Array<[string, string]> = []): Record<string, string> {
  const data = prossimaDataGit()
  const tutte = [...CONFIG, ...altre]
  const amb: Record<string, string> = { GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_DATE: data, GIT_COMMITTER_DATE: data, GIT_CONFIG_COUNT: String(tutte.length) }
  tutte.forEach(([k, v], i) => { amb[`GIT_CONFIG_KEY_${i}`] = k; amb[`GIT_CONFIG_VALUE_${i}`] = v })
  return amb
}

export function usaGitFinto(): void {
  let prima: Record<string, string | undefined> = {}
  beforeAll(() => {
    secondi = 0
    const amb = ambienteGitFinto()
    prima = Object.fromEntries(Object.keys(amb).map((k) => [k, process.env[k]]))
    Object.assign(process.env, amb)
  })
  afterAll(() => {
    for (const [k, v] of Object.entries(prima)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })
}

/** `gitReale` con la data che avanza di un secondo a ogni comando. */
export const gitFinto: Git = (args, cwd) => {
  prossimaDataGit()
  return gitReale(args, cwd)
}

/** `gitAsincronoReale` con la data che avanza di un secondo a ogni comando. */
export const gitAsincronoFinto: GitAsincrono = (args, cwd) => {
  prossimaDataGit()
  return gitAsincronoReale(args, cwd)
}
