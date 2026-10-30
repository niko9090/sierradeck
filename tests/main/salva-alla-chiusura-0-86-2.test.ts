import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { entroOppure, fotografaFinestra } from '../../src/main/salva-alla-chiusura'

/**
 * 0.86.2: `istantanee:salva` alla chiusura — «Object has been destroyed», e
 * «Ultima chiusura» non scritta.
 */

describe('la finestra che salva si fotografa prima di qualunque attesa', () => {
  it('viva: id, monitor e slot', () => {
    const win = { id: 3, isDestroyed: () => false }
    expect(fotografaFinestra(win, () => 'monitor-A', () => '2')).toEqual({ id: 3, monitor: 'monitor-A', slot: '2' })
  })

  it('gia\' distrutta, o che si distrugge mentre la si legge: niente, senza eccezioni', () => {
    expect(fotografaFinestra({ id: 3, isDestroyed: () => true }, () => 'm', () => '1')).toBeUndefined()
    const morente = { id: 3, isDestroyed: () => false }
    expect(fotografaFinestra(morente, () => { throw new TypeError('Object has been destroyed') }, () => '1')).toBeUndefined()
  })

  it('il gestore legge monitor e slot prima del primo await', () => {
    const sorgente = readFileSync(join(__dirname, '../../src/main/ipc.ts'), 'utf8')
    const inizio = sorgente.indexOf("'istantanee:salva'")
    const corpo = sorgente.slice(inizio, sorgente.indexOf("'istantanee:elimina'"))
    const foto = corpo.indexOf('fotografaFinestra(win')
    const primoAwait = corpo.indexOf('await ')
    expect(foto).toBeGreaterThan(0)
    expect(foto).toBeLessThan(primoAwait)
    // Dopo le attese la finestra non si tocca piu'.
    expect(corpo.slice(primoAwait)).not.toMatch(/monitorDellaFinestra\(win\)|slotDellaFinestra\(win\)|win\.id/)
  })
})

describe('alla chiusura il servizio degli autopiloti non si aspetta', () => {
  it('risponde in tempo: la sua risposta', async () => {
    expect(await entroOppure(Promise.resolve([1, 2]), 50, [])).toEqual([1, 2])
  })

  it('non risponde: il ripiego, allo scadere', async () => {
    const inizio = Date.now()
    const esito = await entroOppure(new Promise<number[]>(() => undefined), 30, [])
    expect(esito).toEqual([])
    expect(Date.now() - inizio).toBeLessThan(1000)
  })

  it('risponde con un errore: il ripiego, senza rigettare', async () => {
    expect(await entroOppure(Promise.reject(new Error('servizio spento')), 50, ['x'])).toEqual(['x'])
  })
})
