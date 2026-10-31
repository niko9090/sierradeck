import { describe, it, expect } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { progettiVuotiDaTogliere, prefissoProgetto, type RegistroProgetti } from '../../src/main/progetti/registro'
import { cartellaVuota, giroProgettiVuoti } from '../../src/main/progetti/vuoti'

/**
 * I progetti vuoti (0.88.9, deciso da Nicholas il 31/10): il riordino aveva
 * dato a un PC progetti che non c'erano da nessuna parte. Si tolgono solo se
 * sono di questo PC, vecchi più di una settimana, senza un file qui né sul Drive.
 */
const ADESSO = Date.parse('2026-10-31T20:00:00.000Z')
const VECCHIO = '2026-09-14T17:12:06.852Z'

describe('i progetti vuoti escono dall’elenco (0.88.9)', () => {
  it('solo di questo PC, vecchi, senza file né qui né sul Drive', () => {
    const reg: RegistroProgetti = {
      versione: 1,
      progetti: [
        { id: 'aaaaaaaaaaaa', nome: 'X', aggiuntoIl: VECCHIO, proprietario: 'io', percorso: 'C:\\vuota' },
        { id: 'bbbbbbbbbbbb', nome: 'ConFileQui', aggiuntoIl: VECCHIO, proprietario: 'io', percorso: 'C:\\piena' },
        { id: 'cccccccccccc', nome: 'SulDrive', aggiuntoIl: VECCHIO, proprietario: 'io', percorso: 'C:\\vuota' },
        { id: 'dddddddddddd', nome: 'DiUnAltro', aggiuntoIl: VECCHIO, proprietario: 'altro', percorso: 'C:\\vuota' },
        { id: 'eeeeeeeeeeee', nome: 'Appena nato', aggiuntoIl: '2026-10-29T10:00:00.000Z', proprietario: 'io', percorso: 'C:\\vuota' },
        { id: 'ffffffffffff', nome: 'Senza cartella', aggiuntoIl: VECCHIO, proprietario: 'io' }
      ]
    }
    const vuoti = progettiVuotiDaTogliere(reg, {
      pcId: 'io', adesso: ADESSO,
      conFileSulDrive: new Set([prefissoProgetto('cccccccccccc')]),
      cartellaVuota: (p) => p === 'C:\\vuota'
    })
    expect(vuoti.map((p) => p.nome)).toEqual(['X', 'Senza cartella'])
  })

  it('una cartella con un file, anche in fondo, non è vuota', () => {
    const d = mkdtempSync(join(tmpdir(), 'sd-vuota-'))
    mkdirSync(join(d, 'a', 'b'), { recursive: true })
    expect(cartellaVuota(d)).toBe(true)
    writeFileSync(join(d, 'a', 'b', 'nota.md'), 'x')
    expect(cartellaVuota(d)).toBe(false)
    expect(cartellaVuota(join(d, 'non-c-e'))).toBe(true)
  })

  it('il giro: toglie con la lapide e la cartella vuota; con il Drive che non si legge non tocca niente', async () => {
    const vuota = mkdtempSync(join(tmpdir(), 'sd-progetto-vuoto-'))
    mkdirSync(join(vuota, 'sotto'))
    let reg: RegistroProgetti = { versione: 1, progetti: [{ id: 'aaaaaaaaaaaa', nome: 'X', aggiuntoIl: VECCHIO, proprietario: 'io', percorso: vuota }] }
    const righe: string[] = []
    const d = (sulDrive: Set<string> | undefined): Parameters<typeof giroProgettiVuoti>[0] => ({
      registro: { leggi: () => reg, scrivi: (r) => { reg = r } },
      pcId: () => 'io',
      conFileSulDrive: () => Promise.resolve(sulDrive),
      adesso: () => ADESSO,
      log: (r) => righe.push(r)
    })
    expect(await giroProgettiVuoti(d(undefined))).toBe(0)
    expect(reg.progetti).toHaveLength(1)
    expect(await giroProgettiVuoti(d(new Set()))).toBe(1)
    expect(reg.progetti).toEqual([])
    expect(reg.tolti?.aaaaaaaaaaaa).toBe(new Date(ADESSO).toISOString())
    expect(existsSync(vuota)).toBe(false)
    expect(righe[0]).toContain('«X» tolto dall’elenco')
  })
})
