import { describe, it, expect } from 'vitest'
import { giudicaRuolo } from '../../src/autopilot-host/divieti'

/**
 * Il guardiano «installa solo Nicholas» (0.85.1): blocca chi esegue
 * l'installatore, non chi lo copia o lo carica. Caso vero del 23/10 (c-122,
 * caricando la 0.84.4): `./` trovato dentro `../` bloccava una copia.
 */
const bash = (command: string) => giudicaRuolo({ tool_name: 'Bash', tool_input: { command } }, 'sviluppo')
const ps = (command: string) => giudicaRuolo({ tool_name: 'PowerShell', tool_input: { command } }, 'sviluppo')

describe('installa solo Nicholas: eseguire sì, copiare no', () => {
  it('permette la copia con un percorso relativo ../', () => {
    expect(bash('cp ../x/dist/SierraDeck-Setup-0.84.4.exe.blockmap dist/').ok).toBe(true)
    expect(bash('cp ../x/dist/SierraDeck-Setup-0.84.4.exe dist/').ok).toBe(true)
    expect(bash('ls ../x/dist/SierraDeck-Setup-0.84.4.exe').ok).toBe(true)
  })

  it('blocca l\'avvio con ./', () => {
    expect(bash('./SierraDeck-Setup-0.84.4.exe').ok).toBe(false)
    expect(bash('./dist/SierraDeck-Setup-0.84.4.exe /S').ok).toBe(false)
    expect(bash('cd dist && ./SierraDeck-Setup-0.84.4.exe').ok).toBe(false)
    expect(bash('"./dist/SierraDeck-Setup-0.84.4.exe"').ok).toBe(false)
  })

  it('il .blockmap non si esegue: lanciarlo non è installare', () => {
    expect(bash('./dist/SierraDeck-Setup-0.84.4.exe.blockmap').ok).toBe(true)
  })

  it('restano bloccati gli altri modi di avviarlo', () => {
    expect(ps('Start-Process .\\dist\\SierraDeck-Setup-0.84.4.exe').ok).toBe(false)
    expect(bash('dist/SierraDeck-Setup-0.84.4.exe').ok).toBe(false)
    expect(ps('cmd /c dist\\SierraDeck-Setup-0.84.4.exe').ok).toBe(false)
  })

  it('caricare o cercare il nome resta permesso', () => {
    expect(bash('gh release upload v0.84.4 dist/SierraDeck-Setup-0.84.4.exe dist/SierraDeck-Setup-0.84.4.exe.blockmap').ok).toBe(true)
    expect(bash('grep -rn "SierraDeck-Setup" src').ok).toBe(true)
  })
})
