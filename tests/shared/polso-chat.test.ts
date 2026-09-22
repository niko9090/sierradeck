import { describe, expect, it } from 'vitest'
import { avvisiConsumi, costoPerPeriodo, leggiPolso, limitiAggiornati, rigaDiStato } from '../../src/shared/polso-chat'

const ADESSO = Date.parse('2026-09-22T12:00:00+02:00')
const RESET = Math.floor(Date.parse('2026-09-22T14:20:00+02:00') / 1000)

const grezzo = {
  session_id: 's-1',
  model: { id: 'claude-opus-5', display_name: 'Opus 5' },
  cost: { total_cost_usd: 1.2345, total_duration_ms: 1000 },
  context_window: { used_percentage: 42.4, context_window_size: 200000, current_usage: { input_tokens: 80000, cache_read_input_tokens: 4000, output_tokens: 800 } },
  rate_limits: { five_hour: { used_percentage: 63, resets_at: RESET }, seven_day: { used_percentage: 31.2, resets_at: RESET + 86400 * 3 } }
}

describe('leggiPolso', () => {
  it('legge il JSON della riga di stato: modello, costo, contesto, limiti (reset in secondi → ms)', () => {
    const p = leggiPolso(grezzo, ADESSO)
    expect(p).toMatchObject({
      sessione: 's-1', quando: ADESSO, modello: 'Opus 5', costoUsd: 1.2345,
      contesto: { percento: 42, usati: 84800, dimensione: 200000 },
      limiti: { cinqueOre: { percento: 63, resettaIl: RESET * 1000 }, settimana: { percento: 31.2 } }
    })
  })
  it('senza limiti (piano a consumo) resta il resto; senza session_id niente', () => {
    const { rate_limits: _r, ...senza } = grezzo
    expect(leggiPolso(senza, ADESSO)?.limiti).toBeUndefined()
    expect(leggiPolso({ model: {} }, ADESSO)).toBeUndefined()
    expect(leggiPolso('x', ADESSO)).toBeUndefined()
  })
})

describe('rigaDiStato', () => {
  it('e corta e dice quello che serve a decidere se continuare', () => {
    const p = leggiPolso(grezzo, ADESSO)
    expect(p && rigaDiStato(p, ADESSO)).toBe('Opus 5 · contesto 42% · 5 ore 63% (azzera 14:20) · settimana 31% · 1.23 $')
  })
})

describe('limitiAggiornati e costoPerPeriodo', () => {
  it('prende i limiti dal polso piu recente, e una finestra gia azzerata torna a zero', () => {
    const vecchio = { sessione: 'a', quando: ADESSO - 10_000, modello: 'Sonnet', limiti: { cinqueOre: { percento: 90, resettaIl: ADESSO - 1 } } }
    const nuovo = { sessione: 'b', quando: ADESSO - 1000, modello: 'Opus 5', limiti: { cinqueOre: { percento: 63, resettaIl: ADESSO + 3600_000 } } }
    expect(limitiAggiornati([vecchio, nuovo], ADESSO)).toMatchObject({ cinqueOre: { percento: 63 }, modello: 'Opus 5', letti: ADESSO - 1000 })
    expect(limitiAggiornati([vecchio], ADESSO)?.cinqueOre).toEqual({ percento: 0, resettaIl: ADESSO - 1 })
    expect(limitiAggiornati([{ sessione: 'c', quando: ADESSO }], ADESSO)).toBeUndefined()
  })
  it('somma i costi per oggi, settimana e sempre', () => {
    const c = costoPerPeriodo([
      { sessione: 'a', quando: ADESSO, costoUsd: 1 },
      { sessione: 'b', quando: ADESSO - 3 * 86400_000, costoUsd: 2 },
      { sessione: 'c', quando: ADESSO - 30 * 86400_000, costoUsd: 4 },
      { sessione: 'd', quando: ADESSO }
    ], ADESSO)
    expect(c).toEqual({ oggi: 1, settimana: 3, totale: 7, chat: 3 })
  })
})

describe('avvisiConsumi', () => {
  it('avvisa all 80% e al 95%, e la soglia alta vince su quella bassa', () => {
    const a = avvisiConsumi({ limiti: { cinqueOre: { percento: 96, resettaIl: RESET * 1000 }, settimana: { percento: 82 }, letti: ADESSO }, chatAperte: [], adesso: ADESSO })
    expect(a.map((x) => [x.chiave, x.tono])).toEqual([[`5 ore:95:${RESET * 1000}`, 'errore'], ['settimana:80:x', 'attesa']])
    expect(a[0]?.testo).toContain('14:20')
  })
  it('sotto l 80% tace; il contesto quasi pieno di una chat aperta si dice', () => {
    expect(avvisiConsumi({ limiti: { cinqueOre: { percento: 40 }, letti: ADESSO }, chatAperte: [], adesso: ADESSO })).toEqual([])
    const a = avvisiConsumi({ chatAperte: [{ sessione: 'abcdefgh-1', titolo: 'Portfolio', contestoPercento: 93 }, { sessione: 'x', contestoPercento: 50 }], adesso: ADESSO })
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ chiave: 'ctx:abcdefgh-1:90', tono: 'attesa' })
    expect(a[0]?.testo).toContain('«Portfolio»')
  })
})
