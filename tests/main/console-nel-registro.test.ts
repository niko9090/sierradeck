import { describe, it, expect } from 'vitest'
import { consoleNelRegistro } from '../../src/main/console-nel-registro'

/** 0.80.0: gli errori del main restavano nella console, mai nel registro. */
describe('consoleNelRegistro (0.80.0)', () => {
  const finta = (): { c: Pick<Console, 'warn' | 'error'>; visti: string[] } => {
    const visti: string[] = []
    return { visti, c: { warn: (...a: unknown[]) => { visti.push(`warn ${a.join(' ')}`) }, error: (...a: unknown[]) => { visti.push(`error ${a.join(' ')}`) } } }
  }

  it('error va come ERRORE e warn come info, e la console li vede ancora', () => {
    const righe: string[] = []
    const { c, visti } = finta()
    consoleNelRegistro({ info: (m) => righe.push(`info ${m}`), errore: (m) => righe.push(`ERRORE ${m}`) }, c)
    c.error('[workspace] salvataggio fallito:', new Error('EBUSY'))
    c.warn('[layout] scartato: %s', 'riquadro senza id')
    expect(righe[0]).toMatch(/^ERRORE \[workspace\] salvataggio fallito: Error: EBUSY/)
    expect(righe[1]).toBe('info [layout] scartato: riquadro senza id')
    expect(visti).toHaveLength(2)
  })

  it('un registro che non riesce a scrivere e lo dice con console.error non si richiama da solo', () => {
    let chiamate = 0
    const { c } = finta()
    const registro = { info: () => undefined, errore: () => { chiamate += 1; c.error('[registro] scrittura fallita') } }
    consoleNelRegistro(registro, c)
    c.error('primo')
    expect(chiamate).toBe(1)
  })

  it('si torna a prima', () => {
    const righe: string[] = []
    const { c } = finta()
    const prima = c.error
    const togli = consoleNelRegistro({ info: (m) => righe.push(m), errore: (m) => righe.push(m) }, c)
    togli()
    expect(c.error).toBe(prima)
    c.error('dopo')
    expect(righe).toEqual([])
  })
})
