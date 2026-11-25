import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  accessoClaudePc, accessoClaudeQui, accessoDalBattito, battitoPerNome, dopoAccessoTornato, dopoTurnoScaduto,
  fraseAccessoPc, leggiRegistroAccesso, RISCRIVI_SCADUTO_MS, segnaAccessoTornato, segnaTurnoScaduto, verdettoAccesso
} from '@shared/accesso-claude-pc'
import { etichettaRinnovo, notaRinnovoAperto } from '@shared/accesso-claude-vista'
import { scriptRinnovaAccesso } from '@shared/rinnova-accesso'

const T0 = Date.parse('2026-11-25T18:00:00Z')
const iso = (ms: number): string => new Date(ms).toISOString()

describe('il registro dell’accesso di questo PC', () => {
  it('un turno fallito segna «scaduto dal», poi riscrive l’ultimo al più ogni 5 minuti', () => {
    const r1 = dopoTurnoScaduto({}, T0)
    expect(r1).toEqual({ scadutoDal: iso(T0), ultimoIl: iso(T0) })
    expect(dopoTurnoScaduto(r1!, T0 + 60_000)).toBeUndefined()
    const r2 = dopoTurnoScaduto(r1!, T0 + RISCRIVI_SCADUTO_MS)
    expect(r2).toEqual({ scadutoDal: iso(T0), ultimoIl: iso(T0 + RISCRIVI_SCADUTO_MS) })
  })

  it('l’accesso tornato toglie lo «scaduto»; se non era scaduto non scrive niente', () => {
    expect(dopoAccessoTornato({}, T0)).toBeUndefined()
    expect(dopoAccessoTornato({ scadutoDal: iso(T0), ultimoIl: iso(T0) }, T0 + 1000)).toEqual({ rinnovatoIl: iso(T0 + 1000) })
  })

  it('lo stato: scaduto finché l’accesso non cambia dopo l’ultimo turno fallito', () => {
    const r = { scadutoDal: iso(T0), ultimoIl: iso(T0 + 10 * 60_000) }
    expect(accessoClaudePc(r)).toEqual({ stato: 'scaduto', dal: iso(T0) })
    // Un gettone salvato prima dell'ultimo fallimento non conta.
    expect(accessoClaudePc(r, T0 + 5 * 60_000)).toEqual({ stato: 'scaduto', dal: iso(T0) })
    // Rinnovato dopo (il 25/11 alle 20:56): ok subito, anche se il servizio non l'ha ancora segnato.
    expect(accessoClaudePc(r, T0 + 20 * 60_000)).toEqual({ stato: 'ok', rinnovatoIl: iso(T0 + 20 * 60_000) })
    expect(accessoClaudePc({})).toEqual({ stato: 'ok' })
    expect(accessoClaudePc({ rinnovatoIl: iso(T0) })).toEqual({ stato: 'ok', rinnovatoIl: iso(T0) })
  })
})

describe('su disco', () => {
  let cartella: string | undefined
  afterEach(() => { if (cartella !== undefined) rmSync(cartella, { recursive: true, force: true }); cartella = undefined })

  it('segna, rilegge e ricava lo stato dai file d’accesso', () => {
    cartella = mkdtempSync(join(tmpdir(), 'accesso-pc-'))
    const fileTurni = join(cartella, 'turni.json')
    const fileGettone = join(cartella, 'accesso-claude.json')
    const fileCredenziali = join(cartella, 'nessuna.json')
    expect(segnaTurnoScaduto({ file: fileTurni, adesso: T0 })).toBe(true)
    expect(leggiRegistroAccesso(fileTurni)).toEqual({ scadutoDal: iso(T0), ultimoIl: iso(T0) })
    expect(accessoClaudeQui({ fileTurni, fileGettone, fileCredenziali, adesso: T0 + 1000 })).toEqual({ stato: 'scaduto', dal: iso(T0) })
    // Il gettone di un anno salvato dopo: ok.
    writeFileSync(fileGettone, JSON.stringify({ versione: 1, dpapi: 'x', creatoIl: iso(T0 + 60_000), scadeIl: iso(T0 + 365 * 86_400_000) }))
    expect(accessoClaudeQui({ fileTurni, fileGettone, fileCredenziali, adesso: T0 + 120_000 })).toEqual({ stato: 'ok', rinnovatoIl: iso(T0 + 60_000) })
    expect(segnaAccessoTornato({ file: fileTurni, adesso: T0 + 120_000 })).toBe(true)
    expect(leggiRegistroAccesso(fileTurni)).toEqual({ rinnovatoIl: iso(T0 + 120_000) })
    expect(segnaAccessoTornato({ file: fileTurni, adesso: T0 + 130_000 })).toBe(false)
  })

  it('un file rovinato è «niente di segnato», non un guasto', () => {
    cartella = mkdtempSync(join(tmpdir(), 'accesso-pc-'))
    const f = join(cartella, 'turni.json')
    writeFileSync(f, '{rotto')
    expect(leggiRegistroAccesso(f)).toEqual({})
    writeFileSync(f, JSON.stringify({ scadutoDal: 'ieri' }))
    expect(leggiRegistroAccesso(f)).toEqual({})
  })
})

