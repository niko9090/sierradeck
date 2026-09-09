import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apriSincronia } from '../../src/main/cassaforte/sincronia'
import { magazzinoInMemoria, type Magazzino } from '../../src/main/cassaforte/magazzino'
import { archivioInMemoria, type Archivio } from '../../src/main/cassaforte/archivio'
import { apriRegistroProgetti } from '../../src/main/progetti/registro'
import { creaLavoro } from '../../src/main/cassaforte/lavoro-in-corso'

/**
 * «Porta qui» dal catalogo: le chat di un progetto nato su un altro PC
 * arrivano qui, la cartella si crea nella cartella dei progetti, l'origine
 * resta scritta nel registro (per rimappare le chat), e l'esito consiglia il
 * riavvio.
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
  const radice = mkdtempSync(join(tmpdir(), `sd-porta-${nome}-`))
  const dati = join(radice, 'dati')
  const claude = join(radice, 'claude')
  const progetti = join(radice, 'Progetti SierraDeck')
  mkdirSync(dati, { recursive: true })
  mkdirSync(join(claude, 'projects', 'E--Users-tecnico-Documents-Wdeck'), { recursive: true })
  return { dati, claude, progetti }
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

describe('«Porta qui» dal catalogo', () => {
  it('le chat di un progetto nato altrove arrivano, la cartella si crea, l origine resta nel registro, e si consiglia il riavvio', async () => {
    const drive = driveCondiviso()
    const portatile = pc('portatile'); const fisso = pc('fisso')
    writeFileSync(join(portatile.claude, 'projects', 'E--Users-tecnico-Documents-Wdeck', 'u1.jsonl'), '{"riga":1}\n{"riga":2}\n', 'utf8')
    writeFileSync(join(portatile.claude, 'projects', 'E--Users-tecnico-Documents-Wdeck', 'u2.jsonl'), '{"riga":1}\n', 'utf8')
    const syncP = apri(portatile, drive, 'PORTATILE')
    expect((await syncP.creaPassphrase('passphrase-robusta-1')).ok).toBe(true)
    expect((await syncP.salva()).ok).toBe(true)

    const lavoro = creaLavoro()
    const syncF = apri(fisso, drive, 'FISSO', lavoro)
    expect((await syncF.sblocca('passphrase-robusta-1')).ok).toBe(true)
    const cat = await syncF.catalogo()
    expect(cat.ok).toBe(true)
    if (!cat.ok) return
    expect(cat.catalogo.progetti).toHaveLength(1)
    const g = cat.catalogo.progetti[0]!
    expect(g.nome).toBe('Wdeck')
    expect(g.cartellaOrigine).toBe('E:\\Users\\tecnico\\Documents\\Wdeck')
    expect(g.quiEsiste).toBe(false)
    expect(g.stato).toBe('daPortare')
    expect(g.chat.map((c) => c.stato)).toEqual(['soloDrive', 'soloDrive'])

    const r = await syncF.portaQui(g.chiave)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.esito.scaricati).toBe(2)
    // Le chat sono arrivate sotto lo slug d'origine (la rimappatura del cwd la fa il Core al giro dopo).
    expect(existsSync(join(fisso.claude, 'projects', 'E--Users-tecnico-Documents-Wdeck', 'u1.jsonl'))).toBe(true)
    // La cartella qui c'e', e il registro ricorda l'origine.
    expect(existsSync(join(fisso.progetti, 'Wdeck'))).toBe(true)
    const reg = JSON.parse(readFileSync(join(fisso.dati, 'progetti-drive.json'), 'utf8')) as { progetti: { nome: string; percorsi: Record<string, string>; origini?: string[] }[] }
    const voce = reg.progetti.find((p) => p.nome === 'Wdeck')!
    expect(voce.percorsi.FISSO).toBe(join(fisso.progetti, 'Wdeck'))
    expect(voce.origini).toEqual(['E:\\Users\\tecnico\\Documents\\Wdeck'])
    // L'esito consiglia il riavvio: le chat compaiono nei workspace solo al riavvio.
    expect(lavoro.stato().ultimo?.riavvioConsigliato).toBe(true)
    // Riletto, il catalogo dice «allineato».
    const dopo = await syncF.catalogo()
    expect(dopo.ok && dopo.catalogo.progetti[0]?.stato).toBe('allineato')
  })

  it('un catalogo senza niente da portare non consiglia il riavvio', async () => {
    const drive = driveCondiviso()
    const a = pc('a')
    const lavoro = creaLavoro()
    const syncA = apri(a, drive, 'A', lavoro)
    writeFileSync(join(a.claude, 'projects', 'E--Users-tecnico-Documents-Wdeck', 'u1.jsonl'), '{"riga":1}\n', 'utf8')
    expect((await syncA.creaPassphrase('passphrase-robusta-1')).ok).toBe(true)
    expect((await syncA.salva()).ok).toBe(true)
    expect(lavoro.stato().ultimo?.riavvioConsigliato).toBeUndefined()
    const cat = await syncA.catalogo()
    expect(cat.ok && cat.catalogo.totali.daPortare).toBe(0)
  })
})
