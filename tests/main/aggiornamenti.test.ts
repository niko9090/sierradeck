import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaGiroMuto, intestazioniAccesso, indirizzoAlternativo, feedAlternativo } from '../../src/main/aggiornamenti'

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

describe('0.73.1: i controlli di routina non riempiono il registro', () => {
  it('«cerco» → «aggiornato» ogni dieci minuti si scrive una volta all’ora; una versione trovata sempre', () => {
    const g = creaGiroMuto()
    let ora = Date.parse('2026-10-15T07:00:00Z')
    const giro = (fine = 'aggiornato'): boolean[] => {
      const r = [g.cambia('aggiornato', 'cerco', ora), g.rigaMuta('Checking for update'), g.rigaMuta('Update for version 0.73.0 is not available'), g.cambia('cerco', fine, ora)]
      ora += 10 * 60_000
      return r
    }
    // Il primo giro si scrive.
    expect(giro()).toEqual([false, false, false, false])
    // I cinque dopo, nella stessa ora, no.
    for (let i = 0; i < 5; i++) expect(giro()).toEqual([true, true, true, true])
    // Un'ora dopo il primo, di nuovo.
    expect(giro()).toEqual([false, false, false, false])
    // Una versione nuova si scrive sempre, anche dentro l'ora.
    expect(g.cambia('aggiornato', 'cerco', ora)).toBe(true)
    expect(g.cambia('cerco', 'disponibile', ora)).toBe(false)
    expect(g.rigaMuta('Found version 0.74.0')).toBe(false)
  })
  it('un errore dopo un giro muto si scrive', () => {
    const g = creaGiroMuto()
    const ora = Date.parse('2026-10-15T07:00:00Z')
    g.cambia('aggiornato', 'cerco', ora); g.cambia('cerco', 'aggiornato', ora)
    expect(g.cambia('aggiornato', 'cerco', ora + 1)).toBe(true)
    expect(g.cambia('cerco', 'errore', ora + 2)).toBe(false)
  })
})
