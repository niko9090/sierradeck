import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apriSincronia } from '../../src/main/cassaforte/sincronia'
import { magazzinoInMemoria, type Magazzino } from '../../src/main/cassaforte/magazzino'
import { archivioInMemoria, type Archivio } from '../../src/main/cassaforte/archivio'
import { apriRegistroProgetti } from '../../src/main/progetti/registro'
import { creaLavoro } from '../../src/main/cassaforte/lavoro-in-corso'

/**
 * 0.79.0: una chat eliminata da questo PC non scende di nuovo dal Drive da
 * sola (né con l'arrivo né con «Ripristina»): la copia lassù resta, ma qui
 * l'hai tolta tu. Solo cartelle temporanee.
 */

const SLUG = 'C--Users-utente-Documents-Esempio'
const U1 = '11111111-1111-4111-8111-111111111111'
const U2 = '22222222-2222-4222-8222-222222222222'

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

const temp: string[] = []
afterEach(() => { for (const t of temp.splice(0)) rmSync(t, { recursive: true, force: true }) })

function pc(nome: string): { dati: string; claude: string; progetti: string } {
  const radice = mkdtempSync(join(tmpdir(), `sd-gc-arrivo-${nome}-`))
  temp.push(radice)
  const dati = join(radice, 'dati')
  const claude = join(radice, 'claude')
  mkdirSync(dati, { recursive: true })
  mkdirSync(join(claude, 'projects', SLUG), { recursive: true })
  return { dati, claude, progetti: join(radice, 'Progetti') }
}

function apri(p: ReturnType<typeof pc>, drive: ReturnType<typeof driveCondiviso>, pcId: string, tolte?: (percorso: string) => boolean): ReturnType<typeof apriSincronia> {
  const registro = apriRegistroProgetti(p.dati)
  return apriSincronia({
    dati: p.dati, radiceClaude: p.claude,
    driveConnesso: () => true, magazzino: drive.magazzino, archivio: drive.archivio,
    lavoro: creaLavoro(), pcId: () => pcId, cartellaProgetti: () => p.progetti,
    registroProgetti: { leggi: () => registro.leggi(), scrivi: (r) => registro.scrivi(r) },
    ...(tolte !== undefined ? { chatTolteDaQui: tolte } : {})
  })
}

describe('l’arrivo dal Drive e le chat eliminate dal PC', () => {
  it('quella eliminata qui resta sul Drive; le altre scendono con «Ripristina»', async () => {
    const drive = driveCondiviso()
    const altro = pc('altro'); const qui = pc('qui')
    writeFileSync(join(altro.claude, 'projects', SLUG, `${U1}.jsonl`), '{"riga":1}\n', 'utf8')
    writeFileSync(join(altro.claude, 'projects', SLUG, `${U2}.jsonl`), '{"riga":1}\n', 'utf8')
    const syncA = apri(altro, drive, 'ALTRO')
    expect((await syncA.creaPassphrase('passphrase-robusta-1')).ok).toBe(true)
    expect((await syncA.salva()).ok).toBe(true)

    const syncQ = apri(qui, drive, 'QUI', (p) => p.includes(U1))
    expect((await syncQ.sblocca('passphrase-robusta-1')).ok).toBe(true)
    // L'arrivo (0.88.0) allinea solo il registro: non scarica chat.
    expect((await syncQ.arrivo()).ok).toBe(true)
    expect(existsSync(join(qui.claude, 'projects', SLUG, `${U2}.jsonl`))).toBe(false)
    // «Ripristina» porta le altre, mai quella eliminata qui.
    expect((await syncQ.ripristina()).ok).toBe(true)
    expect(existsSync(join(qui.claude, 'projects', SLUG, `${U1}.jsonl`))).toBe(false)
    expect(existsSync(join(qui.claude, 'projects', SLUG, `${U2}.jsonl`))).toBe(true)
  })
})
