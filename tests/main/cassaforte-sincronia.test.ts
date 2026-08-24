import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apriSincronia } from '../../src/main/cassaforte/sincronia'
import { magazzinoInMemoria } from '../../src/main/cassaforte/magazzino'
import type { Magazzino } from '../../src/main/cassaforte/magazzino'

/**
 * Un «Drive» condiviso fra due PC finti: una mappa nomeFile → magazzino in
 * memoria, la stessa istanza per entrambi. È ciò che simula «lo stesso account
 * Google visto da due macchine».
 */
function driveCondiviso(): (nomeFile?: string) => Magazzino {
  const per = new Map<string, Magazzino>()
  return (nomeFile = 'sierradeck.cassaforte') => {
    let m = per.get(nomeFile)
    if (m === undefined) { m = magazzinoInMemoria(); per.set(nomeFile, m) }
    return m
  }
}

/** Prepara le cartelle di un «PC»: dati SierraDeck + root di Claude Code. */
function pc(nome: string): { dati: string; claude: string } {
  const radice = mkdtempSync(join(tmpdir(), `sd-sync-${nome}-`))
  const dati = join(radice, 'dati')
  const claude = join(radice, 'claude')
  mkdirSync(dati, { recursive: true })
  mkdirSync(join(claude, 'projects', 'progetto'), { recursive: true })
  return { dati, claude }
}

describe('sincronia: giro completo fra due PC', () => {
  let temp: string[] = []
  const traccia = (p: { dati: string }): void => { temp.push(join(p.dati, '..')) }
  beforeEach(() => { temp = [] })
  afterEach(() => { for (const t of temp) rmSync(t, { recursive: true, force: true }) })

  it('crea la passphrase e salva su un PC, sblocca e ripristina sull’altro', async () => {
    const drive = driveCondiviso()

    // --- PC A: dati veri, poi crea passphrase e salva ---
    const a = pc('A'); traccia(a)
    writeFileSync(join(a.dati, 'workspaces.json'), '{"ciao":"da A"}', 'utf8')
    writeFileSync(join(a.claude, 'projects', 'progetto', 'sessione.jsonl'), '{"riga":1}\n', 'utf8')

    const syncA = apriSincronia({ dati: a.dati, radiceClaude: a.claude, driveConnesso: () => true, magazzino: drive })

    const creata = await syncA.creaPassphrase('passphrase-robusta-1')
    expect(creata.ok).toBe(true)
    expect(creata.chiaveRecupero).toBeTruthy()

    const salvato = await syncA.salva()
    expect(salvato.ok).toBe(true)
    expect(salvato.voci ?? 0).toBeGreaterThanOrEqual(2)

    // --- PC B: cartelle vuote, stesso Drive ---
    const b = pc('B'); traccia(b)
    const syncB = apriSincronia({ dati: b.dati, radiceClaude: b.claude, driveConnesso: () => true, magazzino: drive })

    // Vede che una cassaforte esiste (scaricata dal Drive), ma è chiusa.
    const st = await syncB.stato()
    expect(st.haCassaforte).toBe(true)
    expect(st.sbloccato).toBe(false)

    // Passphrase sbagliata: rifiutata.
    expect((await syncB.sblocca('sbagliata')).ok).toBe(false)
    // Giusta: apre.
    expect((await syncB.sblocca('passphrase-robusta-1')).ok).toBe(true)

    const ripristinato = await syncB.ripristina()
    expect(ripristinato.ok).toBe(true)
    expect(ripristinato.scritti ?? 0).toBeGreaterThanOrEqual(2)

    // I file di A sono comparsi su B, identici.
    expect(readFileSync(join(b.dati, 'workspaces.json'), 'utf8')).toBe('{"ciao":"da A"}')
    expect(existsSync(join(b.claude, 'projects', 'progetto', 'sessione.jsonl'))).toBe(true)
  })

  it('sblocca con la chiave di recupero quando la passphrase è persa', async () => {
    const drive = driveCondiviso()
    const a = pc('A'); traccia(a)
    writeFileSync(join(a.dati, 'workspaces.json'), '{"x":1}', 'utf8')
    const syncA = apriSincronia({ dati: a.dati, radiceClaude: a.claude, driveConnesso: () => true, magazzino: drive })
    const { chiaveRecupero } = await syncA.creaPassphrase('la-mia-passphrase-2')
    await syncA.salva()

    const b = pc('B'); traccia(b)
    const syncB = apriSincronia({ dati: b.dati, radiceClaude: b.claude, driveConnesso: () => true, magazzino: drive })
    expect((await syncB.sbloccaConRecupero('codice-storto')).ok).toBe(false)
    expect((await syncB.sbloccaConRecupero(chiaveRecupero!)).ok).toBe(true)
    expect((await syncB.ripristina()).ok).toBe(true)
    expect(readFileSync(join(b.dati, 'workspaces.json'), 'utf8')).toBe('{"x":1}')
  })

  it('non si crea una seconda cassaforte se ne esiste già una', async () => {
    const drive = driveCondiviso()
    const a = pc('A'); traccia(a)
    const syncA = apriSincronia({ dati: a.dati, radiceClaude: a.claude, driveConnesso: () => true, magazzino: drive })
    expect((await syncA.creaPassphrase('prima-passphrase-3')).ok).toBe(true)

    const b = pc('B'); traccia(b)
    const syncB = apriSincronia({ dati: b.dati, radiceClaude: b.claude, driveConnesso: () => true, magazzino: drive })
    const secondo = await syncB.creaPassphrase('altra-passphrase-3')
    expect(secondo.ok).toBe(false)
    expect(secondo.messaggio).toMatch(/esiste già/i)
  })

  it('senza sblocco non salva né ripristina', async () => {
    const drive = driveCondiviso()
    const a = pc('A'); traccia(a)
    const sync = apriSincronia({ dati: a.dati, radiceClaude: a.claude, driveConnesso: () => true, magazzino: drive })
    expect((await sync.salva()).ok).toBe(false)
    expect((await sync.ripristina()).ok).toBe(false)
  })
})
