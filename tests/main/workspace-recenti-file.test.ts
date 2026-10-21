import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FILE_RECENTI_WORKSPACE, leggiRecentiWorkspace, rinominaRecenteWorkspace, toccaRecenteWorkspace } from '../../src/main/workspace-recenti-file'

/** «Recenti» del menu dei workspace (0.82.0): un file accanto a workspaces.json, solo di questo PC. */
let dati: string
beforeEach(() => { dati = mkdtempSync(join(tmpdir(), 'ws-recenti-')) })
afterEach(() => { rmSync(dati, { recursive: true, force: true }) })

describe('i recenti dei workspace sul disco', () => {
  it('senza file vale vuoto; toccare mette in cima e si rilegge uguale', () => {
    expect(leggiRecentiWorkspace(dati)).toEqual([])
    toccaRecenteWorkspace(dati, 'Prova A')
    toccaRecenteWorkspace(dati, 'Prova B')
    expect(toccaRecenteWorkspace(dati, 'Prova A')).toEqual(['Prova A', 'Prova B'])
    expect(leggiRecentiWorkspace(dati)).toEqual(['Prova A', 'Prova B'])
    expect(JSON.parse(readFileSync(join(dati, FILE_RECENTI_WORKSPACE), 'utf8'))).toEqual(['Prova A', 'Prova B'])
  })

  it('una rinomina tiene il posto; un nome che non c’è non tocca il file', () => {
    toccaRecenteWorkspace(dati, 'Prova A')
    toccaRecenteWorkspace(dati, 'Prova B')
    rinominaRecenteWorkspace(dati, 'Prova A', 'Prova A bis')
    expect(leggiRecentiWorkspace(dati)).toEqual(['Prova B', 'Prova A bis'])
    rinominaRecenteWorkspace(dati, 'Nessuno', 'Altro')
    expect(leggiRecentiWorkspace(dati)).toEqual(['Prova B', 'Prova A bis'])
  })

  it('un file storto vale vuoto e il prossimo tocco lo riscrive', () => {
    writeFileSync(join(dati, FILE_RECENTI_WORKSPACE), '{ non è json')
    expect(leggiRecentiWorkspace(dati)).toEqual([])
    expect(toccaRecenteWorkspace(dati, 'Prova C')).toEqual(['Prova C'])
    expect(leggiRecentiWorkspace(dati)).toEqual(['Prova C'])
  })
})
