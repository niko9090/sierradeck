import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { apriEtichetteStore } from '../../src/main/etichette-store'

function dir(): string {
  return mkdtempSync(join(tmpdir(), 'etichette-'))
}

describe('apriEtichetteStore', () => {
  it('parte senza etichette', () => {
    expect(apriEtichetteStore(dir()).leggi()).toEqual({})
  })

  it('rilegge cio che ha scritto', () => {
    const d = dir()
    apriEtichetteStore(d).imposta('u-1', 'Bollette di casa')
    expect(apriEtichetteStore(d).leggi()['u-1']).toBe('Bollette di casa')
  })

  it('un etichetta vuota la toglie, invece di scrivere una riga vuota', () => {
    const s = apriEtichetteStore(dir())
    s.imposta('u-1', 'Prima')
    s.imposta('u-1', '   ')
    expect(s.leggi()['u-1']).toBeUndefined()
  })

  it('taglia le etichette chilometriche', () => {
    // Un'etichetta è un nome, non una descrizione: nell'elenco deve stare in
    // una riga accanto alla data.
    const s = apriEtichetteStore(dir())
    s.imposta('u-1', 'x'.repeat(500))
    expect((s.leggi()['u-1'] ?? '').length).toBeLessThanOrEqual(80)
  })

  it('rifiuta un id che uscirebbe dai suoi confini', () => {
    // L'id finisce in una chiave, non in un percorso, ma un id assurdo è
    // comunque il segno di una richiesta che non viene da qui.
    expect(() => apriEtichetteStore(dir()).imposta('../../fuori', 'x')).toThrow()
  })

  it('conserva un file illeggibile invece di cancellarlo', () => {
    const d = dir()
    writeFileSync(join(d, 'etichette.json'), 'non sono JSON', 'utf8')
    const s = apriEtichetteStore(d)
    expect(s.leggi()).toEqual({})
    s.imposta('u-1', 'Nuova')
    expect(readdirSync(d).filter((f) => f.includes('.illeggibile'))).toHaveLength(1)
    expect(s.leggi()['u-1']).toBe('Nuova')
  })

  it('scarta le voci che non sono testo, tenendo le buone', () => {
    const d = dir()
    writeFileSync(join(d, 'etichette.json'), JSON.stringify({ versione: 1, etichette: { a: 'buona', b: 42 } }), 'utf8')
    expect(apriEtichetteStore(d).leggi()).toEqual({ a: 'buona' })
  })
})