describe('il battito degli altri PC', () => {
  it('si tiene solo un campo con la forma giusta', () => {
    expect(accessoDalBattito({ stato: 'scaduto', dal: iso(T0) })).toEqual({ stato: 'scaduto', dal: iso(T0) })
    expect(accessoDalBattito({ stato: 'scaduto' })).toBeUndefined()
    expect(accessoDalBattito({ stato: 'ok', rinnovatoIl: 3 })).toEqual({ stato: 'ok' })
    expect(accessoDalBattito('ok')).toBeUndefined()
    expect(accessoDalBattito(undefined)).toBeUndefined()
  })

  it('verdetto: ok dopo l’errore = tornato; scaduto = ancora; senza campo = non so', () => {
    const errore = iso(T0)
    expect(verdettoAccesso(errore, { battito: iso(T0 + 3600_000), accessoClaude: { stato: 'ok', rinnovatoIl: iso(T0 + 1800_000) } })).toEqual({ esito: 'ok', rinnovatoIl: iso(T0 + 1800_000) })
    expect(verdettoAccesso(errore, { battito: iso(T0 + 3600_000), accessoClaude: { stato: 'scaduto', dal: iso(T0) } })).toEqual({ esito: 'scaduto', dal: iso(T0) })
    expect(verdettoAccesso(errore, { battito: iso(T0 + 3600_000) }).esito).toBe('non-so')
    expect(verdettoAccesso(errore, undefined).esito).toBe('non-so')
    // Un battito «ok» di prima dell'errore non dice niente di adesso.
    expect(verdettoAccesso(errore, { battito: iso(T0 - 60_000), accessoClaude: { stato: 'ok' } }).esito).toBe('non-so')
  })

  it('la frase dice quale PC e che si rinnova sul suo schermo', () => {
    const f = fraseAccessoPc('PORTATILE', { esito: 'scaduto', dal: iso(T0) })
    expect(f).toMatch(/Accesso a Claude di PORTATILE: scaduto dal/)
    expect(f).toMatch(/sullo schermo di PORTATILE/)
    expect(f).toMatch(/su un altro PC non serve/)
    expect(fraseAccessoPc('PORTATILE', { esito: 'non-so', perche: 'x' })).toMatch(/non so se è ancora scaduto.*Non dire a Nicholas di rinnovarlo/)
  })

  it('trova il battito per nome scelto, nome o hostname; mai un Aiutante', () => {
    const battiti = [
      { pcId: 'a', nome: 'Portatile', host: 'HOST-A', battito: iso(T0) },
      { pcId: 'a2', nome: 'Portatile', host: 'HOST-A', battito: iso(T0 + 1000), aiutante: true },
      { pcId: 'b', nome: 'Fisso', host: 'HOST-B', nomeScelto: 'Il fisso', battito: iso(T0) }
    ]
    expect(battitoPerNome(battiti, 'portatile')?.pcId).toBe('a')
    expect(battitoPerNome(battiti, 'HOST-A')?.pcId).toBe('a')
    expect(battitoPerNome(battiti, 'Il fisso')?.pcId).toBe('b')
    expect(battitoPerNome(battiti, 'Altro')).toBeUndefined()
    expect(battitoPerNome(battiti, ' ')).toBeUndefined()
  })
})

describe('il tasto e la finestra dicono quale PC rinnovano', () => {
  it('l’etichetta e la nota col nome di questo PC', () => {
    expect(etichettaRinnovo('PORTATILE')).toBe('Rinnova l’accesso a Claude di PORTATILE')
    expect(etichettaRinnovo(undefined)).toBe('Rinnova l’accesso a Claude di questo PC')
    expect(notaRinnovoAperto('PORTATILE')).toBe('Finestra aperta su PORTATILE: approva nel browser.')
  })

  it('la finestra di PowerShell porta il nome, senza caratteri che rompono lo script', () => {
    const s = scriptRinnovaAccesso('claude.exe', 'C:\\x.json', undefined, "Port'atile;$(rm)")
    expect(s).toContain("$Host.UI.RawUI.WindowTitle = 'SierraDeck - Rinnova l accesso a Claude di Portatilerm'")
    expect(s).toContain('di questo PC (Portatilerm) per un anno. Vale solo per questo PC.')
    expect(scriptRinnovaAccesso('claude.exe', 'C:\\x.json')).toContain('Rinnova l accesso a Claude di questo PC')
  })
})
