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

/**
 * Dove stavano le finestre.
 *
 * Questo file teneva **un ricordo per monitor**, accumulato una finestra alla
 * volta e mai ripulito: dopo qualche settimana conteneva schermi su cui non
 * c'era una finestra da giorni, e riaprendone una la si pescava da lì — chi ne
 * teneva una sola sul monitor di destra se la ritrovava a sinistra.
 *
 * È lo stesso guasto dell'archivio dei workspace, *dedurre lo stato invece di
 * registrarlo*, e la cura è la stessa: si scrive **la fotografia intera** delle
 * finestre di adesso, ogni volta che la scena cambia.
 */
describe('la fotografia delle finestre', () => {
  it('senza niente di salvato non racconta niente', () => {
    const s = apriFinestreStore(cartella())
    expect(s.leggi()).toEqual([])
    expect(s.nesima(0)).toBeUndefined()
  })

  it('rilegge quello che ha scritto: monitor, dimensione e stato', () => {
    const dove = cartella()
    apriFinestreStore(dove).fotografa([{
      chiave: 'mon', slot: '1',
      bounds: { x: 100, y: 50, width: 1280, height: 800 },
      stato: 'ingrandita'
    }])
    expect(apriFinestreStore(dove).nesima(0)).toEqual({
      chiave: 'mon', slot: '1',
      bounds: { x: 100, y: 50, width: 1280, height: 800 },
      stato: 'ingrandita'
    })
  })

  it('una fotografia nuova cancella quella di prima', () => {
    // È il punto: due finestre ieri e una oggi vuol dire **una**. Accumulando,
    // quella di ieri restava a dire il falso per sempre.
    const s = apriFinestreStore(cartella())
    s.fotografa([geo('sinistro', { slot: '1' }), geo('destro', { slot: '2' })])
    s.fotografa([geo('destro', { slot: '1' })])
    expect(s.nesima(0)?.chiave).toBe('destro')
    expect(s.nesima(1)).toBeUndefined()
    expect(s.leggi()).toEqual(['destro'])
  })

  it('la n-esima finestra torna dov era la n-esima', () => {
    // Per **posizione**, non per numero di slot: chiudendo la finestra di
    // sinistra, quella di destra resta sola e la volta dopo è la numero 1. Deve
    // tornare dove stava lei, non dove stava quella che portava il suo numero.
    const s = apriFinestreStore(cartella())
    s.fotografa([geo('destro', { slot: '2' })])
    expect(s.nesima(0)?.chiave).toBe('destro')
  })

  it('lo schermo intero si ricorda come tale', () => {
    const dove = cartella()
    apriFinestreStore(dove).fotografa([geo('m', { stato: 'schermo-intero' })])
    expect(apriFinestreStore(dove).geometria('m')?.stato).toBe('schermo-intero')
  })

  it('non ne tiene piu di quattro', () => {
    const s = apriFinestreStore(cartella())
    s.fotografa(['a', 'b', 'c', 'd', 'e'].map((c) => geo(c)))
    expect(s.leggi()).toHaveLength(4)
    expect(s.leggi()[0]).toBe('a')
  })

  it('una fotografia vuota non e una posizione', () => {
    const s = apriFinestreStore(cartella())
    s.fotografa([geo('c-era')])
    s.fotografa([])
    expect(s.nesima(0)).toBeUndefined()
    expect(s.leggi()).toEqual([])
  })

  it('geometria di un monitor sconosciuto e undefined', () => {
    const s = apriFinestreStore(cartella())
    s.fotografa([geo('c-e')])
    expect(s.geometria('non-c-e')).toBeUndefined()
  })
})

describe('quello che arriva da disco', () => {
  it('un file rovinato non impedisce al programma di aprirsi', () => {
    // Al massimo la finestra torna dove tornava prima: sul primo schermo libero.
    const dove = cartella()
    writeFileSync(join(dove, 'finestre.json'), '{ questo non e json')
    expect(apriFinestreStore(dove).leggi()).toEqual([])
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

  it('legge il formato precedente, senza slot', () => {
    // Le finestre di chi aggiorna adesso: la posizione c'è, lo slot no, e la
    // prima della lista è la prima finestra. Meglio dell'unica alternativa, che
    // è aprirle dove capita.
    const dove = cartella()
    writeFileSync(join(dove, 'finestre.json'), JSON.stringify({
      finestre: [{ chiave: 'destro', bounds: { x: 1, y: 2, width: 900, height: 700 }, stato: 'normale' }]
    }))
    const s = apriFinestreStore(dove)
    expect(s.nesima(0)?.chiave).toBe('destro')
    expect(s.nesima(0)?.slot).toBeUndefined()
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

describe('un file scritto prima della 0.12.48 non e una fotografia', () => {
  it('senza slot solo la prima voce vale per posizione: le altre ripiegano sul monitor', () => {
    // Quel file era un ricordo per monitor, il piu' recente davanti, con dentro
    // schermi senza finestre da settimane. Letto per posizione, la prima
    // finestra finiva sull'ultimo monitor chiuso — il guasto che lo slot e'
    // nato per chiudere.
    const dove = cartella()
    writeFileSync(join(dove, 'finestre.json'), JSON.stringify({
      finestre: [
        { chiave: 'sinistro', bounds: { x: 0, y: 0, width: 1600, height: 1000 }, stato: 'normale' },
        { chiave: 'destro', bounds: { x: 1920, y: 0, width: 1600, height: 1000 }, stato: 'ingrandita' }
      ]
    }))
    const s = apriFinestreStore(dove)
    // La prima voce e' l'ultima finestra chiusa: per chi ne ha una e' giusta.
    expect(s.nesima(0)?.chiave).toBe('sinistro')
    // Dalla seconda in poi la posizione non dice niente.
    expect(s.nesima(1)).toBeUndefined()
    expect(s.geometria('destro')?.stato).toBe('ingrandita')
    expect(s.leggi().sort()).toEqual(['destro', 'sinistro'])
  })
})
