import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { intestazioniAccesso, indirizzoAlternativo, feedAlternativo } from '../../src/main/aggiornamenti'

function cartella(contenuto?: unknown): string {
  const d = mkdtempSync(join(tmpdir(), 'aggiorn-'))
  if (contenuto !== undefined) {
    writeFileSync(join(d, 'aggiornamenti.json'), JSON.stringify(contenuto), 'utf8')
  }
  return d
}

describe('intestazioniAccesso', () => {
  it('senza file non manda niente: il server e pubblico', () => {
    expect(intestazioniAccesso(cartella())).toBeUndefined()
  })

  it('con utente e parola compone l accesso di base', () => {
    const h = intestazioniAccesso(cartella({ utente: 'tecnico', password: 'segreta' }))
    expect(h?.Authorization).toBe(`Basic ${Buffer.from('tecnico:segreta').toString('base64')}`)
  })

  it('con un file rotto non fa saltare l aggiornamento', () => {
    const d = mkdtempSync(join(tmpdir(), 'aggiorn-'))
    writeFileSync(join(d, 'aggiornamenti.json'), 'non sono JSON', 'utf8')
    expect(intestazioniAccesso(d)).toBeUndefined()
  })

  it('senza password non inventa un accesso a meta', () => {
    expect(intestazioniAccesso(cartella({ utente: 'tecnico' }))).toBeUndefined()
  })
})

describe('indirizzoAlternativo', () => {
  it('senza file resta quello del pacchetto', () => {
    expect(indirizzoAlternativo(cartella())).toBeUndefined()
  })

  it('permette di spostare il server a programma installato', () => {
    // L'indirizzo scritto nel pacchetto e' congelato al momento della
    // costruzione: senza questa riga, cambiare server vorrebbe dire
    // ricostruire e reinstallare — cioe' quello che gli aggiornamenti evitano.
    expect(indirizzoAlternativo(cartella({ url: 'https://esempio.it/sd/' })))
      .toBe('https://esempio.it/sd/')
  })

  it('un indirizzo vuoto non vale come indirizzo', () => {
    expect(indirizzoAlternativo(cartella({ url: '   ' }))).toBeUndefined()
  })
})

describe('da dove si scarica', () => {
  it('senza configurazione locale resta quella del pacchetto', () => {
    expect(feedAlternativo(cartella())).toBeUndefined()
  })

  it('con owner e repo cerca fra i rilasci di GitHub', () => {
    // Cambiare il nome del repository non deve costringere a ricostruire e
    // reinstallare il programma: e' proprio quello che gli aggiornamenti evitano.
    expect(feedAlternativo(cartella({ owner: 'niko9090', repo: 'sierradeck' })))
      .toEqual({ provider: 'github', owner: 'niko9090', repo: 'sierradeck' })
  })

  it('con un indirizzo cerca li, senza passare da GitHub', () => {
    expect(feedAlternativo(cartella({ url: 'https://esempio.it/sd/' })))
      .toEqual({ provider: 'generic', url: 'https://esempio.it/sd/' })
  })

  it('fra i due vince GitHub, che e la strada normale', () => {
    const f = feedAlternativo(cartella({ owner: 'a', repo: 'b', url: 'https://esempio.it/' }))
    expect(f?.provider).toBe('github')
  })
})
