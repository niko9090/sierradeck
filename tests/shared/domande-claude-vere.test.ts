import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  scelteDiTerminale, tastiPerRisposta, rispostaDaTesto, firmaScelte, GIU, SU, INVIO, type Scelta
} from '../../src/shared/scelte-terminale'

/**
 * Le domande di Claude Code come le disegna davvero (2.1.293/2.1.294): schermi
 * catturati da un claude.exe in un pty, letti con xterm come fa il programma
 * (`righeDaSchermo`). Percorsi resi neutri. Nicholas, 08/10: «Non riesco a
 * rispondere alle domande».
 */
const DIR = join(__dirname, '../fixtures/claude-2.1.294-domande')
const schermo = (n: string): string => readFileSync(join(DIR, `${n}.txt`), 'utf8')
const scelta = (n: string): Scelta => {
  const s = scelteDiTerminale(schermo(n))
  if (s === undefined) throw new Error(`nessuna scelta in ${n}`)
  return s
}
const testi = (s: Scelta): string[] => s.opzioni.map((o) => o.testo)

describe('il riconoscitore sugli schermi veri', () => {
  it('IL DIFETTO: una domanda con la spiegazione sotto ogni opzione è una scelta (prima no)', () => {
    const s = scelta('singola')
    expect(testi(s)).toEqual(['Rosso', 'Verde', 'Blu', 'Type something.', 'Chat about this'])
    expect(s.opzioni.map((o) => o.descrizione)).toEqual([
      "Il colore della passione e dell'energia", 'Il colore della natura e della calma', 'Il colore del cielo e della serenità', undefined, undefined
    ])
    expect(s.corrente).toBe(0)
    expect(s.multipla).toBeUndefined()
    expect(s.opzioni.filter((o) => o.libera === true).map((o) => o.testo)).toEqual(['Type something.'])
  })
  it('«Type something.» con il testo già scritto resta la risposta libera', () => {
    const sopra = scelta('libera-sopra')
    expect(sopra.corrente).toBe(2)
    const scritta = scelta('libera-scritta')
    expect(scritta.opzioni[2]).toMatchObject({ testo: 'Pappagallo', libera: true, scelta: true })
  })
  it('scelta multipla: caselle, «Submit» è una fermata del cursore fra l’ultima opzione e «Chat about this»', () => {
    const s = scelta('multi')
    expect(s.multipla).toBe(true)
    expect(s.opzioni.map((o) => [o.numero, o.testo, o.spuntata ?? null, o.invio ?? false])).toEqual([
      [1, 'Lunedì', false, false], [2, 'Martedì', false, false], [3, 'Mercoledì', false, false],
      [4, 'Type something', false, false], [0, 'Submit', null, true], [5, 'Chat about this', null, false]
    ])
    expect(scelta('multi-spuntata').opzioni[0]?.spuntata).toBe(true)
    // Il cursore su «Submit» (riga senza numero).
    expect(scelta('multi-submit').corrente).toBe(4)
    // Una spunta cambia la firma: non è la «stessa domanda appena mandata».
    expect(firmaScelte(scelta('multi'))).not.toBe(firmaScelte(scelta('multi-spuntata')))
    expect(firmaScelte(scelta('singola'))).toBe(testi(scelta('singola')).join('\n'))
  })
  it('due domande insieme: una per volta, poi il riepilogo', () => {
    expect(testi(scelta('due-1')).slice(0, 2)).toEqual(['Rosso', 'Blu'])
    expect(testi(scelta('due-2')).slice(0, 2)).toEqual(['Uno', 'Due'])
    expect(testi(scelta('due-riepilogo'))).toEqual(['Submit answers', 'Cancel'])
    expect(testi(scelta('multi-dopo'))).toEqual(['Submit answers', 'Cancel'])
  })
  it('il permesso di un comando', () => {
    expect(testi(scelta('permesso'))).toEqual(['Yes', 'No'])
  })
  it('il JSON per l’app è quello che produce il riconoscitore (lo legge SceltaVistaTest.kt)', () => {
    const j = JSON.parse(readFileSync(join(DIR, 'scelte.json'), 'utf8')) as Record<string, unknown>
    const nomi = readdirSync(DIR).filter((f) => f.endsWith('.txt')).map((f) => f.replace(/\.txt$/, '')).sort()
    expect(Object.keys(j).sort()).toEqual(nomi)
    for (const n of nomi) expect(j[n], n).toEqual(JSON.parse(JSON.stringify(scelteDiTerminale(schermo(n)) ?? null)))
  })
  it('niente dati privati negli schermi', () => {
    for (const f of readdirSync(DIR)) {
      const t = readFileSync(join(DIR, f), 'utf8')
      for (const v of ['Users\\','DESKTOP-', 'LAPTOP-']) expect(t, f).not.toContain(v)
    }
  })
})

