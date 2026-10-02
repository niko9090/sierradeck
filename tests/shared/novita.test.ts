import { describe, it, expect } from 'vitest'
import { NOVITA, novitaDi, novitaConLeUltime, confrontaVersioni } from '@shared/novita'
import { analizzaMarkdown, noteDaNovita } from '@shared/note-aggiornamento'
import { readFileSync } from 'node:fs'

describe('NOVITA', () => {
  it('la versione del pacchetto ha le sue righe scritte', () => {
    // Il testo si scrive quando si fa la cosa, non dopo: se questa cade vuol
    // dire che si e' alzata la versione senza dire a chi usa il programma cosa
    // e' cambiato. Dalla 0.39.0 conta ancora di piu': queste righe diventano
    // il corpo della release, ed e' quello che la finestra di «Installa»
    // mostra prima di installare.
    const pkg: unknown = JSON.parse(readFileSync('package.json', 'utf8'))
    const versione = (pkg as { version: string }).version
    expect(novitaDi(versione)).toBeDefined()
  })

  it('nessuna versione compare due volte', () => {
    // Due voci per la stessa versione vorrebbero dire che una delle due non si
    // vedrebbe mai, e nessuno se ne accorgerebbe.
    const viste = new Set(NOVITA.map((n) => n.versione))
    expect(viste.size).toBe(NOVITA.length)
  })

  it('ogni voce dice qualcosa, e in poche righe', () => {
    // «Poche righe» e' il requisito, non un dettaglio: una finestra con venti
    // punti elenco viene chiusa senza leggerla, e allora tanto vale non aprirla.
    for (const n of NOVITA) {
      expect(n.righe.length).toBeGreaterThan(0)
      expect(n.righe.length).toBeLessThanOrEqual(8)
      for (const riga of n.righe) expect(riga.trim()).not.toBe('')
    }
  })

  it('parla all utente e non ai commit', () => {
    // Il gergo interno qui non serve a nessuno: chi legge vuole sapere cosa puo'
    // fare oggi che ieri non poteva.
    const gergo = /rifattorizz|refactor|commit|typecheck|vitest|useEffect|IPC\b/i
    for (const n of NOVITA) {
      for (const riga of n.righe) expect(riga).not.toMatch(gergo)
    }
  })
})

describe('le novita nella finestra delle note', () => {
  it('ogni voce diventa una voce d elenco, con l attacco in grassetto e senza asterischi', () => {
    // Le novita' non si aprono piu' da sole all'avvio (0.39.0): si leggono dal
    // menu, nella stessa finestra di «Installa». La voce della versione deve
    // arrivarci intera.
    const pkg: unknown = JSON.parse(readFileSync('package.json', 'utf8'))
    const versione = (pkg as { version: string }).version
    const [resa] = noteDaNovita([novitaDi(versione)!])
    const elenco = resa?.blocchi[0]
    expect(elenco?.tipo).toBe('elenco')
    if (elenco?.tipo !== 'elenco') return
    expect(elenco.voci).toHaveLength(novitaDi(versione)!.righe.length)
    for (const voce of elenco.voci) {
      expect(voce[0]?.grassetto).toBe(true)
      expect(voce.map((p) => p.testo).join('')).not.toContain('**')
    }
  })

  it('come corpo della release, ogni voce si rilegge uguale', () => {
    // Le note della release si scrivono da queste righe («- » davanti, una
    // riga vuota fra le voci): rilette dalla finestra, restano un elenco solo.
    const n = NOVITA[0]!
    const corpo = n.righe.map((r) => `- ${r}`).join('\n\n')
    const b = analizzaMarkdown(corpo)
    expect(b).toHaveLength(1)
    expect(b[0]?.tipo === 'elenco' ? b[0].voci.length : 0).toBe(n.righe.length)
  })

  it('confronta le versioni per numero, non per testo', () => {
    expect(confrontaVersioni('0.13.0', '0.12.64')).toBeGreaterThan(0)
    expect(confrontaVersioni('0.9.9', '0.10.0')).toBeLessThan(0)
    expect(confrontaVersioni('1.0.0', '1.0.0')).toBe(0)
  })

  it('riaperte dal menu, portano anche le ultime versioni prima', () => {
    const n = novitaConLeUltime(NOVITA[0]!.versione, 2)
    expect(n.altre?.map((a) => a.versione)).toEqual([NOVITA[1]!.versione, NOVITA[2]!.versione])
  })
})
