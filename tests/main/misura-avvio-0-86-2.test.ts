import { describe, it, expect } from 'vitest'
import { creaMisuraAvvio } from '../../src/main/misura-avvio'

/** 0.86.2: l'avvio non era misurato. Due tempi, una volta sola. */
describe('il tempo d avvio', () => {
  it('prima finestra e prima chat al prompt, una volta ciascuna, anche prima del registro', () => {
    let adesso = 0
    const m = creaMisuraAvvio(() => adesso)
    adesso = 2100
    m.finestraMostrata()
    adesso = 3000
    m.finestraMostrata()
    m.datiDaTerminale('\x1b[2J caricamento…')
    expect(m.finita()).toBe(false)

    const righe: string[] = []
    m.impostaRegistro((r) => righe.push(r))
    expect(righe).toEqual(['[avvio] prima finestra a schermo dopo 2.1 s'])

    adesso = 9600
    m.datiDaTerminale('╭───╮\n│ ❯ \n╰───╯ ? for shortcuts')
    adesso = 12_000
    m.datiDaTerminale('❯ ')
    expect(righe).toEqual([
      '[avvio] prima finestra a schermo dopo 2.1 s',
      '[avvio] prima chat al prompt dopo 9.6 s (7.5 s dopo la finestra)'
    ])
    expect(m.finita()).toBe(true)
  })
})
