import { describe, it, expect } from 'vitest'
import { creaInvioDoppioni, richiestaDoppioni } from '../../src/main/progetti/doppioni-al-servizio'
import type { RichiestaDoppioni } from '@shared/autopiloti-doppioni'

/**
 * 31/10: il programma manda il registro dei progetti al servizio la prima
 * volta e poi solo quando cambia; se il servizio non risponde riprova al giro
 * dopo, e lo dice una volta sola.
 */

describe('il registro dei progetti al servizio', () => {
  it('manda la prima volta, non rimanda lo stesso registro, rimanda quando cambia; un fallimento si riprova e si dice una volta', async () => {
    let progetti = [{ id: '1', nome: 'GLOS', aggiuntoIl: '', proprietario: 'pc-la' }]
    const mandate: RichiestaDoppioni[] = []
    const log: string[] = []
    let rotto = false
    const invio = creaInvioDoppioni({
      richiesta: () => richiestaDoppioni({ pcId: 'pc-qui', progetti, nomiPc: { 'pc-la': 'Portatile' } }),
      manda: (r) => {
        if (rotto) return Promise.reject(new Error('il servizio non risponde'))
        mandate.push(r)
        return Promise.resolve({ righe: ['[pulizia] autopilota di GLOS archiviato: il progetto vive su Portatile'], errori: [] })
      },
      log: (m) => { log.push(m) }
    })
    expect(await invio.giro()).toBe(true)
    expect(mandate[0]).toEqual({ pcId: 'pc-qui', progetti: [{ nome: 'GLOS', proprietario: 'pc-la' }], nomiPc: { 'pc-la': 'Portatile' } })
    expect(await invio.giro()).toBe(false)
    rotto = true
    progetti = [...progetti, { id: '2', nome: 'Sito', aggiuntoIl: '', proprietario: 'pc-qui' }]
    expect(await invio.giro()).toBe(false)
    expect(await invio.giro()).toBe(false)
    expect(log.filter((m) => m.includes('non mandato'))).toHaveLength(1)
    rotto = false
    expect(await invio.giro()).toBe(true)
    expect(mandate).toHaveLength(2)
  })
})
