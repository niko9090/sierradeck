import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  migraAProprietari, migraRegistroSuDisco, nonProgetto, pcDellaTabella, pcPerNome, idDopoMigrazione, risolviPercorsiMiei, sceltaCartella,
  TABELLA_PROPRIETARI, type PcNoto
} from '../../src/main/progetti/migra-proprietari'
import { fondiRegistri, parseRegistro, type RegistroProgetti } from '../../src/main/progetti/registro'

/**
 * La migrazione al modello «un progetto, un PC» (0.88.0): chi non è un
 * progetto esce dal registro, i doppioni si uniscono, ogni progetto ha il suo
 * proprietario per nome del PC. Id e percorsi finti.
 */
const FISSO: PcNoto = { id: 'pc-f', nome: 'PC-Fisso' }
const PORTATILE: PcNoto = { id: 'pc-l', nome: 'Portatile', host: 'LAPTOP-E60QM2D1' }
const DESKTOP: PcNoto = { id: 'pc-d', nome: 'DESKTOP-G24D499' }
const PROBOOK: PcNoto = { id: 'pc-p', nome: 'NB-PROBOOK-TEC' }
const TUTTI = [FISSO, PORTATILE, DESKTOP, PROBOOK]
const ADESSO = '2026-10-30T10:00:00.000Z'

/** Un registro del modello di prima, come lo scriveva la 0.87. */
function vecchio(voci: { id: string; nome: string; percorsi?: Record<string, string>; aggiuntoIl?: string; unitoIn?: string; origini?: string[] }[]): RegistroProgetti {
  return parseRegistro({
    versione: 1,
    progetti: voci.map((v) => ({ id: v.id, nome: v.nome, percorsi: v.percorsi ?? {}, aggiuntoIl: v.aggiuntoIl ?? '2026-09-01', ...(v.unitoIn !== undefined ? { unitoIn: v.unitoIn } : {}), ...(v.origini !== undefined ? { origini: v.origini } : {}) }))
  })
}

describe('chi non è un progetto', () => {
  it('le copie degli autopiloti', () => {
    expect(nonProgetto({ nome: 'ap-3fa9c1-c-2' })).toBe('copia-autopilota')
    expect(nonProgetto({ nome: 'ap-00ff-c-17' })).toBe('copia-autopilota')
  })
  it('le cartelle generiche', () => {
    for (const n of ['Desktop', 'Documents', 'Downloads', 'Downloads-vecchi', 'inbox', 'snap', '_tool', 'web']) {
      expect(nonProgetto({ nome: n }), n).toBe('cartella-generica')
    }
  })
  it('la casa dell utente e la radice di una condivisione', () => {
    expect(nonProgetto({ nome: 'utente', percorsi: ['C:\\Users\\utente'] })).toBe('casa-utente')
    expect(nonProgetto({ nome: 'dati', percorsi: ['\\\\nas\\dati'] })).toBe('radice-condivisa')
  })
  it('i nomi strani: vuoti o frasi', () => {
    expect(nonProgetto({ nome: '   ' })).toBe('nome-strano')
    expect(nonProgetto({ nome: 'questa è una frase che non è un progetto' })).toBe('nome-strano')
    expect(nonProgetto({ nome: 'Fatto.' })).toBe('nome-strano')
  })
  it('i progetti veri restano, anche con nomi di più parole o di una lettera', () => {
    for (const n of ['SierraDeck', 'PROGRAMMA VECCHIO SARDI', 'fionda apl', 'X', 'Home assistant', 'gen', 'ProgettoNuovo']) {
      expect(nonProgetto({ nome: n }), n).toBeUndefined()
    }
    expect(nonProgetto({ nome: 'Sito', percorsi: ['C:\\Users\\utente\\Progetti\\Sito'] })).toBeUndefined()
  })
})

