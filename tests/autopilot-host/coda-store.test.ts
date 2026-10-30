import { describe, it, expect, vi, afterEach } from 'vitest'
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { apriCode, cartellaWorkspace } from '../../src/autopilot-host/coda-store'
import { aggiungi, unisci } from '@shared/coda-richieste'

/** La coda sul disco (P1): stato atomico, eventi solo in aggiunta, scritto solo quando cambia. */

const T0 = '2026-10-30T08:00:00.000Z'
afterEach(() => { vi.restoreAllMocks() })

describe('la coda sul disco', () => {
  it('coda.json e coda.eventi.jsonl nella cartella del workspace; si rilegge uguale', () => {
    const dir = mkdtempSync(join(tmpdir(), 'coda-'))
    const code = apriCode(dir)
    expect(existsSync(join(dir, cartellaWorkspace('Lavoro')))).toBe(false)
    const lungo = 'parole '.repeat(2000)
    code.cambia('Lavoro', (c) => aggiungi(c, { testo: lungo, quando: T0 }))
    const sub = join(dir, cartellaWorkspace('Lavoro'))
    expect(readdirSync(sub).sort()).toEqual(['coda.eventi.jsonl', 'coda.json'])
    const riletta = apriCode(dir).leggi('Lavoro')
    expect(riletta).toEqual(code.leggi('Lavoro'))
    expect(riletta.richieste[0]!.originali[0]!.testo).toBe(lungo)
    const eventi = readFileSync(join(sub, 'coda.eventi.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { tipo: string; originale?: { testo: string } })
    expect(eventi).toHaveLength(1)
    expect(eventi[0]!.originale!.testo).toBe(lungo)
    expect(apriCode(dir).workspaces()).toEqual(['Lavoro'])
  })

  it('scrive solo quando cambia: nessuna modifica, nessuna scrittura', () => {
    const dir = mkdtempSync(join(tmpdir(), 'coda-'))
    const code = apriCode(dir)
    code.cambia('W', (c) => aggiungi(c, { testo: 'uno', quando: T0 }))
    const file = join(dir, cartellaWorkspace('W'), 'coda.json')
    const prima = statSync(file).mtimeMs
    const testo = readFileSync(file, 'utf8')
    const stessa = code.leggi('W')
    expect(code.cambia('W', () => undefined)).toBe(stessa)
    expect(code.cambia('W', (c) => ({ coda: c, eventi: [] }))).toBe(stessa)
    expect(statSync(file).mtimeMs).toBe(prima)
    expect(readFileSync(file, 'utf8')).toBe(testo)
    // Senza la cartella non si crea niente per una lettura.
    code.leggi('Mai')
    expect(existsSync(join(dir, cartellaWorkspace('Mai')))).toBe(false)
  })

  it('gli eventi si aggiungono, non si riscrivono: aggiunte, unione rifiutata e unione', () => {
    const dir = mkdtempSync(join(tmpdir(), 'coda-'))
    const code = apriCode(dir)
    code.cambia('W', (c) => aggiungi(c, { testo: 'uno', quando: T0 }))
    code.cambia('W', (c) => aggiungi(c, { testo: 'due', quando: T0 }))
    code.cambia('W', (c) => { const e = unisci(c, { ids: ['r-1', 'r-2'], testo: 'x', punti: [{ id: 'p-1' }], perche: 'p', quando: T0 }); return e.ok ? e : undefined })
    code.cambia('W', (c) => { const e = unisci(c, { ids: ['r-1', 'r-2'], testo: 'x', punti: [{ id: 'p-1' }, { id: 'p-2' }], perche: 'p', quando: T0 }); return e.ok ? e : undefined })
    const righe = readFileSync(join(dir, cartellaWorkspace('W'), 'coda.eventi.jsonl'), 'utf8').trim().split('\n').map((l) => (JSON.parse(l) as { tipo: string }).tipo)
    expect(righe).toEqual(['aggiunta', 'aggiunta', 'unione'])
    expect(apriCode(dir).leggi('W').richieste.map((r) => r.id)).toEqual(['r-1'])
  })

  it('un coda.json illeggibile: si riparte vuoti senza sovrascriverlo finché non cambia niente', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const dir = mkdtempSync(join(tmpdir(), 'coda-'))
    const sub = join(dir, cartellaWorkspace('W'))
    mkdirSync(sub, { recursive: true })
    writeFileSync(join(sub, 'coda.json'), '{ rotto')
    const code = apriCode(dir)
    expect(code.leggi('W').richieste).toEqual([])
    expect(readFileSync(join(sub, 'coda.json'), 'utf8')).toBe('{ rotto')
  })

  it('il nome della cartella: leggibile, senza caratteri vietati, distinto per nomi diversi', () => {
    expect(cartellaWorkspace('Lavoro')).toMatch(/^Lavoro-[0-9a-f]{8}$/)
    expect(cartellaWorkspace('cartella:c:\\progetti\\app')).toMatch(/^cartella_c_progetti_app-[0-9a-f]{8}$/)
    expect(cartellaWorkspace('a/b')).not.toBe(cartellaWorkspace('a:b'))
    expect(cartellaWorkspace('fine. ')).not.toMatch(/[. ]-/)
  })
})
