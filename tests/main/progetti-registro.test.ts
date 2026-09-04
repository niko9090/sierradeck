import { describe, it, expect } from 'vitest'
import { mkdtempSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  aggiungiProgetto, collegaProgetto, rimuoviProgetto, registroVuoto, parseRegistro,
  percorsoLocale, progettoDiCwd, rimappaCwd, rimappaWorkspace, prefissoProgetto, idDaPrefisso,
  apriRegistroProgetti, nomeDaCartella
} from '../../src/main/progetti/registro'
import type { WorkspaceSalvato } from '@shared/workspace'

/**
 * I progetti sul Drive: un registro condiviso, un percorso per PC, e le `cwd`
 * delle chat che si rimappano sulla cartella di qui.
 */
describe('il registro dei progetti', () => {
  const adesso = '2026-09-04T17:00:00.000Z'

  it('mette una cartella sul Drive per questo PC, una volta sola', () => {
    const a = aggiungiProgetto(registroVuoto(), { pcId: 'A', percorso: 'E:\\Documenti\\SierraDeck', adesso })
    expect(a.progetto.nome).toBe('SierraDeck')
    expect(a.progetto.percorsi).toEqual({ A: 'E:\\Documenti\\SierraDeck' })
    // La stessa cartella, anche scritta diversa, non fa un secondo progetto.
    const b = aggiungiProgetto(a.registro, { pcId: 'A', percorso: 'e:/documenti/sierradeck/', adesso })
    expect(b.registro.progetti).toHaveLength(1)
  })

  it('una cartella con il nome di un progetto arrivato da un altro PC lo collega', () => {
    const daA = aggiungiProgetto(registroVuoto(), { pcId: 'A', percorso: 'E:\\Documenti\\SierraDeck', adesso }).registro
    const suB = aggiungiProgetto(daA, { pcId: 'B', percorso: 'C:\\Lavoro\\SierraDeck', adesso })
    expect(suB.registro.progetti).toHaveLength(1)
    expect(suB.progetto.percorsi).toEqual({ A: 'E:\\Documenti\\SierraDeck', B: 'C:\\Lavoro\\SierraDeck' })
  })

  it('un progetto senza cartella qui va nella cartella dei progetti, col suo nome', () => {
    const p = aggiungiProgetto(registroVuoto(), { pcId: 'A', percorso: 'E:\\Documenti\\SierraDeck', adesso }).progetto
    expect(percorsoLocale(p, 'A', 'C:\\Progetti')).toEqual({ percorso: 'E:\\Documenti\\SierraDeck', nuovo: false })
    expect(percorsoLocale(p, 'B', 'C:\\Progetti')).toEqual({ percorso: 'C:\\Progetti\\SierraDeck', nuovo: true })
  })

  it('collega, rimuovi, e il prefisso nel manifesto', () => {
    const reg = aggiungiProgetto(registroVuoto(), { pcId: 'A', percorso: 'E:\\X', adesso, id: 'p1' }).registro
    const col = collegaProgetto(reg, 'p1', 'B', 'D:\\X')
    expect(col.progetti[0]?.percorsi.B).toBe('D:\\X')
    expect(rimuoviProgetto(col, 'p1').progetti).toHaveLength(0)
    expect(prefissoProgetto('p1')).toBe('progetto-p1')
    expect(idDaPrefisso('progetto-p1')).toBe('p1')
    expect(idDaPrefisso('chat')).toBeUndefined()
    expect(nomeDaCartella('C:\\')).toBe('C:\\')
  })

  it('progettoDiCwd trova il progetto in cui sta una sottocartella', () => {
    const reg = aggiungiProgetto(registroVuoto(), { pcId: 'A', percorso: 'E:\\Documenti\\SierraDeck', adesso }).registro
    expect(progettoDiCwd(reg, 'E:\\Documenti\\SierraDeck\\android', 'A')?.nome).toBe('SierraDeck')
    expect(progettoDiCwd(reg, 'E:\\Documenti\\SierraDeckBis', 'A')).toBeUndefined()
    expect(progettoDiCwd(reg, 'E:\\Documenti\\SierraDeck', 'B')).toBeUndefined()
  })

  it('parseRegistro tollera forme sbagliate e doppioni', () => {
    expect(parseRegistro(undefined)).toEqual(registroVuoto())
    expect(parseRegistro({ progetti: 'no' })).toEqual(registroVuoto())
    const r = parseRegistro({ progetti: [
      { id: 'a', nome: 'uno', percorsi: { A: 'E:\\1', B: 7 } },
      { id: 'a', nome: 'doppio' },
      { id: '', nome: 'senza id' },
      { nome: 'senza id' }
    ] })
    expect(r.progetti).toHaveLength(1)
    expect(r.progetti[0]?.percorsi).toEqual({ A: 'E:\\1' })
  })
})

