import { describe, it, expect } from 'vitest'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import { autopilotaLeggero, CODA_LEGGERA, conIntero, eTroncato, firmaStoria } from '@shared/autopilota-leggero'

/** Un autopilota con `n` decisioni, una al secondo. */
function con(n: number, extra: Partial<Autopilota> = {}): Autopilota {
  const base = nuovoAutopilota({ id: 'ap-1', nome: 'N', obiettivo: 'O', cwd: 'C:\\p', criteri: [], iniziatoIl: '2026-10-01T00:00:00.000Z' })
  const decisioni = Array.from({ length: n }, (_, i) => ({ quando: new Date(Date.UTC(2026, 9, 1, 0, 0, i)).toISOString(), cosa: `mossa ${i}` }))
  return { ...base, decisioni, ...extra }
}

describe('l’elenco leggero degli autopiloti (0.85.2)', () => {
  it('un autopilota corto resta com’è, senza `troncati`', () => {
    const a = con(3)
    expect(autopilotaLeggero(a)).toBe(a)
    expect(eTroncato(a)).toBe(false)
  })

  it('di un autopilota lungo tiene la coda e dice quanto era lungo', () => {
    const l = autopilotaLeggero(con(500))
    expect(l.decisioni).toHaveLength(CODA_LEGGERA.decisioni)
    expect(l.decisioni.at(-1)?.cosa).toBe('mossa 499')
    expect(l.troncati).toEqual({ decisioni: 500, dialogo: 0, modifiche: 0 })
    expect(eTroncato(l)).toBe(true)
  })

  it('con l’intero rimette la storia tutta; i campi freschi vengono dall’elenco', () => {
    const intero = con(500)
    const leggero = { ...autopilotaLeggero(intero), stato: 'sospeso' as const }
    const unito = conIntero(leggero, intero)
    expect(unito.decisioni).toHaveLength(500)
    expect(unito.stato).toBe('sospeso')
    expect('troncati' in unito).toBe(false)
  })

  it('un dettaglio indietro si allunga con le voci nuove della coda, mai una riga persa', () => {
    const vecchio = con(500)
    const leggero = autopilotaLeggero(con(503))
    const unito = conIntero(leggero, vecchio)
    expect(unito.decisioni).toHaveLength(503)
    expect(unito.decisioni.at(-1)?.cosa).toBe('mossa 502')
  })

  it('una voce della coda riscritta si vede subito, anche col dettaglio di prima', () => {
    const intero = con(500)
    const fresco = con(500)
    fresco.decisioni[499] = { ...fresco.decisioni[499]!, cosa: 'mossa 499, riscritta' }
    const unito = conIntero(autopilotaLeggero(fresco), intero)
    expect(unito.decisioni).toHaveLength(500)
    expect(unito.decisioni.at(-1)?.cosa).toBe('mossa 499, riscritta')
  })

  it('senza dettaglio, o di un altro, resta quello dell’elenco', () => {
    const l = autopilotaLeggero(con(500))
    expect(conIntero(l, undefined)).toBe(l)
    expect(conIntero(l, { ...con(500), id: 'ap-2' })).toBe(l)
  })

  it('la firma della storia cambia con una voce nuova, non con i segni di vita', () => {
    const l = autopilotaLeggero(con(500))
    const conSegno = { ...l, ultimoSegno: '2026-10-29T10:00:00.000Z' } as Autopilota
    expect(firmaStoria(conSegno)).toBe(firmaStoria(l))
    expect(firmaStoria(autopilotaLeggero(con(501)))).not.toBe(firmaStoria(l))
  })
})
