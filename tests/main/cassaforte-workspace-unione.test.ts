import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apriSincronia } from '../../src/main/cassaforte/sincronia'
import { magazzinoInMemoria, type Magazzino } from '../../src/main/cassaforte/magazzino'
import { archivioInMemoria, type Archivio } from '../../src/main/cassaforte/archivio'
import { apriRegistroProgetti } from '../../src/main/progetti/registro'
import { creaLavoro } from '../../src/main/cassaforte/lavoro-in-corso'
import { fondiArchivi } from '../../src/main/cassaforte/fusione'
import { parseArchivio, type Archivio as ArchivioWorkspace } from '@shared/workspace'

/**
 * Il difetto (fisso, 2026-09-13): «SALVA conflitto su sierradeck/workspaces.json:
 * vince questo PC» a ogni salvataggio automatico. Sul Drive c'e' un archivio
 * dei workspace solo, e ogni PC lo sovrascriveva col proprio: i workspace del
 * portatile sparivano dal Drive prima che il fisso potesse fonderli. Da qui
 * sul Drive sale l'UNIONE, e il file locale resta quello del PC.
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
  const radice = mkdtempSync(join(tmpdir(), `sd-unione-${nome}-`))
  const dati = join(radice, 'dati')
  const claude = join(radice, 'claude')
  mkdirSync(dati, { recursive: true })
  mkdirSync(join(claude, 'projects'), { recursive: true })
  return { dati, claude, progetti: join(radice, 'Progetti SierraDeck') }
}

const temp: string[] = []
afterEach(() => { for (const t of temp.splice(0)) rmSync(t, { recursive: true, force: true }) })

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

describe('l’archivio dei workspace sul Drive e’ l’unione dei PC', () => {
  it('IL PUNTO: il secondo PC che salva non cancella i workspace del primo, e nessuno dei due segna un conflitto', async () => {
    const drive = driveCondiviso()
    const fisso = pc('fisso'); const portatile = pc('portatile'); const terzo = pc('terzo')
    writeFileSync(join(fisso.dati, 'workspaces.json'), archivio('fisso-lavoro'), 'utf8')
    const syncF = apri(fisso, drive, 'FISSO')
    expect((await syncF.creaPassphrase('passphrase-robusta-1')).ok).toBe(true)
    expect((await syncF.salva()).ok).toBe(true)

    writeFileSync(join(portatile.dati, 'workspaces.json'), archivio('portatile-viaggio'), 'utf8')
    const syncP = apri(portatile, drive, 'PORTATILE')
    expect((await syncP.sblocca('passphrase-robusta-1')).ok).toBe(true)
    const salvatoP = await syncP.salva()
    expect(salvatoP.ok).toBe(true)
    expect(salvatoP.conflitti).toBeUndefined()

    // Un terzo PC, senza archivio suo: sul Drive vede TUTTI E DUE i workspace.
    const syncT = apri(terzo, drive, 'TERZO')
    expect((await syncT.sblocca('passphrase-robusta-1')).ok).toBe(true)
    expect(nomiSulDrive(await syncT.catalogo())).toEqual(['fisso-lavoro', 'portatile-viaggio'])

    // Il fisso cambia il suo archivio e risalva: il Drive ha i suoi due piu'
    // quello del portatile; il file locale del fisso resta suo, senza il
    // workspace del portatile.
    writeFileSync(join(fisso.dati, 'workspaces.json'), archivio('fisso-lavoro', 'fisso-conti'), 'utf8')
    const salvatoF = await syncF.salva()
    expect(salvatoF.ok).toBe(true)
    expect(salvatoF.conflitti).toBeUndefined()
    expect(nomiSulDrive(await syncT.catalogo())).toEqual(['fisso-conti', 'fisso-lavoro', 'portatile-viaggio'])
    const localeF = JSON.parse(readFileSync(join(fisso.dati, 'workspaces.json'), 'utf8')) as { workspace: { nome: string }[] }
    expect(localeF.workspace.map((w) => w.nome)).toEqual(['fisso-lavoro', 'fisso-conti'])

    // Un salvataggio senza cambi non ricarica l'archivio: il Drive ha gia' l'unione.
    const ancora = await syncF.salva()
    expect(ancora.ok).toBe(true)
    expect(ancora.invariato).toBe(true)
  })

  it('le impostazioni riscritte dall’altro PC non contano come conflitto: sono file per-PC', async () => {
    const drive = driveCondiviso()
    const a = pc('a'); const b = pc('b')
    writeFileSync(join(a.dati, 'impostazioni.json'), JSON.stringify({ tema: 'scuro' }), 'utf8')
    const syncA = apri(a, drive, 'A')
    expect((await syncA.creaPassphrase('passphrase-robusta-1')).ok).toBe(true)
    expect((await syncA.salva()).ok).toBe(true)
    writeFileSync(join(b.dati, 'impostazioni.json'), JSON.stringify({ tema: 'chiaro' }), 'utf8')
    const syncB = apri(b, drive, 'B')
    expect((await syncB.sblocca('passphrase-robusta-1')).ok).toBe(true)
    expect((await syncB.salva()).ok).toBe(true)
    // A riscrive le sue e salva: il Drive e' cambiato da B, ma non e' un conflitto.
    writeFileSync(join(a.dati, 'impostazioni.json'), JSON.stringify({ tema: 'scuro', font: 14 }), 'utf8')
    const r = await syncA.salva()
    expect(r.ok).toBe(true)
    expect(r.conflitti).toBeUndefined()
    expect(JSON.parse(readFileSync(join(a.dati, 'impostazioni.json'), 'utf8'))).toEqual({ tema: 'scuro', font: 14 })
  })
})

describe('«Togli il workspace dal Drive»: la lapide', () => {
  const ws = (nome: string): ArchivioWorkspace['workspace'][number] => ({ nome, perSlot: { '1': { root: undefined, panes: [] } } })

  it('l unione per il Drive salta i workspace con la lapide, anche se il PC li ha ancora; quella per un PC li tiene', () => {
    // Senza la lapide, togliere il nome dal file sul Drive non basta: il
    // prossimo salvataggio di un PC che ce l'ha ancora lo rimette con l'unione.
    const pc: ArchivioWorkspace = { versione: 1, attivo: 'lavoro', workspace: [ws('lavoro'), ws('vecchio')] }
    const drive: ArchivioWorkspace = { versione: 1, attivo: 'lavoro', workspace: [ws('lavoro'), ws('altro')], tolti: { vecchio: { quando: '2026-09-14T10:00:00.000Z', pcId: 'A' } } }
    const perDrive = fondiArchivi(pc, drive, 'unione', [], { perDrive: true })
    expect(perDrive?.workspace.map((w) => w.nome)).toEqual(['lavoro', 'altro'])
    expect(perDrive?.tolti).toEqual({ vecchio: { quando: '2026-09-14T10:00:00.000Z', pcId: 'A' } })
    // Per il PC: «vecchio» resta suo (una lapide toglie dal Drive, mai da un PC), e le lapidi non entrano nel suo file.
    const perPc = fondiArchivi(pc, drive, 'unione')
    expect(perPc?.workspace.map((w) => w.nome)).toEqual(['lavoro', 'vecchio', 'altro'])
    expect(perPc?.tolti).toBeUndefined()
  })

  it('la lapide si legge e si riscrive; una voce storta si scarta da sola', () => {
    const { archivio: letto } = parseArchivio({
      versione: 1, attivo: 'a', workspace: [ws('a')],
      tolti: { b: { quando: '2026-09-14T10:00:00.000Z', pcId: 'X' }, c: { pcId: 'senza-data' }, '': { quando: 'x' } }
    })
    expect(letto.tolti).toEqual({ b: { quando: '2026-09-14T10:00:00.000Z', pcId: 'X' } })
    expect(parseArchivio({ versione: 1, attivo: 'a', workspace: [] }).archivio.tolti).toBeUndefined()
  })

  it('IL PUNTO: tolto da A, il salvataggio di B (che ce l ha ancora) non lo rimette; «Rimetti» si', async () => {
    const drive = driveCondiviso()
    const a = pc('a'); const b = pc('b'); const c = pc('c')
    writeFileSync(join(a.dati, 'workspaces.json'), archivio('lavoro', 'vecchio'), 'utf8')
    const syncA = apri(a, drive, 'A')
    expect((await syncA.creaPassphrase('passphrase-robusta-1')).ok).toBe(true)
    expect((await syncA.salva()).ok).toBe(true)
    writeFileSync(join(b.dati, 'workspaces.json'), archivio('lavoro', 'vecchio', 'casa'), 'utf8')
    const syncB = apri(b, drive, 'B')
    expect((await syncB.sblocca('passphrase-robusta-1')).ok).toBe(true)
    expect((await syncB.salva()).ok).toBe(true)

    // A lo toglie dal Drive.
    const tolto = await syncA.togliWorkspaceDalDrive('vecchio')
    expect(tolto.ok).toBe(true)
    const syncC = apri(c, drive, 'C')
    expect((await syncC.sblocca('passphrase-robusta-1')).ok).toBe(true)
    let cat = await syncC.catalogo()
    if (!cat.ok) throw new Error(cat.messaggio)
    expect(cat.catalogo.workspace.map((w) => w.nome).sort()).toEqual(['casa', 'lavoro'])
    expect(cat.catalogo.workspaceTolti.map((t) => t.nome)).toEqual(['vecchio'])

    // B cambia qualcosa e salva: «vecchio» ce l'ha ancora, ma sul Drive non torna.
    writeFileSync(join(b.dati, 'workspaces.json'), archivio('lavoro', 'vecchio', 'casa', 'nuovo'), 'utf8')
    expect((await syncB.salva()).ok).toBe(true)
    cat = await syncC.catalogo()
    if (!cat.ok) throw new Error(cat.messaggio)
    expect(cat.catalogo.workspace.map((w) => w.nome).sort()).toEqual(['casa', 'lavoro', 'nuovo'])
    expect(cat.catalogo.workspaceTolti.map((t) => t.nome)).toEqual(['vecchio'])
    // E il file di B non e' cambiato: la lapide toglie dal Drive, non da un PC.
    const localeB = JSON.parse(readFileSync(join(b.dati, 'workspaces.json'), 'utf8')) as { workspace: { nome: string }[] }
    expect(localeB.workspace.map((w) => w.nome)).toEqual(['lavoro', 'vecchio', 'casa', 'nuovo'])

    // A lo rimette: al prossimo salvataggio di B torna.
    expect((await syncA.rimettiWorkspaceSulDrive('vecchio')).ok).toBe(true)
    writeFileSync(join(b.dati, 'workspaces.json'), archivio('lavoro', 'vecchio', 'casa', 'nuovo', 'ultimo'), 'utf8')
    expect((await syncB.salva()).ok).toBe(true)
    cat = await syncC.catalogo()
    if (!cat.ok) throw new Error(cat.messaggio)
    expect(cat.catalogo.workspace.map((w) => w.nome).sort()).toEqual(['casa', 'lavoro', 'nuovo', 'ultimo', 'vecchio'])
    expect(cat.catalogo.workspaceTolti).toEqual([])
  })
})

describe('«Ripristina dal Drive» e i file di ogni PC', () => {
  it('le impostazioni e le istantanee di qui restano, con una copia di sicurezza; un PC nuovo le riceve', async () => {
    // Difetto 1 del rapporto del 13/09: «Ripristina» su un PC portava qui le
    // impostazioni dell'altro (tema, cartella dei progetti, preferenze).
    const drive = driveCondiviso()
    const a = pc('a'); const b = pc('b'); const c = pc('c')
    writeFileSync(join(a.dati, 'impostazioni.json'), JSON.stringify({ tema: 'scuro' }), 'utf8')
    writeFileSync(join(a.dati, 'istantanee.json'), JSON.stringify({ istantanee: ['di-a'] }), 'utf8')
    writeFileSync(join(a.dati, 'workspaces.json'), archivio('lavoro'), 'utf8')
    const syncA = apri(a, drive, 'A')
    expect((await syncA.creaPassphrase('passphrase-robusta-1')).ok).toBe(true)
    expect((await syncA.salva()).ok).toBe(true)

    writeFileSync(join(b.dati, 'impostazioni.json'), JSON.stringify({ tema: 'chiaro' }), 'utf8')
    writeFileSync(join(b.dati, 'istantanee.json'), JSON.stringify({ istantanee: ['di-b'] }), 'utf8')
    writeFileSync(join(b.dati, 'workspaces.json'), archivio('casa'), 'utf8')
    const syncB = apri(b, drive, 'B')
    expect((await syncB.sblocca('passphrase-robusta-1')).ok).toBe(true)
    const r = await syncB.ripristina()
    expect(r.ok).toBe(true)
    expect(JSON.parse(readFileSync(join(b.dati, 'impostazioni.json'), 'utf8'))).toEqual({ tema: 'chiaro' })
    expect(JSON.parse(readFileSync(join(b.dati, 'istantanee.json'), 'utf8'))).toEqual({ istantanee: ['di-b'] })
    // Le copie di sicurezza ci sono, per tornare indietro con le mani.
    expect(JSON.parse(readFileSync(join(b.dati, 'impostazioni.prima-del-ripristino-drive.json'), 'utf8'))).toEqual({ tema: 'chiaro' })
    expect(JSON.parse(readFileSync(join(b.dati, 'workspaces.prima-del-ripristino-drive.json'), 'utf8')).workspace.map((w: { nome: string }) => w.nome)).toEqual(['casa'])

    // Un PC nuovo, senza niente: prende quelle del Drive.
    const syncC = apri(c, drive, 'C')
    expect((await syncC.sblocca('passphrase-robusta-1')).ok).toBe(true)
    expect((await syncC.ripristina()).ok).toBe(true)
    expect(JSON.parse(readFileSync(join(c.dati, 'impostazioni.json'), 'utf8'))).toEqual({ tema: 'scuro' })
  })
})
