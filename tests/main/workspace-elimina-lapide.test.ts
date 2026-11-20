import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apriSincronia } from '../../src/main/cassaforte/sincronia'
import { magazzinoInMemoria, type Magazzino } from '../../src/main/cassaforte/magazzino'
import { archivioInMemoria, type Archivio } from '../../src/main/cassaforte/archivio'
import { apriRegistroProgetti } from '../../src/main/progetti/registro'
import { creaLavoro } from '../../src/main/cassaforte/lavoro-in-corso'
import { lapideDelWorkspace } from '../../src/main/workspace-lapide'

/**
 * k-166w1: «Elimina workspace» toccava solo l'archivio del PC e non scriveva la
 * lapide sul Drive: al salvataggio dopo, l'unione rimetteva il nome che restava
 * sul Drive e il workspace eliminato tornava, anche sugli altri PC. Ora
 * l'eliminazione scrive la lapide e il ripristino dal recupero la toglie.
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

function pc(nome: string): { dati: string; claude: string; progetti: string } {
  const radice = mkdtempSync(join(tmpdir(), `sd-lapide-ws-${nome}-`))
  const dati = join(radice, 'dati')
  const claude = join(radice, 'claude')
  mkdirSync(dati, { recursive: true })
  mkdirSync(join(claude, 'projects'), { recursive: true })
  return { dati, claude, progetti: join(radice, 'Progetti SierraDeck') }
}

const temp: string[] = []
afterEach(() => { vi.restoreAllMocks(); for (const t of temp.splice(0)) rmSync(t, { recursive: true, force: true }) })

function apri(p: ReturnType<typeof pc>, drive: ReturnType<typeof driveCondiviso>, pcId: string): ReturnType<typeof apriSincronia> {
  temp.push(join(p.dati, '..'))
  const registro = apriRegistroProgetti(p.dati)
  return apriSincronia({
    dati: p.dati, radiceClaude: p.claude,
    driveConnesso: () => true, magazzino: drive.magazzino, archivio: drive.archivio,
    lavoro: creaLavoro(), pcId: () => pcId, cartellaProgetti: () => p.progetti,
    registroProgetti: { leggi: () => registro.leggi(), scrivi: (r) => registro.scrivi(r) }
  })
}

function archivio(...nomi: string[]): string {
  return JSON.stringify({
    versione: 1,
    attivo: nomi[0] ?? 'lavoro',
    workspace: nomi.map((nome) => ({ nome, perSlot: { '1': { root: undefined, panes: [] } } }))
  })
}

function nomiSulDrive(cat: Awaited<ReturnType<ReturnType<typeof apriSincronia>['catalogo']>>): string[] {
  if (!cat.ok) throw new Error(cat.messaggio)
  return cat.catalogo.workspaceSoloDrive.map((w) => w.nome).sort()
}

async function preparaDuePc(): Promise<{
  a: ReturnType<typeof pc>; b: ReturnType<typeof pc>; t: ReturnType<typeof pc>
  syncA: ReturnType<typeof apriSincronia>; syncB: ReturnType<typeof apriSincronia>; syncT: ReturnType<typeof apriSincronia>
}> {
  const drive = driveCondiviso()
  const a = pc('a'); const b = pc('b'); const t = pc('t')
  writeFileSync(join(a.dati, 'workspaces.json'), archivio('uno', 'due'), 'utf8')
  writeFileSync(join(b.dati, 'workspaces.json'), archivio('uno', 'due'), 'utf8')
  const syncA = apri(a, drive, 'A')
  expect((await syncA.creaPassphrase('passphrase-robusta-1')).ok).toBe(true)
  expect((await syncA.salva()).ok).toBe(true)
  const syncB = apri(b, drive, 'B')
  expect((await syncB.sblocca('passphrase-robusta-1')).ok).toBe(true)
  const syncT = apri(t, drive, 'T')
  expect((await syncT.sblocca('passphrase-robusta-1')).ok).toBe(true)
  expect(nomiSulDrive(await syncT.catalogo())).toEqual(['due', 'uno'])
  return { a, b, t, syncA, syncB, syncT }
}

describe('eliminare un workspace scrive la lapide sul Drive', () => {
  it('elimina su A, salva B che lo ha ancora: sul Drive non ricompare; il ripristino lo rimette', async () => {
    const { a, b, syncA, syncB, syncT } = await preparaDuePc()

    // A elimina «due» (come `workspace:elimina`): archivio locale + lapide.
    writeFileSync(join(a.dati, 'workspaces.json'), archivio('uno'), 'utf8')
    await lapideDelWorkspace((n, v) => syncA.segnaWorkspaceSulDrive(n, v), 'due', 'togli')
    expect((await syncA.salva()).ok).toBe(true)

    // B ha ancora «due» nel suo archivio e salva.
    writeFileSync(join(b.dati, 'workspaces.json'), archivio('uno', 'due', 'tre'), 'utf8')
    expect((await syncB.salva()).ok).toBe(true)
    expect(nomiSulDrive(await syncT.catalogo())).toEqual(['tre', 'uno'])
    // Su A il Drive non gli rimette «due».
    expect((await syncA.salva()).ok).toBe(true)
    const localeA = JSON.parse(readFileSync(join(a.dati, 'workspaces.json'), 'utf8')) as { workspace: { nome: string }[] }
    expect(localeA.workspace.map((w) => w.nome)).not.toContain('due')

    // Ripristino dal recupero: il workspace torna nell'archivio di A e la lapide si toglie.
    writeFileSync(join(a.dati, 'workspaces.json'), archivio('uno', 'due'), 'utf8')
    await lapideDelWorkspace((n, v) => syncA.segnaWorkspaceSulDrive(n, v), 'due', 'rimetti')
    expect((await syncA.salva()).ok).toBe(true)
    expect(nomiSulDrive(await syncT.catalogo())).toContain('due')
  })

  it('senza Drive la lapide non si scrive e non solleva: si dice nel registro', async () => {
    const righe: string[] = []
    await lapideDelWorkspace(async () => ({ ok: false, messaggio: 'Collega prima Google Drive.' }), 'due', 'togli', (m) => righe.push(m))
    await lapideDelWorkspace(async () => { throw new Error('rete') }, 'due', 'togli', (m) => righe.push(m))
    expect(righe).toHaveLength(2)
    expect(righe[0]).toContain('Collega prima Google Drive.')
    expect(righe[1]).toContain('rete')
  })
})
