import { describe, expect, it } from 'vitest'
import { WORKSPACE_GENERALE, contaLavori, leggiRapportoLavori, type RapportoLavori } from '@shared/rapporto-lavori'
import { riassumi, testoRiassunto } from '../../src/main/rapporti-lavori-analisi'

const riga = (ora: string, corpo: string, fonte = 'app'): string => `2026-11-20T10:${ora}Z [info] [${fonte}] ${corpo}`

describe('rapporti dei lavori: i conti del 23/11', () => {
  it('D1: scaduto e poi verde dà finiti 1, rossi 0, scaduti 1', () => {
    const c = contaLavori([
      riga('00:01', '[criterio] [ws: WsA] finito con 1 in 300 s: npm test'),
      riga('00:02', '[criterio] [ws: WsA] «Test» rosso per tempo scaduto: lo rimisuro una volta'),
      riga('00:03', '[criterio] [ws: WsA] finito con 0 in 120 s: npm test')
    ])
    expect(c.workspace.WsA!.criteri).toMatchObject({ finiti: 1, riusciti: 1, rossi: 0, scaduti: 1 })
  })

  it('D1: scaduto due volte resta rosso, uno solo', () => {
    const c = contaLavori([
      riga('00:01', '[criterio] [ws: WsA] finito con 1 in 300 s: npm test'),
      riga('00:02', '[criterio] [ws: WsA] «Test» rosso per tempo scaduto: lo rimisuro una volta'),
      riga('00:03', '[criterio] [ws: WsA] finito con 1 in 300 s: npm test')
    ])
    expect(c.workspace.WsA!.criteri).toMatchObject({ finiti: 1, rossi: 1, scaduti: 1 })
  })

  it('D1: un rosso vero senza scadenza resta rosso', () => {
    const c = contaLavori([riga('00:01', '[criterio] [ws: WsA] finito con 1 in 5 s: npm test')])
    expect(c.workspace.WsA!.criteri).toMatchObject({ finiti: 1, rossi: 1, nonMisurati: 0 })
  })

  it('D2: «non misurato» dà rossi 0 e nonMisurati 1; le righe vecchie restano rosse', () => {
    const c = contaLavori([
      riga('00:01', '[criterio] [ws: WsA] finito con 127 in 1 s (non misurato: comando assente): npm test'),
      riga('00:02', '[criterio] [ws: WsA] finito con 127 in 1 s: npm test')
    ])
    expect(c.workspace.WsA!.criteri).toMatchObject({ finiti: 2, rossi: 1, nonMisurati: 1 })
  })

  it('D2: il criterio «non misurabile su questo PC (ricordato)» conta come non misurato', () => {
    const c = contaLavori([riga('00:01', '[criterio] [ws: WsA] «Test» non misurabile su questo PC (ricordato): npm test')])
    expect(c.workspace.WsA!.criteri).toMatchObject({ rossi: 0, nonMisurati: 1 })
  })

  it('D4: «sessione avviata» di app e servizio dà un riavvio solo', () => {
    const c = contaLavori([
      riga('00:01', '━━━ sessione avviata · SierraDeck v1 · win32 ━━━', 'app'),
      riga('00:02', '━━━ sessione avviata · SierraDeck v1 · win32 ━━━', 'servizio')
    ])
    expect(c.workspace[WORKSPACE_GENERALE]!.fermate.riavvii).toBe(1)
  })

  it('D5: «(5 volte …)» somma 5; il riassunto parla di rallentamenti, non di fermate', () => {
    const c = contaLavori([
      riga('00:01', '[servizio] fermo 2.4 s senza rispondere (5 volte oltre 1.5 s dall\'ultima riga)', 'servizio'),
      riga('00:02', '[servizio] fermo 1.8 s senza rispondere (1 volta oltre 1.5 s dall\'ultima riga)', 'servizio')
    ])
    const f = c.workspace[WORKSPACE_GENERALE]!.fermate
    expect(f.fermo).toBe(6)
    expect(f.fermoMaxMs).toBe(2400)
    const r: RapportoLavori = { da: 'PC-1', giorno: '2026-11-20', dal: '2026-11-20T09:00:00Z', al: '2026-11-20T11:00:00Z', workspace: c.workspace }
    const testo = testoRiassunto('x', riassumi([r])!)
    expect(testo).toContain('rallentamenti del servizio oltre 1,5 s: 6')
    expect(testo).not.toContain('fermate del programma')
  })

  it('D6: il lavoro fermo non tocca le fermate e ha il suo massimo in minuti', () => {
    const c = contaLavori([
      riga('00:01', '[orchestratore] WsA — lavoro fermo da 3692 minuti: lo sveglio'),
      riga('00:02', '[orchestratore] WsA — lavoro fermo da 15 minuti: lo sveglio'),
      riga('00:03', '[orchestratore] WsA — spinte sospese: 3 senza effetto')
    ])
    const w = c.workspace.WsA!
    expect(w.fermate).toEqual({ fermo: 0, fermoMaxMs: 0, riavvii: 0 })
    expect(w.avanzamento).toMatchObject({ svegli: 2, lavoroFermoMaxMin: 3692, spinteSospese: 3 })
    const r: RapportoLavori = { da: 'PC-1', giorno: '2026-11-20', dal: '2026-11-20T09:00:00Z', al: '2026-11-20T11:00:00Z', workspace: c.workspace }
    const testo = testoRiassunto('x', riassumi([r])!)
    expect(testo).toContain('lavoro fermo più lungo: 3692 min')
    expect(testo).toContain('spinte sospese 3')
  })

  it('i rapporti dei PC con versioni vecchie restano leggibili', () => {
    const vecchio = {
      da: 'PC-1', dal: '2026-11-20T09:00:00Z', al: '2026-11-20T11:00:00Z',
      workspace: { WsA: {
        unioni: {}, criteri: { finiti: 2, riusciti: 1, rossi: 1 }, compiti: {},
        avanzamento: { svegli: 1 }, fermate: { fermo: 2, riavvii: 1 }
      } }
    }
    const l = leggiRapportoLavori(vecchio)
    expect(l.ok).toBe(true)
    if (!l.ok) return
    expect(l.rapporto.workspace.WsA!.criteri).toMatchObject({ finiti: 2, rossi: 1, nonMisurati: 0 })
    expect(l.rapporto.workspace.WsA!.avanzamento).toMatchObject({ svegli: 1, lavoroFermoMaxMin: 0, spinteSospese: 0 })
    const somma = riassumi([l.rapporto])!
    expect(somma.totale.WsA!.criteri.nonMisurati).toBe(0)
    expect(testoRiassunto('x', somma)).toContain('1 ROSSI')
  })
})
