import { describe, it, expect } from 'vitest'
import {
  diagnostica, passoAttesaPrompt, tettoAttesaMs, PER_CHAT_IN_AVVIO_MS, SOGLIA_ERRORE_LENTA_MS
} from '../../src/renderer/diagnosi-chat'
import { creaTurni } from '../../src/renderer/turni-avvio'

/**
 * 0.86.2: ~150 «non si apre — lenta: nessun prompt dopo 22 s (previsto 20 s)»
 * a raffica all'avvio, con una quindicina di chat ripristinate insieme e il
 * processore al 100%.
 */

function orologioFinto(): { imposta: (f: () => void, ms: number) => unknown; annulla: (t: unknown) => void; avanza: (ms: number) => void } {
  let adesso = 0
  const timer = new Map<number, { quando: number; f: () => void }>()
  let n = 0
  return {
    imposta: (f, ms) => { n += 1; timer.set(n, { quando: adesso + ms, f }); return n },
    annulla: (t) => { timer.delete(t as number) },
    avanza: (ms) => {
      adesso += ms
      for (const [k, t] of [...timer]) if (t.quando <= adesso) { timer.delete(k); t.f() }
    }
  }
}

describe('turni di avvio: le chat ripartono poche alla volta', () => {
  it('ne partono al massimo tre; le altre aspettano il turno', async () => {
    const turni = creaTurni(3, { orologio: orologioFinto() })
    const rese: (() => void)[] = []
    const partite: number[] = []
    for (let i = 0; i < 5; i += 1) void turni.prendi().then((r) => { partite.push(i); rese.push(r) })
    await Promise.resolve(); await Promise.resolve()
    expect(partite).toEqual([0, 1, 2])
    expect(turni.inAvvio()).toBe(3)
    expect(turni.inCoda()).toBe(2)

    rese[0]?.()
    // Rendere due volte lo stesso turno non ne libera un secondo.
    rese[0]?.()
    await Promise.resolve(); await Promise.resolve()
    expect(partite).toEqual([0, 1, 2, 3])
    expect(turni.inAvvio()).toBe(3)
    expect(turni.inCoda()).toBe(1)
  })

  it('un turno non si tiene per sempre: dopo il tetto si rende da solo', async () => {
    const orologio = orologioFinto()
    const turni = creaTurni(1, { tettoMs: 45_000, orologio })
    const partite: number[] = []
    void turni.prendi().then(() => partite.push(0))
    void turni.prendi().then(() => partite.push(1))
    await Promise.resolve(); await Promise.resolve()
    expect(partite).toEqual([0])
    orologio.avanza(45_000)
    await Promise.resolve(); await Promise.resolve()
    expect(partite).toEqual([0, 1])
  })
})

describe('il tetto dipende dal carico, l errore solo dopo 90 s', () => {
  it('ogni altra chat in avvio concede altri 10 s, fino alla soglia dell errore', () => {
    expect(tettoAttesaMs(1200)).toBe(20_000)
    expect(tettoAttesaMs(1200, 2)).toBe(20_000 + 2 * PER_CHAT_IN_AVVIO_MS)
    expect(tettoAttesaMs(1200, 14)).toBe(SOGLIA_ERRORE_LENTA_MS)
    // Una conversazione enorme tiene il suo doppio anche oltre i 90 s.
    expect(tettoAttesaMs(60_000, 5)).toBe(120_000)
  })

  it('passato il tetto si mostra l avviso, ma la riga rossa solo oltre 90 s, e una volta', () => {
    const base = { tettoMs: 40_000, promptVisto: false, erroreScritto: false }
    expect(passoAttesaPrompt({ ...base, trascorsoMs: 22_000, guasto: undefined })).toBe('niente')
    expect(passoAttesaPrompt({ ...base, trascorsoMs: 41_000, guasto: undefined })).toBe('mostra-lenta')
    expect(passoAttesaPrompt({ ...base, trascorsoMs: 60_000, guasto: 'lenta' })).toBe('niente')
    expect(passoAttesaPrompt({ ...base, trascorsoMs: 91_000, guasto: 'lenta' })).toBe('scrivi-errore')
    expect(passoAttesaPrompt({ ...base, trascorsoMs: 120_000, guasto: 'lenta', erroreScritto: true })).toBe('niente')
  })

  it('il prompt arrivato dopo toglie l avviso «lenta» (e non tocca gli altri guasti)', () => {
    expect(passoAttesaPrompt({ trascorsoMs: 50_000, tettoMs: 20_000, promptVisto: true, guasto: 'lenta', erroreScritto: false })).toBe('togli-lenta')
    expect(passoAttesaPrompt({ trascorsoMs: 50_000, tettoMs: 20_000, promptVisto: true, guasto: 'morta', erroreScritto: false })).toBe('niente')
    expect(passoAttesaPrompt({ trascorsoMs: 50_000, tettoMs: 20_000, promptVisto: true, guasto: undefined, erroreScritto: false })).toBe('niente')
  })

  it('il messaggio dice il previsto vero, non il tetto', () => {
    const d = diagnostica({ tipo: 'lenta', trascorsoMs: 92_000, previstoMs: 2_100, tettoMs: 60_000 }, [])
    expect(d.dettaglio).toContain('nessun prompt dopo 92 s (previsto circa 2 s, avviso dopo 60 s)')
    expect(d.dettaglio).not.toContain('previsto 60 s')
    expect(d.spiegazione).toContain('il previsto era circa 2 s')
  })
})
