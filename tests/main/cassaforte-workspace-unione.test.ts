import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apriSincronia } from '../../src/main/cassaforte/sincronia'
import { magazzinoInMemoria, type Magazzino } from '../../src/main/cassaforte/magazzino'
import { archivioInMemoria, type Archivio } from '../../src/main/cassaforte/archivio'
import { apriRegistroProgetti } from '../../src/main/progetti/registro'
import { creaLavoro } from '../../src/main/cassaforte/lavoro-in-corso'

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
