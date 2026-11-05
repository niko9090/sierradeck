import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { gestisciErroreServer, versioneDelServizio } from '../../src/autopilot-host/errore-server'
import { consoleNelRegistro } from '../../src/autopilot-host/index'

/** Lotto 20261105113725: il doppione che esce per la porta occupata finiva negli errori. */
describe('errore del server del servizio', () => {
  const prova = (codice: string): { avvisi: string[]; errori: string[]; uscite: number[] } => {
    const r = { avvisi: [] as string[], errori: [] as string[], uscite: [] as number[] }
    const err = Object.assign(new Error('x'), { code: codice })
    gestisciErroreServer(err, 4000, {
      avviso: (m) => r.avvisi.push(m),
      errore: (m) => r.errori.push(m),
      esci: (c) => r.uscite.push(c)
    })
    return r
  }

  it('porta occupata: un avviso, nessun errore, uscita 0', () => {
    const r = prova('EADDRINUSE')
    expect(r.avvisi).toHaveLength(1)
    expect(r.avvisi[0]).toContain('4000')
    expect(r.errori).toEqual([])
    expect(r.uscite).toEqual([0])
  })

  it('un altro errore del server resta ERRORE, uscita 1', () => {
    const r = prova('EACCES')
    expect(r.avvisi).toEqual([])
    expect(r.errori).toHaveLength(1)
    expect(r.uscite).toEqual([1])
  })

  it('nel registro del servizio l avviso e info e non errore', () => {
    const righe: string[] = []
    const salvate = { warn: console.warn, error: console.error, info: console.info, log: console.log }
    consoleNelRegistro({ info: (m) => righe.push(`info ${m}`), errore: (m) => righe.push(`ERRORE ${m}`) })
    try {
      gestisciErroreServer(Object.assign(new Error('x'), { code: 'EADDRINUSE' }), 4000, {
        avviso: (m) => console.warn(m), errore: (m, e) => console.error(m, e), esci: () => undefined
      })
    } finally {
      Object.assign(console, salvate)
    }
    expect(righe).toHaveLength(1)
    expect(righe[0]).toMatch(/^info /)
  })
})

describe('versione del servizio', () => {
  const cartella = join('app', 'out', 'main')
  it('quella del Gestore ha la precedenza', () => {
    expect(versioneDelServizio({ SIERRADECK_VERSIONE: '1.2.3' }, cartella, () => { throw new Error('no') })).toBe('1.2.3')
  })
  it('avviato al login: la legge dal package.json dell app', () => {
    let letto = ''
    const v = versioneDelServizio({}, cartella, (p) => { letto = p; return '{"version":"9.8.7"}' })
    expect(v).toBe('9.8.7')
    expect(letto).toBe(join('app', 'package.json'))
  })
  it('senza niente resta ?', () => {
    expect(versioneDelServizio({}, cartella, () => { throw new Error('ENOENT') })).toBe('?')
    expect(versioneDelServizio({}, cartella, () => '{}')).toBe('?')
  })
})
