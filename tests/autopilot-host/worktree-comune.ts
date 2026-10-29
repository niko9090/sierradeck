import { beforeAll } from 'vitest'
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gitFinto, usaGitFinto } from '../setup/git-finto'

/**
 * Il necessario comune ai test `worktree-*.test.ts`, con un git vero in una
 * cartella temporanea: è il solo modo di sapere che worktree, commit e
 * unione fanno davvero quello che dicono.
 *
 * Erano un file solo da 85 s (a PC carico): diviso in cinque, i pezzi girano
 * insieme. Ogni file fa il suo repository di partenza una volta sola.
 */
export const git = gitFinto
export const esegui = (args: string[], cwd: string): string => {
  const r = git(args, cwd)
  if (r.codice !== 0) throw new Error(`git ${args.join(' ')}: ${r.uscita}`)
  return r.uscita
}

/**
 * Il repository di partenza si fa con git una volta sola per file e ogni test
 * ne riceve una copia (20/10): a PC carico ogni processo git costa più di un
 * secondo, e sei processi per test (init, config, commit) portavano il file
 * oltre il tempo. Da chiamare in cima al file; torna il modello e la copia.
 */
export function repositoryDiPartenza(): { modello: () => string; copia: () => string } {
  usaGitFinto()
  let modello = ''
  beforeAll(() => {
    modello = join(mkdtempSync(join(tmpdir(), 'sd-wt-modello-')), 'progetto')
    mkdirSync(modello)
    esegui(['init', '-q', '-b', 'main'], modello)
    esegui(['config', 'user.name', 'Prova'], modello)
    esegui(['config', 'user.email', 'prova@example.com'], modello)
    esegui(['config', 'core.autocrlf', 'false'], modello)
    writeFileSync(join(modello, 'a.txt'), 'uno\n')
    esegui(['add', '-A'], modello)
    esegui(['commit', '-q', '-m', 'inizio'], modello)
  })
  return {
    modello: () => modello,
    copia: () => {
      const progetto = join(mkdtempSync(join(tmpdir(), 'sd-wt-')), 'progetto')
      cpSync(modello, progetto, { recursive: true })
      return progetto
    }
  }
}
