import { describe, expect, it } from 'vitest'
import {
  AGGIORNAMENTO_VALE_MS, TESTO_IN_AGGIORNAMENTO, aggiornamentoInCorsoDi, testoAggiornamentoRemoto
} from '../../src/shared/aggiornamento-remoto'
import { descriviSilenzio } from '../../src/shared/pc-remoto'
import { messaggioErroreRemoto, statoPc } from '../../src/shared/scoperta-pc'

const ADESSO = 1_800_000_000_000
const battito = (extra: Record<string, unknown> = {}) => ({ pcId: 'pc-a', nome: 'PC-Prova', versione: '1.0.0', ...extra })

describe('aggiornamentoInCorsoDi', () => {
  it('vale dentro i 15 minuti', () => {
    expect(aggiornamentoInCorsoDi(battito({ aggiornando: { versione: '1.1.0', da: ADESSO - 60_000 } }), ADESSO)).toEqual({ versione: '1.1.0' })
    expect(aggiornamentoInCorsoDi(battito({ aggiornando: { versione: '1.1.0', da: ADESSO - AGGIORNAMENTO_VALE_MS } }), ADESSO)).toEqual({ versione: '1.1.0' })
  })
  it('non vale oltre i 15 minuti', () => {
    expect(aggiornamentoInCorsoDi(battito({ aggiornando: { versione: '1.1.0', da: ADESSO - AGGIORNAMENTO_VALE_MS - 1 } }), ADESSO)).toBeNull()
  })
  it('non vale se è nel futuro lontano', () => {
    expect(aggiornamentoInCorsoDi(battito({ aggiornando: { versione: '1.1.0', da: ADESSO + 3_600_000 } }), ADESSO)).toBeNull()
  })
  it('campo assente o battito sbagliato = null', () => {
    expect(aggiornamentoInCorsoDi(battito(), ADESSO)).toBeNull()
    expect(aggiornamentoInCorsoDi(undefined, ADESSO)).toBeNull()
    expect(aggiornamentoInCorsoDi('x', ADESSO)).toBeNull()
  })
  it('campo malformato = null', () => {
    for (const aggiornando of [null, 5, 'ora', {}, { versione: '1.1.0' }, { versione: '', da: ADESSO }, { versione: 3, da: ADESSO }, { versione: '1.1.0', da: '1' }, { versione: '1.1.0', da: Number.NaN }]) {
      expect(aggiornamentoInCorsoDi(battito({ aggiornando }), ADESSO)).toBeNull()
    }
  })
  it('se il battito dice già la versione nuova, è finito', () => {
    expect(aggiornamentoInCorsoDi(battito({ versione: '1.1.0', aggiornando: { versione: '1.1.0', da: ADESSO - 1000 } }), ADESSO)).toBeNull()
  })
})

describe('testi', () => {
  it('il testo corto e la frase', () => {
    expect(TESTO_IN_AGGIORNAMENTO).toBe('Computer in aggiornamento, attendere')
    expect(testoAggiornamentoRemoto('PC-Prova', '1.1.0')).toBe('PC-Prova: computer in aggiornamento alla 1.1.0, attendere. Riprende da solo.')
    expect(testoAggiornamentoRemoto('PC-Prova', '')).toBe('PC-Prova: computer in aggiornamento, attendere. Riprende da solo.')
  })
})

describe('chi guarda', () => {
  const agg = { versione: '1.1.0' }
  it('descriviSilenzio dice l’aggiornamento al posto di «non risponde»', () => {
    expect(descriviSilenzio('non-so', 'PC-Prova', 120_000, agg).titolo).toBe(TESTO_IN_AGGIORNAMENTO)
    expect(descriviSilenzio('http', 'PC-Prova', 120_000, agg).titolo).toBe(TESTO_IN_AGGIORNAMENTO)
    expect(descriviSilenzio('non-so', 'PC-Prova', 120_000).titolo).toContain('Non so se')
    expect(descriviSilenzio('pin', 'PC-Prova', 1000, agg).titolo).toContain('PIN')
  })
  it('statoPc (scoperta) dà in-aggiornamento, ma se risponde è acceso', () => {
    const base = { nome: 'PC-Prova', ping: { esito: 'muto' as const, provati: [] }, battitoVivo: false, driveCollegato: true, porta: 1 }
    const s = statoPc({ ...base, aggiornando: agg })
    expect(s.stato).toBe('in-aggiornamento')
    expect(s.titolo).toBe(TESTO_IN_AGGIORNAMENTO)
    expect(s.aggiornando).toEqual(agg)
    expect(statoPc(base).stato).toBe('non-so')
    expect(statoPc({ ...base, ping: { esito: 'risponde', indirizzo: 'x' }, aggiornando: agg }).stato).toBe('acceso')
  })
  it('messaggioErroreRemoto dà la frase intera', () => {
    expect(messaggioErroreRemoto('non-so', 'PC-Prova', undefined, agg)).toBe(testoAggiornamentoRemoto('PC-Prova', '1.1.0'))
    expect(messaggioErroreRemoto('non-so', 'PC-Prova')).not.toContain('aggiornamento')
  })
})
