import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cancellaSicura } from '../../src/shared/cancella-sicura'
import {
  COPIA_PRIMA_DI_ALTRI_PC, FILE_MIGRAZIONE_ALTRI_PC, FILE_SU_PC, leggiSuPc, migraLinguetteRemote, rinominaSuPc, togliSuPc
} from '../../src/main/workspace-su-pc-file'

/** Sezione «Altri PC» (13/11): il registro dei workspace di altri PC sul disco, e la migrazione una volta sola. */
let dati: string
beforeEach(() => { dati = mkdtempSync(join(tmpdir(), 'ws-su-pc-')) })
afterEach(() => { try { cancellaSicura(dati, { dentro: [tmpdir()] }) } catch { /* Windows tiene i file un attimo */ } })

const PC_B = { pcId: 'pc-b', pcNome: 'Portatile' }
const remoto = { remoto: PC_B }
const archivio = (ws: { nome: string; panes: { remoto?: typeof PC_B }[] }[]): { workspace: { nome: string; perSlot: Record<string, { panes: { remoto?: typeof PC_B }[] }> }[] } =>
  ({ workspace: ws.map((w) => ({ nome: w.nome, perSlot: { 1: { panes: w.panes } } })) })

describe('la migrazione delle linguette remote', () => {
  it('sposta in «Altri PC» i workspace con tutte le chat su un altro PC, senza toccare gli altri, una volta sola', () => {
    writeFileSync(join(dati, FILE_SU_PC), JSON.stringify({ Gia: { pcId: 'pc-c', pcNome: 'Ufficio' } }))
    const righe: string[] = []
    const a = archivio([{ nome: 'Fionda', panes: [remoto, remoto] }, { nome: 'Di qui', panes: [{}, remoto] }, { nome: 'Gia', panes: [remoto] }])
    expect(migraLinguetteRemote(dati, a, 'io', (r) => righe.push(r))).toEqual(['Fionda'])
    expect(leggiSuPc(dati)).toEqual({ Gia: { pcId: 'pc-c', pcNome: 'Ufficio' }, Fionda: PC_B })
    // Il registro di prima resta accanto: si torna com'era.
    expect(JSON.parse(readFileSync(join(dati, COPIA_PRIMA_DI_ALTRI_PC), 'utf8'))).toEqual({ Gia: { pcId: 'pc-c', pcNome: 'Ufficio' } })
    expect(existsSync(join(dati, FILE_MIGRAZIONE_ALTRI_PC))).toBe(true)
    expect(righe).toHaveLength(1)
    // La seconda volta non rifà niente, anche con un workspace nuovo tutto remoto.
    expect(migraLinguetteRemote(dati, archivio([{ nome: 'Nuovo', panes: [remoto] }]), 'io', () => undefined)).toEqual([])
    expect(leggiSuPc(dati).Nuovo).toBeUndefined()
  })
  it('senza niente da spostare lascia solo il segno, nessuna copia', () => {
    expect(migraLinguetteRemote(dati, archivio([{ nome: 'Di qui', panes: [{}] }]), 'io', () => undefined)).toEqual([])
    expect(existsSync(join(dati, FILE_SU_PC))).toBe(false)
    expect(existsSync(join(dati, COPIA_PRIMA_DI_ALTRI_PC))).toBe(false)
    expect(existsSync(join(dati, FILE_MIGRAZIONE_ALTRI_PC))).toBe(true)
  })
})

describe('il registro segue rinomina ed eliminazione', () => {
  it('rinominato resta dello stesso PC; eliminato esce; un nome che non c’è non scrive niente', () => {
    writeFileSync(join(dati, FILE_SU_PC), JSON.stringify({ Fionda: PC_B }))
    rinominaSuPc(dati, 'Fionda', 'Fionda 2')
    expect(leggiSuPc(dati)).toEqual({ 'Fionda 2': PC_B })
    togliSuPc(dati, 'Nessuno')
    expect(leggiSuPc(dati)).toEqual({ 'Fionda 2': PC_B })
    togliSuPc(dati, 'Fionda 2')
    expect(leggiSuPc(dati)).toEqual({})
  })
  it('un file rovinato vale vuoto', () => {
    writeFileSync(join(dati, FILE_SU_PC), '{non è json')
    expect(leggiSuPc(dati)).toEqual({})
  })
})