describe('rimappare le cwd delle chat', () => {
  const adesso = '2026-09-04T17:00:00.000Z'
  const reg = aggiungiProgetto(registroVuoto(), { pcId: 'A', percorso: 'E:\\Users\\nikof\\Documents\\SierraDeck', adesso, id: 'p1' }).registro

  it('una cartella che c e non si tocca', () => {
    expect(rimappaCwd('C:\\qualunque', reg, 'B', 'C:\\Progetti', () => true)).toEqual({ cwd: 'C:\\qualunque' })
  })

  it('una cwd dentro il progetto di un altro PC diventa la stessa sottocartella qui', () => {
    const r = rimappaCwd('E:\\Users\\nikof\\Documents\\SierraDeck\\android', reg, 'B', 'C:\\Progetti', () => false)
    expect(r.cwd).toBe('C:\\Progetti\\SierraDeck\\android')
    expect(r.progetto?.id).toBe('p1')
    expect(r.nuovo).toBe(true)
    // La radice stessa.
    expect(rimappaCwd('e:/users/nikof/documents/sierradeck', reg, 'B', 'C:\\Progetti', () => false).cwd)
      .toBe('C:\\Progetti\\SierraDeck')
  })

  it('se il progetto ha gia una cartella qui, si usa quella', () => {
    const col = collegaProgetto(reg, 'p1', 'B', 'D:\\Lavoro\\SD')
    const r = rimappaCwd('E:\\Users\\nikof\\Documents\\SierraDeck\\src', col, 'B', 'C:\\Progetti', () => false)
    expect(r).toEqual({ cwd: 'D:\\Lavoro\\SD\\src', progetto: col.progetti[0], nuovo: false })
  })

  it('una cartella sconosciuta che non c e resta com e', () => {
    expect(rimappaCwd('E:\\Altro\\cosa', reg, 'B', 'C:\\Progetti', () => false)).toEqual({ cwd: 'E:\\Altro\\cosa' })
  })

  it('rimappaWorkspace tocca solo le chat da rimappare e racconta i cambi', () => {
    const chat = (id: string, cwd: string): WorkspaceSalvato['perSlot'] => ({
      '1': { root: { type: 'pane', id }, panes: [{ id, sessionUuid: `s-${id}`, cwd, title: id }] }
    })
    const archivio = {
      versione: 1, attivo: 'a',
      workspace: [
        { nome: 'a', perSlot: chat('p1', 'E:\\Users\\nikof\\Documents\\SierraDeck') },
        { nome: 'b', perSlot: chat('p2', 'C:\\esiste') }
      ]
    }
    const { archivio: dopo, cambi } = rimappaWorkspace(archivio, (cwd) =>
      rimappaCwd(cwd, reg, 'B', 'C:\\Progetti', (p) => p === 'C:\\esiste').cwd)
    expect(cambi).toEqual([{ sessione: 's-p1', da: 'E:\\Users\\nikof\\Documents\\SierraDeck', a: 'C:\\Progetti\\SierraDeck' }])
    expect(dopo.workspace[0]?.perSlot['1']?.panes[0]?.cwd).toBe('C:\\Progetti\\SierraDeck')
    expect(dopo.workspace[1]).toEqual(archivio.workspace[1])
    // Senza cambi, lo stesso oggetto: chi chiama non riscrive niente.
    expect(rimappaWorkspace(archivio, (c) => c).archivio).toBe(archivio)
  })

  it('il registro su disco si legge e si scrive, e da vuoto non fallisce', () => {
    const dati = mkdtempSync(join(tmpdir(), 'sd-progetti-'))
    const store = apriRegistroProgetti(dati)
    expect(store.leggi()).toEqual(registroVuoto())
    store.scrivi(reg)
    expect(existsSync(join(dati, 'progetti-drive.json'))).toBe(true)
    expect(store.leggi()).toEqual(reg)
    expect(readFileSync(join(dati, 'progetti-drive.json'), 'utf8')).toContain('SierraDeck')
  })
})
