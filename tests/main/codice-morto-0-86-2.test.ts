import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import * as motore from '../../src/main/cassaforte/motore'
import type { Progresso } from '../../src/main/cassaforte/motore'

/**
 * Codice morto tolto (0.86.2): il motore a blocco unico, l'esecutore su
 * thread e il suo worker non li chiamava più nessuno fuori dalle loro prove.
 * Resta il tipo `Progresso`, che usano la sincronizzazione e il main.
 */
describe('codice morto tolto', () => {
  it('motore.ts non ha più caricaStato e ripristinaStato, ma il tipo Progresso c è', () => {
    expect(Object.keys(motore)).not.toContain('caricaStato')
    expect(Object.keys(motore)).not.toContain('ripristinaStato')
    const p: Progresso = { fase: 'carico', fatto: 1, totale: 2, unita: 'file' }
    expect(p.fase).toBe('carico')
  })

  it('lavoratore.ts non c è più: anche l esecutore in processo non lo usava nessuno', () => {
    expect(existsSync('src/main/cassaforte/lavoratore.ts')).toBe(false)
  })

  it('il worker della sincronizzazione non c è più, né nella build', () => {
    expect(existsSync('src/main/cassaforte/sync-worker.ts')).toBe(false)
    expect(readFileSync('electron.vite.config.ts', 'utf8')).not.toContain('sync-worker')
  })
})
