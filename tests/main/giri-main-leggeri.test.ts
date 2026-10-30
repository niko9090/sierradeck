import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * I giri a tempo del Gestore lavorano solo quando c'è qualcosa da fare (0.85.2).
 */
const main = readFileSync('src/main/index.ts', 'utf8')

describe('i giri del Gestore', () => {
  it('le chat in sottofondo: mezzo secondo solo mentre ricevono un testo, se no ogni due; lo stato si rifà solo se cambia', () => {
    expect(main).toContain("const stretto = prima.some((s) => s.inCoda > 0 || s.fase === 'consegna' || s.fase === 'avvio')")
    expect(main).toContain('const GIRI_SOTTOFONDO_QUIETO = 4')
    expect(main).toContain('if (firma === firmaSottofondo) return')
  })
  it('le cartelle del postino si rifanno al più ogni due minuti', () => {
    expect(main).toContain('const CARTELLE_POSTINO_MS = 2 * 60_000')
    expect(main).toContain('Date.now() - cartelleInMemoria.il < CARTELLE_POSTINO_MS')
  })
  it('la scheda del telefono chiede l’autopilota intero', () => {
    expect(main).toContain('autopilota: (id: string) => clientAutopilota.dettaglio(id)')
  })
})
