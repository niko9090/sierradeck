import { describe, expect, it } from 'vitest'
import { giroRapportoLavori, type StatoRapporto } from '../../src/main/rapporti-lavori'
import type { RapportoLavori } from '../../src/shared/rapporto-lavori'

const T0 = Date.parse('2026-11-23T12:00:00Z')
const riga = (ora: string, testo: string): string => `2026-11-23T${ora}Z [info] [servizio] ${testo}`

function giro(righe: string[], stato: StatoRapporto | undefined) {
  let s = stato
  const mandati: RapportoLavori[] = []
  const esegui = () => giroRapportoLavori({
    righe: () => righe,
    stato: { leggi: () => s, scrivi: (x) => { s = x } },
    pcRiferimento: () => 'pc-a',
    adesso: () => T0,
    da: () => 'PC',
    versione: '0.117.2',
    manda: async (r) => { mandati.push(r); return { ok: true, messaggio: 'Mandato' } },
    log: () => {},
    forza: true
  })
  return { esegui, stato: () => s, mandati }
}

describe('giroRapportoLavori: ricorda la versione avviata', () => {
  it('la salva anche quando il rapporto non parte perché non ci sono intoppi', async () => {
    const p = giro([riga('10:00:00', '━━━ sessione avviata · SierraDeck v0.117.2')], { fino: '2026-11-23T00:00:00.000Z', versioneAvviata: '0.117.1' })
    const e = await p.esegui()
    expect(e.messaggio).toMatch(/Nessun intoppo/)
    expect(p.mandati).toHaveLength(0)
    expect(p.stato()?.versioneAvviata).toBe('0.117.2')
  })

  it('passa la versione di prima a contaLavori e la salva dopo l’invio', async () => {
    const p = giro([
      riga('10:00:00', '━━━ sessione avviata · SierraDeck v0.117.2'),
      riga('10:01:00', '[servizio] fermo 90 s senza rispondere')
    ], { fino: '2026-11-23T00:00:00.000Z', versioneAvviata: '0.117.1' })
    await p.esegui()
    expect(p.mandati[0]?.workspace['generale']?.fermate.motiviRiavvio).toEqual({ 'aggiornamento da 0.117.1 a 0.117.2': 1 })
    expect(p.stato()?.versioneAvviata).toBe('0.117.2')
  })

  it('uno stato vecchio senza il campo funziona come prima', async () => {
    const p = giro([riga('10:00:00', '━━━ sessione avviata · SierraDeck v0.117.2')], { fino: '2026-11-23T00:00:00.000Z' })
    await p.esegui()
    expect(p.stato()?.versioneAvviata).toBe('0.117.2')
  })
})
