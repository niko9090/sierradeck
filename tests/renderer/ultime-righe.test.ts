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
    expect(r.codaDi('p1')).toEqual([])
  })

  it('tiene le ultime righe, non solo l ultima', () => {
    // Una riga dice che si muove, quattordici dicono **cosa** sta facendo: è
    // la differenza fra guardare da fuori e poter decidere se intervenire.
    const r = creaUltimeRighe()
    r.aggiorna('p1', 'npm test\n\n3 falliti\nil quarto passa\n')
    // Le righe vuote non contano: da un telefono occupano spazio e non dicono
    // niente.
    expect(r.codaDi('p1')).toEqual(['npm test', '3 falliti', 'il quarto passa'])
  })

  it('non tiene tutto quello che una chat ha mai scritto', () => {
    // Conservare il flusso vorrebbe dire tenere in memoria ore di terminale
    // per ogni chat aperta.
    const r = creaUltimeRighe()
    for (let i = 0; i < 100; i += 1) r.aggiorna('p1', `riga ${i}\n`)
    const coda = r.codaDi('p1')
    expect(coda.length).toBeLessThanOrEqual(14)
    expect(coda[coda.length - 1]).toBe('riga 99')
  })
})
