import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { risolviCartellaDiChat } from '../../src/main/progetti/cartella-di-chat'
import type { RegistroProgetti } from '../../src/main/progetti/registro'

/**
 * Nicholas (2026-09-15): le chat arrivate dal Drive si aprivano in una
 * cartella vuota di qui e davano «directory non trovata». La regola nuova:
 * la cartella di un altro PC non si adotta.
 */
const PROGETTI = 'C:\\Users\\nikof\\Progetti SierraDeck'
const vuoto: RegistroProgetti = { versione: 1, progetti: [] }
const ORIGINE = 'E:\\Documents\\Progetti SierraDeck\\fionda apl'
const portatile = (cwd: string): { id: string; nome: string } | undefined => (cwd.startsWith('E:\\Documents\\') ? { id: 'P', nome: 'Portatile' } : undefined)

describe('la cartella di un altro PC non si adotta', () => {
  it('IL PUNTO: la chat resta con la sua cartella, e si sa di chi e', () => {
    const r = risolviCartellaDiChat({ cwd: ORIGINE, registro: vuoto, pcId: 'F', cartellaProgetti: PROGETTI, esiste: () => false, adesso: 'T', altrove: portatile })
    expect(r).toEqual({ cwd: ORIGINE, motivo: 'altrove', pc: { id: 'P', nome: 'Portatile' } })
  })

  it('vale anche se il registro conosce un progetto con quel percorso: prima si guarda chi ce l ha', () => {
    // Un terzo PC l'aveva adottato: senza questa regola, la chat andava
    // nella cartella vuota di qui «perche' il progetto e' noto».
    const reg: RegistroProgetti = { versione: 1, progetti: [{ id: 'p1', nome: 'fionda apl', percorsi: { X: 'C:\\Users\\x\\Progetti SierraDeck\\fionda apl' }, origini: [ORIGINE], aggiuntoIl: 'T' }] }
    const r = risolviCartellaDiChat({ cwd: ORIGINE, registro: reg, pcId: 'F', cartellaProgetti: PROGETTI, esiste: () => false, adesso: 'T', altrove: portatile })
    expect(r.motivo).toBe('altrove')
  })

  it('«Aprila qui lo stesso»: con forza si adotta come prima, in una cartella vuota', () => {
    const r = risolviCartellaDiChat({ cwd: ORIGINE, registro: vuoto, pcId: 'F', cartellaProgetti: PROGETTI, esiste: () => false, adesso: 'T', altrove: portatile, forza: true })
    expect(r.motivo).toBe('adottata')
    expect(r.cwd).toBe(join(PROGETTI, 'fionda apl'))
  })

  it('una cartella che nessun PC ha (un vecchio percorso di questo stesso PC) si adotta come prima', () => {
    const r = risolviCartellaDiChat({ cwd: 'C:\\Users\\nikof\\Documents\\Money', registro: vuoto, pcId: 'F', cartellaProgetti: PROGETTI, esiste: () => false, adesso: 'T', altrove: portatile })
    expect(r.motivo).toBe('adottata')
  })

  it('se la cartella c e, non si chiede a nessuno', () => {
    let chieste = 0
    const r = risolviCartellaDiChat({ cwd: ORIGINE, registro: vuoto, pcId: 'F', cartellaProgetti: PROGETTI, esiste: () => true, adesso: 'T', altrove: (c) => { chieste += 1; return portatile(c) } })
    expect(r.motivo).toBe('esiste')
    expect(chieste).toBe(0)
  })
})
