import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { paginaClient } from '../../src/main/client-pagina'
import { rotteClient, type DipendenzeRotte } from '../../src/main/client-rotte'
import { apriDispositivi } from '../../src/main/dispositivi'
import { LINEA_NUOVA, passo, qualita, eOra, type EventoLinea, type Linea } from '@shared/collegamento'

/**
 * 0.51.0: il collegamento nella pagina del telefono. La sua macchina degli
 * stati è una copia (la pagina non importa moduli): qui si confronta con
 * quella di `@shared/collegamento` sulle stesse cadute simulate; poi la coda,
 * contro le rotte vere: una risposta persa non scrive due volte.
 */
const html = paginaClient()
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
const estrai = (inizio: string): string => {
  const i = script.indexOf(inizio)
  if (i < 0) throw new Error(`manca ${inizio}`)
  let profondita = 0
  for (let j = script.indexOf('{', i); j < script.length; j++) {
    if (script[j] === '{') profondita++
    else if (script[j] === '}' && --profondita === 0) return script.slice(i, j + 1)
  }
  throw new Error('non si chiude')
}

type Pagina = { passoLinea: (l: unknown, e: unknown) => Record<string, unknown>; qualitaLinea: (m: unknown) => Record<string, unknown>; eOraLinea: (l: unknown, u: number, a: number) => boolean }
const pagina = new Function(`
  const ATTESE_LINEA = [1000, 2000, 5000, 10000, 30000]
  const KEEPALIVE_MS = 2000
  ${estrai('function attesaPrima(')}
  ${estrai('function passoLinea(')}
  ${estrai('function qualitaLinea(')}
  ${estrai('function eOraLinea(')}
  return { passoLinea, qualitaLinea, eOraLinea }
`)() as Pagina

/** Cadute, ritorni e «riprova adesso» a caso, ma ripetibili. */
function scenario(seme: number, passi: number): EventoLinea[] {
  let x = seme
  const caso = (): number => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648 }
  const eventi: EventoLinea[] = []
  let il = 1000
  for (let i = 0; i < passi; i++) {
    il += Math.round(caso() * 20_000)
    const c = caso()
    eventi.push(c < 0.45 ? { tipo: 'ok', il, ritardoMs: Math.round(caso() * 1500) } : c < 0.9 ? { tipo: 'errore', il, motivo: 'irraggiungibile', messaggio: 'giù' } : { tipo: 'riprova-adesso', il })
  }
  return eventi
}

describe('la pagina e il PC hanno la stessa macchina del collegamento', () => {
  it('su duecento cadute e ritorni simulati: stessa fase, tentativi, attese, storia e qualità', () => {
    for (const seme of [1, 7, 42, 2026]) {
      let a: Linea = LINEA_NUOVA
      let b: Record<string, unknown> = { fase: 'cerco', tentativo: 0, misure: [], storia: [] }
      for (const e of scenario(seme, 200)) {
        a = passo(a, e)
        b = pagina.passoLinea(b, e)
        expect(b.fase).toBe(a.fase)
        expect(b.tentativo).toBe(a.tentativo)
        expect(b.prossimoIl).toBe(a.fase === 'ricollego' ? a.prossimoIl : undefined)
        expect(b.cadutaIl).toBe(a.fase === 'ricollego' ? a.cadutaIl : undefined)
        expect((b.storia as { tipo: string }[]).map((s) => s.tipo)).toEqual(a.storia.map((s) => s.tipo))
        expect(pagina.qualitaLinea(b.misure)).toEqual(qualita(a.misure))
        expect(pagina.eOraLinea(b, e.il - 1500, e.il + 700)).toBe(eOra(a, e.il - 1500, e.il + 700))
      }
    }
  })
})

describe('la coda della pagina', () => {
  it('la rete cade dopo che il computer ha scritto: rimandato con lo stesso id, nel terminale una volta sola', async () => {
    const scritti: string[] = []
    const rotte = rotteClient({
      dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-lin-'))),
      chat: () => [{ id: 'p-1', titolo: 'Clienti', cwd: 'C:\\x' }],
      scriviAChat: (_c: string, t: string) => { scritti.push(t) }
    } as unknown as DipendenzeRotte)
    let cade = true
    const fetch = async (percorso: string, o: { body?: string }): Promise<unknown> => {
      const e = await rotte({ metodo: 'POST', percorso, corpo: o.body !== undefined ? JSON.parse(o.body) as unknown : undefined, dispositivo: 't1' })
      // La prima volta il computer scrive, ma la risposta non torna.
      if (cade) { cade = false; throw new TypeError('Failed to fetch') }
      return { status: e.stato, ok: e.stato < 300, json: async () => e.corpo }
    }
    const m = new Function('fetch', `
      var chiave = 'k', rifiuti401 = 0, RIFIUTI_PER_ARRENDERSI = 5, ultimoStato = {}, ultimaImpronta = '', notaScelta = null, pinDentro = false
      var storiaLineaAperta = false, firmaLineaVista = ''
      function pannello() {}
      var localStorage = { removeItem() {} }
      function ingresso() {}
      var document = { getElementById: () => null }
      var window = {}
      const ATTESE_LINEA = [1000, 2000, 5000, 10000, 30000]
      const KEEPALIVE_MS = 2000
      ${estrai('async function chiedi(')}
      ${estrai('function attesaPrima(')}
      ${estrai('function passoLinea(')}
      ${estrai('function qualitaLinea(')}
      ${estrai('function fraSecondiLinea(')}
      ${estrai('function firmaLinea(')}
      ${estrai('function ridisegnaLinea(')}
      var linea = { fase: 'collegato', tentativo: 0, misure: [], storia: [] }
      var codaPagina = [{ id: 'm-00000001', chat: 'p-1', testo: 'continua', stato: 'attesa' }]
      ${estrai('async function mandaCoda(')}
      return { mandaCoda, stato: () => ({ linea, codaPagina }), torna: () => { linea = passoLinea(linea, { tipo: 'ok', il: Date.now(), ritardoMs: 20 }) } }
    `)(fetch) as { mandaCoda: () => Promise<void>; stato: () => { linea: { fase: string }; codaPagina: { stato: string }[] }; torna: () => void }
    await m.mandaCoda()
    // Caduta: resta in coda, in attesa, e la linea è giù.
    expect(m.stato().codaPagina.map((v) => v.stato)).toEqual(['attesa'])
    expect(m.stato().linea.fase).toBe('ricollego')
    // Torna: parte di nuovo con lo stesso id; il computer lo riconosce.
    m.torna()
    await m.mandaCoda()
    expect(m.stato().codaPagina).toEqual([])
    expect(scritti).toEqual(['continua'])
  })
  it('la pagina mostra la linea, la fascia con «Riprova adesso», la storia e la mappa', () => {
    expect(script).toContain('onclick="riprovaLinea()"')
    expect(script).toContain('onclick="apriStoriaLinea()"')
    expect(script).toContain('in attesa di invio')
    expect(script).toContain('mappaHtml(saluteVista.mappa)')
    expect(() => new Function(script)).not.toThrow()
  })
})
