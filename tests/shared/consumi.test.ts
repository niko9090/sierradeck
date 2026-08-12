import { describe, it, expect } from 'vitest'
import { riassumiConsumi, formattaToken } from '@shared/consumi'
import type { SessionSummary } from '@shared/types'

const ADESSO = Date.parse('2026-08-09T20:00:00.000Z')

function s(over: Partial<SessionSummary> = {}): SessionSummary {
  return {
    uuid: 'u-1', projectSlug: 'C--p', projectPath: 'C:\\progetto',
    aiTitle: undefined, cwd: 'C:\\progetto', gitBranch: undefined, model: undefined,
    permissionMode: undefined, claudeVersion: undefined, messageCount: 10,
    firstTimestamp: '2026-08-09T10:00:00.000Z', lastTimestamp: '2026-08-09T12:00:00.000Z',
    inputTokens: 1000, outputTokens: 500, cacheReadTokens: 8000, cacheWriteTokens: 200,
    primoPrompt: undefined, mtimeMs: 0, jsonlPath: 'x.jsonl', sizeBytes: 0, skippedLines: 0,
    ...over
  }
}

describe('riassumiConsumi', () => {
  it('somma i token di oggi', () => {
    const r = riassumiConsumi([s(), s({ uuid: 'u-2' })], ADESSO)
    expect(r.oggi.ingresso).toBe(2000)
    expect(r.oggi.uscita).toBe(1000)
    expect(r.oggi.cache).toBe(16400)
  })

  it('non conta ieri fra oggi', () => {
    const r = riassumiConsumi([s({ lastTimestamp: '2026-08-08T12:00:00.000Z' })], ADESSO)
    expect(r.oggi.ingresso).toBe(0)
    expect(r.settimana.ingresso).toBe(1000)
  })

  it('la settimana copre sette giorni indietro', () => {
    const r = riassumiConsumi([
      s({ uuid: 'a', lastTimestamp: '2026-08-04T12:00:00.000Z' }),
      s({ uuid: 'b', lastTimestamp: '2026-07-20T12:00:00.000Z' })
    ], ADESSO)
    expect(r.settimana.ingresso).toBe(1000)
    expect(r.totale.ingresso).toBe(2000)
  })

  it('elenca i progetti che consumano di piu, dal primo', () => {
    const r = riassumiConsumi([
      s({ uuid: 'a', projectPath: 'C:\\piccolo', inputTokens: 100, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 }),
      s({ uuid: 'b', projectPath: 'C:\\grande', inputTokens: 5000, outputTokens: 5000, cacheReadTokens: 0, cacheWriteTokens: 0 })
    ], ADESSO)
    expect(r.perProgetto[0]?.progetto).toBe('grande')
    expect(r.perProgetto[0]?.token).toBe(10000)
  })

  it('conta le chat, non i file', () => {
    // Due sessioni della stessa conversazione sono una chat sola: il numero
    // serve a farsi un'idea, e contare i file la gonfierebbe.
    const r = riassumiConsumi([
      s({ uuid: 'a', aiTitle: 'Stessa chat' }),
      s({ uuid: 'b', aiTitle: 'Stessa chat' }),
      s({ uuid: 'c', aiTitle: 'Altra' })
    ], ADESSO)
    expect(r.oggi.chat).toBe(2)
  })

  it('regge una sessione senza data invece di perderla nel totale', () => {
    const r = riassumiConsumi([s({ lastTimestamp: undefined })], ADESSO)
    expect(r.totale.ingresso).toBe(1000)
    expect(r.oggi.ingresso).toBe(0)
  })

  it('non solleva su un elenco vuoto', () => {
    const r = riassumiConsumi([], ADESSO)
    expect(r.totale.ingresso).toBe(0)
    expect(r.perProgetto).toEqual([])
  })
})

describe('formattaToken', () => {
  it('scrive i numeri piccoli per intero', () => {
    expect(formattaToken(842)).toBe('842')
  })

  it('accorcia le migliaia e i milioni', () => {
    expect(formattaToken(12_400)).toBe('12,4k')
    expect(formattaToken(3_450_000)).toBe('3,5M')
  })

  it('zero resta zero', () => {
    expect(formattaToken(0)).toBe('0')
  })
})

describe('nomi dei progetti', () => {
  it('non produce righe senza nome', () => {
    // Un percorso che finisce con la barra darebbe una riga vuota nel pannello:
    // una barra senza etichetta e' un dato che non si puo' usare.
    const r = riassumiConsumi([
      s({ uuid: 'a', projectPath: 'C:\\progetto\\' }),
      s({ uuid: 'b', projectPath: 'C:\\' })
    ], ADESSO)
    expect(r.perProgetto.every((p) => p.progetto.trim() !== '')).toBe(true)
  })
})
