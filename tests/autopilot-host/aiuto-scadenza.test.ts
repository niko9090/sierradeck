import { describe, it, expect } from 'vitest'
import { LAVORO_MAX_MS } from '../../src/shared/aiuto-rete'
import { causaRiassegnabile } from '../../src/shared/aiuto-esito'
import {
  causaScadenza, scadenzaIniziale, scadenzaRaggiunta, scadenzaSegno, scadenzaTick, TICK_SCADENZA_MS, type StatoScadenza
} from '../../src/shared/aiuto-scadenza'

const ORA = 60 * 60_000

/** Fa passare `ms` di PC sveglio, un controllo ogni giro; ogni `ogniSegno` ms lo specialista scrive una riga. */
function lavora(s: StatoScadenza, ms: number, ogniSegno?: number): StatoScadenza {
  let r = s
  for (let t = 0; t < ms; t += TICK_SCADENZA_MS) {
    const ora = r.ultimoTick + TICK_SCADENZA_MS
    r = scadenzaTick(r, ora)
    if (ogniSegno !== undefined && (t / TICK_SCADENZA_MS) % Math.max(1, Math.round(ogniSegno / TICK_SCADENZA_MS)) === 0) r = scadenzaSegno(r, ora)
  }
  return r
}

describe('la scadenza dei lavori affidati', () => {
  it('un sonno lungo non fa scadere il lavoro', () => {
    let s = lavora(scadenzaIniziale(ORA), 60 * 60_000, 60_000)
    // Il portatile dorme 9 ore: al risveglio il primo controllo salta il buco.
    s = scadenzaTick(s, s.ultimoTick + 9 * 60 * 60_000)
    expect(s.dormito).toBe(true)
    expect(s.svegliMs).toBe(60 * 60_000)
    expect(scadenzaRaggiunta(s, LAVORO_MAX_MS)).toBe(false)
    // E il lavoro può ancora andare avanti per le due ore che restano.
    s = lavora(s, 119 * 60_000, 60_000)
    expect(scadenzaRaggiunta(s, LAVORO_MAX_MS)).toBe(false)
    s = lavora(s, 2 * 60_000, 60_000)
    expect(scadenzaRaggiunta(s, LAVORO_MAX_MS)).toBe(true)
  })

  it('scade dopo un sonno, con lo specialista muto: causa «pc», che si riassegna', () => {
    let s = lavora(scadenzaIniziale(ORA), 2 * 60 * 60_000 + 50 * 60_000, 60_000)
    s = scadenzaTick(s, s.ultimoTick + 8 * 60 * 60_000) // sonno
    // Al risveglio la connessione è caduta: nessuna riga fino alla scadenza.
    s = lavora(s, 15 * 60_000)
    expect(scadenzaRaggiunta(s, LAVORO_MAX_MS)).toBe(true)
    const c = causaScadenza(s, s.ultimoTick)
    expect(c.causa).toBe('pc')
    expect(causaRiassegnabile(c.causa)).toBe(true)
    expect(c.motivo).toContain('addormentato')
  })

  it('3 ore di lavoro vero, con le righe che arrivano: causa «compito», non si riassegna', () => {
    const s = lavora(scadenzaIniziale(ORA), LAVORO_MAX_MS, 60_000)
    expect(scadenzaRaggiunta(s, LAVORO_MAX_MS)).toBe(true)
    const c = causaScadenza(s, s.ultimoTick)
    expect(c).toEqual({ causa: 'compito', motivo: 'ha superato le 3 ore' })
    expect(causaRiassegnabile(c.causa)).toBe(false)
  })

  it('un sonno seguito da lavoro che continua a dare segni resta «compito»', () => {
    let s = lavora(scadenzaIniziale(ORA), 30 * 60_000, 60_000)
    s = scadenzaTick(s, s.ultimoTick + 5 * 60 * 60_000)
    s = lavora(s, LAVORO_MAX_MS, 60_000)
    expect(causaScadenza(s, s.ultimoTick).causa).toBe('compito')
  })

  it('senza sonno, ma muto da più di un’ora: causa «pc»', () => {
    let s = lavora(scadenzaIniziale(ORA), 30 * 60_000, 60_000)
    s = lavora(s, LAVORO_MAX_MS - 30 * 60_000) // 2 ore e mezza senza una riga
    expect(scadenzaRaggiunta(s, LAVORO_MAX_MS)).toBe(true)
    expect(causaScadenza(s, s.ultimoTick).causa).toBe('pc')
  })

  it('un orologio che torna indietro non conta e non rompe niente', () => {
    const s = scadenzaTick(lavora(scadenzaIniziale(ORA), 60_000, 30_000), ORA - 10 * 60_000)
    expect(s.svegliMs).toBe(60_000)
    expect(s.dormito).toBe(false)
  })
})
