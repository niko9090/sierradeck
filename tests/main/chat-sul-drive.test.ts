import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaSpazioDrive } from '../../src/main/spazio-drive'
import { archivioInMemoria } from '../../src/main/cassaforte/archivio'
import type { Manifesto } from '../../src/main/cassaforte/incrementale'

const GIORNO = 86_400_000
const ADESSO = Date.parse('2026-11-06T12:00:00.000Z')

async function banco(opz: { soloQui?: (p: string) => boolean; quota?: { limite?: number; usato: number }; pieno?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'chat-drive-'))
  const a = archivioInMemoria()
  const chat = [
    { id: 'recente', size: 100, giorni: 2 },
    { id: 'vecchia', size: 200, giorni: 60 },
    { id: 'grossa', size: 900, giorni: 3 },
    { id: 'soloDrive', size: 50, giorni: 90 }
  ]
  const file: Manifesto['file'] = {}
  const locali = new Map<string, { nome: string; size: number }[]>()
  for (const c of chat) {
    await a.carica(`f_${c.id}`, Buffer.alloc(c.size))
    file[`chat/slug/${c.id}.jsonl`] = { nome: `f_${c.id}`, size: c.size, mtime: ADESSO - c.giorni * GIORNO }
    // «Il PC» ha il file vero su disco, tranne la chat che e' solo sul Drive.
    if (c.id !== 'soloDrive') {
      writeFileSync(join(dir, `${c.id}.jsonl`), 'x'.repeat(c.size))
      locali.set(c.id, [{ nome: 'PC', size: c.size }])
    }
  }
  let manifesto: Manifesto = { versione: 1, creatoIl: '', file }
  if (opz.quota !== undefined) a.quota = async () => ({ ...opz.quota! })
  const oggetti = new Map<string, unknown>()
  const solo = new Set<string>()
  const righe: string[] = []
  const spazio = creaSpazioDrive({
    archivio: () => a,
    scatola: () => ({ leggi: async <T>(n: string) => oggetti.get(n) as T | undefined, scrivi: async (n: string, o: unknown) => { oggetti.set(n, JSON.parse(JSON.stringify(o))) } }) as never,
    manifestoDrive: async () => manifesto,
    modificaManifesto: async (cambia) => { const d = cambia(manifesto); if (d !== undefined) manifesto = d; return { ok: true } },
    copieSuiPc: () => locali,
    io: () => ({ id: 'pc-qui', nome: 'PC-ESEMPIO' }),
    log: (m) => { righe.push(m) },
    adesso: () => ADESSO,
    soloQui: opz.soloQui ?? (() => false),
    sessioniSoloLocali: () => solo,
    segnaSoloLocali: (s) => { for (const x of s) solo.add(x) },
    pieno: () => opz.pieno === true
  })
  return { spazio, a, dir, solo, righe, manifesto: () => manifesto, chiudi: () => rmSync(dir, { recursive: true, force: true }) }
}

describe('chat sul Drive, con un Drive finto', () => {
  it('1) le chat non usate escono dal Drive, quelle usate restano, la chat solo sul Drive non si tocca', async () => {
    const b = await banco()
    const e = await b.spazio.chatSulDrive()
    expect(e.ok).toBe(true)
    expect(Object.keys(b.manifesto().file).sort()).toEqual(['chat/slug/grossa.jsonl', 'chat/slug/recente.jsonl', 'chat/slug/soloDrive.jsonl'])
    b.chiudi()
  })

  it('2) un workspace «solo su questo PC»: le sue chat escono dal Drive anche se usate', async () => {
    const b = await banco({ soloQui: (p) => p.includes('/recente') || p.includes('/grossa') })
    await b.spazio.chatSulDrive()
    expect(Object.keys(b.manifesto().file).sort()).toEqual(['chat/slug/soloDrive.jsonl'])
    b.chiudi()
  })

  it('3) poco spazio: la piu\' grossa diventa solo locale, subito e senza aspettare 30 giorni', async () => {
    const b = await banco({ quota: { limite: 1000, usato: 950 } })
    await b.spazio.chatSulDrive()
    // La vecchia (200) esce per la regola dei 30 giorni: 950 - 200 = 750, sotto il 90%. Sulla grossa non serve intervenire.
    const sulDrive = await b.a.elenca()
    expect(sulDrive.has('f_vecchia')).toBe(false)
    expect(sulDrive.has('f_recente')).toBe(true)
    b.chiudi()
  })

  it('3) poco spazio, ancora sopra la soglia: la piu\' grossa resta solo locale e se ne va dal Drive', async () => {
    const b = await banco({ quota: { limite: 1000, usato: 1300 } })
    await b.spazio.chatSulDrive()
    expect(b.solo.has('grossa')).toBe(true)
    expect(Object.keys(b.manifesto().file)).not.toContain('chat/slug/grossa.jsonl')
    expect((await b.a.elenca()).has('f_grossa')).toBe(false)
    b.chiudi()
  })

  it('niente poco spazio: il recupero di 30 giorni tiene ancora i file sul Drive', async () => {
    const b = await banco()
    await b.spazio.chatSulDrive()
    expect((await b.a.elenca()).has('f_vecchia')).toBe(true)
    b.chiudi()
  })

  it('la chat locale non viene mai cancellata, qualunque cosa succeda sul Drive', async () => {
    const b = await banco({ quota: { limite: 1000, usato: 1990 }, pieno: true, soloQui: (p) => p.includes('/recente') })
    await b.spazio.chatSulDrive()
    await b.spazio.giro()
    const misure: Record<string, number> = { recente: 100, vecchia: 200, grossa: 900 }
    for (const id of Object.keys(misure)) {
      expect(existsSync(join(b.dir, `${id}.jsonl`))).toBe(true)
      expect(readFileSync(join(b.dir, `${id}.jsonl`), 'utf8')).toHaveLength(misure[id]!)
    }
    // La chat che esiste solo sul Drive non si cancella: non c'e' una copia sul PC.
    expect((await b.a.elenca()).has('f_soloDrive')).toBe(true)
    expect(Object.keys(b.manifesto().file)).toContain('chat/slug/soloDrive.jsonl')
    b.chiudi()
  })

  it('con il Drive che chiede di rallentare non fa niente', async () => {
    const b = await banco()
    const s = creaSpazioDrive({
      archivio: () => b.a, scatola: () => undefined, manifestoDrive: async () => b.manifesto(), modificaManifesto: async () => ({ ok: true }),
      copieSuiPc: () => new Map(), io: () => ({ id: 'x', nome: 'x' }), log: () => undefined, inAttesa: () => true
    })
    const e = await s.chatSulDrive()
    expect(e.ok).toBe(false)
    expect(e.tolte).toBe(0)
    b.chiudi()
  })
})
