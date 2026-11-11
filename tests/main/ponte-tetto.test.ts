import { describe, it, expect } from 'vitest'
import { creaClientPcRemoto, ErroreRemoto, leggiJsonConTetto, RISPOSTA_MAX_BYTE } from '../../src/main/pc-remoto'
import { provaCasa } from '../../src/main/casa-firma'

/**
 * Il tetto del ponte sui byte letti davvero: il Client risponde a pezzi,
 * senza `content-length`, e il controllo di prima non scattava mai (k-4: 214 MB).
 */

/** Un flusso di `pezzi` pezzi da `grandezza` byte, prodotti solo quando qualcuno li legge. */
function flusso(pezzi: number, grandezza: number, contati: { n: number; chiuso: boolean }): ReadableStream<Uint8Array> {
  let dati = 0
  return new ReadableStream<Uint8Array>({
    pull(c) {
      if (dati >= pezzi) { c.close(); return }
      dati += 1
      contati.n += 1
      c.enqueue(new Uint8Array(grandezza).fill(0x20))
    },
    cancel() { contati.chiuso = true }
  })
}

describe('leggiJsonConTetto', () => {
  it('un JSON sotto il tetto si legge come prima', async () => {
    expect(await leggiJsonConTetto(new Response('{"ok":true,"è":"sì"}'), 1000)).toEqual({ ok: true, dati: { ok: true, è: 'sì' } })
  })

  it('oltre il tetto smette di leggere e chiude il flusso', async () => {
    const contati = { n: 0, chiuso: false }
    const e = await leggiJsonConTetto(new Response(flusso(1000, 1024, contati)), 10 * 1024)
    expect(e.ok).toBe(false)
    expect(contati.n).toBeLessThan(20)
    expect(contati.chiuso).toBe(true)
  })

  it('un corpo che non è JSON vale undefined, come prima', async () => {
    expect(await leggiJsonConTetto(new Response('<html>'), 1000)).toEqual({ ok: true, dati: undefined })
  })

  it('una risposta finta con il solo json() si legge lo stesso', async () => {
    const finta = { status: 200, json: async () => ({ a: 1 }) } as unknown as Response
    expect(await leggiJsonConTetto(finta, 1000)).toEqual({ ok: true, dati: { a: 1 } })
  })
})

describe('il ponte', () => {
  it('una risposta di 17 MB senza content-length non passa, e non si legge tutta', async () => {
    const contati = { n: 0, chiuso: false }
    const f = (async (url: string | URL | Request): Promise<Response> => {
      const u = new URL(String(url))
      if (u.pathname === '/api/casa') return new Response(JSON.stringify({ prova: provaCasa('chiave-di-casa-B', u.searchParams.get('sfida') ?? '') }), { status: 200 })
      return new Response(flusso(17 * 16, 64 * 1024, contati), { status: 200 })
    }) as typeof fetch
    const remoto = creaClientPcRemoto({
      battiti: () => [{ pcId: 'B', nome: 'Portatile', versione: '0.100.0', battito: new Date().toISOString(), cartelle: [], chat: [], indirizzi: ['10.1.2.3'], porta: 47640 }],
      chiavePer: () => 'chiave-di-casa-B',
      mioNome: () => 'Torre',
      fetch: f,
      attesaMs: 5000
    })
    let errore: unknown
    try { await remoto.chiama('B', '/api/storia', { chat: 'c1' }) } catch (e) { errore = e }
    expect(errore).toBeInstanceOf(ErroreRemoto)
    expect((errore as ErroreRemoto).stato).toBe(502)
    expect((errore as Error).message).toContain('troppo per passare dal ponte')
    // Al più un pezzo o due oltre il tetto (il flusso ne prepara uno in anticipo), mai tutti.
    expect(contati.n * 64 * 1024).toBeLessThanOrEqual(RISPOSTA_MAX_BYTE + 2 * 64 * 1024)
    expect(contati.n).toBeLessThan(17 * 16)
    expect(contati.chiuso).toBe(true)
  })
})
