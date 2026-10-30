import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apriSincronia } from '../../src/main/cassaforte/sincronia'
import { magazzinoInMemoria } from '../../src/main/cassaforte/magazzino'
import { archivioInMemoria } from '../../src/main/cassaforte/archivio'
import { parseRegistro, type RegistroProgetti } from '../../src/main/progetti/registro'

/**
 * 0.86.2 (I4): `sierradeck/progetti-drive.json` sul Drive e' la lista dei
 * progetti di tutti i PC (il pannello la legge cosi'), ma ogni PC la
 * riscriveva con la sua: «riscritti da un altro PC» 125 volte nel registro, e
 * i progetti degli altri sparivano dal pannello. Ora sale l'unione, come per
 * i workspace, e il registro di ogni PC resta il suo.
 */
describe('il registro dei progetti sul Drive e l unione di tutti i PC', () => {
  const temp: string[] = []
  afterEach(() => { for (const t of temp.splice(0)) rmSync(t, { recursive: true, force: true }) })
  const PASS = 'una passphrase lunga abbastanza'

  const magazzino = magazzinoInMemoria()
  const archivio = archivioInMemoria()
  const pc = (id: string, progetti: { id: string; file: string }[]) => {
    const radice = mkdtempSync(join(tmpdir(), `sd-registro-${id}-`))
    temp.push(radice)
    const dati = join(radice, 'dati')
    const claude = join(radice, 'claude')
    mkdirSync(dati, { recursive: true })
    mkdirSync(join(claude, 'projects'), { recursive: true })
    const radici = progetti.map((p) => {
      const cartella = join(radice, p.id)
      mkdirSync(cartella, { recursive: true })
      writeFileSync(join(cartella, p.file), `file di ${p.id}`)
      return { prefisso: `progetto-${p.id}`, cartella }
    })
    const righe: string[] = []
    const s = apriSincronia({
      dati, radiceClaude: claude, driveConnesso: () => true, magazzino: () => magazzino, archivio: () => archivio,
      pcId: () => id, pcNome: () => id, log: (m) => { righe.push(m) },
      progetti: { radiciLocali: () => radici, preparaRipristino: () => [], eDiProgetto: (p) => p.startsWith('progetto-') }
    })
    let mtime = Date.parse('2026-10-30T08:00:00.000Z')
    const registro = (r: RegistroProgetti): void => {
      const f = join(dati, 'progetti-drive.json')
      writeFileSync(f, JSON.stringify(r))
      mtime += 60_000
      utimesSync(f, mtime / 1000, mtime / 1000)
    }
    return { s, registro, righe }
  }
  const sulDrive = async (s: ReturnType<typeof apriSincronia>): Promise<RegistroProgetti> => {
    const m = await s.manifestoDrive()
    const b = m === undefined ? undefined : await s.leggiFileDrive('sierradeck/progetti-drive.json', m)
    return parseRegistro(b === undefined ? undefined : JSON.parse(b.toString('utf8')))
  }

  it('due PC salvano il loro registro: sul Drive restano i progetti e i percorsi di tutti e due', async () => {
    const a = pc('torre', [{ id: 'pa', file: 'a.ts' }])
    const b = pc('portatile', [{ id: 'pb', file: 'b.ts' }])
    await a.s.creaPassphrase(PASS)
    expect((await b.s.sblocca(PASS)).ok).toBe(true)

    a.registro({ versione: 1, progetti: [
      { id: 'pa', nome: 'Alfa', percorsi: { torre: 'E:\\Alfa' }, aggiuntoIl: '2026-10-01' },
      { id: 'pc', nome: 'Comune', percorsi: { torre: 'E:\\Comune' }, aggiuntoIl: '2026-10-02' }
    ] })
    b.registro({ versione: 1, progetti: [
      { id: 'pb', nome: 'Beta', percorsi: { portatile: 'C:\\Beta' }, aggiuntoIl: '2026-10-03' },
      { id: 'pc', nome: 'Comune', percorsi: { portatile: 'C:\\Comune' }, aggiuntoIl: '2026-10-02' }
    ] })
    expect((await a.s.salva()).ok).toBe(true)
    expect((await b.s.salva()).ok).toBe(true)
    // A cambia il suo registro e risalva: prima, qui, spariva Beta dal Drive.
    a.registro({ versione: 1, progetti: [
      { id: 'pa', nome: 'Alfa rinominato', percorsi: { torre: 'E:\\Alfa' }, aggiuntoIl: '2026-10-01' },
      { id: 'pc', nome: 'Comune', percorsi: { torre: 'E:\\Comune' }, aggiuntoIl: '2026-10-02' }
    ] })
    expect((await a.s.salva()).ok).toBe(true)

    const r = await sulDrive(a.s)
    expect(r.progetti.map((p) => p.id).sort()).toEqual(['pa', 'pb', 'pc'])
    expect(r.progetti.find((p) => p.id === 'pc')?.percorsi).toEqual({ torre: 'E:\\Comune', portatile: 'C:\\Comune' })
    expect(r.progetti.find((p) => p.id === 'pa')?.nome).toBe('Alfa rinominato')
    // Niente «riscritti da un altro PC» per il registro.
    expect([...a.righe, ...b.righe].filter((x) => x.includes('progetti-drive.json') && x.includes('riscritti'))).toEqual([])
  })
})