describe('il proprietario per nome', () => {
  it('la tabella: ognuno al suo PC, gli sconosciuti al PC-Fisso', () => {
    expect(pcDellaTabella('Trading')).toBe('LAPTOP-E60QM2D1')
    expect(pcDellaTabella('glos')).toBe('DESKTOP-G24D499')
    expect(pcDellaTabella('HomeAssistant')).toBe('PC-Fisso')
    expect(pcDellaTabella('Home assistant')).toBe('DESKTOP-G24D499')
    expect(pcDellaTabella('gen')).toBe('PC-Fisso')
    expect(pcDellaTabella('Mai visto')).toBe('PC-Fisso')
  })
  it('il NB-PROBOOK-TEC non possiede niente', () => {
    expect(Object.keys(TABELLA_PROPRIETARI.proprietari)).not.toContain('NB-PROBOOK-TEC')
    const r = vecchio([
      { id: 'a', nome: 'Ignoto', percorsi: { 'pc-p': 'D:\\Lavori\\Ignoto' } },
      { id: 'b', nome: 'Money', percorsi: { 'pc-p': 'D:\\Lavori\\Money' } }
    ])
    const e = migraAProprietari(r, TUTTI, TABELLA_PROPRIETARI, { adesso: ADESSO })
    expect(e.registro.progetti.map((p) => p.proprietario)).toEqual(['pc-f', 'pc-l'])
    expect(e.registro.progetti.some((p) => p.proprietario === 'pc-p')).toBe(false)
  })
  it('i PC si riconoscono per nome mostrato, hostname o nome scelto', () => {
    expect(pcPerNome('laptop-e60qm2d1', TUTTI)?.id).toBe('pc-l')
    expect(pcPerNome('pc-fisso', TUTTI)?.id).toBe('pc-f')
    expect(pcPerNome('Nessuno', TUTTI)).toBeUndefined()
  })
})

