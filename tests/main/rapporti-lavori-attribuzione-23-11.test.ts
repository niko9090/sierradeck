import { describe, expect, it } from 'vitest'
import { RUOLO_NON_NOTO, WORKSPACE_GENERALE, contaLavori, segnoWorkspace, type RapportoLavori } from '@shared/rapporto-lavori'
import { riassumi, testoRiassunto } from '../../src/main/rapporti-lavori-analisi'

const riga = (ora: string, corpo: string, fonte = 'app'): string => `2026-11-20T10:${ora}Z [info] [${fonte}] ${corpo}`

describe('rapporti dei lavori: ruoli', () => {
  it('conta gli affidamenti per ruolo', () => {
    const c = contaLavori([
      riga('00:01', '[aiuto] WsA — sviluppatore affidato a PC-1 (Aiutante, 2 posti liberi là, compito k-1)'),
      riga('00:02', '[aiuto] WsA — sviluppatore affidato a PC-2 (Aiutante, 1 posti liberi là)'),
      riga('00:03', '[aiuto] WsA — revisore affidato a PC-1 (Aiutante, 2 posti liberi là, compito k-2)')
    ])
    expect(c.workspace.WsA!.compiti.ruoli).toEqual({ sviluppatore: 2, revisore: 1 })
    expect(c.workspace.WsA!.compiti.affidati).toBe(3)
  })

  it('le righe vecchie con l’id del compito non diventano ruoli', () => {
    const c = contaLavori([
      riga('00:01', '[aiuto] WsA — k-178e affidato a PC-1 (Aiutante, 2 posti liberi là)'),
      riga('00:02', '[aiuto] WsA — k-191 affidato a PC-1 (Aiutante, 2 posti liberi là)'),
      riga('00:03', '[aiuto] WsA — android affidato a PC-1 (Aiutante, 2 posti liberi là)')
    ])
    expect(c.workspace.WsA!.compiti.ruoli).toEqual({ [RUOLO_NON_NOTO]: 2, android: 1 })
  })

  it('i rapporti già arrivati con l’id nel ruolo finiscono sotto «ruolo non noto» nel riassunto', () => {
    const base = riga('00:01', '[aiuto] WsA — x affidato a PC-1 (Aiutante, 1 posti liberi là)')
    const c = contaLavori([base])
    c.workspace.WsA!.compiti.ruoli = { 'k-178e': 4, 'k-191': 1, sviluppatore: 2 }
    const r: RapportoLavori = { da: 'PC-X', giorno: '2026-11-20', dal: '2026-11-20T09:00:00Z', al: '2026-11-20T11:00:00Z', workspace: c.workspace }
    const s = riassumi([r])!
    expect(s.totale.WsA!.compiti.ruoli).toEqual({ sviluppatore: 2, [RUOLO_NON_NOTO]: 5 })
    const testo = testoRiassunto('t', s)
    expect(testo).toContain(`per ruolo: ${RUOLO_NON_NOTO} ×5, sviluppatore ×2`)
    expect(testo).not.toContain('k-178e')
  })
})

describe('rapporti dei lavori: workspace delle unioni, dei criteri e delle fermate', () => {
  it('unioni e criteri con il segno finiscono sotto il loro workspace', () => {
    const c = contaLavori([
      riga('00:01', `[unione di prova] ${segnoWorkspace('WsA')}ramo-1: attesa del turno 3 s, prova 40 s`),
      riga('00:02', `[unione di prova] ${segnoWorkspace('WsB')}ramo-2: attesa del turno 5 s, prova 90 s (scaduta mentre stava per confermare)`),
      riga('00:03', `[criterio] ${segnoWorkspace('WsA')}finito con 0 in 20 s: npm test`),
      riga('00:04', `[criterio] ${segnoWorkspace('WsB')}finito con 1 in 30 s: npm test`),
      riga('00:05', `[criterio] ${segnoWorkspace('WsB')}aspetta il suo turno dietro 2 comandi lunghi: npm test`),
      riga('00:06', `[criterio] ${segnoWorkspace('WsA')}«suite» rosso per tempo scaduto: lo rimisuro una volta`)
    ])
    const a = c.workspace.WsA!, b = c.workspace.WsB!
    expect(a.unioni).toMatchObject({ prove: 1, provaMs: 40_000, scadute: 0 })
    expect(b.unioni).toMatchObject({ prove: 1, provaMs: 90_000, scadute: 1 })
    expect(a.criteri).toMatchObject({ finiti: 1, riusciti: 1, scaduti: 1 })
    expect(b.criteri).toMatchObject({ finiti: 1, rossi: 1, inAttesa: 1 })
    expect(c.workspace[WORKSPACE_GENERALE]).toBeUndefined()
  })

  it('le righe senza workspace restano nelle generali', () => {
    const c = contaLavori([
      riga('00:01', '[unione di prova] ramo-1: attesa del turno 3 s, prova 40 s'),
      riga('00:02', '[criterio] finito con 0 in 20 s: npm test'),
      riga('00:03', '[servizio] fermo 12.5 s senza rispondere (1 volta oltre 10 s dall\'ultima riga)', 'servizio'),
      riga('00:04', '━━━ sessione avviata · SierraDeck v1 · win32 · Node 1 · Electron 1 ━━━', 'servizio')
    ])
    const g = c.workspace[WORKSPACE_GENERALE]!
    expect(g.unioni.prove).toBe(1)
    expect(g.criteri.finiti).toBe(1)
    expect(g.fermate).toMatchObject({ fermo: 1, fermoMaxMs: 12_500, riavvii: 1 })
    expect(Object.keys(c.workspace)).toEqual([WORKSPACE_GENERALE])
  })

  it('il riassunto mette la durata delle prove sotto il workspace e solo il generale sotto «senza workspace»', () => {
    const c = contaLavori([
      riga('00:01', `[unione di prova] ${segnoWorkspace('WsA')}ramo-1: attesa del turno 3 s, prova 40 s`),
      riga('00:02', '[orchestratore] WsA — il lavoro ha una unione in fila, 2ª'),
      riga('00:03', '━━━ sessione avviata · SierraDeck v1 ━━━', 'servizio')
    ])
    const r: RapportoLavori = { da: 'PC-X', giorno: '2026-11-20', dal: '2026-11-20T09:00:00Z', al: '2026-11-20T11:00:00Z', workspace: c.workspace }
    const testo = testoRiassunto('t', riassumi([r])!)
    const sezioneA = testo.split('### workspace WsA')[1]!.split('###')[0]!
    expect(sezioneA).toContain('unioni: 1 prove')
    expect(sezioneA).toContain('prova media 40 s')
    const generale = testo.split('### senza workspace')[1]!.split('\n## ')[0]!
    expect(generale).toContain('riavvii: 1')
    expect(generale).not.toContain('unioni: ')
  })
})