describe('i tasti di una risposta', () => {
  it('un’opzione: frecce e Invio, separati', () => {
    expect(tastiPerRisposta(scelta('singola'), { tipo: 'opzione', testo: 'Blu' })).toEqual({ pezzi: [GIU + GIU, INVIO] })
    expect(tastiPerRisposta(scelta('singola'), { tipo: 'opzione', testo: 'Rosso' })).toEqual({ pezzi: [INVIO] })
    expect(tastiPerRisposta(scelta('libera-sopra'), { tipo: 'opzione', testo: 'Gatto' })).toEqual({ pezzi: [SU + SU, INVIO] })
  })
  it('la risposta libera: frecce fino a «Type something.», il testo, Invio; in una multipla senza Invio', () => {
    expect(tastiPerRisposta(scelta('libera'), { tipo: 'libera', testo: 'Pappagallo' })).toEqual({ pezzi: [GIU + GIU, 'Pappagallo', INVIO] })
    expect(tastiPerRisposta(scelta('libera'), { tipo: 'libera', testo: 'due\nrighe' })).toEqual({ pezzi: [GIU + GIU, 'due righe', INVIO] })
    expect(tastiPerRisposta(scelta('multi'), { tipo: 'libera', testo: 'Giovedì' })).toEqual({ pezzi: [GIU + GIU + GIU, 'Giovedì'] })
  })
  it('«Type something.» toccata senza testo, o la risposta libera a un permesso: niente tasti, il perché', () => {
    expect(tastiPerRisposta(scelta('singola'), { tipo: 'opzione', testo: 'Type something.' })).toMatchObject({ errore: expect.stringContaining('scrivi la risposta') })
    expect(tastiPerRisposta(scelta('permesso'), { tipo: 'libera', testo: 'boh' })).toMatchObject({ errore: expect.stringContaining('1. Yes, 2. No') })
    expect(tastiPerRisposta(scelta('singola'), { tipo: 'opzione', testo: 'Viola' })).toMatchObject({ errore: expect.stringContaining('cambiata') })
  })
  it('mai il numero dell’opzione come tasto: in Claude Code risponde subito e l’Invio andrebbe nella domanda dopo', () => {
    for (const n of readdirSync(DIR).filter((f) => f.endsWith('.txt')).map((f) => f.replace(/\.txt$/, ''))) {
      const s = scelta(n)
      for (const o of s.opzioni) {
        if (o.libera === true) continue
        const k = tastiPerRisposta(s, { tipo: 'opzione', testo: o.testo })
        expect('pezzi' in k && k.pezzi.every((p) => !/\d/.test(p.replace(/\u001b\[[AB]/g, ''))), `${n}: ${o.testo}`).toBe(true)
      }
    }
  })
})

describe('un testo scritto a una chat ferma su una domanda', () => {
  it('il testo o il numero di un’opzione sceglie quella', () => {
    expect(rispostaDaTesto(scelta('singola'), 'verde')).toEqual({ tipo: 'opzione', testo: 'Verde' })
    expect(rispostaDaTesto(scelta('singola'), '  Blu. ')).toEqual({ tipo: 'opzione', testo: 'Blu' })
    expect(rispostaDaTesto(scelta('singola'), '1')).toEqual({ tipo: 'opzione', testo: 'Rosso' })
  })
  it('il resto è la risposta libera, se la domanda la accetta', () => {
    expect(rispostaDaTesto(scelta('singola'), 'Arancione')).toEqual({ tipo: 'libera', testo: 'Arancione' })
  })
  it('un permesso: sì/no in italiano; altro → le opzioni', () => {
    expect(rispostaDaTesto(scelta('permesso'), 'Sì')).toEqual({ tipo: 'opzione', testo: 'Yes' })
    expect(rispostaDaTesto(scelta('permesso'), 'ok')).toEqual({ tipo: 'opzione', testo: 'Yes' })
    expect(rispostaDaTesto(scelta('permesso'), 'NO')).toEqual({ tipo: 'opzione', testo: 'No' })
    expect(rispostaDaTesto(scelta('permesso'), 'aspetta')).toMatchObject({ errore: expect.stringContaining('1. Yes, 2. No') })
  })
  it('scelta multipla: «invia» è Submit', () => {
    expect(rispostaDaTesto(scelta('multi-spuntata'), 'invia')).toEqual({ tipo: 'opzione', testo: 'Submit' })
  })
})
