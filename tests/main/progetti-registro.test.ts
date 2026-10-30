import { describe, it, expect } from 'vitest'
import { mkdtempSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  aggiungiProgetto, cambiaProprietario, fondiRegistri, rimuoviProgetto, registroVuoto, parseRegistro,
  percorsoNuovo, progettoDiCartella, progettoDiCwd, prefissoProgetto, idDaPrefisso,
  apriRegistroProgetti, nomeDaCartella, type RegistroProgetti
} from '../../src/main/progetti/registro'

/**
 * I progetti sul Drive (0.88.0): un registro condiviso, e ogni progetto con
 * un proprietario solo (il PC dove vive) e la sua cartella là.
 */
describe('il registro dei progetti', () => {
  const adesso = '2026-09-04T17:00:00.000Z'

  it('mette una cartella sul Drive con questo PC proprietario, una volta sola', () => {
    const a = aggiungiProgetto(registroVuoto(), { pcId: 'A', percorso: 'E:\\Documenti\\SierraDeck', adesso })
    expect(a.progetto).toMatchObject({ nome: 'SierraDeck', proprietario: 'A', percorso: 'E:\\Documenti\\SierraDeck', proprietarioDal: adesso })
    // La stessa cartella, anche scritta diversa, non fa un secondo progetto.
    const b = aggiungiProgetto(a.registro, { pcId: 'A', percorso: 'e:/documenti/sierradeck/', adesso })
    expect(b.registro.progetti).toHaveLength(1)
  })

  it('un progetto che arriva su questo PC va nella cartella dei progetti, col suo nome', () => {
    expect(percorsoNuovo({ nome: 'SierraDeck' }, join('C:', 'Progetti'))).toBe(join('C:', 'Progetti', 'SierraDeck'))
  })

  it('cambia proprietario, rimuovi, e il prefisso nel manifesto', () => {
    const reg = aggiungiProgetto(registroVuoto(), { pcId: 'A', percorso: 'E:\\X', adesso, id: 'p1' }).registro
    const spostato = cambiaProprietario(reg, 'p1', 'B', 'D:\\X', '2026-10-30T10:00:00Z')
    expect(spostato.progetti[0]).toMatchObject({ proprietario: 'B', percorso: 'D:\\X', proprietarioDal: '2026-10-30T10:00:00Z' })
    expect(rimuoviProgetto(spostato, 'p1').progetti).toHaveLength(0)
    expect(rimuoviProgetto(spostato, 'p1', 'oggi').tolti).toEqual({ p1: 'oggi' })
    expect(prefissoProgetto('p1')).toBe('progetto-p1')
    expect(idDaPrefisso('progetto-p1')).toBe('p1')
    expect(idDaPrefisso('chat')).toBeUndefined()
    expect(nomeDaCartella('C:\\')).toBe('C:\\')
  })

  it('progettoDiCwd trova solo i progetti di questo PC; progettoDiCartella quelli di chiunque', () => {
    const reg = aggiungiProgetto(registroVuoto(), { pcId: 'A', percorso: 'E:\\Documenti\\SierraDeck', adesso }).registro
    expect(progettoDiCwd(reg, 'E:\\Documenti\\SierraDeck\\android', 'A')?.nome).toBe('SierraDeck')
    expect(progettoDiCwd(reg, 'E:\\Documenti\\SierraDeckBis', 'A')).toBeUndefined()
    expect(progettoDiCwd(reg, 'E:\\Documenti\\SierraDeck', 'B')).toBeUndefined()
    expect(progettoDiCartella(reg, 'E:\\Documenti\\SierraDeck\\src')?.proprietario).toBe('A')
  })

  it('parseRegistro tollera forme sbagliate e doppioni, e tiene da parte il modello di prima', () => {
    expect(parseRegistro(undefined)).toEqual(registroVuoto())
    expect(parseRegistro({ progetti: 'no' })).toEqual(registroVuoto())
    const r = parseRegistro({ progetti: [
      { id: 'a', nome: 'uno', percorsi: { A: 'E:\\1', B: 7 } },
      { id: 'a', nome: 'doppio' },
      { id: '', nome: 'senza id' },
      { nome: 'senza id' }
    ] })
    expect(r.progetti).toHaveLength(1)
    expect(r.progetti[0]?.proprietario).toBeUndefined()
    expect(r.progetti[0]?.vecchio?.percorsi).toEqual({ A: 'E:\\1' })
  })

  it('fondiRegistri: vince il proprietario cambiato più di recente; i tolti restano tolti', () => {
    const qui: RegistroProgetti = { versione: 1, progetti: [
      { id: 'p1', nome: 'Uno', aggiuntoIl: '', proprietario: 'A', percorso: 'E:\\Uno', proprietarioDal: '2026-10-01' },
      { id: 'p2', nome: 'Due', aggiuntoIl: '', proprietario: 'A', percorso: 'E:\\Due', proprietarioDal: '2026-10-01' }
    ] }
    const drive: RegistroProgetti = { versione: 1, progetti: [
      { id: 'p1', nome: 'Uno', aggiuntoIl: '', proprietario: 'B', percorso: 'D:\\Uno', proprietarioDal: '2026-10-20' },
      { id: 'p3', nome: 'Tre', aggiuntoIl: '', proprietario: 'B', percorso: 'D:\\Tre', proprietarioDal: '2026-10-01' }
    ], tolti: { p2: '2026-10-25' } }
    const f = fondiRegistri(qui, drive)
    expect(f.progetti.map((p) => p.id).sort()).toEqual(['p1', 'p3'])
    expect(f.progetti.find((p) => p.id === 'p1')).toMatchObject({ proprietario: 'B', percorso: 'D:\\Uno' })
  })

  it('il registro su disco si legge e si scrive, e da vuoto non fallisce', () => {
    const reg = aggiungiProgetto(registroVuoto(), { pcId: 'A', percorso: 'E:\\Documenti\\SierraDeck', adesso }).registro
    const dati = mkdtempSync(join(tmpdir(), 'sd-progetti-'))
    const store = apriRegistroProgetti(dati)
    expect(store.leggi()).toEqual(registroVuoto())
    store.scrivi(reg)
    expect(existsSync(join(dati, 'progetti-drive.json'))).toBe(true)
    expect(store.leggi()).toEqual(reg)
    expect(readFileSync(join(dati, 'progetti-drive.json'), 'utf8')).toContain('SierraDeck')
  })
})
