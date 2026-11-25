import { describe, it, expect } from 'vitest'
import { componiAvvisi, type FontiAvvisi } from '../../src/renderer/avvisi'
import type { StatoAccesso } from '@shared/accesso-claude'

const SCADE = Date.parse('2027-11-16T12:00:00.000Z')
const con = (stato: 'valido' | 'in-scadenza' | 'scaduto' | 'rifiutato', giorniRimasti = 300): StatoAccesso =>
  ({ stato, creatoIl: SCADE - 365 * 24 * 3600_000, scadeIl: SCADE, giorniRimasti })

function fonti(over: Partial<FontiAvvisi> = {}): FontiAvvisi {
  return {
    accesso: { autenticato: true },
    servizioRaggiungibile: true,
    autopiloti: [],
    preparazione: { claude: 'C:\c\claude.exe', avvisi: [] },
    ...over
  }
}

describe('componiAvvisi: l’accesso a Claude di un anno', () => {
  it('valido, non impostato o non ancora letto: la banda tace', () => {
    expect(componiAvvisi(fonti())).toEqual([])
    expect(componiAvvisi(fonti({ accessoClaude: { stato: 'assente' } }))).toEqual([])
    expect(componiAvvisi(fonti({ accessoClaude: con('valido') }))).toEqual([])
  })

  it('scaduto: avviso col tasto per rinnovare, senza «Chiudi»', () => {
    const a = componiAvvisi(fonti({ accessoClaude: con('scaduto', 0) }))
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ id: 'accesso-claude', gravita: 'blocco', azione: 'rinnovaAccessoClaude', etichettaAzione: 'Rinnova su questo PC' })
    expect(a[0]?.chiavi).toBeUndefined()
  })

  it('rifiutato: stesso avviso', () => {
    expect(componiAvvisi(fonti({ accessoClaude: con('rifiutato') }))[0]).toMatchObject({ id: 'accesso-claude', azione: 'rinnovaAccessoClaude' })
  })

  it('sta per scadere: si chiude con «Chiudi» e non torna per la stessa chiave', () => {
    const a = componiAvvisi(fonti({ accessoClaude: con('in-scadenza', 9) }))
    expect(a[0]).toMatchObject({ id: 'accesso-claude', gravita: 'attenzione' })
    const chiavi = a[0]?.chiavi ?? []
    expect(chiavi).toHaveLength(1)
    expect(componiAvvisi(fonti({ accessoClaude: con('in-scadenza', 9), chiusi: chiavi }))).toEqual([])
    // Negli ultimi tre giorni torna.
    expect(componiAvvisi(fonti({ accessoClaude: con('in-scadenza', 2), chiusi: chiavi }))).toHaveLength(1)
  })

  it('il login normale mancante resta l’unico avviso', () => {
    const a = componiAvvisi(fonti({ accesso: { autenticato: false }, accessoClaude: con('scaduto', 0) }))
    expect(a.map((x) => x.id)).toEqual(['accesso'])
  })
})
