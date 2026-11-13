import { describe, it, expect } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path, { join } from 'node:path'
import { gitReale, type Git } from '../../src/autopilot-host/worktree'
import { cartellaVietata, FILE_GRANDE_BYTE, preparaGitLocale } from '../../src/autopilot-host/git-locale'

/** 12/11, Nicholas: «Sì, in automatico» — git locale nei progetti che non ce l'hanno. */

function progetto(): string {
  const d = mkdtempSync(join(tmpdir(), 'git-locale-'))
  writeFileSync(join(d, 'bot.py'), 'print("ciao")\n')
  writeFileSync(join(d, '.env'), 'CHIAVE=segreta\n')
  mkdirSync(join(d, 'venv', 'lib'), { recursive: true })
  writeFileSync(join(d, 'venv', 'lib', 'x.py'), '#\n')
  return d
}

const tracciati = (d: string): string[] => gitReale(['ls-files'], d).uscita.split(/\r?\n/u).filter((s) => s !== '')

describe('git locale automatico', () => {
  it('crea il repository col primo salvataggio, senza segreti né librerie', () => {
    const d = progetto()
    const e = preparaGitLocale(gitReale, d, join(tmpdir(), 'casa-finta-che-non-c-e'))
    expect(e).toMatchObject({ fatto: true })
    expect(gitReale(['rev-parse', '--is-inside-work-tree'], d).codice).toBe(0)
    expect(tracciati(d)).toEqual(['.gitignore', 'bot.py'])
    expect(gitReale(['status', '--porcelain'], d).uscita).toBe('')
    expect(gitReale(['remote'], d).uscita).toBe('')
    expect(readFileSync(join(d, '.env'), 'utf8')).toBe('CHIAVE=segreta\n')
  })

  it('un file grande resta fuori, e il .gitignore di Nicholas non si tocca', () => {
    const d = progetto()
    writeFileSync(join(d, '.gitignore'), 'mio/\n')
    writeFileSync(join(d, 'dati.bin'), Buffer.alloc(FILE_GRANDE_BYTE + 1))
    const e = preparaGitLocale(gitReale, d, join(tmpdir(), 'casa-finta-che-non-c-e'))
    expect(e).toMatchObject({ fatto: true, grandi: ['dati.bin'] })
    expect(readFileSync(join(d, '.gitignore'), 'utf8')).toBe('mio/\n')
    expect(tracciati(d)).toEqual(['.gitignore', 'bot.py'])
  })

  it('già un repository, cartella vuota, disco intero o cartella dell’utente: niente', () => {
    const d = progetto()
    expect(preparaGitLocale(gitReale, d, join(tmpdir(), 'casa-finta'))).toMatchObject({ fatto: true })
    expect(preparaGitLocale(gitReale, d, join(tmpdir(), 'casa-finta'))).toEqual({ fatto: false, motivo: 'c’è già' })
    expect(preparaGitLocale(gitReale, mkdtempSync(join(tmpdir(), 'vuota-')), join(tmpdir(), 'casa-finta'))).toMatchObject({ fatto: false })
    expect(cartellaVietata('C:\\', 'C:\\Users\\qualcuno')).toBe(true)
    expect(cartellaVietata('C:\\Users\\qualcuno', 'C:\\Users\\qualcuno')).toBe(true)
    expect(cartellaVietata('C:\\Users', 'C:\\Users\\qualcuno')).toBe(true)
    expect(cartellaVietata('C:\\Users\\qualcuno\\progetti\\bot', 'C:\\Users\\qualcuno')).toBe(false)
  })

  it('un progetto su un altro disco rispetto alla casa non è vietato; casa, sopra la casa e radice sì', () => {
    const w = path.win32
    const casa = 'C:\\Users\\qualcuno'
    expect(cartellaVietata('D:\\progetti\\sito', casa, w)).toBe(false)
    expect(cartellaVietata('d:\\progetti\\sito', 'D:\\Users\\qualcuno', w)).toBe(false)
    expect(cartellaVietata('c:\\users\\qualcuno\\progetti\\bot', casa, w)).toBe(false)
    expect(cartellaVietata('D:\\progetti\\sito', 'd:\\Users\\qualcuno', w)).toBe(false)
    expect(cartellaVietata(casa, casa, w)).toBe(true)
    expect(cartellaVietata('c:\\users\\QUALCUNO\\', casa, w)).toBe(true)
    expect(cartellaVietata('C:\\Users', casa, w)).toBe(true)
    expect(cartellaVietata('c:\\users\\', casa, w)).toBe(true)
    expect(cartellaVietata('D:\\', casa, w)).toBe(true)
    expect(cartellaVietata('C:\\', casa, w)).toBe(true)
  })

  it('se il primo salvataggio non riesce torna tutto come prima: mai un repository a metà', () => {
    const d = progetto()
    const rotto: Git = (args, cwd) => (args[0] === 'commit' ? { codice: 1, uscita: 'no' } : gitReale(args, cwd))
    const e = preparaGitLocale(rotto, d, join(tmpdir(), 'casa-finta'))
    expect(e).toMatchObject({ fatto: false })
    expect(existsSync(join(d, '.git'))).toBe(false)
    expect(existsSync(join(d, '.gitignore'))).toBe(false)
    expect(existsSync(join(d, 'bot.py'))).toBe(true)
  })
})
