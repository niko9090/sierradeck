import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apriSincronia } from '../../src/main/cassaforte/sincronia'
import { magazzinoInMemoria, type Magazzino } from '../../src/main/cassaforte/magazzino'
import { archivioInMemoria, type Archivio } from '../../src/main/cassaforte/archivio'
import { apriRegistroProgetti } from '../../src/main/progetti/registro'
import { creaLavoro } from '../../src/main/cassaforte/lavoro-in-corso'
import { pianifica } from '../../src/main/cassaforte/fusione'

/**
 * L'arrivo: la sincronizzazione porta anche giu'. Nicholas (2026-09-13):
 * «qui non sono apparse le chat sincronizzate dal portatile». Le chat che
 * stanno solo sul Drive, o ci sono piu' avanti, scendono da sole dopo il
 * salvataggio automatico; mai una chat di qui accorciata; mai due volte la
 * stessa conversazione sotto due cartelle.
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

const SLUG_P = 'C--Users-nikof-Documents-Wdeck'
const SLUG_F = 'E--Users-nikof-Documents-Wdeck'

function pc(nome: string): { dati: string; claude: string; progetti: string } {
  const radice = mkdtempSync(join(tmpdir(), `sd-arrivo-${nome}-`))
  const dati = join(radice, 'dati')
  const claude = join(radice, 'claude')
  mkdirSync(dati, { recursive: true })
  mkdirSync(join(claude, 'projects', SLUG_P), { recursive: true })
  mkdirSync(join(claude, 'projects', SLUG_F), { recursive: true })
  return { dati, claude, progetti: join(radice, 'Progetti SierraDeck') }
}

const temp: string[] = []
afterEach(() => { for (const t of temp.splice(0)) rmSync(t, { recursive: true, force: true }) })

function apri(p: ReturnType<typeof pc>, drive: ReturnType<typeof driveCondiviso>, pcId: string, lavoro = creaLavoro()): ReturnType<typeof apriSincronia> {
  temp.push(join(p.dati, '..'))
  const registro = apriRegistroProgetti(p.dati)
  return apriSincronia({
    dati: p.dati, radiceClaude: p.claude,
    driveConnesso: () => true, magazzino: drive.magazzino, archivio: drive.archivio,
    lavoro, pcId: () => pcId, cartellaProgetti: () => p.progetti,
    registroProgetti: { leggi: () => registro.leggi(), scrivi: (r) => registro.scrivi(r) }
  })
}

describe('l’arrivo dal Drive', () => {
  it('IL PUNTO: le chat solo sul Drive scendono da sole; la stessa conversazione gia’ qui sotto un’altra cartella no; una chat di qui piu’ lunga non si accorcia', async () => {
    const drive = driveCondiviso()
    const portatile = pc('portatile'); const fisso = pc('fisso')
    writeFileSync(join(portatile.claude, 'projects', SLUG_P, 'u1.jsonl'), '{"riga":1}\n{"riga":2}\n', 'utf8')
    writeFileSync(join(portatile.claude, 'projects', SLUG_P, 'u2.jsonl'), '{"riga":1}\n', 'utf8')
    writeFileSync(join(portatile.claude, 'projects', SLUG_P, 'u4.jsonl'), '{"riga":1}\n', 'utf8')
    const syncP = apri(portatile, drive, 'PORTATILE')
    expect((await syncP.creaPassphrase('passphrase-robusta-1')).ok).toBe(true)
    expect((await syncP.salva()).ok).toBe(true)

    // Sul fisso: u2 c'e' gia' sotto la SUA cartella (rimappata), piu' lunga;
    // u4 c'e' sotto la stessa cartella del portatile ma piu' lunga.
    writeFileSync(join(fisso.claude, 'projects', SLUG_F, 'u2.jsonl'), '{"riga":1}\n{"riga":2}\n{"riga":3}\n', 'utf8')
    writeFileSync(join(fisso.claude, 'projects', SLUG_P, 'u4.jsonl'), '{"riga":1}\n{"riga":2}\n{"riga":3}\n{"riga":4}\n', 'utf8')
    const lavoro = creaLavoro(() => 'T')
    let eventi = 0
    lavoro.onCambio(() => { eventi += 1 })
    const syncF = apri(fisso, drive, 'FISSO', lavoro)
    expect((await syncF.sblocca('passphrase-robusta-1')).ok).toBe(true)

    const r = await syncF.arrivo()
    expect(r.ok).toBe(true)
    expect(r.scritti).toBe(1)
    expect(readFileSync(join(fisso.claude, 'projects', SLUG_P, 'u1.jsonl'), 'utf8')).toBe('{"riga":1}\n{"riga":2}\n')
    expect(existsSync(join(fisso.claude, 'projects', SLUG_P, 'u2.jsonl'))).toBe(false)
    expect(readFileSync(join(fisso.claude, 'projects', SLUG_P, 'u4.jsonl'), 'utf8')).toBe('{"riga":1}\n{"riga":2}\n{"riga":3}\n{"riga":4}\n')
    expect(lavoro.stato().ultimo).toMatchObject({ tipo: 'arrivo', esito: 'ok', scaricati: 1 })
    const eventiDopo = eventi
    expect(eventiDopo).toBeGreaterThan(0)

    // Niente di nuovo: non si prende il lavoro e non si annuncia niente.
    const di_nuovo = await syncF.arrivo()
    expect(di_nuovo).toEqual({ ok: true, scritti: 0 })
    expect(eventi).toBe(eventiDopo)

    // Il portatile va avanti con u1: sul fisso arriva la versione piu' lunga.
    writeFileSync(join(portatile.claude, 'projects', SLUG_P, 'u1.jsonl'), '{"riga":1}\n{"riga":2}\n{"riga":3}\n', 'utf8')
    expect((await syncP.salva()).ok).toBe(true)
    const terzo = await syncF.arrivo()
    expect(terzo.scritti).toBe(1)
    expect(readFileSync(join(fisso.claude, 'projects', SLUG_P, 'u1.jsonl'), 'utf8')).toBe('{"riga":1}\n{"riga":2}\n{"riga":3}\n')
  })

  it('una chat ferma da piu’ della ritenzione di Claude Code resta sul Drive (scenderebbe oggi e sparirebbe domani); con una ritenzione lunga scende', async () => {
    const drive = driveCondiviso()
    const portatile = pc('portatile'); const fisso = pc('fisso')
    const fresca = join(portatile.claude, 'projects', SLUG_P, 'fresca.jsonl')
    const vecchia = join(portatile.claude, 'projects', SLUG_P, 'vecchia.jsonl')
    writeFileSync(fresca, '{"riga":1}\n', 'utf8')
    writeFileSync(vecchia, '{"riga":1}\n', 'utf8')
    const quarantaGiorniFa = (Date.now() - 40 * 86_400_000) / 1000
    utimesSync(vecchia, quarantaGiorniFa, quarantaGiorniFa)
    const syncP = apri(portatile, drive, 'PORTATILE')
    expect((await syncP.creaPassphrase('passphrase-robusta-1')).ok).toBe(true)
    expect((await syncP.salva()).ok).toBe(true)

    const syncF = apri(fisso, drive, 'FISSO')
    expect((await syncF.sblocca('passphrase-robusta-1')).ok).toBe(true)
    const r = await syncF.arrivo()
    expect(r.ok).toBe(true)
    expect(r.scritti).toBe(1)
    expect(existsSync(join(fisso.claude, 'projects', SLUG_P, 'fresca.jsonl'))).toBe(true)
    expect(existsSync(join(fisso.claude, 'projects', SLUG_P, 'vecchia.jsonl'))).toBe(false)

    // Chi tiene le trascrizioni dieci anni (cleanupPeriodDays) le riceve tutte.
    writeFileSync(join(fisso.claude, 'settings.json'), JSON.stringify({ cleanupPeriodDays: 3650 }), 'utf8')
    const dopo = await syncF.arrivo()
    expect(dopo.scritti).toBe(1)
    expect(existsSync(join(fisso.claude, 'projects', SLUG_P, 'vecchia.jsonl'))).toBe(true)
  })

  it('l’automatico fa salire e poi scendere', async () => {
    const drive = driveCondiviso()
    const portatile = pc('portatile'); const fisso = pc('fisso')
    writeFileSync(join(portatile.claude, 'projects', SLUG_P, 'u9.jsonl'), '{"riga":1}\n', 'utf8')
    const syncP = apri(portatile, drive, 'PORTATILE')
    expect((await syncP.creaPassphrase('passphrase-robusta-1')).ok).toBe(true)
    expect((await syncP.salva()).ok).toBe(true)
    const syncF = apri(fisso, drive, 'FISSO')
    expect((await syncF.sblocca('passphrase-robusta-1')).ok).toBe(true)
    syncF.auto(true)
    await syncF.salvaSeServe()
    expect(existsSync(join(fisso.claude, 'projects', SLUG_P, 'u9.jsonl'))).toBe(true)
  })

  it('nel piano di fusione una chat solo-Drive che qui sta sotto un’altra cartella si salta', () => {
    const piano = pianifica({
      firmaPc: new Map([[`chat/${SLUG_F}/u2.jsonl`, { size: 30, mtime: 5 }]]),
      manifestoDrive: { versione: 1, creatoIl: 'T', file: { [`chat/${SLUG_P}/u2.jsonl`]: { nome: 'f_u2', size: 10, mtime: 1 } } },
      registroPc: { versione: 1, progetti: [] },
      registroDrive: { versione: 1, progetti: [] },
      pcId: 'FISSO',
      cassaforteDiversa: false
    })
    const drivePath = piano.chat.find((c) => c.percorso === `chat/${SLUG_P}/u2.jsonl`)
    expect(drivePath).toMatchObject({ dove: 'entrambi', diverse: false, predefinita: 'salta' })
    expect(drivePath?.sotto).toContain('già qui')
    expect(piano.totali.soloDrive).toBe(0)
  })
})