describe('migraAProprietari', () => {
  const r = vecchio([
    { id: 's1', nome: 'SierraDeck', percorsi: { 'pc-f': 'E:\\Progetti\\SierraDeck', 'pc-l': 'C:\\P\\SierraDeck' }, aggiuntoIl: '2026-09-01' },
    { id: 's2', nome: 'sierradeck', percorsi: { 'pc-l': 'C:\\Altro\\sierradeck' }, aggiuntoIl: '2026-09-05' },
    { id: 'v1', nome: 'VisitaFacile', percorsi: { 'pc-f': 'E:\\Progetti\\VisitaFacile' } },
    { id: 'v2', nome: 'visitafacile', percorsi: {} },
    { id: 'g', nome: 'gen', percorsi: { 'pc-f': 'E:\\Progetti\\FLUX\\tools\\gen' }, aggiuntoIl: '2026-08-01' },
    { id: 'f', nome: 'FLUX', percorsi: { 'pc-f': 'E:\\Progetti\\FLUX' }, aggiuntoIl: '2026-09-02' },
    { id: 't', nome: 'Trading', percorsi: { 'pc-l': 'C:\\P\\Trading', 'pc-f': 'E:\\Progetti\\Trading' } },
    { id: 'ap', nome: 'ap-1a2b-c-3', percorsi: { 'pc-f': 'E:\\Progetti\\ap-1a2b-c-3' } },
    { id: 'dl', nome: 'Downloads', percorsi: { 'pc-f': 'C:\\Users\\utente\\Downloads' } },
    { id: 'u', nome: 'Unito', percorsi: { 'pc-d': 'D:\\Unito' }, unitoIn: 'gl' },
    { id: 'gl', nome: 'GLOS', percorsi: { 'pc-d': 'D:\\GLOS' } }
  ])
  const e = migraAProprietari(r, TUTTI, TABELLA_PROPRIETARI, { adesso: ADESSO })
  const per = (id: string) => e.registro.progetti.find((p) => p.id === id)

  it('toglie dal registro chi non è un progetto, con il motivo', () => {
    expect(e.rapporto.tolti.map((t) => [t.id, t.motivo])).toEqual([['ap', 'copia-autopilota'], ['dl', 'cartella-generica']])
    expect(per('ap')).toBeUndefined()
    expect(per('dl')).toBeUndefined()
  })
  it('unisce i doppioni per nome nel più vecchio, e dice chi va dove', () => {
    expect(per('s1')).toBeDefined()
    expect(per('s2')).toBeUndefined()
    expect(e.rimappa).toMatchObject({ s2: 's1', v2: 'v1', g: 'f', u: 'gl' })
    expect(e.rapporto.uniti.find((u) => u.id === 's1')?.da).toEqual(['s2'])
    expect(idDopoMigrazione('s2', e.rimappa)).toBe('s1')
    expect(idDopoMigrazione('s1', e.rimappa)).toBe('s1')
  })
  it('gen si unisce a FLUX anche se è più vecchio', () => {
    expect(per('f')?.proprietario).toBe('pc-f')
    expect(per('f')?.percorso).toBe('E:\\Progetti\\FLUX')
    expect(per('g')).toBeUndefined()
  })
  it('il proprietario e la cartella sul proprietario; spariti i campi di prima', () => {
    expect(per('s1')).toMatchObject({ proprietario: 'pc-f', percorso: 'E:\\Progetti\\SierraDeck', proprietarioDal: ADESSO })
    expect(per('t')).toMatchObject({ proprietario: 'pc-l', percorso: 'C:\\P\\Trading' })
    expect(per('gl')).toMatchObject({ proprietario: 'pc-d', percorso: 'D:\\GLOS' })
    for (const p of e.registro.progetti) expect(p.vecchio).toBeUndefined()
    const scritto = JSON.stringify(e.registro)
    expect(scritto).not.toContain('percorsi')
    expect(scritto).not.toContain('unitoIn')
  })
  it('un progetto senza cartella sul proprietario lo dice', () => {
    expect(e.rapporto.senzaCartella).toEqual([])
    const solo = migraAProprietari(vecchio([{ id: 'm', nome: 'Money', percorsi: { 'pc-f': 'E:\\Money' } }]), TUTTI, TABELLA_PROPRIETARI, { adesso: ADESSO })
    expect(solo.registro.progetti[0]).toMatchObject({ proprietario: 'pc-l' })
    expect(solo.registro.progetti[0]?.percorso).toBeUndefined()
    expect(solo.rapporto.senzaCartella.map((x) => x.nome)).toEqual(['Money'])
  })
  it('sul proprietario stesso trova la cartella nella cartella dei progetti', () => {
    const solo = migraAProprietari(vecchio([{ id: 'm', nome: 'Money' }]), TUTTI, TABELLA_PROPRIETARI, {
      adesso: ADESSO, io: { id: 'pc-l', cartellaProgetti: 'C:\\P' }, esiste: (p) => p === join('C:\\P', 'Money')
    })
    expect(solo.registro.progetti[0]?.percorso).toBe(join('C:\\P', 'Money'))
  })
  it('un PC della tabella che non si conosce ancora: la voce resta com era', () => {
    const solo = migraAProprietari(vecchio([{ id: 'm', nome: 'Money', percorsi: { 'pc-l': 'C:\\Money' } }]), [FISSO], TABELLA_PROPRIETARI, { adesso: ADESSO })
    expect(solo.rapporto.senzaPc).toEqual([{ id: 'm', nome: 'Money', pcNome: 'LAPTOP-E60QM2D1' }])
    expect(solo.registro.progetti[0]?.proprietario).toBeUndefined()
    expect(solo.registro.progetti[0]?.vecchio?.percorsi).toEqual({ 'pc-l': 'C:\\Money' })
  })
  it('è idempotente: una seconda volta non cambia niente', () => {
    const due = migraAProprietari(e.registro, TUTTI, TABELLA_PROPRIETARI, { adesso: '2026-11-01T00:00:00.000Z' })
    expect(due.cambiato).toBe(false)
    expect(due.registro).toEqual(e.registro)
    expect(due.rapporto.proprietari).toEqual([])
  })
  it('non riassegna un proprietario scelto con «Sposta»', () => {
    const spostato: RegistroProgetti = { ...e.registro, progetti: e.registro.progetti.map((p) => (p.id === 't' ? { ...p, proprietario: 'pc-f', percorso: 'E:\\Progetti\\Trading' } : p)) }
    const due = migraAProprietari(spostato, TUTTI)
    expect(due.registro.progetti.find((p) => p.id === 't')?.proprietario).toBe('pc-f')
  })
  it('le voci tolte non tornano unendo il registro di un PC non ancora migrato', () => {
    const fuso = fondiRegistri(e.registro, r)
    expect(fuso.progetti.map((p) => p.id).sort()).toEqual(e.registro.progetti.map((p) => p.id).sort())
  })
})

