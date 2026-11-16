import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  aggiungiEventoAiuto,
  eventiPiuRecentiInCima,
  fileEventiAiuto,
  leggiEventiAiuto,
  registraEventoAiuto,
  salvaEventiAiuto,
  type EventoAiuto
} from '@shared/eventi-aiuto'

function ev(n: number, extra: Partial<EventoAiuto> = {}): EventoAiuto {
  return {
    quando: new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString(),
    lavoroId: `lavoro-${n}`,
    compito: `Compito ${n}`,
    daPc: 'PC-uno',
    aPc: 'PC-due',
    tipo: 'affidato',
    motivo: 'Mandato a un altro PC.',
    ...extra
  }
}

describe('eventi-aiuto', () => {
  let dati: string
  beforeEach(() => { dati = mkdtempSync(join(tmpdir(), 'eventi-aiuto-')) })
  afterEach(() => { rmSync(dati, { recursive: true, force: true }) })

  it('aggiunge in fondo senza cambiare l’elenco dato', () => {
    const a = [ev(1)]
    const b = aggiungiEventoAiuto(a, ev(2))
    expect(a).toHaveLength(1)
    expect(b.map((e) => e.lavoroId)).toEqual(['lavoro-1', 'lavoro-2'])
  })

  it('tiene solo gli ultimi, al tetto', () => {
    let l: EventoAiuto[] = []
    for (let i = 1; i <= 7; i += 1) l = aggiungiEventoAiuto(l, ev(i), 5)
    expect(l).toHaveLength(5)
    expect(l[0]?.lavoroId).toBe('lavoro-3')
    expect(l[4]?.lavoroId).toBe('lavoro-7')
  })

  it('il tetto di partenza è 500', () => {
    let l: EventoAiuto[] = []
    for (let i = 0; i < 510; i += 1) l = aggiungiEventoAiuto(l, ev(i % 50, { lavoroId: `x${i}` }))
    expect(l).toHaveLength(500)
    expect(l[0]?.lavoroId).toBe('x10')
  })

  it('mette i più recenti in cima, e a parità l’ultimo aggiunto', () => {
    const l = [ev(2), ev(5), ev(1), ev(5, { lavoroId: 'dopo' })]
    expect(eventiPiuRecentiInCima(l).map((e) => e.lavoroId)).toEqual(['dopo', 'lavoro-5', 'lavoro-2', 'lavoro-1'])
  })

  it('salva e rilegge, con la risorsa', () => {
    const l = [ev(1), ev(2, { tipo: 'risorsa-mancante', risorsa: 'il progetto', motivo: 'Il progetto non c’è su questo PC.' })]
    expect(salvaEventiAiuto(dati, l)).toBe(true)
    expect(leggiEventiAiuto(dati)).toEqual(l)
    expect(readdirSync(join(dati, 'aiuto'))).toEqual(['eventi-aiuto.json'])
  })

  it('registraEventoAiuto aggiunge al file esistente', () => {
    expect(registraEventoAiuto(dati, ev(1))).toBe(true)
    expect(registraEventoAiuto(dati, ev(2), 1)).toBe(true)
    expect(leggiEventiAiuto(dati).map((e) => e.lavoroId)).toEqual(['lavoro-2'])
  })

  it('senza file: elenco vuoto', () => {
    expect(leggiEventiAiuto(dati)).toEqual([])
  })

  it('file rovinato: elenco vuoto, senza errori, e si riparte', () => {
    mkdirSync(join(dati, 'aiuto'), { recursive: true })
    writeFileSync(fileEventiAiuto(dati), '{ non è json [[', 'utf8')
    expect(leggiEventiAiuto(dati)).toEqual([])
    expect(registraEventoAiuto(dati, ev(1))).toBe(true)
    expect(leggiEventiAiuto(dati)).toHaveLength(1)
  })

  it('forma sbagliata: scarta le voci storte', () => {
    mkdirSync(join(dati, 'aiuto'), { recursive: true })
    writeFileSync(fileEventiAiuto(dati), JSON.stringify([ev(1), { quando: 3 }, null, { ...ev(2), tipo: 'boh' }]), 'utf8')
    expect(leggiEventiAiuto(dati).map((e) => e.lavoroId)).toEqual(['lavoro-1'])
    writeFileSync(fileEventiAiuto(dati), '42', 'utf8')
    expect(leggiEventiAiuto(dati)).toEqual([])
  })
})
