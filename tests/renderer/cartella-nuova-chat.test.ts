import { describe, it, expect } from 'vitest'
import { cartellaPerNuovaChat } from '../../src/renderer/cartella-nuova-chat'
import type { SessionSummary } from '@shared/types'
import type { PaneData } from '../../src/renderer/state/layout'

function riquadro(over: Partial<PaneData> = {}): PaneData {
  return { id: 'p-1', sessionUuid: 's-1', cwd: 'C:\\lavoro\\gestore', title: 'Gestore', ...over }
}

function sessione(over: Partial<SessionSummary> = {}): SessionSummary {
  return {
    uuid: 'u-1', projectSlug: 'C--p', projectPath: 'C:\\indice\\progetto', aiTitle: undefined,
    cwd: 'C:\\indice\\progetto', gitBranch: undefined, model: undefined, permissionMode: undefined,
    claudeVersion: undefined, messageCount: 1, firstTimestamp: undefined,
    lastTimestamp: '2026-08-10T10:00:00.000Z', inputTokens: 0, outputTokens: 0,
    cacheReadTokens: 0, cacheWriteTokens: 0, primoPrompt: undefined, mtimeMs: 0,
    jsonlPath: 'x.jsonl', sizeBytes: 0, skippedLines: 0, ...over
  }
}

describe('cartellaPerNuovaChat', () => {
  it('apre dove si sta gia lavorando', () => {
    // Una chat nuova serve quasi sempre accanto a quella che si ha davanti: la
    // cartella di un riquadro aperto e' l'ipotesi giusta piu' spesso di
    // qualunque percorso deciso una volta per tutte.
    const dove = cartellaPerNuovaChat([riquadro()], [sessione()], 'C:\\casa')
    expect(dove).toBe('C:\\lavoro\\gestore')
  })

  it('senza riquadri aperti prende il progetto piu recente', () => {
    const dove = cartellaPerNuovaChat([], [
      sessione({ uuid: 'a', cwd: 'C:\\vecchio', lastTimestamp: '2026-08-01T10:00:00.000Z' }),
      sessione({ uuid: 'b', cwd: 'C:\\recente', lastTimestamp: '2026-08-09T10:00:00.000Z' })
    ], 'C:\\casa')
    expect(dove).toBe('C:\\recente')
  })

  it('senza niente resta la cartella dell utente', () => {
    // Non un percorso scritto nel codice: quello vale su una macchina sola, e
    // qui c'era il nome utente di chi l'ha scritto.
    expect(cartellaPerNuovaChat([], [], 'C:\\Users\\qualcuno')).toBe('C:\\Users\\qualcuno')
  })

  it('fra piu riquadri prende l ultimo aperto', () => {
    const dove = cartellaPerNuovaChat(
      [riquadro({ id: 'a', cwd: 'C:\\primo' }), riquadro({ id: 'b', cwd: 'C:\\ultimo' })],
      [], 'C:\\casa'
    )
    expect(dove).toBe('C:\\ultimo')
  })

  it('salta una sessione senza cartella invece di aprire nel vuoto', () => {
    const dove = cartellaPerNuovaChat([], [
      sessione({ uuid: 'a', cwd: undefined, projectPath: 'C:\\dedotto', lastTimestamp: '2026-08-09T10:00:00.000Z' })
    ], 'C:\\casa')
    expect(dove).toBe('C:\\dedotto')
  })
})
