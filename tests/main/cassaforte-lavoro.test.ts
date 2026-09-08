import { describe, it, expect } from 'vitest'
import { creaLavoro } from '../../src/main/cassaforte/lavoro-in-corso'

/**
 * Il difetto: «Fondi adesso» partiva e non si vedeva niente, e non c'era modo
 * di fermarlo. Il lavoro con il Drive vive qui, fuori dalle finestre: si
 * vede, si annulla, e finito lascia l'esito.
 */

describe('il lavoro con il Drive', () => {
  it('uno alla volta: il secondo non parte', () => {
    const l = creaLavoro(() => 'T')
    l.avvia('fusione')
    expect(l.occupato()).toBe(true)
    expect(() => l.avvia('salvataggio')).toThrow(/gia' un lavoro in corso/)
  })

  it('racconta a che punto e, e chi guarda lo sa', () => {
    const l = creaLavoro(() => 'T')
    const visti: string[] = []
    l.onCambio((s) => visti.push(s.inCorso === undefined ? 'fine' : `${s.inCorso.fase}:${s.inCorso.fatto ?? '-'}/${s.inCorso.totale ?? '-'}`))
    const presa = l.avvia('fusione')
    presa.aggiorna({ fase: 'carico', fatto: 1, totale: 3, unita: 'file', dettaglio: 'chat/a.jsonl' })
    presa.aggiorna({ fase: 'carico', fatto: 3, totale: 3, unita: 'file' })
    presa.fine('ok', '3 file')
    expect(visti).toEqual(['preparo:-/-', 'carico:1/3', 'carico:3/3', 'fine'])
    expect(l.stato().ultimo).toEqual({ tipo: 'fusione', esito: 'ok', messaggio: '3 file', quando: 'T' })
  })

  it('IL PUNTO: «Annulla» alza il segnale, e il lavoro finisce come annullato', () => {
    const l = creaLavoro(() => 'T')
    const presa = l.avvia('ripristino')
    expect(presa.segnale.aborted).toBe(false)
    expect(l.annulla()).toBe(true)
    expect(presa.segnale.aborted).toBe(true)
    expect(l.stato().inCorso?.annullamento).toBe(true)
    presa.fine('annullato', 'fermato a 2 su 10')
    expect(l.stato().inCorso).toBeUndefined()
    expect(l.stato().ultimo?.esito).toBe('annullato')
    expect(l.occupato()).toBe(false)
  })

  it('senza niente in corso, annullare non fa niente', () => {
    const l = creaLavoro()
    expect(l.annulla()).toBe(false)
  })

  it('un lavoro finito non parla piu: la presa vecchia non sporca quella nuova', () => {
    const l = creaLavoro(() => 'T')
    const vecchia = l.avvia('salvataggio')
    vecchia.fine('ok', '')
    const nuova = l.avvia('fusione')
    vecchia.aggiorna({ fase: 'carico', fatto: 9, totale: 9 })
    vecchia.fine('errore', 'vecchio')
    expect(l.stato().inCorso?.tipo).toBe('fusione')
    expect(l.stato().inCorso?.fatto).toBeUndefined()
    nuova.fine('ok', 'nuovo')
    expect(l.stato().ultimo?.messaggio).toBe('nuovo')
  })
})
