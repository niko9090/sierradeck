import { describe, it, expect } from 'vitest'
import { NOVITA, novitaDi, novitaDaMostrare } from '@shared/novita'
import { readFileSync } from 'node:fs'

describe('NOVITA', () => {
  it('la versione del pacchetto ha le sue righe scritte', () => {
    // Il testo si scrive quando si fa la cosa, non dopo: se questa cade vuol
    // dire che si e' alzata la versione senza dire a chi usa il programma cosa
    // e' cambiato, e la finestrella delle novita' non comparirebbe mai.
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
    // «Poche righe» e' il requisito, non un dettaglio: una finestra che si apre
    // con venti punti elenco viene chiusa senza leggerla, e allora tanto vale
    // non aprirla.
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

describe('novitaDaMostrare', () => {
  it('mostra le novita di una versione mai vista', () => {
    const versione = NOVITA[0]!.versione
    expect(novitaDaMostrare(versione, '0.0.1')?.versione).toBe(versione)
  })

  it('non le mostra una seconda volta', () => {
    // Una finestra che ricompare a ogni avvio diventa un ostacolo fra l'utente
    // e la prima chat, ed e' il motivo per cui si smette di leggere anche
    // quella che conta.
    const versione = NOVITA[0]!.versione
    expect(novitaDaMostrare(versione, versione)).toBeUndefined()
  })

  it('una versione senza righe scritte non apre niente', () => {
    // Meglio il silenzio di una finestra vuota che si apre per dire che non ha
    // niente da dire.
    expect(novitaDaMostrare('9.9.9', undefined)).toBeUndefined()
  })

  it('alla primissima apertura, senza nessuna memoria, le mostra', () => {
    // Chi installa SierraDeck per la prima volta non ha una versione
    // precedente: le righe gli dicono cosa fa il programma, ed e' meglio di
    // niente.
    const versione = NOVITA[0]!.versione
    expect(novitaDaMostrare(versione, undefined)?.versione).toBe(versione)
  })
})
