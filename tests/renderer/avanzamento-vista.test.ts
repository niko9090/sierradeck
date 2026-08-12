import { describe, it, expect } from 'vitest'
import { descriviAvanzamento } from '../../src/renderer/avanzamento-vista'
import type { Avanzamento } from '@shared/types'

function a(over: Partial<Avanzamento> = {}): Avanzamento {
  return { fase: 'lettura', done: 50, total: 200, riusate: 0, ...over }
}

describe('descriviAvanzamento', () => {
  it('dice la percentuale sul lavoro fatto', () => {
    expect(descriviAvanzamento(a()).percento).toBe(25)
  })

  it('durante la ricerca dei progetti non inventa una percentuale', () => {
    // Non si sa ancora quanti file ci siano: una barra che parte da un numero
    // qualsiasi e poi salta indietro mente su cio' che sta succedendo.
    const d = descriviAvanzamento(a({ fase: 'scansione', done: 0, total: 0 }))
    expect(d.percento).toBeUndefined()
    expect(d.titolo).toBe('Cerco le conversazioni')
  })

  it('non supera il cento per cento ne scende sotto zero', () => {
    expect(descriviAvanzamento(a({ done: 300, total: 200 })).percento).toBe(100)
    expect(descriviAvanzamento(a({ done: -5, total: 200 })).percento).toBe(0)
  })

  it('non divide per zero quando non c e niente da leggere', () => {
    expect(descriviAvanzamento(a({ fase: 'lettura', done: 0, total: 0 })).percento).toBeUndefined()
  })

  it('dice quante ne ha lette e quante ne mancano', () => {
    expect(descriviAvanzamento(a({ done: 50, total: 200 })).conteggio).toBe('50 di 200')
  })

  it('distingue la prima lettura dall aggiornamento', () => {
    // La prima volta ci sono minuti da aspettare, le altre volte un istante:
    // la stessa scritta per due attese cosi' diverse non aiuta nessuno.
    expect(descriviAvanzamento(a({ done: 10, riusate: 0 })).titolo).toBe('Leggo le conversazioni')
    expect(descriviAvanzamento(a({ done: 10, riusate: 9 })).titolo).toBe('Aggiorno l’elenco')
  })

  it('dice quante ne ha gia in archivio, quando ce ne sono', () => {
    expect(descriviAvanzamento(a({ riusate: 40 })).dettaglio).toContain('40 già note')
    expect(descriviAvanzamento(a({ riusate: 0 })).dettaglio).toBe(undefined)
  })

  it('mostra il nome del progetto che sta leggendo, non il percorso intero', () => {
    // Il percorso intero non entra in una riga e non aggiunge niente: quello
    // che serve e' vedere che il lavoro avanza.
    const d = descriviAvanzamento(a({ progetto: 'C:\\Users\\utente\\Documents\\Progetto' }))
    expect(d.dove).toBe('Progetto')
  })

  it('senza progetto non lascia un nome vuoto', () => {
    expect(descriviAvanzamento(a({ progetto: undefined })).dove).toBeUndefined()
  })

  it('la pulizia e la fine hanno parole loro', () => {
    expect(descriviAvanzamento(a({ fase: 'pulizia' })).titolo).toBe('Tolgo le conversazioni sparite')
    expect(descriviAvanzamento(a({ fase: 'fine' })).titolo).toBe('Pronto')
    expect(descriviAvanzamento(a({ fase: 'fine', done: 7, total: 7 })).percento).toBe(100)
  })
})
