import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { scriviAtomico, scriviJsonAtomico } from '@shared/scrittura-atomica'

function dirTemporanea(): string {
  return mkdtempSync(join(tmpdir(), 'gestore-atomica-'))
}

describe('scriviAtomico', () => {
  it('scrive il contenuto e lo rilegge', () => {
    const dir = dirTemporanea()
    const percorso = join(dir, 'roba.json')
    expect(scriviAtomico(percorso, '{"a":1}', 'prova')).toBe(true)
    expect(readFileSync(percorso, 'utf8')).toBe('{"a":1}')
  })

  it('non lascia il file temporaneo dopo una scrittura riuscita', () => {
    // Un residuo per salvataggio, e i salvataggi sono ora a ogni modifica: la
    // cartella dei dati si riempirebbe di scarti che nessuno raccoglie.
    const dir = dirTemporanea()
    scriviAtomico(join(dir, 'roba.json'), 'x', 'prova')
    expect(readdirSync(dir)).toEqual(['roba.json'])
  })

  it('sostituisce il contenuto precedente', () => {
    const dir = dirTemporanea()
    const percorso = join(dir, 'roba.json')
    scriviAtomico(percorso, 'prima', 'prova')
    scriviAtomico(percorso, 'dopo', 'prova')
    expect(readFileSync(percorso, 'utf8')).toBe('dopo')
  })

  it('non si scontra con un temporaneo dal nome fisso lasciato da altri', () => {
    // Il nome del temporaneo non e' fisso apposta: due scrittori sovrapposti —
    // due finestre, o il servizio autopilota accanto al programma — si
    // contenderebbero lo stesso file, e uno dei due salvataggi sparirebbe con
    // un solo console.error a testimoniarlo. Qui l'ostacolo e' messo in modo
    // che solo un nome fisso possa inciamparci.
    const dir = dirTemporanea()
    const percorso = join(dir, 'roba.json')
    mkdirSync(`${percorso}.tmp`)

    expect(scriviAtomico(percorso, 'contenuto', 'prova')).toBe(true)
    expect(readFileSync(percorso, 'utf8')).toBe('contenuto')
  })

  it('dice di non essere riuscita invece di sollevare, e non lascia residui', () => {
    // Chi salva non ha un posto dove far risalire un'eccezione: e' dentro un
    // canale a senso unico o dentro la chiusura di una finestra. Sollevare qui
    // porterebbe giu' l'operazione che stava intorno.
    const dir = dirTemporanea()
    const percorso = join(dir, 'manca-la-cartella', 'roba.json')
    expect(scriviAtomico(percorso, 'x', 'prova')).toBe(false)
    expect(readdirSync(dir)).toEqual([])
  })

  it('un fallimento della rinomina non porta via cio che c era prima', () => {
    // E' tutta la ragione del temporaneo: il file definitivo e' sempre uno dei
    // due contenuti interi, mai un troncone e mai il vuoto.
    const dir = dirTemporanea()
    const percorso = join(dir, 'occupato')
    mkdirSync(percorso)

    expect(scriviAtomico(percorso, 'x', 'prova')).toBe(false)
    expect(statSync(percorso).isDirectory()).toBe(true)
    // Il temporaneo va tolto lo stesso: nessuno tornera' a raccoglierlo.
    expect(readdirSync(dir).filter((n) => n !== 'occupato')).toEqual([])
  })

  it('accetta i permessi del file, per cio che contiene una chiave', () => {
    // Il file del provider contiene il token dell'API: nasce con i permessi
    // stretti o non li ha mai, perche' scriverli dopo lascerebbe una finestra
    // in cui il file e' leggibile da chiunque.
    const dir = dirTemporanea()
    const percorso = join(dir, 'segreto.json')
    expect(scriviAtomico(percorso, 'x', 'prova', { mode: 0o600 })).toBe(true)
    expect(existsSync(percorso)).toBe(true)
  })
})

describe('scriviJsonAtomico', () => {
  it('scrive il JSON indentato del valore ricevuto', () => {
    const dir = dirTemporanea()
    const percorso = join(dir, 'roba.json')
    expect(scriviJsonAtomico(percorso, { a: 1 }, 'prova')).toBe(true)
    expect(JSON.parse(readFileSync(percorso, 'utf8'))).toEqual({ a: 1 })
  })

  it('un valore non serializzabile non solleva e non tocca il file', () => {
    // La conversione sta dentro la protezione e non fuori: un BigInt arrivato
    // da un ingresso non fidato solleverebbe nel bel mezzo di un salvataggio, e
    // l'eccezione risalirebbe dentro un canale IPC a senso unico o dentro la
    // chiusura di una finestra, dove nessuno la raccoglie.
    const dir = dirTemporanea()
    const percorso = join(dir, 'roba.json')
    scriviJsonAtomico(percorso, { a: 1 }, 'prova')

    expect(scriviJsonAtomico(percorso, { a: 1n }, 'prova')).toBe(false)

    expect(JSON.parse(readFileSync(percorso, 'utf8'))).toEqual({ a: 1 })
    expect(readdirSync(dir)).toEqual(['roba.json'])
  })
})
