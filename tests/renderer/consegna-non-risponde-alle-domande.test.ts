import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { consegnaPartita, sceltaSulloSchermo } from '../../src/renderer/ultime-righe'

/**
 * Dopo l'invio di un testo la chat apre una domanda a scelta (AskUserQuestion):
 * il testo è arrivato. Prima della 0.71.1 la consegna non lo capiva, ripremeva
 * Invio e così rispondeva alla domanda con la prima opzione (visto dal vero il
 * 13/10 nel sottofondo: «Preferisci il gatto o il cane? → Gatto»).
 */
const ESC = String.fromCharCode(27)
const schermo = (f: string): string[] => readFileSync(join(__dirname, '..', 'fixtures', 'claude-2.1.294-domande', f), 'utf8')
  .split(/\r?\n/).map((r) => r.replace(new RegExp(`${ESC}\\[[0-9;]*m`, 'g'), ''))

describe('una domanda a scelta dopo l’invio vuol dire «partita»', () => {
  it('lo schermo vero di AskUserQuestion (Claude Code 2.1.294) è una scelta', () => {
    expect(sceltaSulloSchermo(schermo('due-1.txt'))).toBe(true)
  })
  it('la consegna è partita: niente altro Invio', () => {
    expect(consegnaPartita(schermo('due-1.txt'), 'Usa SUBITO lo strumento AskUserQuestion', 0)).toBe(true)
  })
})
