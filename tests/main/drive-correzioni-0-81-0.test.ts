import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, utimesSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { archivioInMemoria, type Archivio } from '../../src/main/cassaforte/archivio'
import { creaArchivioDrive } from '../../src/main/cassaforte/google-drive'
import {
  salvaIncrementale, ripristinaIncrementale, manifestoVuoto, nomeCopiaConflitto, ELENCO_DA, type Manifesto
} from '../../src/main/cassaforte/incrementale'

/**
 * Correzioni del Drive dall'analisi della 0.81.0 (analisi-0-80-0.md):
 * - una copia di conflitto che non si crea non fa perdere il lavoro di qui;
 * - un 403 «troppe richieste» si riprova come un 429, un 403 vero no;
 * - il primo giro di un PC nuovo chiede l'elenco una volta invece di cercare ogni file.
 */
const maestra = randomBytes(32)
const T = (s: number): number => Date.parse('2026-10-20T08:00:00.000Z') + s * 1000
const cartella = (): string => mkdtempSync(join(tmpdir(), 'sd-081-'))
function scrivi(dir: string, rel: string, testo: string, mtime: number): void {
  const p = join(dir, ...rel.split('/'))
  mkdirSync(join(p, '..'), { recursive: true })
  writeFileSync(p, testo)
  utimesSync(p, mtime / 1000, mtime / 1000)
}

describe('la copia di conflitto che non si crea', () => {
  it('tiene il lavoro di qui invece di sovrascriverlo col Drive', async () => {
    const archivio = archivioInMemoria()
    const a = cartella(); const b = cartella()
    scrivi(a, 'src/x.ts', 'v1', T(0))
    const mA = await salvaIncrementale({ radici: [{ prefisso: 'progetto-p', cartella: a }], maestra, archivio, manifestoPrec: manifestoVuoto(), adesso: 'x', pcNome: 'Torre' })
    const rB = await ripristinaIncrementale({ radici: [{ prefisso: 'progetto-p', cartella: b }], maestra, archivio })
    // B lavora, A salva una versione più recente: vince il Drive e il lavoro di B andrebbe accanto.
    scrivi(b, 'src/x.ts', 'lavoro-di-B', T(10))
    scrivi(a, 'src/x.ts', 'di-A', T(20))
    await salvaIncrementale({ radici: [{ prefisso: 'progetto-p', cartella: a }], maestra, archivio, manifestoPrec: mA.manifesto, adesso: 'y', pcNome: 'Torre' })
    // ...ma al posto della copia c'è una cartella: né rinominare né scrivere riesce.
    const adesso = '2026-10-20T08:00:40.000Z'
    const copia = nomeCopiaConflitto('progetto-p/src/x.ts', 'Portatile', adesso).slice('progetto-p/'.length)
    mkdirSync(join(b, ...copia.split('/')), { recursive: true })
    const r = await ripristinaIncrementale({
      radici: [{ prefisso: 'progetto-p', cartella: b }], maestra, archivio, manifestoPrec: rB.manifesto as Manifesto, pcNome: 'Portatile', adesso
    })
    expect(readFileSync(join(b, 'src', 'x.ts'), 'utf8')).toBe('lavoro-di-B')
    expect(r.conflitti).toEqual([{ percorso: 'progetto-p/src/x.ts', vinto: 'mio' }])
  })
})

describe('il primo giro di un PC nuovo', () => {
  function contaElenchi(archivio: Archivio): { archivio: Archivio; elenchi: () => number } {
    let n = 0
    return { archivio: { ...archivio, elenca: () => { n += 1; return archivio.elenca() } }, elenchi: () => n }
  }

  it(`con ${ELENCO_DA} file o più chiede l'elenco una volta sola`, async () => {
    const base = archivioInMemoria()
    const a = cartella()
    for (let i = 0; i < ELENCO_DA; i += 1) scrivi(a, `c/${i}.jsonl`, `chat ${i}`, T(i))
    await salvaIncrementale({ radici: [{ prefisso: 'chat', cartella: a }], maestra, archivio: base, manifestoPrec: manifestoVuoto(), adesso: 'x' })
    const { archivio, elenchi } = contaElenchi(base)
    const r = await ripristinaIncrementale({ radici: [{ prefisso: 'chat', cartella: cartella() }], maestra, archivio })
    expect(r.scritti).toBe(ELENCO_DA)
    expect(elenchi()).toBe(1)
  })

  it('con pochi file no: basta la ricerca di ognuno', async () => {
    const base = archivioInMemoria()
    const a = cartella()
    scrivi(a, 'c/uno.jsonl', 'chat', T(0))
    await salvaIncrementale({ radici: [{ prefisso: 'chat', cartella: a }], maestra, archivio: base, manifestoPrec: manifestoVuoto(), adesso: 'x' })
    const { archivio, elenchi } = contaElenchi(base)
    await ripristinaIncrementale({ radici: [{ prefisso: 'chat', cartella: cartella() }], maestra, archivio })
    expect(elenchi()).toBe(0)
  })

  it("dopo l'elenco, l'archivio del Drive scarica senza cercare per nome", async () => {
    let ricerche = 0
    const fetch = (async (url: string | URL): Promise<Response> => {
      const u = String(url)
      if (u.includes('&q=')) { ricerche += 1; return new Response(JSON.stringify({ files: [{ id: 'id-1' }] }), { status: 200 }) }
      if (u.includes('/files?')) return new Response(JSON.stringify({ files: [{ id: 'id-1', name: 'a', version: 1 }] }), { status: 200 })
      return new Response(new Uint8Array([1, 2]), { status: 200 })
    }) as typeof globalThis.fetch
    const d = creaArchivioDrive({ token: async () => 't', fetch })
    await d.elenca()
    expect(await d.scarica('a')).toEqual(Buffer.from([1, 2]))
    expect(ricerche).toBe(0)
  })
})

describe('un 403 di Google', () => {
  function driveCon(primaRisposta: Response): { fetch: typeof globalThis.fetch; chiamate: () => number } {
    let n = 0
    const fetch = (async (): Promise<Response> => {
      n += 1
      if (n === 1) return primaRisposta
      return new Response(JSON.stringify({ files: [] }), { status: 200 })
    }) as typeof globalThis.fetch
    return { fetch, chiamate: () => n }
  }

  it('«troppe richieste» si riprova', async () => {
    const corpo = JSON.stringify({ error: { code: 403, message: 'User Rate Limit Exceeded', errors: [{ reason: 'userRateLimitExceeded' }] } })
    const d = driveCon(new Response(corpo, { status: 403 }))
    const a = creaArchivioDrive({ token: async () => 't', fetch: d.fetch })
    expect((await a.elenca()).size).toBe(0)
    expect(d.chiamate()).toBe(2)
  })

  it('un permesso negato no: risale subito', async () => {
    const corpo = JSON.stringify({ error: { code: 403, message: 'Insufficient Permission', errors: [{ reason: 'insufficientPermissions' }] } })
    const d = driveCon(new Response(corpo, { status: 403 }))
    const a = creaArchivioDrive({ token: async () => 't', fetch: d.fetch })
    await expect(a.elenca()).rejects.toThrow(/403/)
    expect(d.chiamate()).toBe(1)
  })
})