describe('migraRegistroSuDisco', () => {
  it('tiene una copia del registro di prima e riscrive solo se cambia', () => {
    const dati = mkdtempSync(join(tmpdir(), 'sd-migra-'))
    writeFileSync(join(dati, 'pc.json'), JSON.stringify({ id: 'pc-f', nome: 'PC-Fisso', cartellaProgetti: 'E:\\Progetti' }))
    writeFileSync(join(dati, 'pc-altrui.json'), JSON.stringify([{ pcId: 'pc-l', nome: 'LAPTOP-E60QM2D1', cartelle: [], chat: [] }]))
    writeFileSync(join(dati, 'progetti-drive.json'), JSON.stringify({ versione: 1, progetti: [
      { id: 'a', nome: 'Trading', percorsi: { 'pc-l': 'C:\\Trading' }, aggiuntoIl: '' },
      { id: 'b', nome: 'snap', percorsi: { 'pc-f': 'E:\\snap' }, aggiuntoIl: '' }
    ] }))
    const e = migraRegistroSuDisco({ dati, adesso: ADESSO })
    expect(e.cambiato).toBe(true)
    expect(existsSync(join(dati, 'progetti-drive.prima-dei-proprietari.json'))).toBe(true)
    const scritto = JSON.parse(readFileSync(join(dati, 'progetti-drive.json'), 'utf8')) as RegistroProgetti
    expect(scritto.progetti).toEqual([{ id: 'a', nome: 'Trading', aggiuntoIl: '', proprietario: 'pc-l', percorso: 'C:\\Trading', proprietarioDal: ADESSO }])
    expect(Object.keys(scritto.tolti ?? {})).toEqual(['b'])
    expect(migraRegistroSuDisco({ dati, adesso: ADESSO }).cambiato).toBe(false)
  })
})

