import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, statSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apriContoDrive } from '../../src/main/cassaforte/conto-drive'
import { creaRonda, RONDA_SENZA_CHAT_MS } from '../../src/main/progetti/presenza'
import { creaPostino } from '../../src/main/progetti/posta'
import type { Scatola } from '../../src/main/progetti/presenza'
import { aggiungiProgetto, registroVuoto } from '../../src/main/progetti/registro'
import { apriSincronia } from '../../src/main/cassaforte/sincronia'
import { magazzinoInMemoria, type Magazzino } from '../../src/main/cassaforte/magazzino'
import { archivioInMemoria } from '../../src/main/cassaforte/archivio'
import { paginaClient } from '../../src/main/client-pagina'

/**
 * «Ottimizziamo l'app perché i PC girano lenti» (Nicholas, 12/10). Ogni giro
 * tolto o allungato nella 0.69.0, con la sua prova.
 */
afterEach(() => { vi.unstubAllGlobals() })

function scatolaContata(): Scatola & { letture: string[]; scritture: string[]; dati: Map<string, unknown> } {
  const dati = new Map<string, unknown>()
  const s = {
    dati, letture: [] as string[], scritture: [] as string[],
    leggi: <T,>(nome: string) => { s.letture.push(nome); return Promise.resolve(dati.get(nome) as T | undefined) },
    scrivi: (nome: string, o: unknown) => { s.scritture.push(nome); dati.set(nome, JSON.parse(JSON.stringify(o))); return Promise.resolve() },
    cancella: (nome: string) => { dati.delete(nome); return Promise.resolve() },
    elenca: (p: string) => Promise.resolve([...dati.keys()].filter((k) => k.startsWith(p)))
  }
  return s
}

describe('il Drive: un archivio solo per collegamento', () => {
  it('lo stesso archivio a ogni chiamata: un file già trovato non si ricerca più', async () => {
    const d = mkdtempSync(join(tmpdir(), 'sd-lento-'))
    writeFileSync(join(d, 'google-oauth.json'), JSON.stringify({ clientId: 'cid', clientSecret: 'sec' }))
    writeFileSync(join(d, 'google-drive-token.json'), JSON.stringify({ accessToken: 'a', refreshToken: 'r', scadeIl: Date.now() + 3_600_000 }))
    const ricerche: string[] = []
    vi.stubGlobal('fetch', (async (url: string | URL) => {
      const u = String(url)
      if (u.includes('/files?')) { ricerche.push(u); return new Response(JSON.stringify({ files: [{ id: 'id-1' }] }), { status: 200 }) }
      return new Response(Buffer.from('ciao'), { status: 200 })
    }) as typeof fetch)
    const conto = apriContoDrive(d)
    expect(conto.archivio()).toBe(conto.archivio())
    await conto.archivio().scarica('battito-x')
    await conto.archivio().scarica('battito-x')
    expect(ricerche.length).toBe(1)
  })
})

describe('la ronda dei progetti', () => {
  const reg = aggiungiProgetto(registroVuoto(), { pcId: 'A', percorso: 'E:\\SD', adesso: 'ieri', id: 'p1' }).registro
  function ronda(vive: () => string[], ora: { t: number }, s: Scatola) {
    return creaRonda({
      scatola: () => s, registro: { leggi: () => reg, scrivi: () => {} },
      pcId: () => 'A', pcNome: () => 'PC', vive: () => vive(), progettoDi: () => undefined,
      salva: () => Promise.resolve({ ok: true }), ripristinaProgetto: () => Promise.resolve({ ok: true }),
      iberna: () => {}, avvisa: () => {}, adesso: () => ora.t
    })
  }
  it('senza chat vive qui un progetto si legge ogni 5 minuti, non ogni mezzo minuto', async () => {
    const s = scatolaContata()
    const ora = { t: Date.parse('2026-10-12T21:00:00Z') }
    const r = ronda(() => [], ora, s)
    await r.giro()
    const prima = s.letture.length
    expect(prima).toBeGreaterThan(0)
    for (let i = 0; i < 9; i += 1) { ora.t += 30_000; await r.giro() }
    expect(s.letture.length).toBe(prima)
    ora.t += RONDA_SENZA_CHAT_MS
    await r.giro()
    expect(s.letture.length).toBeGreaterThan(prima)
  })
  it('con una chat viva si guarda a ogni giro, come prima', async () => {
    const s = scatolaContata()
    const ora = { t: Date.parse('2026-10-12T21:00:00Z') }
    const r = ronda(() => ['s1'], ora, s)
    await r.giro()
    const prima = s.letture.length
    ora.t += 30_000
    await r.giro()
    expect(s.letture.length).toBeGreaterThan(prima)
  })
  it('il testimone si legge solo quando la presenza è mia', async () => {
    const s = scatolaContata()
    const ora = { t: Date.parse('2026-10-12T21:00:00Z') }
    await ronda(() => [], ora, s).giro()
    expect(s.letture.some((n) => n.includes('staffetta'))).toBe(false)
  })
})

