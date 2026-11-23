import { describe, expect, it } from 'vitest'
import { contaLavori, segnoWorkspace, WORKSPACE_GENERALE } from '../../src/shared/rapporto-lavori'
import { conWorkspaceDiLog, segnoDiLog, workspaceDiLog } from '../../src/autopilot-host/contesto-log'

const riga = (ora: string, testo: string): string => `2026-11-23T${ora}Z [info] [servizio] ${testo}`

describe('k-193e: unioni e criteri per workspace nel rapporto dei lavori', () => {
  it('le righe con il segno vanno sotto il loro workspace', () => {
    const c = contaLavori([
      riga('10:00:00', '[unione di prova] [ws: alfa] ramo-1: attesa del turno 2 s, prova 30 s'),
      riga('10:01:00', '[unione di prova] [ws: beta] ramo-2: attesa del turno 0 s, prova 10 s (scaduta mentre stava per misurare)'),
      riga('10:02:00', '[criterio] [ws: alfa] finito con 0 in 5 s: npm test'),
      riga('10:03:00', '[criterio] [ws: beta] finito con 1 in 7 s: npm test'),
      riga('10:04:00', '[criterio] [ws: beta] aspetta il suo turno dietro 2 comandi lunghi: npm test'),
      riga('10:05:00', '[criterio] [ws: beta] «prova» rosso per tempo scaduto: lo rimisuro una volta')
    ])
    expect(Object.keys(c.workspace).sort()).toEqual(['alfa', 'beta'])
    expect(c.workspace.alfa?.unioni.prove).toBe(1)
    expect(c.workspace.alfa?.criteri.riusciti).toBe(1)
    expect(c.workspace.beta?.unioni.scadute).toBe(1)
    expect(c.workspace.beta?.criteri).toMatchObject({ finiti: 0, rossi: 0, inAttesa: 1, scaduti: 1 })
    expect(c.workspace[WORKSPACE_GENERALE]).toBeUndefined()
    expect(c.righe).toBe(6)
  })

  it('le righe vecchie, senza segno, restano sotto «generale»', () => {
    const c = contaLavori([
      riga('10:00:00', '[unione di prova] ramo-1: attesa del turno 1 s, prova 4 s'),
      riga('10:01:00', '[criterio] finito con 0 in 3 s: npm test'),
      riga('10:02:00', '[criterio] aspetta il suo turno dietro 1 comandi lunghi: npm test'),
      riga('10:03:00', '[unione di prova] [ws: alfa] ramo-3: attesa del turno 1 s, prova 2 s')
    ])
    expect(c.workspace[WORKSPACE_GENERALE]?.unioni.prove).toBe(1)
    expect(c.workspace[WORKSPACE_GENERALE]?.criteri).toMatchObject({ finiti: 1, inAttesa: 1 })
    expect(c.workspace.alfa?.unioni.prove).toBe(1)
  })

  it('il segno si compone e si rilegge, anche con nomi strani', () => {
    expect(segnoWorkspace('alfa')).toBe('[ws: alfa] ')
    expect(segnoWorkspace('  ')).toBe('')
    const s = segnoWorkspace('a]b\nc')
    const c = contaLavori([riga('10:00:00', `[criterio] ${s}finito con 0 in 1 s: x`)])
    expect(Object.keys(c.workspace)).toEqual(['a b c'])
  })

  it('il contesto di log porta il workspace dentro le chiamate asincrone', async () => {
    expect(segnoDiLog()).toBe('')
    const visto = await conWorkspaceDiLog('gamma', async () => {
      await Promise.resolve()
      return [workspaceDiLog(), segnoDiLog()]
    })
    expect(visto).toEqual(['gamma', '[ws: gamma] '])
    expect(workspaceDiLog()).toBeUndefined()
  })
})
