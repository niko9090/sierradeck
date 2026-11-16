import { describe, it, expect } from 'vitest'
import { NESSUN_PASSAGGIO, PASSAGGI_VISIBILI, righePassaggi, rigaPassaggio } from '../../src/aiutante/passaggi-finestra'
import type { EventoAiuto } from '../../src/shared/eventi-aiuto'

const ev = (n: number, extra: Partial<EventoAiuto> = {}): EventoAiuto => ({
  quando: new Date(2026, 10, 16, 9, n).toISOString(),
  lavoroId: `l${n}`, compito: `Compito ${n}`, daPc: 'PC-A', aPc: 'PC-B', tipo: 'affidato', motivo: 'ha posti liberi', ...extra
})

describe('passaggi di mano nella finestra', () => {
  it('elenco vuoto: una riga corta', () => {
    expect(righePassaggi([])).toEqual([NESSUN_PASSAGGIO])
  })

  it('la riga ha ora, lavoro, da PC a PC e motivo', () => {
    const r = rigaPassaggio(ev(5, { tipo: 'riassegnato', motivo: 'il PC era pieno' }))
    expect(r).toContain('16/11 09:05')
    expect(r).toContain('Compito 5')
    expect(r).toContain('PC-A → PC-B')
    expect(r).toContain('Passato ad altro PC: il PC era pieno')
  })

  it('senza motivo usa la risorsa mancante', () => {
    expect(rigaPassaggio(ev(1, { tipo: 'risorsa-mancante', motivo: ' ', risorsa: 'il progetto' }))).toContain('manca il progetto')
  })

  it('i più recenti in cima e oltre il tetto una riga di riepilogo', () => {
    const elenco = Array.from({ length: PASSAGGI_VISIBILI + 2 }, (_, i) => ev(i))
    const righe = righePassaggi(elenco)
    expect(righe).toHaveLength(PASSAGGI_VISIBILI + 1)
    expect(righe[0]).toContain(`Compito ${PASSAGGI_VISIBILI + 1}`)
    expect(righe[righe.length - 1]).toBe('…e altri 2')
  })
})
