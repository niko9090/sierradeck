import { describe, it, expect } from 'vitest'
import {
  comandoShell, esecutoreReale, nomeScript, nonMisurabile, trovaBash
} from '../../src/autopilot-host/verifiche'

describe('trovaBash', () => {
  it('prende il primo che esiste davvero', () => {
    const esiste = (p: string): boolean => p === 'C:\\seconda\\bash.exe'
    expect(trovaBash(['C:\\prima\\bash.exe', 'C:\\seconda\\bash.exe'], esiste))
      .toBe('C:\\seconda\\bash.exe')
  })

  it('senza bash non inventa un percorso', () => {
    expect(trovaBash(['C:\\niente\\bash.exe'], () => false)).toBeUndefined()
  })
})

describe('comandoShell', () => {
  it('con bash gli passa lo script, non il comando', () => {
    // E' tutto il punto: un comando con apici e pipe non deve attraversare
    // nessun livello che possa reinterpretarlo, e un file non va citato.
    const { file, argomenti } = comandoShell('C:\\Git\\bin\\bash.exe', 'C:\\t\\criterio.sh')
    expect(file).toBe('C:\\Git\\bin\\bash.exe')
    expect(argomenti).toContain('C:\\t\\criterio.sh')
  })

  it('senza bash ripiega su cmd', () => {
    const { file, argomenti } = comandoShell(undefined, 'C:\\t\\criterio.cmd')
    expect(file).toBe('cmd.exe')
    expect(argomenti).toEqual(['/d', '/s', '/c', 'C:\\t\\criterio.cmd'])
  })

  it('lo script ha l estensione che la shell sa eseguire', () => {
    expect(nomeScript('C:\\Git\\bin\\bash.exe')).toMatch(/\.sh$/)
    expect(nomeScript(undefined)).toMatch(/\.cmd$/)
  })
})

describe('nonMisurabile', () => {
  it('riconosce un comando che la shell non ha capito', () => {
    // Il caso vero: `cmd` spezzava `bash -lc '... | wc -l)'` sulla pipe, e
    // bash riceveva un pezzo senza chiusura.
    expect(nonMisurabile(2, 'bash: -c: line 2: unexpected EOF while looking for matching `)\'')).toBe(true)
    expect(nonMisurabile(1, 'SyntaxError: Invalid or unexpected token')).toBe(true)
  })

  it('riconosce un comando che non esiste', () => {
    expect(nonMisurabile(127, 'vitest: command not found')).toBe(true)
    expect(nonMisurabile(9009, "'npx' non è riconosciuto come comando interno")).toBe(true)
  })

  it('un test rosso resta un test rosso', () => {
    // Qui il comando ha funzionato benissimo: e' il criterio a non essere
    // soddisfatto, ed e' esattamente cio' su cui la chat deve lavorare.
    expect(nonMisurabile(1, 'Tests  3 failed | 915 passed')).toBe(false)
    expect(nonMisurabile(1, 'file di test: 61')).toBe(false)
  })
})

describe('esecutoreReale', () => {
  it('esegue un comando che cmd spezzerebbe', async () => {
    // La riproduzione esatta del criterio che teneva fermo l'autopilota: con
    // `exec` questo diventava «wc: unknown option -- )».
    const comando = `n=$(echo "uno due tre" | wc -w); echo "parole: $n"; [ "$n" -eq 3 ]`
    const { codice, uscita } = await esecutoreReale(60_000)(comando, process.cwd())
    expect(uscita).toContain('parole: 3')
    expect(codice).toBe(0)
  })

  it('un criterio non soddisfatto esce con un codice diverso da zero', async () => {
    const { codice } = await esecutoreReale(60_000)('[ 1 -eq 2 ]', process.cwd())
    expect(codice).not.toBe(0)
  })
})