describe('la cartella vera del progetto (prova sui dati veri del 30/10)', () => {
  // Il registro di prima dava a Wdeck una cartella vuota in «Progetti SierraDeck»;
  // quella vera, un repository, stava fra le origini.
  const punti: Record<string, number> = { 'E:\Progetti\Wdeck': 1, 'D:\Documenti\Wdeck': 3 }
  const valuta = (x: string): number => punti[x] ?? 0
  const pcNoti = [{ id: 'pc-f', nome: 'PC-Fisso' }, { id: 'pc-l', nome: 'LAPTOP-E60QM2D1' }]
  const registro = (): RegistroProgetti => ({ versione: 1, progetti: [
    { id: 'w', nome: 'Wdeck', aggiuntoIl: '', vecchio: { percorsi: { 'pc-f': 'E:\Progetti\Wdeck' }, origini: ['D:\Documenti\Wdeck'] } }
  ] })

  it('sul proprietario sceglie la cartella che c’è e ha dentro il progetto, non quella vuota', () => {
    const e = migraAProprietari(registro(), pcNoti, undefined, { adesso: ADESSO, io: { id: 'pc-f', cartellaProgetti: 'E:\Progetti' }, valuta })
    expect(e.registro.progetti[0]).toMatchObject({ proprietario: 'pc-f', percorso: 'D:\Documenti\Wdeck' })
    expect(e.registro.progetti[0]?.candidati).toBeUndefined()
  })

  it('su un altro PC tiene i candidati, e il proprietario sceglie quando li vede', () => {
    const e = migraAProprietari(registro(), pcNoti, undefined, { adesso: ADESSO, io: { id: 'pc-l', cartellaProgetti: 'C:\Progetti' }, valuta: () => 0 })
    expect(e.registro.progetti[0]).toMatchObject({ proprietario: 'pc-f', percorso: 'E:\Progetti\Wdeck', candidati: ['D:\Documenti\Wdeck'] })
    const r = risolviPercorsiMiei(e.registro, { id: 'pc-f', cartellaProgetti: 'E:\Progetti' }, valuta)
    expect(r.cambiati).toEqual(['Wdeck'])
    expect(r.registro.progetti[0]).toMatchObject({ percorso: 'D:\Documenti\Wdeck' })
    expect(r.registro.progetti[0]?.candidati).toBeUndefined()
    expect(risolviPercorsiMiei(r.registro, { id: 'pc-f', cartellaProgetti: 'E:\Progetti' }, valuta).cambiati).toEqual([])
  })

  it('fra due copie del registro vince quella in cui il proprietario ha già scelto, anche se più vecchia', () => {
    const scelto = { id: 'w', nome: 'Wdeck', aggiuntoIl: '', proprietario: 'pc-f', percorso: 'D:\Documenti\Wdeck', proprietarioDal: '2026-10-30T10:00:00Z' }
    const daAltri = { id: 'w', nome: 'Wdeck', aggiuntoIl: '', proprietario: 'pc-f', percorso: 'E:\Progetti\Wdeck', candidati: ['D:\Documenti\Wdeck'], proprietarioDal: '2026-10-31T10:00:00Z' }
    expect(fondiRegistri({ versione: 1, progetti: [scelto] }, { versione: 1, progetti: [daAltri] }).progetti[0]).toEqual(scelto)
    expect(fondiRegistri({ versione: 1, progetti: [daAltri] }, { versione: 1, progetti: [scelto] }).progetti[0]).toEqual(scelto)
  })

  it('sceltaCartella: nessuna se non ne esiste una', () => {
    expect(sceltaCartella(['X:\a', 'Y:\b'], () => 0)).toBeUndefined()
  })
})

describe('valutaCartella', () => {
  it('un guscio (solo .git vuoto e README) vale meno di una cartella con il progetto', async () => {
    const { mkdirSync } = await import('node:fs')
    const { valutaCartella } = await import('../../src/main/progetti/migra-proprietari')
    const base = mkdtempSync(join(tmpdir(), 'sd-valuta-'))
    const guscio = join(base, 'guscio')
    mkdirSync(join(guscio, '.git'), { recursive: true })
    writeFileSync(join(guscio, 'README.md'), 'x')
    const vero = join(base, 'vero')
    mkdirSync(join(vero, '.git', 'refs'), { recursive: true })
    writeFileSync(join(vero, '.git', 'HEAD'), 'ref: refs/heads/main')
    writeFileSync(join(vero, 'index.html'), 'x')
    const senzaGit = join(base, 'senza-git')
    mkdirSync(senzaGit)
    writeFileSync(join(senzaGit, 'STATO.md'), 'x')
    expect(valutaCartella(join(base, 'non-c-e'))).toBe(0)
    expect(valutaCartella(guscio)).toBe(1)
    expect(valutaCartella(senzaGit)).toBe(2)
    expect(valutaCartella(vero)).toBe(3)
  })
})
