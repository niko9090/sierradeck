import { describe, expect, it } from 'vitest'
import { contaLavori, leggiRapportoLavori, WORKSPACE_GENERALE, type RapportoLavori } from '@shared/rapporto-lavori'
import { riassumi, testoRiassunto } from '../../src/main/rapporti-lavori-analisi'

// k-199h: un avvio scrive due «sessione avviata» (programma e servizio): il rapporto contava due riavvii del servizio.
const avvio = (ora: string, chi: 'app' | 'servizio', versione: string): string =>
  `2026-11-20T10:${ora}Z [info] [${chi}] ━━━ sessione avviata · SierraDeck v${versione} · win32 · Node 1 · Electron 1 ━━━`

const generale = (righe: string[]) => contaLavori(righe).workspace[WORKSPACE_GENERALE]!.fermate

describe('riavvii del servizio nel rapporto dei lavori', () => {
  it('un avvio (riga del programma + riga del servizio) è un solo riavvio', () => {
    const f = generale([avvio('00:01', 'app', '1.0.0'), avvio('00:03', 'servizio', '1.0.0')])
    expect(f.riavvii).toBe(1)
  })

  it('la finestra riaperta senza il servizio non è un riavvio del servizio', () => {
    const c = contaLavori([avvio('00:01', 'app', '1.0.0')])
    expect(c.workspace[WORKSPACE_GENERALE]).toBeUndefined()
  })

  it('dice il motivo: aggiornamento, stessa versione, versione precedente ignota', () => {
    const f = generale([
      avvio('00:01', 'servizio', '1.0.0'),
      avvio('00:05', 'servizio', '1.0.0'),
      avvio('00:09', 'servizio', '1.1.0')
    ])
    expect(f.riavvii).toBe(3)
    expect(f.motiviRiavvio).toEqual({
      'avvio con la versione 1.0.0 (la precedente non è nota)': 1,
      'riavvio senza aggiornamento (versione 1.0.0)': 1,
      'aggiornamento da 1.0.0 a 1.1.0': 1
    })
  })

  it('il motivo passa dal rapporto ricevuto e si somma nel riassunto', () => {
    const c = contaLavori([avvio('00:05', 'servizio', '1.0.0'), avvio('00:09', 'servizio', '1.0.0')])
    const r: RapportoLavori = { da: 'PC-X', giorno: '2026-11-20', dal: '2026-11-20T09:00:00Z', al: '2026-11-20T11:00:00Z', workspace: c.workspace }
    const letto = leggiRapportoLavori(JSON.parse(JSON.stringify(r)))
    expect(letto.ok && letto.rapporto.workspace[WORKSPACE_GENERALE]!.fermate.motiviRiavvio).toBeDefined()
    const testo = testoRiassunto('t', riassumi([r, r])!)
    expect(testo).toContain('riavvii: 4')
    expect(testo).toContain('riavvio senza aggiornamento (versione 1.0.0) ×2')
  })

  it('con 0 fermate non scrive «la più lunga 0 s»', () => {
    const c = contaLavori([avvio('00:05', 'servizio', '1.0.0')])
    const r: RapportoLavori = { da: 'PC-X', giorno: '2026-11-20', dal: '2026-11-20T09:00:00Z', al: '2026-11-20T11:00:00Z', workspace: c.workspace }
    const testo = testoRiassunto('t', riassumi([r])!)
    expect(testo).toContain('fermate: 0 · riavvii: 1')
    expect(testo).not.toContain('la più lunga')
  })
})
