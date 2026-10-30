import { describe, it, expect } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import { apriQuadernoLezioni } from '../../src/main/quaderno-lezioni-store'

/** P2 (30/10): le decisioni di Nicholas passano da memoria.json a decisioni.md, una volta sola. */
describe('le decisioni nel quaderno', () => {
  const prepara = (): { dati: string; progetto: string; sparito: string } => {
    const dati = mkdtempSync(join(tmpdir(), 'sd-mem-p2-'))
    const progetto = mkdtempSync(join(tmpdir(), 'sd-mem-p2-progetto-'))
    const sparito = join(dati, 'non-esiste-piu')
    mkdirSync(join(dati, 'servizio'), { recursive: true })
    writeFileSync(join(dati, 'servizio', 'memoria.json'), JSON.stringify({
      versione: 1,
      risposte: { 'ap-1': [{ domanda: 'Uso la chiave di prova?', risposta: 'di prova', quando: '2026-10-12T10:00:00Z' }] },
      decisioni: {
        [progetto.toLowerCase()]: [
          { testo: 'mai pubblicare il venerdì', quando: '2026-10-13T08:00:00Z' },
          { testo: 'la coda resta visibile in alto', quando: '2026-10-14T08:00:00Z' }
        ],
        [sparito.toLowerCase()]: [{ testo: 'una decisione di un progetto sparito', quando: '2026-10-10T08:00:00Z' }]
      }
    }))
    return { dati, progetto, sparito }
  }
  const nelQuaderno = (): Parameters<typeof apriMemoria>[1] => {
    const q = apriQuadernoLezioni(() => '2026-10-30T10:00:00Z')
    return { ricorda: (cwd, testo, quando) => q.decidi(cwd, testo, quando), elenca: (cwd) => q.decisioni(cwd) }
  }

  it('migrate una volta: nel quaderno del progetto, fuori da memoria.json; un progetto sparito resta dov’è', () => {
    const { dati, progetto, sparito } = prepara()
    const m = apriMemoria(dati, nelQuaderno())
    expect(m.decisioni(progetto).map((d) => d.testo)).toEqual(['mai pubblicare il venerdì', 'la coda resta visibile in alto'])
    const disco = JSON.parse(readFileSync(join(dati, 'servizio', 'memoria.json'), 'utf8')) as { decisioni: Record<string, unknown>; risposte: Record<string, unknown> }
    expect(Object.keys(disco.decisioni)).toEqual([sparito.toLowerCase()])
    // Le risposte non si toccano.
    expect(m.rispostaPer('ap-1', 'Uso la chiave di prova?').esatta?.risposta).toBe('di prova')
    // Riaperta: niente doppioni nel quaderno.
    apriMemoria(dati, nelQuaderno())
    const md = readFileSync(join(progetto, '.sierradeck', 'quaderno', 'decisioni.md'), 'utf8')
    expect(md.match(/mai pubblicare il venerdì/g)).toHaveLength(1)
  })

  it('una decisione nuova va nel quaderno, e una ripetuta si conta', () => {
    const { dati, progetto } = prepara()
    const m = apriMemoria(dati, nelQuaderno())
    m.ricordaDecisione(progetto, 'il tema scuro resta quello di serie', '2026-10-20T08:00:00Z')
    m.ricordaDecisione(progetto, 'il tema scuro resta quello di serie', '2026-10-21T08:00:00Z')
    const md = readFileSync(join(progetto, '.sierradeck', 'quaderno', 'decisioni.md'), 'utf8')
    expect(md).toContain('il tema scuro resta quello di serie _(confermata 2×, ultima 2026-10-21)_')
  })
})
