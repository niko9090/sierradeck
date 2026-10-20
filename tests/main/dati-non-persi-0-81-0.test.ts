import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { apriFilePin } from '../../src/main/pin-file'
import { fileElencoRecupero, leggiElencoRecupero, spostaCartellaInRecupero } from '../../src/main/rimozione-sicura'
import { rinominaConRiprova, RIPROVE_RINOMINA } from '@shared/scrittura-atomica'
import { FILE_DEL_REGISTRO } from '../../src/main/registro'

/** Dati che non si perdono per una lettura o una rinomina fallita un istante (analisi 0.81.0). */
const cartella = (): string => mkdtempSync(join(tmpdir(), 'sd-dati-081-'))

describe('il file del PIN', () => {
  it('una lettura fallita un istante si riprova e trova il PIN', () => {
    let tentativi = 0
    const f = apriFilePin('pin-chat.json', {
      log: () => undefined,
      leggi: () => { tentativi += 1; if (tentativi === 1) throw Object.assign(new Error('occupato'), { code: 'EBUSY' }); return '{"impronta":"x"}' }
    })
    expect(f.leggi()).toEqual({ impronta: 'x' })
    expect(tentativi).toBe(2)
  })

  it('un file che resta illeggibile si mette da parte prima di riscriverlo, e lo si dice', () => {
    const dir = cartella()
    const percorso = join(dir, 'pin-chat.json')
    writeFileSync(percorso, '{"impronta":"x", troncato')
    const righe: string[] = []
    const f = apriFilePin(percorso, { log: (m) => righe.push(m) })
    expect(f.leggi()).toBeUndefined()
    const accanto = readdirSync(dir).find((n) => n.startsWith('pin-chat.json.illeggibile-'))
    expect(accanto).toBeDefined()
    expect(readFileSync(join(dir, accanto as string), 'utf8')).toBe('{"impronta":"x", troncato')
    expect(righe[0]).toMatch(/messo da parte/)
  })

  it('un file che non c’è vale «nessun PIN», senza righe nel registro', () => {
    const righe: string[] = []
    expect(apriFilePin(join(cartella(), 'pin-chat.json'), { log: (m) => righe.push(m) }).leggi()).toBeUndefined()
    expect(righe).toEqual([])
  })

  it('si scrive per intero', () => {
    const percorso = join(cartella(), 'pin-chat.json')
    apriFilePin(percorso, { log: () => undefined }).scrivi({ impronta: 'y' })
    expect(JSON.parse(readFileSync(percorso, 'utf8'))).toEqual({ impronta: 'y' })
  })
})

describe("l'elenco del recupero", () => {
  it('illeggibile: una nuova rimozione non cancella le voci di prima, le mette da parte', () => {
    const dati = cartella()
    mkdirSync(join(dati, 'recupero-progetti'), { recursive: true })
    writeFileSync(fileElencoRecupero(dati), '[{"id":"vecchia"} troncato')
    const da = join(dati, 'progetto-x')
    mkdirSync(da)
    const r = spostaCartellaInRecupero(dati, da, { progetto: 'p', nome: 'progetto-x', motivo: 'prova', quando: '2026-10-20T10:00:00.000Z' })
    expect(r.ok).toBe(true)
    const accanto = readdirSync(join(dati, 'recupero-progetti')).find((n) => n.startsWith('elenco.json.illeggibile-'))
    expect(accanto).toBeDefined()
    expect(readFileSync(join(dati, 'recupero-progetti', accanto as string), 'utf8')).toContain('vecchia')
    expect(leggiElencoRecupero(dati).map((c) => c.nome)).toEqual(['progetto-x'])
  })
})

describe('la rinomina di una scrittura atomica', () => {
  it('rifiutata un attimo (EPERM) si riprova', () => {
    let n = 0
    rinominaConRiprova('a', 'b', () => { n += 1; if (n < 3) throw Object.assign(new Error('preso'), { code: 'EPERM' }) })
    expect(n).toBe(3)
  })

  it('rifiutata sempre si arrende dopo le riprove', () => {
    let n = 0
    expect(() => rinominaConRiprova('a', 'b', () => { n += 1; throw Object.assign(new Error('preso'), { code: 'EBUSY' }) })).toThrow('preso')
    expect(n).toBe(RIPROVE_RINOMINA + 1)
  })

  it('un errore vero (ENOENT) non si riprova', () => {
    let n = 0
    expect(() => rinominaConRiprova('a', 'b', () => { n += 1; throw Object.assign(new Error('manca'), { code: 'ENOENT' }) })).toThrow('manca')
    expect(n).toBe(1)
  })
})

describe('i file del registro', () => {
  it('si riconoscono dal nome (prima la regex senza le barre non ne trovava nessuno)', () => {
    expect(FILE_DEL_REGISTRO.test('sierradeck-2026-10-20.log')).toBe(true)
    expect(FILE_DEL_REGISTRO.test('sierradeck-d444-dd-dd.log')).toBe(false)
    expect(FILE_DEL_REGISTRO.test('sierradeck-2026-10-20xlog')).toBe(false)
  })
})
