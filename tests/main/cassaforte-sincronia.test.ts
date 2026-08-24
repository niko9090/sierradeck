import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apriSincronia } from '../../src/main/cassaforte/sincronia'
import { magazzinoInMemoria, type Magazzino } from '../../src/main/cassaforte/magazzino'
import { archivioInMemoria, type Archivio } from '../../src/main/cassaforte/archivio'

/**
 * Un «Drive» condiviso fra PC finti: il magazzino a blocco unico (per le chiavi)
 * e l'archivio a più file (per i dati incrementali), le stesse istanze per tutti.
 * È ciò che simula «lo stesso account Google visto da più macchine».
 */
function driveCondiviso(): { magazzino: (nome?: string) => Magazzino; archivio: () => Archivio } {
  const mags = new Map<string, Magazzino>()
  const arch = archivioInMemoria()
  return {
    magazzino: (nome = 'sierradeck.cassaforte') => {
      let m = mags.get(nome)
      if (m === undefined) { m = magazzinoInMemoria(); mags.set(nome, m) }
      return m
    },
    archivio: () => arch
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

function apri(p: { dati: string; claude: string }, drive: ReturnType<typeof driveCondiviso>): ReturnType<typeof apriSincronia> {
  return apriSincronia({
    dati: p.dati, radiceClaude: p.claude,
    driveConnesso: () => true, magazzino: drive.magazzino, archivio: drive.archivio
  })
}

describe('sincronia incrementale: giro completo fra due PC', () => {
  let temp: string[] = []
  const traccia = (p: { dati: string }): void => { temp.push(join(p.dati, '..')) }
  beforeEach(() => { temp = [] })
  afterEach(() => { for (const t of temp) rmSync(t, { recursive: true, force: true }) })

  it('crea la passphrase e salva su un PC, sblocca e ripristina sull’altro', async () => {
    const drive = driveCondiviso()
    const a = pc('A'); traccia(a)
    writeFileSync(join(a.dati, 'workspaces.json'), '{"ciao":"da A"}', 'utf8')
    writeFileSync(join(a.claude, 'projects', 'progetto', 'sessione.jsonl'), '{"riga":1}\n', 'utf8')

    const syncA = apri(a, drive)
    const creata = await syncA.creaPassphrase('passphrase-robusta-1')
    expect(creata.ok).toBe(true)
    expect(creata.chiaveRecupero).toBeTruthy()

    const salvato = await syncA.salva()
    expect(salvato.ok).toBe(true)
    expect(salvato.voci ?? 0).toBeGreaterThanOrEqual(2) // due file caricati

    const b = pc('B'); traccia(b)
    const syncB = apri(b, drive)
    const st = await syncB.stato()
    expect(st.haCassaforte).toBe(true)
    expect(st.sbloccato).toBe(false)

    expect((await syncB.sblocca('sbagliata')).ok).toBe(false)
    expect((await syncB.sblocca('passphrase-robusta-1')).ok).toBe(true)

    const ripristinato = await syncB.ripristina()
    expect(ripristinato.ok).toBe(true)
    expect(ripristinato.scritti ?? 0).toBeGreaterThanOrEqual(2)

    expect(readFileSync(join(b.dati, 'workspaces.json'), 'utf8')).toBe('{"ciao":"da A"}')
    expect(existsSync(join(b.claude, 'projects', 'progetto', 'sessione.jsonl'))).toBe(true)
  })

  it('incrementale: al secondo salvataggio manda SOLO il file cambiato', async () => {
    const drive = driveCondiviso()
    const a = pc('A'); traccia(a)
    writeFileSync(join(a.dati, 'workspaces.json'), '{"x":1}', 'utf8')
    writeFileSync(join(a.claude, 'projects', 'progetto', 's.jsonl'), '{"r":1}\n', 'utf8')
    const syncA = apri(a, drive)
    await syncA.creaPassphrase('pw-incrementale')

    const primo = await syncA.salva()
    expect(primo.voci).toBe(2) // due file la prima volta

    // Niente cambia → salvataggio a costo zero.
    const secondo = await syncA.salva()
    expect(secondo.ok).toBe(true)
    expect(secondo.invariato).toBe(true)

    // Cambia UN file (contenuto più lungo → la firma cambia) → solo quello riparte.
    writeFileSync(join(a.claude, 'projects', 'progetto', 's.jsonl'), '{"r":1}\n{"r":2}\n{"r":3}\n', 'utf8')
    const terzo = await syncA.salva()
    expect(terzo.ok).toBe(true)
    expect(terzo.voci).toBe(1) // UN solo file caricato, non due
  })

  it('sblocca con la chiave di recupero quando la passphrase è persa', async () => {
    const drive = driveCondiviso()
    const a = pc('A'); traccia(a)
    writeFileSync(join(a.dati, 'workspaces.json'), '{"x":1}', 'utf8')
    const syncA = apri(a, drive)
    const { chiaveRecupero } = await syncA.creaPassphrase('la-mia-passphrase-2')
    await syncA.salva()

    const b = pc('B'); traccia(b)
    const syncB = apri(b, drive)
    expect((await syncB.sbloccaConRecupero('codice-storto')).ok).toBe(false)
    expect((await syncB.sbloccaConRecupero(chiaveRecupero!)).ok).toBe(true)
    expect((await syncB.ripristina()).ok).toBe(true)
    expect(readFileSync(join(b.dati, 'workspaces.json'), 'utf8')).toBe('{"x":1}')
  })

  it('cambia la passphrase: la nuova apre, la vecchia no, il recupero resta valido', async () => {
    const drive = driveCondiviso()
    const a = pc('A'); traccia(a)
    const syncA = apri(a, drive)
    const { chiaveRecupero } = await syncA.creaPassphrase('vecchia-passphrase-x')
    expect((await syncA.cambiaPassphrase('non-e-questa', 'nuova-passphrase-y')).ok).toBe(false)
    expect((await syncA.cambiaPassphrase('vecchia-passphrase-x', 'nuova-passphrase-y')).ok).toBe(true)

    const b = pc('B'); traccia(b)
    const syncB = apri(b, drive)
    expect((await syncB.sblocca('vecchia-passphrase-x')).ok).toBe(false)
    expect((await syncB.sblocca('nuova-passphrase-y')).ok).toBe(true)

    const c = pc('C'); traccia(c)
    const syncC = apri(c, drive)
    expect((await syncC.sbloccaConRecupero(chiaveRecupero!)).ok).toBe(true)
  })

  it('non si crea una seconda cassaforte se ne esiste già una', async () => {
    const drive = driveCondiviso()
    const a = pc('A'); traccia(a)
    const syncA = apri(a, drive)
    expect((await syncA.creaPassphrase('prima-passphrase-3')).ok).toBe(true)

    const b = pc('B'); traccia(b)
    const syncB = apri(b, drive)
    const secondo = await syncB.creaPassphrase('altra-passphrase-3')
    expect(secondo.ok).toBe(false)
    expect(secondo.messaggio).toMatch(/esiste già/i)
  })

  it('senza sblocco non salva né ripristina', async () => {
    const drive = driveCondiviso()
    const a = pc('A'); traccia(a)
    const sync = apri(a, drive)
    expect((await sync.salva()).ok).toBe(false)
    expect((await sync.ripristina()).ok).toBe(false)
  })

  it('il salvataggio automatico si accende, si spegne e si ricorda', async () => {
    const drive = driveCondiviso()
    const a = pc('A'); traccia(a)
    const sync = apri(a, drive)
    expect(sync.auto()).toBe(false)
    expect(sync.auto(true)).toBe(true)
    // Una nuova sessione sullo stesso PC ricorda la scelta.
    expect(apri(a, drive).auto()).toBe(true)
  })
})
