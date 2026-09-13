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
    // E si collega qui (controllo del 14/09): senza, la volta dopo la stessa
    // cartella veniva «adottata» come progetto nuovo accanto a quello vero.
    expect(r.registro?.progetti[0]?.percorsi.PORT).toBe(join(PROGETTI, 'Wdeck'))
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

describe('cosa NON si adotta (controllo del 14/09)', () => {
  it('una sottocartella sparita di un progetto già mio si ricrea lì, non diventa un progetto nuovo', () => {
    // Prima `D:\\dev\\Wdeck\\src` cancellata diventava un progetto «src» in
    // «Progetti SierraDeck», nel registro condiviso di tutti i PC.
    const reg: RegistroProgetti = { versione: 1, progetti: [{ id: 'p1', nome: 'Wdeck', percorsi: { QUI: 'D:\\dev\\Wdeck' }, aggiuntoIl: 'T' }] }
    const r = risolviCartellaDiChat({ cwd: 'D:\\dev\\Wdeck\\src', registro: reg, pcId: 'QUI', cartellaProgetti: PROGETTI, esiste: () => false, adesso: 'T' })
    expect(r).toEqual({ cwd: 'D:\\dev\\Wdeck\\src', motivo: 'progetto', nome: 'Wdeck' })
  })

  it('un progetto conosciuto ma mai collegato qui si collega, così la volta dopo non nasce un doppione', () => {
    const reg: RegistroProgetti = { versione: 1, progetti: [{ id: 'p1', nome: 'Wdeck', percorsi: { FISSO: 'E:\\Users\\nikof\\Documents\\Wdeck' }, aggiuntoIl: 'T' }] }
    const r = risolviCartellaDiChat({ cwd: 'E:\\Users\\nikof\\Documents\\Wdeck\\src', registro: reg, pcId: 'PORT', cartellaProgetti: PROGETTI, esiste: () => false, adesso: 'T' })
    expect(r.motivo).toBe('progetto')
    expect(r.registro?.progetti[0]?.percorsi.PORT).toBe(join(PROGETTI, 'Wdeck'))
    // Con il registro aggiornato, la stessa cartella non si adotta piu'.
    const dopo = risolviCartellaDiChat({ cwd: 'E:\\Users\\nikof\\Documents\\Wdeck\\src', registro: r.registro!, pcId: 'PORT', cartellaProgetti: PROGETTI, esiste: () => false, adesso: 'T' })
    expect(dopo.motivo).toBe('progetto')
    expect(dopo.registro).toBeUndefined()
  })

  it('due progetti con lo stesso nome non finiscono nella stessa cartella', () => {
    const reg: RegistroProgetti = { versione: 1, progetti: [{ id: 'p1', nome: 'src', percorsi: { QUI: join(PROGETTI, 'src') }, origini: ['C:\\a\\Alfa\\src'], aggiuntoIl: 'T' }] }
    const r = risolviCartellaDiChat({ cwd: 'C:\\b\\Beta\\src', registro: reg, pcId: 'QUI', cartellaProgetti: PROGETTI, esiste: () => false, adesso: '2026-09-14T10:11:12.000Z' })
    expect(r.motivo).toBe('adottata')
    expect(r.cwd).not.toBe(join(PROGETTI, 'src'))
    expect(r.cwd.startsWith(join(PROGETTI, 'src-'))).toBe(true)
  })
})