describe('i battiti degli altri PC sul disco solo se cambiano', () => {
  it('riletti uguali, non si riscrive pc-altrui', async () => {
    const s = scatolaContata()
    s.dati.set('pc-b', { pcId: 'b', nome: 'B', versione: '0.69.0', battito: '2026-10-12T21:00:00.000Z', cartelle: [], chat: [] })
    let scritture = 0
    const p = creaPostino({
      scatola: () => s, pcId: () => 'a', pcNome: () => 'A', versione: () => '0.69.0',
      chat: () => [], cartelle: () => [], cartellaEsiste: () => true,
      apriChat: () => undefined, riprendiChat: () => undefined, scrivi: () => undefined,
      memoria: { leggi: () => [], scrivi: () => { scritture += 1 } }
    })
    await p.pc()
    await p.pc()
    await p.pc()
    expect(scritture).toBe(1)
  })
})

describe('il manifesto locale non si riscrive uguale', () => {
  it('due salvataggi senza cambi: il file resta quello di prima', async () => {
    const radice = mkdtempSync(join(tmpdir(), 'sd-man-lento-'))
    const dati = join(radice, 'dati'); const claude = join(radice, 'claude')
    mkdirSync(dati, { recursive: true }); mkdirSync(join(claude, 'projects', 'p'), { recursive: true })
    writeFileSync(join(claude, 'projects', 'p', 'a.jsonl'), '{"r":1}\n')
    const mags = new Map<string, Magazzino>()
    const arch = archivioInMemoria()
    const sync = apriSincronia({
      dati, radiceClaude: claude, driveConnesso: () => true, archivio: () => arch,
      magazzino: (nome = 'sierradeck.cassaforte') => { let m = mags.get(nome); if (m === undefined) { m = magazzinoInMemoria(); mags.set(nome, m) } return m }
    })
    expect((await sync.creaPassphrase('passphrase-robusta-1')).ok).toBe(true)
    expect((await sync.salva()).ok).toBe(true)
    const file = join(dati, 'sync-manifesto.json')
    // Il file «di ieri»: se si riscrivesse, la data cambierebbe.
    const ieri = new Date(Date.now() - 86_400_000)
    utimesSync(file, ieri, ieri)
    expect((await sync.salva()).ok).toBe(true)
    expect(statSync(file).mtimeMs).toBe(ieri.getTime())
  })
})

describe('la pagina del telefono, nascosta, non chiede', () => {
  it('PC, lavoro del Drive e coda si fermano quando la pagina non si vede', () => {
    const html = paginaClient()
    // 0.83.0: «aperto» vale anche per la linguetta o la sezione che li mostra.
    expect(html).toContain("if (!aperto('pc') || !chiave || document.hidden) return")
    expect(html).toContain("if (!aperto('drive') || !chiave || document.hidden) return")
    expect(html).toContain("if (!aperto('code') || codaProgetto === null || !chiave || document.hidden) return")
  })
})
