import { describe, expect, it } from 'vitest'
import { soloTransizioni } from '../../src/renderer/progresso-sync'
import type { StatoLavoro } from '../../src/main/cassaforte/lavoro-in-corso'

/**
 * L'App si ridisegna quando un lavoro comincia, cambia tipo o finisce: il
 * progresso file per file lo segue la striscia, da sola.
 */
describe('l’App vede solo le transizioni del lavoro', () => {
  const inCorso = (fatto: number): StatoLavoro => ({ inCorso: { tipo: 'fusione', avviato: 'T', fase: 'carico', fatto, totale: 9, annullamento: false } })

  it('lo stesso lavoro che avanza non e’ una transizione', () => {
    const prima = inCorso(1)
    expect(soloTransizioni(prima, inCorso(2))).toBe(prima)
  })

  it('inizio, fine e cambio di tipo lo sono', () => {
    const fermo: StatoLavoro = {}
    expect(soloTransizioni(fermo, inCorso(1))).toEqual(inCorso(1))
    const finito: StatoLavoro = { ultimo: { tipo: 'fusione', esito: 'ok', messaggio: '', quando: 'T2' } }
    expect(soloTransizioni(inCorso(3), finito)).toBe(finito)
    const altro: StatoLavoro = { inCorso: { tipo: 'salvataggio', avviato: 'T3', fase: 'preparo', annullamento: false } }
    expect(soloTransizioni(inCorso(3), altro)).toBe(altro)
  })

  it('un esito nuovo con lo stesso lavoro in corso passa (serve al riavvio)', () => {
    const a: StatoLavoro = { ...inCorso(1), ultimo: { tipo: 'fusione', esito: 'ok', messaggio: '', quando: 'T1' } }
    const b: StatoLavoro = { ...inCorso(2), ultimo: { tipo: 'fusione', esito: 'ok', messaggio: '', quando: 'T2' } }
    expect(soloTransizioni(a, b)).toBe(b)
  })
})
