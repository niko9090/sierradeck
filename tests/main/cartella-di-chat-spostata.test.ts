import { describe, expect, it } from 'vitest'
import { risolviCartellaDiChat } from '../../src/main/progetti/cartella-di-chat'
import type { RegistroProgetti } from '../../src/main/progetti/registro'

/**
 * Nicholas (2026-09-16): «sto spostando la cartella documenti in E:\ così ho
 * più spazio». Le chat tengono dentro `C:\Users\nikof\Documents\Portfolio`
 * (580 chat); dopo lo spostamento la cartella sta in
 * `E:\Users\nikof\Documents\Portfolio`. Senza questa regola venivano adottate
 * in «Progetti SierraDeck\Portfolio», vuota.
 */
const PROGETTI = 'C:\\Users\\nikof\\Progetti SierraDeck'
const vuoto: RegistroProgetti = { versione: 1, progetti: [] }
const VECCHIA = 'C:\\Users\\nikof\\Documents'
const NUOVA = 'E:\\Users\\nikof\\Documents'
const spostate = [{ da: VECCHIA, a: NUOVA }]
const esisteSuE = (p: string): boolean => p.toLowerCase().startsWith(NUOVA.toLowerCase())

describe('la cartella Documenti si e spostata', () => {
  it('IL PUNTO: la chat lavora nella stessa sottocartella sotto la Documenti nuova', () => {
    const r = risolviCartellaDiChat({
      cwd: `${VECCHIA}\\Portfolio`, registro: vuoto, pcId: 'F', cartellaProgetti: PROGETTI,
      esiste: esisteSuE, adesso: 'T', radiciSpostate: spostate
    })
    expect(r).toEqual({ cwd: `${NUOVA}\\Portfolio`, motivo: 'spostata' })
  })

  it('anche una sottocartella profonda, e senza badare a maiuscole', () => {
    const r = risolviCartellaDiChat({
      cwd: 'c:\\users\\nikof\\documents\\Trading\\Trading', registro: vuoto, pcId: 'F', cartellaProgetti: PROGETTI,
      esiste: esisteSuE, adesso: 'T', radiciSpostate: spostate
    })
    expect(r.motivo).toBe('spostata')
    expect(r.cwd).toBe(`${NUOVA}\\Trading\\Trading`)
  })

  it('vale prima di «altrove»: l altro PC ha ancora lo stesso percorso vecchio, ma la cartella sta qui', () => {
    const portatile = (): { id: string; nome: string } => ({ id: 'P', nome: 'Portatile' })
    const r = risolviCartellaDiChat({
      cwd: `${VECCHIA}\\Portfolio`, registro: vuoto, pcId: 'F', cartellaProgetti: PROGETTI,
      esiste: esisteSuE, adesso: 'T', altrove: portatile, radiciSpostate: spostate
    })
    expect(r.motivo).toBe('spostata')
  })

  it('se sotto la Documenti nuova non c e, si va avanti come prima (adozione)', () => {
    const r = risolviCartellaDiChat({
      cwd: `${VECCHIA}\\Money`, registro: vuoto, pcId: 'F', cartellaProgetti: PROGETTI,
      esiste: () => false, adesso: 'T', radiciSpostate: spostate
    })
    expect(r.motivo).toBe('adottata')
  })

  it('una cartella fuori dalla radice spostata non viene toccata', () => {
    const r = risolviCartellaDiChat({
      cwd: 'D:\\dev\\Wdeck', registro: vuoto, pcId: 'F', cartellaProgetti: PROGETTI,
      esiste: () => false, adesso: 'T', radiciSpostate: spostate
    })
    expect(r.motivo).toBe('adottata')
  })
})
