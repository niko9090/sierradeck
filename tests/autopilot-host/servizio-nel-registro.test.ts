import { describe, it, expect, afterEach } from 'vitest'
import { consoleNelRegistro } from '../../src/autopilot-host/index'

/**
 * Il servizio parte con l'uscita buttata via: dalla 0.72.0 quello che dice va
 * anche nel registro, o del suo lavoro (consegne, criteri) non resta traccia.
 */
const originali = { info: console.info, log: console.log, warn: console.warn, error: console.error }
afterEach(() => { Object.assign(console, originali) })

describe('le righe del servizio finiscono nel registro', () => {
  it('info, warn ed error, con il testo formattato', () => {
    const righe: string[] = []
    Object.assign(console, { info: () => {}, log: () => {}, warn: () => {}, error: () => {} })
    consoleNelRegistro({ info: (m) => righe.push(`I ${m}`), errore: (m) => righe.push(`E ${m}`) })
    console.info('[consegna] %s: partita', 'c-7')
    console.warn('[autopilota] comando bloccato')
    console.error('[criterio] guasto', new Error('x'))
    expect(righe[0]).toBe('I [consegna] c-7: partita')
    expect(righe[1]).toBe('I [autopilota] comando bloccato')
    expect(righe[2]).toMatch(/^E \[criterio\] guasto Error: x/)
  })

  it('un registro che non scrive non fa girare il servizio in tondo', () => {
    Object.assign(console, { info: () => {}, log: () => {}, warn: () => {}, error: () => {} })
    let chiamate = 0
    consoleNelRegistro({ info: () => { chiamate += 1; console.error('[registro] non scrivo') }, errore: () => { chiamate += 1; throw new Error('disco pieno') } })
    console.info('ciao')
    expect(chiamate).toBe(1)
  })

  it('11/11: una riga scritta direttamente nel registro non esce due volte per via della sua eco', () => {
    const righe: string[] = []
    Object.assign(console, { info: () => {}, log: () => {}, warn: () => {}, error: () => {} })
    // Come il registro vero: scrive la riga e ne fa l'eco sulla console, con «[registro]» davanti.
    const registro = {
      info: (m: string): void => { righe.push(`I ${m}`); console.log(`[registro] ${m}`) },
      errore: (m: string): void => { righe.push(`E ${m}`); console.error(`[registro] ${m}`) }
    }
    consoleNelRegistro(registro)
    registro.info('[servizio] avviso di Node: DeprecationWarning: x')
    registro.errore('[servizio] eccezione non gestita — Error: y')
    console.info('[consegna] partita')
    expect(righe).toEqual([
      'I [servizio] avviso di Node: DeprecationWarning: x',
      'E [servizio] eccezione non gestita — Error: y',
      'I [consegna] partita'
    ])
    // Il registro che non riesce a scrivere lo dice con due argomenti: quella riga non è un'eco, e passa.
    console.error('[registro] scrittura fallita:', new Error('disco pieno'))
    expect(righe.at(-1)).toMatch(/^E \[registro\] scrittura fallita: Error: disco pieno/)
  })
})
