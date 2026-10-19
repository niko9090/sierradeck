import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { creaProgettiSync } from '../../src/main/progetti/sincronia-progetti'
import type { RegistroProgetti } from '../../src/main/progetti/registro'

/**
 * Una strada delle cartelle vuote del 19/10 (0.80.0): il ripristino preparava
 * la cartella di **tutti** i progetti del registro, anche di quelli che un
 * altro PC tiene in mano.
 */
function prova(): { creati: string[]; sync: ReturnType<typeof creaProgettiSync> } {
  let reg = {
    versione: 1,
    progetti: [
      { id: 'mio', nome: 'mio', percorsi: { 'pc-la': 'Y:\\mio' } },
      { id: 'suo', nome: 'suo', percorsi: { 'pc-la': 'Y:\\suo' } }
    ]
  } as unknown as RegistroProgetti
  const creati: string[] = []
  const sync = creaProgettiSync({
    registro: { leggi: () => reg, scrivi: (r) => { reg = r } },
    pcId: () => 'pc-qui',
    cartellaProgetti: () => 'X:\\Progetti',
    esiste: () => false,
    crea: (p) => { creati.push(p) },
    esclusi: () => new Set(['suo'])
  })
  return { creati, sync }
}

describe('il ripristino non crea le cartelle dei progetti in mano ad altri', () => {
  it('un giro di tutti i progetti salta quelli esclusi', () => {
    const { creati, sync } = prova()
    expect(sync.preparaRipristino()).toHaveLength(1)
    expect(creati).toHaveLength(1)
    expect(creati[0]).toContain('mio')
  })

  it('chi chiede quel progetto preciso lo riceve comunque', () => {
    const { creati, sync } = prova()
    sync.preparaRipristino(new Set(['suo']))
    expect(creati).toHaveLength(1)
    expect(creati[0]).toContain('suo')
  })

  it('«Ripristina» di un progetto prepara solo quello', () => {
    expect(readFileSync('src/main/cassaforte/sincronia.ts', 'utf8')).toContain('deps.progetti.preparaRipristino(new Set([id]))')
  })
})
