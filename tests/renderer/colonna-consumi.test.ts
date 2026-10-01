import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { normalizzaPreferenze, PREFERENZE_PREDEFINITE, LARGHEZZA_CONSUMI } from '@shared/preferenze'
import { restaApertaLAltra, MOSAICO_MINIMO_PX } from '../../src/renderer/colonne-laterali'
import { frenoDaiLimiti, testoFreno } from '@shared/harness'

/**
 * La colonna laterale «Consumi e limiti» sul PC (0.37.0): come le Domande,
 * tasto nella console, aperta/chiusa e larghezza ricordate; insieme alle
 * Domande quando c'e' posto.
 */
describe('la colonna «Consumi e limiti»', () => {
  it('ricorda aperta/chiusa e larghezza fra un avvio e l altro, con i limiti', () => {
    expect(PREFERENZE_PREDEFINITE).toMatchObject({ consumiLaterali: false, larghezzaConsumi: 380 })
    expect(normalizzaPreferenze({ consumiLaterali: true, larghezzaConsumi: 450 })).toMatchObject({ consumiLaterali: true, larghezzaConsumi: 450 })
    expect(normalizzaPreferenze({ larghezzaConsumi: 10 }).larghezzaConsumi).toBe(LARGHEZZA_CONSUMI.min)
    expect(normalizzaPreferenze({ larghezzaConsumi: 9000 }).larghezzaConsumi).toBe(LARGHEZZA_CONSUMI.max)
  })

  it('sta aperta insieme alle Domande quando c è posto, altrimenti aprirne una chiude l altra', () => {
    expect(restaApertaLAltra({ larghezzaFinestra: 400 + 380 + MOSAICO_MINIMO_PX, larghezzaDomande: 400, larghezzaConsumi: 380 })).toBe(true)
    expect(restaApertaLAltra({ larghezzaFinestra: 1100, larghezzaDomande: 400, larghezzaConsumi: 380 })).toBe(false)
  })

  it('si apre dal tasto «Consumi» della console ed è una colonna accanto al mosaico', () => {
    const app = readFileSync('src/renderer/App.tsx', 'utf8')
    expect(app).toContain('colonnaConsumi.aperta ? (')
    expect(app).toContain('consumiLaterali: consumi')
    expect(app).toContain('larghezzaConsumi: px')
    const console_ = readFileSync('src/renderer/components/Console.tsx', 'utf8')
    expect(console_).toContain('onClick={() => onConsumi?.()}')
    const colonna = readFileSync('src/renderer/components/ColonnaConsumi.tsx', 'utf8')
    // Le sezioni e i testi per esteso: cosa guarda, da dove arriva, se non torna.
    for (const t of ['Limiti del piano', 'Contesto delle chat aperte', 'Freno degli autopiloti', 'Se non torna', 'Da dove arrivano']) expect(colonna).toContain(t)
  })

  it('il freno si dice per esteso, livello per livello', () => {
    const ora = Date.now()
    const f = (p: number) => testoFreno(frenoDaiLimiti({ cinqueOre: { percento: p, resettaIl: ora + 3_600_000, lettoIl: ora } }, ora))
    expect(f(10).titolo).toBe('Via libera')
    expect(f(65).titolo).toBe('Niente chat nuove')
    expect(f(85).titolo).toBe('Una chat sola')
    expect(f(97).titolo).toBe('Fermo')
    expect(f(97).spiegazione).toContain('ripartono da soli')
    expect(testoFreno(frenoDaiLimiti(undefined, ora)).titolo).toBe('Limiti non letti')
  })
})
