import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apriSincronia } from '../../src/main/cassaforte/sincronia'
import { magazzinoInMemoria, type Magazzino } from '../../src/main/cassaforte/magazzino'
import { archivioInMemoria, type Archivio } from '../../src/main/cassaforte/archivio'
import { sblocca, type Cassaforte } from '../../src/main/cassaforte/cifratura'
import { leggiManifesto, scriviManifesto, nomeDi } from '../../src/main/cassaforte/incrementale'
import { FILE_CHIAVI } from '../../src/main/cassaforte/sincronia'

/**
 * IL BUG DEL 2026-09-08: 385 chat cancellate dal Drive da un salvataggio.
 *
 * Il manifesto locale veniva scritto uguale al manifesto del Drive intero,
 * con dentro le chat degli altri PC mai scaricate. Il salvataggio dopo le
 * vedeva come «le avevo e non le ho piu'» e le toglieva dal Drive — mentre
 * una fusione le stava ancora scaricando (375 «saltati»). Regola nuova: il
 * manifesto locale dice solo cio' che sta su questo disco, e cio' che ho e
 * il Drive ha perso risale da solo.
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

function pc(nome: string): { dati: string; claude: string } {
  const radice = mkdtempSync(join(tmpdir(), `sd-man-${nome}-`))
  const dati = join(radice, 'dati')
  const claude = join(radice, 'claude')
  mkdirSync(dati, { recursive: true })
  mkdirSync(join(claude, 'projects', 'progetto'), { recursive: true })
  return { dati, claude }
}

const temp: string[] = []
afterEach(() => { for (const t of temp.splice(0)) rmSync(t, { recursive: true, force: true }) })

function apri(p: { dati: string; claude: string }, drive: ReturnType<typeof driveCondiviso>): ReturnType<typeof apriSincronia> {
  temp.push(join(p.dati, '..'))
  return apriSincronia({ dati: p.dati, radiceClaude: p.claude, driveConnesso: () => true, magazzino: drive.magazzino, archivio: drive.archivio })
}

const chat = (p: { claude: string }, nome: string, righe: number): void => {
  writeFileSync(join(p.claude, 'projects', 'progetto', `${nome}.jsonl`), Array.from({ length: righe }, (_, i) => `{"riga":${i}}`).join('\n') + '\n', 'utf8')
}

async function maestraDi(drive: ReturnType<typeof driveCondiviso>, passphrase: string): Promise<Buffer> {
  const c = JSON.parse((await drive.magazzino(FILE_CHIAVI).scarica())!.blocco.toString('utf8')) as Cassaforte
  const m = sblocca(c, passphrase)
  if (m === undefined) throw new Error('passphrase sbagliata nel test')
  return m
}

async function chatSulDrive(drive: ReturnType<typeof driveCondiviso>, maestra: Buffer): Promise<string[]> {
  const m = await leggiManifesto(drive.archivio(), maestra)
  if (m.stato !== 'ok') return []
  return Object.keys(m.manifesto.file).filter((p) => p.endsWith('.jsonl')).sort()
}

describe('il manifesto locale dice solo cio che sta su questo disco', () => {
  it('IL PUNTO: B salva due volte senza ripristinare, e le chat di A restano sul Drive', async () => {
    const drive = driveCondiviso()
    const a = pc('A'); const b = pc('B')
    chat(a, 'di-a', 3)
    const syncA = apri(a, drive)
    expect((await syncA.creaPassphrase('passphrase-robusta-1')).ok).toBe(true)
    expect((await syncA.salva()).ok).toBe(true)
    const maestra = await maestraDi(drive, 'passphrase-robusta-1')

    const syncB = apri(b, drive)
    expect((await syncB.sblocca('passphrase-robusta-1')).ok).toBe(true)
    chat(b, 'di-b', 2)
    expect((await syncB.salva()).ok).toBe(true)
    // Il secondo salvataggio di B: prima cancellava «di-a», che B non aveva mai avuto.
    chat(b, 'di-b', 5)
    const secondo = await syncB.salva()
    expect(secondo.ok).toBe(true)
    const sulDrive = await chatSulDrive(drive, maestra)
    expect(sulDrive.some((p) => p.endsWith('di-a.jsonl'))).toBe(true)
    expect(sulDrive.some((p) => p.endsWith('di-b.jsonl'))).toBe(true)
  })

  it('cio che ho e il Drive ha perso risale al salvataggio dopo, anche senza cambi locali', async () => {
    const drive = driveCondiviso()
    const a = pc('A')
    chat(a, 'preziosa', 3)
    const syncA = apri(a, drive)
    expect((await syncA.creaPassphrase('passphrase-robusta-1')).ok).toBe(true)
    expect((await syncA.salva()).ok).toBe(true)
    const maestra = await maestraDi(drive, 'passphrase-robusta-1')
    // Il Drive la perde (un altro PC, un salvataggio a meta'): via il blob e la voce.
    const m = await leggiManifesto(drive.archivio(), maestra)
    if (m.stato !== 'ok') throw new Error('manifesto?')
    const percorso = Object.keys(m.manifesto.file).find((p) => p.endsWith('preziosa.jsonl'))!
    await drive.archivio().cancella(nomeDi(percorso))
    delete m.manifesto.file[percorso]
    await scriviManifesto(drive.archivio(), maestra, m.manifesto)
    expect(await chatSulDrive(drive, maestra)).toEqual([])
    // A non ha toccato niente: prima diceva «niente da salvare». Ora la rimette.
    const r = await syncA.salva()
    expect(r.ok).toBe(true)
    expect(r.invariato).not.toBe(true)
    expect(await chatSulDrive(drive, maestra)).toEqual([percorso])
  })

  it('una chat cancellata davvero qui sparisce anche dal Drive (la regola di sempre)', async () => {
    const drive = driveCondiviso()
    const a = pc('A')
    chat(a, 'vecchia', 3)
    const syncA = apri(a, drive)
    expect((await syncA.creaPassphrase('passphrase-robusta-1')).ok).toBe(true)
    expect((await syncA.salva()).ok).toBe(true)
    const maestra = await maestraDi(drive, 'passphrase-robusta-1')
    rmSync(join(a.claude, 'projects', 'progetto', 'vecchia.jsonl'))
    expect((await syncA.salva()).ok).toBe(true)
    expect(await chatSulDrive(drive, maestra)).toEqual([])
  })
})
