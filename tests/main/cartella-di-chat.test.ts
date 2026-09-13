import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { nomeCartella, risolviCartellaDiChat } from '../../src/main/progetti/cartella-di-chat'
import type { RegistroProgetti } from '../../src/main/progetti/registro'

/**
 * Il difetto (portatile, 2026-09-13): una chat scaricata dal Drive porta la
 * cartella del PC in cui e' nata; qui non c'e', e Claude Code non parte
 * («directory non trovata»). All'apertura si decide dove lavora.
 */

const PROGETTI = 'C:\\Users\\nikof\\Documents\\Progetti SierraDeck'
const vuoto: RegistroProgetti = { versione: 1, progetti: [] }

describe('la cartella di una chat arrivata da un altro PC', () => {
  it('se la cartella c’è, resta com’è', () => {
    const r = risolviCartellaDiChat({ cwd: 'C:\\lavoro\\x', registro: vuoto, pcId: 'PORT', cartellaProgetti: PROGETTI, esiste: () => true, adesso: 'T' })
    expect(r).toEqual({ cwd: 'C:\\lavoro\\x', motivo: 'esiste' })
  })

  it('dentro un progetto conosciuto col percorso dell’altro PC: la stessa sottocartella nel progetto di qui', () => {
    const reg: RegistroProgetti = { versione: 1, progetti: [{ id: 'p1', nome: 'Wdeck', percorsi: { FISSO: 'E:\\Users\\nikof\\Documents\\Wdeck' }, aggiuntoIl: 'T' }] }
    const r = risolviCartellaDiChat({ cwd: 'E:\\Users\\nikof\\Documents\\Wdeck\\src', registro: reg, pcId: 'PORT', cartellaProgetti: PROGETTI, esiste: () => false, adesso: 'T' })
    expect(r.motivo).toBe('progetto')
    expect(r.cwd).toBe(join(PROGETTI, 'Wdeck', 'src'))
    expect(r.nome).toBe('Wdeck')
    expect(r.registro).toBeUndefined()
  })

  it('IL PUNTO: una cartella sconosciuta viene adottata in «Progetti SierraDeck», e le sorelle poi la trovano', () => {
    const prima = risolviCartellaDiChat({ cwd: 'E:\\Users\\nikof\\Documents\\Wdeck', registro: vuoto, pcId: 'PORT', cartellaProgetti: PROGETTI, esiste: () => false, adesso: 'T' })
    expect(prima.motivo).toBe('adottata')
    expect(prima.cwd).toBe(join(PROGETTI, 'Wdeck'))
    expect(prima.nome).toBe('Wdeck')
    expect(prima.registro?.progetti).toHaveLength(1)
    expect(prima.registro?.progetti[0]?.origini).toEqual(['E:\\Users\\nikof\\Documents\\Wdeck'])
    expect(prima.registro?.progetti[0]?.percorsi.PORT).toBe(join(PROGETTI, 'Wdeck'))
    // La chat sorella, in una sottocartella dello stesso progetto: gia' mappata.
    const dopo = risolviCartellaDiChat({ cwd: 'E:\\Users\\nikof\\Documents\\Wdeck\\lib', registro: prima.registro!, pcId: 'PORT', cartellaProgetti: PROGETTI, esiste: () => false, adesso: 'T' })
    expect(dopo.motivo).toBe('progetto')
    expect(dopo.cwd).toBe(join(PROGETTI, 'Wdeck', 'lib'))
  })

  it('il nome viene dall’ultima cartella, di qualunque PC, senza caratteri vietati', () => {
    expect(nomeCartella('E:\\Users\\nikof\\Documents\\Wdeck')).toBe('Wdeck')
    expect(nomeCartella('/home/nikof/progetti/torre/')).toBe('torre')
    expect(nomeCartella('E:\\')).toBe('E')
    expect(nomeCartella('')).toBe('progetto')
    expect(nomeCartella('C:\\a\\b:c?')).toBe('b-c')
  })
})
