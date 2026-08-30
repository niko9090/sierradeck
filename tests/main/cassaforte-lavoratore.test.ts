import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { esecutoreSuThread } from '../../src/main/cassaforte/lavoratore'

/**
 * Il filo che se ne va senza dire niente.
 *
 * `worker.on('error')` copre l'eccezione, non l'uscita: un lavoratore che
 * finisce la memoria, o che esce da se', chiude e basta. Senza un ascolto su
 * `exit` la promessa non si risolveva **mai**, e con lei restava appesa la
 * sincronizzazione — che ha pure un ripiego in processo, e non poteva partire
 * perche' nessuno le diceva che il thread era morto.
 */
function lavoratoreCheEsceEBasta(): string {
  const d = mkdtempSync(join(tmpdir(), 'lavoratore-muto-'))
  const f = join(d, 'muto.js')
  writeFileSync(
    f,
    [
      "const { parentPort } = require('node:worker_threads')",
      "parentPort.on('message', () => { process.exit(3) })",
      ''
    ].join(String.fromCharCode(10)),
    'utf8'
  )
  return f
}

describe('il lavoratore della cassaforte', () => {
  it('non lascia la promessa appesa quando il thread esce senza rispondere', async () => {
    const esecutore = esecutoreSuThread(lavoratoreCheEsceEBasta())
    // Se il difetto c'e', questa attesa non finisce e il test scade: e' proprio
    // il sintomo che si vuole rendere impossibile.
    const esito = await Promise.race([
      esecutore
        .prepara({
          dati: 'C:' + String.fromCharCode(92) + 'no',
          radiceClaude: 'C:' + String.fromCharCode(92) + 'no',
          maestra: Buffer.alloc(32),
          adesso: '2026-08-30T00:00:00.000Z'
        })
        .then(() => 'risolta', () => 'rifiutata'),
      new Promise((r) => setTimeout(() => r('appesa'), 3000))
    ])
    // Rifiutata va benissimo: chi chiama ha il suo ripiego in processo. Quello
    // che non deve succedere e' «appesa».
    expect(esito).not.toBe('appesa')
  }, 10_000)
})
