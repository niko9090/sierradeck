import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { installaAvvioAlLogin, disinstallaAvvioAlLogin, statoAvvioAlLogin } from '../../src/main/avvio-al-login'

function dir(): string {
  return mkdtempSync(join(tmpdir(), 'startup-'))
}

const ESEGUIBILE = 'C:\\app\\electron.exe'
const SCRIPT = 'C:\\app\\out\\main\\autopilot-host.js'

describe('avvio al login', () => {
  it('scrive uno script che lancia il servizio', () => {
    const cartella = dir()
    const percorso = installaAvvioAlLogin({ cartella, eseguibile: ESEGUIBILE, script: SCRIPT })
    const contenuto = readFileSync(percorso, 'utf8')
    expect(contenuto).toContain(ESEGUIBILE)
    expect(contenuto).toContain(SCRIPT)
    // Senza questa variabile l'eseguibile di Electron aprirebbe una finestra
    // invece di comportarsi da Node.
    expect(contenuto).toContain('ELECTRON_RUN_AS_NODE')
  })

  it('riferisce di essere installato solo quando lo script c e davvero', () => {
    const cartella = dir()
    expect(statoAvvioAlLogin(cartella).installato).toBe(false)
    installaAvvioAlLogin({ cartella, eseguibile: ESEGUIBILE, script: SCRIPT })
    expect(statoAvvioAlLogin(cartella).installato).toBe(true)
  })

  it('reinstallare aggiorna il percorso invece di aggiungere un secondo script', () => {
    // Dopo uno spostamento della cartella del progetto, lo script vecchio
    // punterebbe a un file che non esiste piu': due script all'avvio sarebbero
    // due servizi, e il secondo morirebbe con un errore di porta occupata.
    const cartella = dir()
    installaAvvioAlLogin({ cartella, eseguibile: ESEGUIBILE, script: 'C:\\vecchio\\host.js' })
    const percorso = installaAvvioAlLogin({ cartella, eseguibile: ESEGUIBILE, script: SCRIPT })
    const contenuto = readFileSync(percorso, 'utf8')
    expect(contenuto).toContain(SCRIPT)
    expect(contenuto).not.toContain('vecchio')
  })

  it('disinstallare toglie lo script', () => {
    const cartella = dir()
    installaAvvioAlLogin({ cartella, eseguibile: ESEGUIBILE, script: SCRIPT })
    disinstallaAvvioAlLogin(cartella)
    expect(statoAvvioAlLogin(cartella).installato).toBe(false)
  })

  it('disinstallare quando non c e niente non solleva', () => {
    expect(() => disinstallaAvvioAlLogin(dir())).not.toThrow()
  })

  it('non tocca gli altri file della cartella Esecuzione automatica', () => {
    // Li' dentro ci sono i programmi che l'utente ha scelto di avviare al login:
    // un servizio che deve restare acceso, per esempio.
    const cartella = dir()
    const altrui = join(cartella, 'portfolio_bot.vbs')
    writeFileSync(altrui, 'roba di qualcun altro', 'utf8')
    installaAvvioAlLogin({ cartella, eseguibile: ESEGUIBILE, script: SCRIPT })
    disinstallaAvvioAlLogin(cartella)
    expect(existsSync(altrui)).toBe(true)
    expect(readFileSync(altrui, 'utf8')).toBe('roba di qualcun altro')
  })
})
