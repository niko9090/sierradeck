import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apriFinestreStore, type GeometriaFinestra } from '../../src/main/finestre-store'

function cartella(): string {
  return mkdtempSync(join(tmpdir(), 'sd-finestre-'))
}

/** Una geometria di comodo: quello che conta nei test è la chiave e lo stato. */
function geo(chiave: string, extra: Partial<GeometriaFinestra> = {}): GeometriaFinestra {
  return { chiave, bounds: { x: 10, y: 20, width: 1600, height: 1000 }, stato: 'normale', ...extra }
}

describe('dove stavano le finestre', () => {
  it('senza niente di salvato non racconta niente', () => {
    expect(apriFinestreStore(cartella()).leggi()).toEqual([])
  })

  it('ricorda il monitor di una finestra chiusa, e lo rilegge dopo', () => {
    const dove = cartella()
    apriFinestreStore(dove).ricorda(geo('2560x1440@0,0@1'))
    expect(apriFinestreStore(dove).leggi()).toEqual(['2560x1440@0,0@1'])
  })

  it('la piu recente sta davanti', () => {
    const s = apriFinestreStore(cartella())
    s.ricorda(geo('primo'))
    s.ricorda(geo('secondo'))
    expect(s.leggi()).toEqual(['secondo', 'primo'])
  })

  it('lo stesso monitor non occupa due posti', () => {
    // Due finestre chiuse sullo stesso schermo sono un'informazione sola.
    const s = apriFinestreStore(cartella())
    s.ricorda(geo('uno'))
    s.ricorda(geo('due'))
    s.ricorda(geo('uno'))
    expect(s.leggi()).toEqual(['uno', 'due'])
  })

  it('non ne tiene piu di quattro', () => {
    const s = apriFinestreStore(cartella())
    for (const c of ['a', 'b', 'c', 'd', 'e']) s.ricorda(geo(c))
    expect(s.leggi()).toHaveLength(4)
    expect(s.leggi()[0]).toBe('e')
  })

  it('un file rovinato non impedisce al programma di aprirsi', () => {
    // Al massimo la finestra torna dove tornava prima: sul primo schermo libero.
    const dove = cartella()
    writeFileSync(join(dove, 'finestre.json'), '{ questo non e json')
    expect(apriFinestreStore(dove).leggi()).toEqual([])
  })

  it('rilegge dimensione e stato, non solo il monitor', () => {
    const dove = cartella()
    apriFinestreStore(dove).ricorda({
      chiave: 'mon',
      bounds: { x: 100, y: 50, width: 1280, height: 800 },
      stato: 'ingrandita'
    })
    const g = apriFinestreStore(dove).geometria('mon')
    expect(g).toEqual({ chiave: 'mon', bounds: { x: 100, y: 50, width: 1280, height: 800 }, stato: 'ingrandita' })
  })

  it('geometria di un monitor sconosciuto e undefined', () => {
    const s = apriFinestreStore(cartella())
    s.ricorda(geo('c-e'))
    expect(s.geometria('non-c-e')).toBeUndefined()
  })

  it('lo schermo intero si ricorda come tale', () => {
    const dove = cartella()
    apriFinestreStore(dove).ricorda(geo('m', { stato: 'schermo-intero' }))
    expect(apriFinestreStore(dove).geometria('m')?.stato).toBe('schermo-intero')
  })

  it('legge il formato vecchio (solo chiavi) senza geometria', () => {
    // Chi aggiorna non perde il ricordo di dov'erano: il monitor si rilegge, ma
    // senza dimensione — `geometria` lo dice restituendo undefined.
    const dove = cartella()
    writeFileSync(join(dove, 'finestre.json'), JSON.stringify({ schermi: ['vecchia', 42, '', null] }))
    const s = apriFinestreStore(dove)
    expect(s.leggi()).toEqual(['vecchia'])
    expect(s.geometria('vecchia')).toBeUndefined()
  })

  it('scarta una voce senza bounds validi', () => {
    const dove = cartella()
    writeFileSync(join(dove, 'finestre.json'), JSON.stringify({
      finestre: [
        { chiave: 'buona', bounds: { x: 0, y: 0, width: 800, height: 600 }, stato: 'normale' },
        { chiave: 'rotta', bounds: { x: 0, y: 0, width: 0, height: 600 }, stato: 'normale' },
        { chiave: 'senza-bounds', stato: 'normale' }
      ]
    }))
    expect(apriFinestreStore(dove).leggi()).toEqual(['buona'])
  })
})
