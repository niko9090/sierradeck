import { describe, it, expect } from 'vitest'
import { delimiter, join } from 'node:path'
import { ambienteConGit, espandi, nomePath, trovaRadiceGit, valoreReg } from '../../src/main/git-nel-path'
import { ambientePty } from '../../src/pty-host/pty-manager'

/**
 * 0.82.1: ogni chat aperta dal programma ha Git nel PATH, trovato dal sistema o
 * dalle preferenze. Senza, gli hook ECC rifiutavano tutti gli strumenti.
 * Percorsi inventati: niente cartelle vere di nessun PC.
 */
const RADICE = join('D:', 'Strumenti', 'Git')
const ALTRA = join('F:', 'Portatili', 'GitPortatile')
const file = new Set([
  join(RADICE, 'cmd', 'git.exe'), join(RADICE, 'cmd'), join(RADICE, 'bin'), join(RADICE, 'bin', 'bash.exe'),
  join(ALTRA, 'cmd'), join(ALTRA, 'bin'), join(ALTRA, 'bin', 'bash.exe'), join(ALTRA, 'cmd', 'git.exe')
])
const esiste = (p: string): boolean => file.has(p)
const WINDOWS = join('C:', 'Windows', 'System32')

describe('Git nel PATH delle chat (0.82.1)', () => {
  it('senza Git nel PATH lo trova nel PATH del sistema e lo aggiunge in fondo, con la bash per Claude Code', () => {
    const env = { Path: WINDOWS }
    const agg = ambienteConGit(env, { pathDiSistema: [WINDOWS, join(RADICE, 'cmd')].join(delimiter), esiste })
    expect(agg.Path).toBe([WINDOWS, join(RADICE, 'cmd'), join(RADICE, 'bin')].join(delimiter))
    expect(agg.CLAUDE_CODE_GIT_BASH_PATH).toBe(join(RADICE, 'bin', 'bash.exe'))
    expect(agg.PATH).toBeUndefined()
  })

  it('dall’installatore di Git quando non è in nessun PATH', () => {
    expect(trovaRadiceGit({ path: WINDOWS, installazione: RADICE, esiste })).toBe(RADICE)
  })

  it('la preferenza vince sul sistema, anche data come git.exe', () => {
    expect(trovaRadiceGit({ path: join(RADICE, 'cmd'), preferenza: join(ALTRA, 'cmd', 'git.exe'), esiste })).toBe(ALTRA)
    expect(trovaRadiceGit({ path: WINDOWS, preferenza: ALTRA, esiste })).toBe(ALTRA)
  })

  it('una preferenza sbagliata non rompe niente: si passa alle altre fonti', () => {
    expect(trovaRadiceGit({ path: join(RADICE, 'cmd'), preferenza: join('Z:', 'non-esiste'), esiste })).toBe(RADICE)
  })

  it('con Git già tutto nel PATH e la bash già detta non aggiunge niente; senza Git da nessuna parte nemmeno', () => {
    const pieno = { PATH: [join(RADICE, 'cmd'), join(RADICE, 'bin')].join(delimiter), CLAUDE_CODE_GIT_BASH_PATH: join(RADICE, 'bin', 'bash.exe') }
    expect(ambienteConGit(pieno, { esiste })).toEqual({})
    expect(ambienteConGit({ Path: WINDOWS }, { esiste })).toEqual({})
  })

  it('il nome del PATH è quello che c’è già (Path su Windows)', () => {
    expect(nomePath({ Path: 'x' })).toBe('Path')
    expect(nomePath({})).toBe('PATH')
  })

  it('l’ambiente del terminale non ha due PATH quando se ne aggiunge uno con le maiuscole diverse', () => {
    const env = ambientePty({ Path: WINDOWS, ALTRO: '1' }, 'uuid', { PATH: 'nuovo' })
    expect(Object.keys(env).filter((k) => k.toUpperCase() === 'PATH')).toEqual(['PATH'])
    expect(env.PATH).toBe('nuovo')
    expect(env.ALTRO).toBe('1')
  })

  it('legge i valori di reg query ed espande le variabili', () => {
    const uscita = '\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\GitForWindows\r\n    InstallPath    REG_SZ    D:\\Strumenti\\Git\r\n\r\n'
    expect(valoreReg(uscita, 'InstallPath')).toBe('D:\\Strumenti\\Git')
    expect(valoreReg('    Path    REG_EXPAND_SZ    %SystemRoot%\\system32;D:\\x', 'Path')).toBe('%SystemRoot%\\system32;D:\\x')
    expect(espandi('%SystemRoot%\\system32', { SYSTEMROOT: 'C:\\Windows' })).toBe('C:\\Windows\\system32')
    expect(espandi('%NON_ESISTE%\\x', {})).toBe('%NON_ESISTE%\\x')
  })
})
