import { describe, expect, it } from 'vitest'
import { creaTurni, TurnoScaduto } from '../../src/autopilot-host/turni-criteri'

const pausa = (ms: number): Promise<void> => new Promise((ris) => setTimeout(ris, ms))

describe('unione scaduta: il lucchetto sulla cartella principale (22/11, k-178m)', () => {
  it('finché la corsa vecchia è viva la successiva non parte; quando muore il lucchetto si libera subito', async () => {
    const turni = creaTurni({ unioneMaxMs: 80, liberaDopoMs: 5000, registra: () => {} })
    let chiudiVecchia: (() => void) | undefined
    const vecchia = turni.unione('C:/principale', (segnale) => new Promise<void>((ris) => {
      segnale.addEventListener('abort', () => { chiudiVecchia = ris }, { once: true })
    }))
    await expect(vecchia).rejects.toBeInstanceOf(TurnoScaduto)
    let partita = false
    const nuova = turni.unione('C:/principale', () => { partita = true; return 'ok' })
    await pausa(10)
    expect(partita).toBe(false)
    expect(turni.stato().unioni).toBe(2)
    chiudiVecchia?.()
    await expect(nuova).resolves.toBe('ok')
    expect(partita).toBe(true)
  })

  it('oltre il tempo di sicurezza il lucchetto si libera e il fatto è registrato', async () => {
    const registrati: string[] = []
    const turni = creaTurni({ unioneMaxMs: 80, liberaDopoMs: 40, registra: (t) => registrati.push(t) })
    // Una corsa che ignora il segnale e non finisce mai.
    await expect(turni.unione('C:/principale', () => new Promise<void>(() => {}))).rejects.toBeInstanceOf(TurnoScaduto)
    let partita = false
    const nuova = turni.unione('C:/principale', () => { partita = true; return 'ok' })
    await pausa(10)
    expect(partita).toBe(false)
    expect(registrati).toHaveLength(0)
    await expect(nuova).resolves.toBe('ok')
    expect(registrati).toHaveLength(1)
    expect(registrati[0]).toContain('libero la cartella principale')
  })

  it('una corsa che si chiude da sola non registra niente', async () => {
    const registrati: string[] = []
    const turni = creaTurni({ unioneMaxMs: 20, liberaDopoMs: 40, registra: (t) => registrati.push(t) })
    await expect(turni.unione('C:/principale', (segnale) => new Promise<void>((ris) => {
      segnale.addEventListener('abort', () => ris(), { once: true })
    }))).rejects.toBeInstanceOf(TurnoScaduto)
    await pausa(100)
    expect(registrati).toHaveLength(0)
    expect(turni.stato().unioni).toBe(0)
  })
})
