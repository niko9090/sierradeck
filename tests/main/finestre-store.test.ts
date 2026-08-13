import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apriFinestreStore } from '../../src/main/finestre-store'

function cartella(): string {
  return mkdtempSync(join(tmpdir(), 'sd-finestre-'))
}

describe('dove stavano le finestre', () => {
  it('senza niente di salvato non racconta niente', () => {
    expect(apriFinestreStore(cartella()).leggi()).toEqual([])
  })

  it('ricorda il monitor di una finestra chiusa, e lo rilegge dopo', () => {
    const dove = cartella()
    apriFinestreStore(dove).ricorda('2560x1440@1')
    expect(apriFinestreStore(dove).leggi()).toEqual(['2560x1440@1'])
  })

  it('la piu recente sta davanti', () => {
    const s = apriFinestreStore(cartella())
    s.ricorda('primo')
    s.ricorda('secondo')
    expect(s.leggi()).toEqual(['secondo', 'primo'])
  })

  it('lo stesso monitor non occupa due posti', () => {
    // Due finestre chiuse sullo stesso schermo sono un'informazione sola.
    const s = apriFinestreStore(cartella())
    s.ricorda('uno')
    s.ricorda('due')
    s.ricorda('uno')
    expect(s.leggi()).toEqual(['uno', 'due'])
  })

  it('non ne tiene piu di quattro', () => {
    const s = apriFinestreStore(cartella())
    for (const c of ['a', 'b', 'c', 'd', 'e']) s.ricorda(c)
    expect(s.leggi()).toHaveLength(4)
    expect(s.leggi()[0]).toBe('e')
  })

  it('un file rovinato non impedisce al programma di aprirsi', () => {
    // Al massimo la finestra torna dove tornava prima: sul primo schermo libero.
    const dove = cartella()
    writeFileSync(join(dove, 'finestre.json'), '{ questo non e json')
    expect(apriFinestreStore(dove).leggi()).toEqual([])
  })

  it('scarta quello che non e una chiave', () => {
    const dove = cartella()
    writeFileSync(join(dove, 'finestre.json'), JSON.stringify({ schermi: ['buona', 42, '', null] }))
    expect(apriFinestreStore(dove).leggi()).toEqual(['buona'])
  })
})
