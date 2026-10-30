import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { creaProgettiSync } from '../../src/main/progetti/sincronia-progetti'
import type { RegistroProgetti } from '../../src/main/progetti/registro'

/**
 * Una strada delle cartelle vuote del 19/10 (0.80.0): il ripristino preparava
 * la cartella di **tutti** i progetti del registro, anche di quelli che un
 * altro PC tiene in mano. Dalla 0.88.0 un PC ripristina solo i progetti di
 * cui è il proprietario: mai la cartella di un progetto di un altro PC.
 */
function prova(): { creati: string[]; sync: ReturnType<typeof creaProgettiSync> } {
  let reg: RegistroProgetti = {
    versione: 1,
    progetti: [
      { id: 'mio', nome: 'mio', aggiuntoIl: '', proprietario: 'pc-qui', percorso: 'X:\\Progetti\\mio' },
      { id: 'escluso', nome: 'escluso', aggiuntoIl: '', proprietario: 'pc-qui', percorso: 'X:\\Progetti\\escluso' },
      { id: 'suo', nome: 'suo', aggiuntoIl: '', proprietario: 'pc-la', percorso: 'Y:\\suo' }
    ]
  }
  const creati: string[] = []
  const sync = creaProgettiSync({
    registro: { leggi: () => reg, scrivi: (r) => { reg = r } },
    pcId: () => 'pc-qui',
    cartellaProgetti: () => 'X:\\Progetti',
    esiste: () => false,
    crea: (p) => { creati.push(p) },
    esclusi: () => new Set(['escluso'])
  })
  return { creati, sync }
}

describe('il ripristino non crea le cartelle dei progetti in mano ad altri', () => {
  it('un giro di tutti i progetti: solo i miei, e salta quelli esclusi', () => {
    const { creati, sync } = prova()
    expect(sync.preparaRipristino()).toHaveLength(1)
    expect(creati).toEqual(['X:\\Progetti\\mio'])
  })

  it('chi chiede il progetto di un altro PC non lo riceve: vive là (0.88.0)', () => {
    const { creati, sync } = prova()
    expect(sync.preparaRipristino(new Set(['suo']))).toEqual([])
    expect(creati).toEqual([])
  })

  it('«Ripristina» di un progetto prepara solo quello', () => {
    expect(readFileSync('src/main/cassaforte/sincronia.ts', 'utf8')).toContain('deps.progetti.preparaRipristino(new Set([id]))')
  })
})
