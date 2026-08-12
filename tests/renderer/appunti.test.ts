import { describe, it, expect } from 'vitest'
import { decidiAzioneAppunti, type EventoTasto } from '../../src/renderer/appunti'

function tasto(p: Partial<EventoTasto>): EventoTasto {
  return {
    type: 'keydown', key: 'a',
    ctrlKey: false, shiftKey: false, altKey: false, metaKey: false,
    ...p
  }
}

describe('decidiAzioneAppunti', () => {
  it('Ctrl+C copia quando c e una selezione', () => {
    expect(decidiAzioneAppunti(tasto({ key: 'c', ctrlKey: true }), true)).toBe('copia')
  })

  it('Ctrl+C senza selezione resta l interruzione del programma', () => {
    // Il caso che rende la scorciatoia accettabile dentro un terminale: senza
    // selezione, Ctrl+C deve continuare ad arrivare a claude.exe come SIGINT.
    expect(decidiAzioneAppunti(tasto({ key: 'c', ctrlKey: true }), false)).toBe('passa')
  })

  it('Ctrl+Maiusc+C copia anche quando la selezione manca', () => {
    // Nessuna ambiguita' con SIGINT: qui il gesto e' esplicito, e restituire
    // 'copia' su selezione vuota e' un'operazione a vuoto, non un danno.
    expect(decidiAzioneAppunti(tasto({ key: 'C', ctrlKey: true, shiftKey: true }), false))
      .toBe('copia')
  })

  it('Ctrl+V e Ctrl+Maiusc+V incollano', () => {
    expect(decidiAzioneAppunti(tasto({ key: 'v', ctrlKey: true }), false)).toBe('incolla')
    expect(decidiAzioneAppunti(tasto({ key: 'V', ctrlKey: true, shiftKey: true }), false))
      .toBe('incolla')
  })

  it('riconosce le scorciatoie storiche con Ins', () => {
    expect(decidiAzioneAppunti(tasto({ key: 'Insert', ctrlKey: true }), true)).toBe('copia')
    expect(decidiAzioneAppunti(tasto({ key: 'Insert', ctrlKey: true }), false)).toBe('passa')
    expect(decidiAzioneAppunti(tasto({ key: 'Insert', shiftKey: true }), false)).toBe('incolla')
  })

  it('non tocca i tasti senza Ctrl', () => {
    expect(decidiAzioneAppunti(tasto({ key: 'c' }), true)).toBe('passa')
    expect(decidiAzioneAppunti(tasto({ key: 'v' }), true)).toBe('passa')
  })

  it('lascia passare le combinazioni con Alt', () => {
    // Alt+Ctrl+V e' una combinazione di qualcun altro: nel dubbio, al terminale.
    expect(decidiAzioneAppunti(tasto({ key: 'v', ctrlKey: true, altKey: true }), false))
      .toBe('passa')
  })

  it('agisce solo sulla pressione, non sul rilascio', () => {
    // xterm consulta lo stesso gestore per keydown, keypress e keyup: agire su
    // piu' di uno significherebbe incollare due volte lo stesso testo.
    expect(decidiAzioneAppunti(tasto({ type: 'keyup', key: 'v', ctrlKey: true }), false))
      .toBe('passa')
    expect(decidiAzioneAppunti(tasto({ type: 'keypress', key: 'v', ctrlKey: true }), false))
      .toBe('passa')
  })
})
