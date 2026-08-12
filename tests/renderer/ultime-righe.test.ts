import { describe, it, expect } from 'vitest'
import { creaUltimeRighe, senzaColori, ultimaRigaUtile } from '../../src/renderer/ultime-righe'

const ESC = String.fromCharCode(27)

describe('senzaColori', () => {
  it('toglie i codici di colore', () => {
    // Mostrati come sono, riempirebbero lo schermo del telefono di parentesi
    // quadre e numeri, e la riga che conta sparirebbe nel rumore.
    expect(senzaColori(`${ESC}[31mrosso${ESC}[0m`)).toBe('rosso')
  })

  it('lascia stare il testo normale', () => {
    expect(senzaColori('una riga qualunque')).toBe('una riga qualunque')
  })
})

describe('ultimaRigaUtile', () => {
  it('prende l ultima riga con dentro qualcosa', () => {
    expect(ultimaRigaUtile('prima\nseconda\n\n\n')).toBe('seconda')
  })

  it('salta le cornici, che non dicono niente', () => {
    // Sono decorazione: da lontano contano meno di una riga di testo vero.
    expect(ultimaRigaUtile('lavoro in corso\n───────────────\n')).toBe('lavoro in corso')
  })

  it('senza niente da leggere non inventa una riga', () => {
    expect(ultimaRigaUtile('\n\n   \n')).toBe('')
  })

  it('una riga lunghissima si taglia', () => {
    expect(ultimaRigaUtile('x'.repeat(500)).length).toBeLessThan(200)
  })
})

describe('creaUltimeRighe', () => {
  it('ricompone una riga arrivata a pezzi', () => {
    // Un terminale manda i dati a pezzetti: senza rimetterli insieme si
    // mostrerebbero mezze parole.
    const r = creaUltimeRighe()
    r.aggiorna('p1', 'sto lavo')
    r.aggiorna('p1', 'rando al file\n')
    expect(r.di('p1')).toBe('sto lavorando al file')
  })

  it('tiene le chat separate', () => {
    const r = creaUltimeRighe()
    r.aggiorna('p1', 'una cosa\n')
    r.aggiorna('p2', 'un altra\n')
    expect(r.di('p1')).toBe('una cosa')
    expect(r.di('p2')).toBe('un altra')
  })

  it('una chat mai vista non ha righe', () => {
    expect(creaUltimeRighe().di('mai-vista')).toBe('')
  })

  it('dimenticare una chat la toglie di mezzo', () => {
    const r = creaUltimeRighe()
    r.aggiorna('p1', 'qualcosa\n')
    r.dimentica('p1')
    expect(r.di('p1')).toBe('')
  })
})
