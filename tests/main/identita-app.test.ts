import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { UUID } from 'builder-util-runtime'
import { APP_ID, GUID_INSTALLAZIONE } from '../../src/main/identita-app'

// 0.57.0: l'appId è cambiato per decisione di Nicholas. Tre cose devono restare
// allineate, o l'aggiornamento diventa un secondo programma oppure la finestra
// si separa dal suo collegamento sulla barra delle applicazioni.

const yml = readFileSync('electron-builder.yml', 'utf8')
const campo = (nome: string): string | undefined => new RegExp(`^\\s*${nome}:\\s*(\\S+)\\s*$`, 'm').exec(yml)?.[1]

describe('identità del programma per Windows', () => {
  it('l appId dell installer è quello che il programma dichiara all avvio', () => {
    expect(campo('appId')).toBe(APP_ID)
    expect(APP_ID).toBe('it.ferrariconsulenze.sierradeck')
  })

  it('la GUID dell installazione resta quella di prima, non quella dell appId nuovo', () => {
    expect(campo('guid')).toBe(GUID_INSTALLAZIONE)
    // electron-builder senza `guid` userebbe questa: una seconda voce in «App installate».
    const ricavata = UUID.v5(APP_ID, UUID.parse('50e065bc-3134-11e6-9bab-38c9862bdaf3'))
    expect(ricavata).not.toBe(GUID_INSTALLAZIONE)
  })

  it('il collegamento fissato sulla barra delle applicazioni riceve l AppUserModelID nuovo', () => {
    expect(campo('include')).toBe('build/installer.nsh')
    const nsh = readFileSync('build/installer.nsh', 'utf8')
    expect(nsh).toContain('!macro customInstall')
    expect(nsh).toContain('WinShell::SetLnkAUMI')
    expect(nsh).toContain('User Pinned\\TaskBar\\${SHORTCUT_NAME}.lnk')
  })

  it('il programma lo dichiara a Windows prima di tutto il resto', () => {
    const main = readFileSync('src/main/index.ts', 'utf8')
    const dichiara = main.indexOf('app.setAppUserModelId(APP_ID)')
    expect(dichiara).toBeGreaterThan(0)
    expect(dichiara).toBeLessThan(main.indexOf('app.requestSingleInstanceLock()'))
  })
})

describe('la copia di prova non usa mai le porte del programma vero', () => {
  it('le predefinite diventano 47650 e 47651, le altre restano', async () => {
    const { portePerLaProva } = await import('../../src/main/identita-app')
    expect(portePerLaProva({ portaClient: 47640, portaAutopiloti: 47630 })).toEqual({ portaClient: 47650, portaAutopiloti: 47651 })
    expect(portePerLaProva({ portaClient: 47700, portaAutopiloti: 47701 })).toEqual({ portaClient: 47700, portaAutopiloti: 47701 })
  })
})
