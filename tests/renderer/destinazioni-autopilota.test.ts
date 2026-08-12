import { describe, it, expect } from 'vitest'
import { destinazioni, RECENTI_MAX } from '../../src/renderer/destinazioni-autopilota'
import type { SessionSummary } from '@shared/types'
import type { PaneData } from '../../src/renderer/state/layout'

function riquadro(over: Partial<PaneData> = {}): PaneData {
  return { id: 'p-1', sessionUuid: 's-1', cwd: 'C:\\lavoro\\gestore', title: 'Gestore', ...over }
}

function sessione(over: Partial<SessionSummary> = {}): SessionSummary {
  return {
    uuid: 'u-1',
    projectSlug: 'C--lavoro-portfolio',
    projectPath: 'C:\\lavoro\\portfolio',
    aiTitle: 'Grafici',
    cwd: 'C:\\lavoro\\portfolio',
    gitBranch: undefined,
    model: undefined,
    permissionMode: undefined,
    claudeVersion: undefined,
    messageCount: 3,
    firstTimestamp: '2026-08-01T10:00:00.000Z',
    lastTimestamp: '2026-08-01T12:00:00.000Z',
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    primoPrompt: undefined,
    mtimeMs: 0,
    jsonlPath: 'x.jsonl',
    sizeBytes: 0,
    skippedLines: 0,
    ...over
  }
}

describe('destinazioni', () => {
  it('mette per prime le chat aperte adesso', () => {
    // Chi preme «nuovo autopilota» sta guardando una chat che ha davanti: quella
    // deve essere la prima voce, non una fra novanta cartelle passate.
    const d = destinazioni([riquadro()], [sessione()])
    expect(d[0]?.cwd).toBe('C:\\lavoro\\gestore')
    expect(d[0]?.aperta).toBe(true)
  })

  it('mostra il titolo della chat aperta, non solo la cartella', () => {
    const d = destinazioni([riquadro({ title: 'Rifattorizzazione' })], [])
    expect(d[0]?.dettaglio).toBe('Rifattorizzazione')
  })

  it('non ripete un progetto gia offerto fra le chat aperte', () => {
    const d = destinazioni(
      [riquadro({ cwd: 'C:\\lavoro\\portfolio' })],
      [sessione({ projectPath: 'C:\\lavoro\\portfolio', cwd: 'C:\\lavoro\\portfolio' })]
    )
    expect(d).toHaveLength(1)
  })

  it('non ripete due riquadri sulla stessa cartella', () => {
    // Due terminali sullo stesso progetto sono una destinazione sola:
    // l'autopilota lavora su una cartella, non su un riquadro.
    const d = destinazioni([riquadro({ id: 'a' }), riquadro({ id: 'b', title: 'Altro' })], [])
    expect(d).toHaveLength(1)
  })

  it('offre i progetti dell indice, dal piu recente', () => {
    const d = destinazioni([], [
      sessione({ uuid: 'a', projectPath: 'C:\\vecchio', cwd: 'C:\\vecchio', lastTimestamp: '2026-08-01T10:00:00.000Z' }),
      sessione({ uuid: 'b', projectPath: 'C:\\recente', cwd: 'C:\\recente', lastTimestamp: '2026-08-09T10:00:00.000Z' })
    ])
    expect(d.map((x) => x.etichetta)).toEqual(['recente', 'vecchio'])
    expect(d.every((x) => x.aperta === false)).toBe(true)
  })

  it('dice quante chat ha un progetto dell indice', () => {
    const d = destinazioni([], [sessione({ uuid: 'a', aiTitle: 'Una' }), sessione({ uuid: 'b', aiTitle: 'Due' })])
    expect(d[0]?.dettaglio).toBe('2 chat')
  })

  it('taglia i progetti passati a un elenco che si legge', () => {
    // Diciassette cartelle in una tendina sono un elenco che si scorre, non che
    // si sceglie: le recenti bastano, il resto si scrive a mano.
    const molte = Array.from({ length: RECENTI_MAX + 5 }, (_, i) =>
      sessione({ uuid: `u-${i}`, projectPath: `C:\\p${i}`, cwd: `C:\\p${i}` })
    )
    expect(destinazioni([], molte)).toHaveLength(RECENTI_MAX)
  })

  it('non conta le chat aperte nel tetto dei progetti passati', () => {
    // Sono ciò che si sta guardando: toglierle per far posto allo storico
    // sarebbe esattamente al contrario.
    const molte = Array.from({ length: RECENTI_MAX + 5 }, (_, i) =>
      sessione({ uuid: `u-${i}`, projectPath: `C:\\p${i}`, cwd: `C:\\p${i}` })
    )
    const d = destinazioni([riquadro({ cwd: 'C:\\aperta' })], molte)
    expect(d).toHaveLength(RECENTI_MAX + 1)
    expect(d[0]?.cwd).toBe('C:\\aperta')
  })

  it('regge una sessione senza cwd usando la cartella del progetto', () => {
    const d = destinazioni([], [sessione({ cwd: undefined, projectPath: 'C:\\solo\\progetto' })])
    expect(d[0]?.cwd).toBe('C:\\solo\\progetto')
  })

  it('non solleva su elenchi vuoti', () => {
    expect(destinazioni([], [])).toEqual([])
  })
})
