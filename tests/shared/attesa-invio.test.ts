import { describe, expect, it } from 'vitest'
import { ATTESA_BASE_MS, ATTESA_TETTO_MS, attesaDopo, dopoFallimento, eSpazioEsaurito, quantoAspettare, type AttesaInvio } from '../../src/shared/attesa-invio'
import { giroInvioErrori } from '../../src/main/errori-invio-automatico'
import type { StoricoErrori } from '../../src/shared/storico-errori'

describe('attesa crescente dell’invio errori', () => {
  it('raddoppia fino al tetto', () => {
    const m = 60_000
    expect([1, 2, 3, 4, 5, 6, 7, 20].map((n) => attesaDopo(n, 'rete'))).toEqual([ATTESA_BASE_MS, m, 2 * m, 4 * m, 8 * m, 16 * m, ATTESA_TETTO_MS, ATTESA_TETTO_MS])
  })
  it('spazio esaurito o quota piena: subito il tetto', () => {
    expect(eSpazioEsaurito('Drive: storageQuotaExceeded')).toBe(true)
    expect(eSpazioEsaurito('Spazio esaurito sul Drive')).toBe(true)
    expect(eSpazioEsaurito('timeout di rete')).toBe(false)
    expect(attesaDopo(1, 'Spazio esaurito')).toBe(ATTESA_TETTO_MS)
  })
  it('dopoFallimento conta i fallimenti e fissa la scadenza', () => {
    const a = dopoFallimento(undefined, 'rete', 1000)
    expect(a).toEqual({ fallimenti: 1, fino: 1000 + ATTESA_BASE_MS })
    expect(dopoFallimento(a, 'rete', 5000)).toEqual({ fallimenti: 2, fino: 5000 + 2 * ATTESA_BASE_MS })
  })
  it('quantoAspettare', () => {
    expect(quantoAspettare(undefined, 10)).toBe(0)
    expect(quantoAspettare({ fallimenti: 1, fino: 100 }, 40)).toBe(60)
    expect(quantoAspettare({ fallimenti: 1, fino: 100 }, 200)).toBe(0)
  })
})

describe('giroInvioErrori con attesa', () => {
  const T0 = Date.parse('2026-01-10T12:00:00Z')
  const storico: StoricoErrori = { voci: [{ messaggio: 'x', origine: 'main', quando: new Date(T0 - 3_600_000).toISOString(), ultima: new Date(T0 - 3_600_000).toISOString(), volte: 1 }] } as unknown as StoricoErrori
  function prova(esito: { ok: boolean; messaggio: string }) {
    let tempo = T0
    let attesa: AttesaInvio | undefined
    let motivo: string | undefined
    let chiamate = 0
    const righe: string[] = []
    const giro = (forza = false) => giroInvioErrori({
      storico: () => storico,
      stato: { leggi: () => ({ fino: new Date(T0 - 86_400_000).toISOString() }), scrivi: () => {} },
      pcSviluppo: () => 'pc-a',
      adesso: () => tempo,
      manda: async () => { chiamate++; return esito },
      log: (r) => righe.push(r),
      fallimento: { leggi: () => motivo, scrivi: (m) => { motivo = m } },
      attesa: { leggi: () => attesa, scrivi: (a) => { attesa = a } },
      forza
    })
    return { giro, avanza: (ms: number) => { tempo += ms }, chiamate: () => chiamate, righe, attesa: () => attesa }
  }
  it('dopo un fallimento non riprova prima della scadenza, poi allunga', async () => {
    const p = prova({ ok: false, messaggio: 'rete' })
    await p.giro()
    expect(p.chiamate()).toBe(1)
    p.avanza(ATTESA_BASE_MS - 1)
    await p.giro()
    expect(p.chiamate()).toBe(1)
    p.avanza(1)
    await p.giro()
    expect(p.chiamate()).toBe(2)
    expect(p.attesa()?.fallimenti).toBe(2)
    p.avanza(ATTESA_BASE_MS)
    await p.giro()
    expect(p.chiamate()).toBe(2)
    expect(p.righe.length).toBe(1) // stessa riga di registro non ripetuta
  })
  it('quota piena: attende il tetto; «Manda ora» salta l’attesa', async () => {
    const p = prova({ ok: false, messaggio: 'Spazio esaurito' })
    await p.giro()
    p.avanza(ATTESA_TETTO_MS - 1)
    await p.giro()
    expect(p.chiamate()).toBe(1)
    await p.giro(true)
    expect(p.chiamate()).toBe(2)
  })
  it('al primo invio riuscito l’attesa si azzera', async () => {
    const esito = { ok: false, messaggio: 'rete' }
    const p = prova(esito)
    await p.giro()
    p.avanza(ATTESA_BASE_MS)
    esito.ok = true
    esito.messaggio = 'ok'
    await p.giro()
    expect(p.attesa()).toBeUndefined()
  })
})
