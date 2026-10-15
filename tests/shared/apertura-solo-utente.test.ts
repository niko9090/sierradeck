import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { nonRipartePerAltri } from '../../src/shared/apertura-solo-utente'

/**
 * 0.73.0, Nicholas (15/10): «una chat su un altro PC non si deve mai aprire da
 * sola». Si apre solo con un suo comando: mai per un riavvio o perché si è
 * aperto un workspace.
 */
describe('una chat chiesta da un altro PC non riparte da sola dopo un riavvio', () => {
  it('quella di un autopilota di questo PC riparte: il suo lavoro deve continuare', () => {
    expect(nonRipartePerAltri({ perChi: { id: 'autopilota:ap-1', nome: 'il suo autopilota' }, coda: [] })).toBeUndefined()
  })
  it('quella chiesta da un altro PC o dal telefono aspetta un nuovo comando, e il registro dice perché', () => {
    expect(nonRipartePerAltri({ perChi: { id: 'pc-2', nome: 'il portatile' }, coda: [] })).toContain('si riapre solo con un suo nuovo comando')
    expect(nonRipartePerAltri({ perChi: { id: 'telefono', nome: 'il telefono' }, coda: [{}, {}] })).toContain('2 testi in coda')
  })
})

describe('aprire qui un workspace di un altro PC non avvia le sue chat là', () => {
  it('nessun avvio in sottofondo dentro «workspace:apriDaAltroPc»', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'src', 'main', 'index.ts'), 'utf8')
    const inizio = src.indexOf("'workspace:apriDaAltroPc'")
    expect(inizio).toBeGreaterThan(0)
    const fine = src.indexOf('ipcMain.handle(', inizio + 10)
    const corpo = src.slice(inizio, fine)
    expect(corpo).not.toContain('sottofondoRemoto(')
    expect(corpo).toContain('restano chiuse')
  })
  it('al riavvio le chat in sottofondo passano dal cancello', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'src', 'main', 'index.ts'), 'utf8')
    expect(src).toMatch(/sf\.riprendi\(\(v\) => \(existsSync\(v\.cwd\) \? nonRipartePerAltri\(v\)/)
  })
})
