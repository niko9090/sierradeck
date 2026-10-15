import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { conDivieti, eseguiCriteri, type Esecutore } from '../../src/autopilot-host/verifiche'

/**
 * I comandi dei criteri passano dal controllo dei divieti (0.72.0): una
 * cancellazione ricorsiva fuori dalla cartella del progetto non parte.
 */
const PROGETTO = join(process.cwd(), 'progetto-finto')

function conRegistro(): { esegui: Esecutore; eseguiti: string[] } {
  const eseguiti: string[] = []
  const esegui = conDivieti((comando) => { eseguiti.push(comando); return Promise.resolve({ codice: 0, uscita: 'ok' }) })
  return { esegui, eseguiti }
}

describe('criteri con i divieti', () => {
  it('i criteri normali partono', async () => {
    const { esegui, eseguiti } = conRegistro()
    for (const c of ['npm test', 'npm run typecheck', 'cd android && gradle testDebugUnitTest assembleDebug --no-daemon', 'rm -rf dist', 'bash -c "rm -rf out/tmp"']) {
      expect((await esegui(c, PROGETTO)).codice).toBe(0)
    }
    expect(eseguiti).toHaveLength(5)
  })

  const RIFIUTATI = [
    'rm -rf ../altro',
    'rm -rf "$LOCALAPPDATA"',
    'rm -rf ~/AppData/Local',
    'd=$(mktemp -d) && gh release download -D "$d" && rm -rf "$d"',
    'bash -c \'rm -rf "$TEMP"/*\'',
    'powershell -Command "Remove-Item C:/Users/mario/AppData/Local -Recurse -Force"',
    'cmd /c rd /s /q C:/Users/mario/AppData/Local',
    'find / -delete',
    'rm -rf .'
  ]
  for (const c of RIFIUTATI) {
    it(`non esegue: ${c}`, async () => {
      const { esegui, eseguiti } = conRegistro()
      const r = await esegui(c, PROGETTO)
      expect(r.codice).not.toBe(0)
      expect(r.uscita).toContain('SierraDeck non esegue questo criterio')
      expect(eseguiti).toHaveLength(0)
    })
  }

  it('il criterio rifiutato risulta «non misurato», con il motivo', async () => {
    const { esegui } = conRegistro()
    const esiti = await eseguiCriteri([{ descrizione: 'pulizia', comando: 'rm -rf ../altro', soddisfatto: false }], PROGETTO, esegui)
    expect(esiti[0]).toMatchObject({ passato: false, misurato: false })
    expect(esiti[0]!.uscita).toContain('fuori dalle cartelle')
  })
})
