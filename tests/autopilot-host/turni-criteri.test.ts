import { describe, it, expect } from 'vitest'
import { conTurni, creaTurni } from '../../src/autopilot-host/turni-criteri'
import { ePesante } from '../../src/autopilot-host/criteri-veloci'

/**
 * 0.82.1: il 21/10 decine di `vitest run` e `gradle` giravano insieme sullo
 * stesso PC, scadevano tutti e facevano scadere anche il supervisore.
 */
function lento() {
  let attivi = 0
  let picco = 0
  const ordine: string[] = []
  const esegui = async (comando: string): Promise<{ codice: number; uscita: string }> => {
    ordine.push(`parte ${comando}`)
    attivi += 1; picco = Math.max(picco, attivi)
    await new Promise((r) => setTimeout(r, 10))
    attivi -= 1
    ordine.push(`finisce ${comando}`)
    return { codice: 0, uscita: 'ok' }
  }
  return { esegui, picco: () => picco, ordine }
}

describe('turni dei criteri (0.82.1)', () => {
  it('riconosce come lunghi anche vitest lanciato da node_modules', () => {
    expect(ePesante('cd "/e/p" && node node_modules/vitest/vitest.mjs run tests/main --maxWorkers=2')).toBe(true)
    expect(ePesante('cd android && gradle testDebugUnitTest assembleDebug --no-daemon')).toBe(true)
    expect(ePesante("bash -c 'test -s .sierradeck/quaderno/lista-lavori.md'")).toBe(false)
  })

  it('i comandi lunghi uno alla volta, anche da cartelle e chat diverse, nell’ordine di arrivo', async () => {
    const l = lento()
    const esegui = conTurni(l.esegui, creaTurni())
    await Promise.all([
      esegui('npx vitest run tests/a', 'C:/p'),
      esegui('cd android && gradle test', 'C:/q'),
      esegui('npm test', 'C:/p')
    ])
    expect(l.picco()).toBe(1)
    expect(l.ordine.filter((r) => r.startsWith('parte'))).toEqual(['parte npx vitest run tests/a', 'parte cd android && gradle test', 'parte npm test'])
  })

  it('i comandi brevi non aspettano i lunghi', async () => {
    const l = lento()
    const esegui = conTurni(l.esegui, creaTurni())
    await Promise.all([esegui('npm test', 'C:/p'), esegui('npm run typecheck', 'C:/p')])
    expect(l.picco()).toBe(2)
  })

  it('un’unione aspetta il comando lungo nella sua cartella, e intanto non ne parte un altro lì', async () => {
    const turni = creaTurni()
    const l = lento()
    const esegui = conTurni(l.esegui, turni)
    const primo = esegui('npm test', 'C:/p')
    await new Promise((r) => setTimeout(r, 1))
    const unione = turni.unione('C:\\P\\', () => { l.ordine.push('unione'); return true })
    const secondo = esegui('npx vitest run', 'c:/p')
    await Promise.all([primo, unione, secondo])
    expect(l.ordine).toEqual(['parte npm test', 'finisce npm test', 'unione', 'parte npx vitest run', 'finisce npx vitest run'])
  })

  it('un’unione in un’altra cartella non aspetta', async () => {
    const turni = creaTurni()
    const l = lento()
    const lungo = conTurni(l.esegui, turni)('npm test', 'C:/copia-della-chat')
    await new Promise((r) => setTimeout(r, 1))
    await turni.unione('C:/principale', () => { l.ordine.push('unione') })
    expect(l.ordine).toEqual(['parte npm test', 'unione'])
    await lungo
  })

  it('un comando che fallisce libera il turno', async () => {
    const turni = creaTurni()
    const rotto = conTurni(async () => { throw new Error('non parte') }, turni)
    await expect(rotto('npm test', 'C:/p')).rejects.toThrow('non parte')
    expect(turni.stato()).toEqual({ inCorso: undefined, inFila: 0, unioni: 0 })
  })
})

describe('turni dei criteri: chi aspetta un’unione non ferma la fila (Revisione 0.82.1)', () => {
  it('il primo della fila bloccato da un’unione lascia passare chi lavora in un’altra cartella', async () => {
    const turni = creaTurni()
    const ordine: string[] = []
    let finisciUnione: () => void = () => {}
    const unione = turni.unione('C:/principale', () => new Promise<void>((r) => { finisciUnione = () => { ordine.push('unione finita'); r() } }))
    const bloccato = turni.pesante('C:/principale', async () => { ordine.push('principale'); return 1 })
    const libero = turni.pesante('C:/copia', async () => { ordine.push('copia'); return 2 })
    await libero
    expect(ordine).toEqual(['copia'])
    finisciUnione()
    await Promise.all([unione, bloccato])
    expect(ordine).toEqual(['copia', 'unione finita', 'principale'])
  })
})
