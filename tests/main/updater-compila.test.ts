import { describe, it, expect } from 'vitest'
import { diariUpdater, diarioUpdater, updaterVivo } from '../../src/main/updater/compila'

describe('dove si cerca il diario dell updater', () => {
  it('guarda TEMP, TMP e la cartella di sistema, senza doppioni', () => {
    // L'updater e' .NET e legge TMP prima di TEMP; noi il contrario. Con due
    // valori diversi SierraDeck diceva «non e' partito» mentre l'updater era
    // vivo, e dopo cinque secondi lui ci terminava a forza.
    const diari = diariUpdater({ TEMP: 'C:\\Uno', TMP: 'C:\\Due' })
    expect(diari.slice(0, 2)).toEqual(['C:\\Uno\\sierradeck-update.log', 'C:\\Due\\sierradeck-update.log'])
    expect(diari.length).toBeGreaterThanOrEqual(2)
    // La stessa cartella scritta in due modi e' una sola.
    const uguali = diariUpdater({ TEMP: 'C:\\Uno\\', TMP: 'c:\\uno' })
    expect(uguali.filter((d) => d.toLowerCase().startsWith('c:\\uno'))).toHaveLength(1)
    expect(diarioUpdater({ TEMP: 'C:\\Uno', TMP: 'C:\\Due' })).toBe('C:\\Uno\\sierradeck-update.log')
  })

  it('l updater e vivo se il diario compare in una qualunque delle cartelle', async () => {
    const vivo = await updaterVivo(() => Promise.resolve(), (p) => p.endsWith('sierradeck-update.log'))
    expect(vivo).toBe(true)
    const morto = await updaterVivo(() => Promise.resolve(), () => false)
    expect(morto).toBe(false)
  })
})
