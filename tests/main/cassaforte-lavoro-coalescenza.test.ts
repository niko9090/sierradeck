import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { creaLavoro } from '../../src/main/cassaforte/lavoro-in-corso'

/**
 * Nicholas (2026-09-13): «le operazioni di sync bloccano il programma». Ogni
 * file caricato (sei alla volta) mandava un evento a ogni finestra, e ogni
 * evento ridisegnava l'App: si raggruppano, al massimo uno ogni 200 ms, ma
 * un cambio di fase, l'inizio e la fine passano subito.
 */
describe('gli eventi del lavoro si raggruppano', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('nella stessa fase arriva l’ultimo stato, non uno per file', () => {
    const l = creaLavoro(() => 'T', 200)
    const visti: string[] = []
    l.onCambio((s) => visti.push(s.inCorso === undefined ? 'fine' : `${s.inCorso.fase}:${s.inCorso.fatto ?? '-'}`))
    const presa = l.avvia('fusione')
    expect(visti).toEqual(['preparo:-'])
    presa.aggiorna({ fase: 'carico', fatto: 1, totale: 9 })   // cambio di fase: subito
    presa.aggiorna({ fase: 'carico', fatto: 2, totale: 9 })
    presa.aggiorna({ fase: 'carico', fatto: 3, totale: 9 })
    presa.aggiorna({ fase: 'carico', fatto: 4, totale: 9 })
    expect(visti).toEqual(['preparo:-', 'carico:1'])
    vi.advanceTimersByTime(200)
    expect(visti).toEqual(['preparo:-', 'carico:1', 'carico:4'])
    // Lo stato letto a mano e' sempre quello vero, anche fra un invio e l'altro.
    presa.aggiorna({ fase: 'carico', fatto: 5, totale: 9 })
    expect(l.stato().inCorso?.fatto).toBe(5)
    presa.fine('ok', 'fatto')
    expect(visti).toEqual(['preparo:-', 'carico:1', 'carico:4', 'fine'])
    vi.advanceTimersByTime(500)
    expect(visti).toHaveLength(4)
  })

  it('con zero (le prove) ogni aggiornamento passa', () => {
    const l = creaLavoro(() => 'T', 0)
    let n = 0
    l.onCambio(() => { n += 1 })
    const presa = l.avvia('salvataggio')
    presa.aggiorna({ fase: 'carico', fatto: 1, totale: 2 })
    presa.aggiorna({ fase: 'carico', fatto: 2, totale: 2 })
    expect(n).toBe(3)
  })
})
