import { describe, it, expect } from 'vitest'
import { decidiFumettiDrive, eLavoroAutomatico } from '../../src/renderer/fumetti-sync'
import type { EsitoLavoro, LavoroInCorso } from '../../src/main/cassaforte/lavoro-in-corso'

/**
 * Nicholas (2026-09-15): «si vede che sincronizza con il cloud e
 * l'impaginazione continua a muoversi ed e' veramente scomodo». Il lavoro
 * automatico non si mostra, a meno che non lo si chieda o vada male.
 */
const lavoro = (tipo: LavoroInCorso['tipo']): LavoroInCorso => ({ tipo, fase: 'lavoro', avviato: '2026-09-15T10:00:00.000Z', annullamento: false } as LavoroInCorso)
const esito = (tipo: EsitoLavoro['tipo'], e: EsitoLavoro['esito'], quando = 'q1'): EsitoLavoro => ({ tipo, esito: e, messaggio: '', quando })

describe('i fumetti della sincronia', () => {
  it('salvataggio e arrivo sono automatici, fusione e ripristino no', () => {
    expect(eLavoroAutomatico('salvataggio')).toBe(true)
    expect(eLavoroAutomatico('arrivo')).toBe(true)
    expect(eLavoroAutomatico('fusione')).toBe(false)
    expect(eLavoroAutomatico('ripristino')).toBe(false)
  })

  it('IL PUNTO: il salvataggio automatico non si vede; con la preferenza accesa e una pillola', () => {
    expect(decidiFumettiDrive({ inCorso: lavoro('salvataggio'), automaticiVisibili: false })).toEqual({})
    expect(decidiFumettiDrive({ inCorso: lavoro('arrivo'), automaticiVisibili: false })).toEqual({})
    expect(decidiFumettiDrive({ inCorso: lavoro('salvataggio'), automaticiVisibili: true })).toEqual({ lavoro: 'pillola' })
  })

  it('un lavoro chiesto da te ha sempre il fumetto pieno', () => {
    expect(decidiFumettiDrive({ inCorso: lavoro('fusione'), automaticiVisibili: false })).toEqual({ lavoro: 'pieno' })
    expect(decidiFumettiDrive({ inCorso: lavoro('ripristino'), automaticiVisibili: true })).toEqual({ lavoro: 'pieno' })
  })

  it('l esito: di un lavoro tuo sempre, di uno automatico solo se e andato male, mai lo stesso due volte', () => {
    expect(decidiFumettiDrive({ ultimo: esito('salvataggio', 'ok'), automaticiVisibili: true })).toEqual({})
    expect(decidiFumettiDrive({ ultimo: esito('salvataggio', 'errore'), automaticiVisibili: false }).esito?.esito).toBe('errore')
    expect(decidiFumettiDrive({ ultimo: esito('fusione', 'ok'), automaticiVisibili: false }).esito?.tipo).toBe('fusione')
    expect(decidiFumettiDrive({ ultimo: esito('fusione', 'ok', 'q1'), esitoVisto: 'q1', automaticiVisibili: false })).toEqual({})
  })

  it('mentre un lavoro e in corso non si mostra l esito di quello prima', () => {
    const d = decidiFumettiDrive({ inCorso: lavoro('fusione'), ultimo: esito('fusione', 'errore'), automaticiVisibili: false })
    expect(d).toEqual({ lavoro: 'pieno' })
  })
})
