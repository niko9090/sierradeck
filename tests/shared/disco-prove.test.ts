import { describe, it, expect } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  CARTELLA_PROVE, ETA_MAX_CRITERI_MS, radiceCriteri, radiceLavoroAiuto, radiceProve, scegliRadiceProve, SOGLIA_TEMP_LIBERI, spazzaCriteri
} from '../../src/shared/disco-prove'

/**
 * 12/11 (Nicholas: «per prove onerose di giga può sfruttare altri dischi del
 * sistema temporaneamente»): la scelta del disco delle prove, pura, e la
 * spazzata delle cartelle dei criteri rimaste.
 */
const GB = 1024 ** 3

describe('il disco delle prove', () => {
  it('con la Temp sotto i 20 GB liberi sceglie il disco con più spazio, nella cartella unica', () => {
    const dischi = [{ radice: 'C:\\', liberi: 5 * GB }, { radice: 'D:\\', liberi: 100 * GB }, { radice: 'G:\\', liberi: 300 * GB }]
    expect(scegliRadiceProve(dischi, 'C:\\Users\\x\\AppData\\Local\\Temp')).toBe(`G:\\${CARTELLA_PROVE}`)
    // Le lettere minuscole e la radice scritta senza la barra valgono lo stesso.
    expect(scegliRadiceProve([{ radice: 'c:', liberi: 1 * GB }, { radice: 'e:\\', liberi: 50 * GB }], 'c:\\temp')).toBe(`E:\\${CARTELLA_PROVE}`)
  })

  it('con la Temp abbastanza libera, o nessun disco migliore, resta tutto dov’era', () => {
    expect(scegliRadiceProve([{ radice: 'C:\\', liberi: SOGLIA_TEMP_LIBERI }, { radice: 'D:\\', liberi: 900 * GB }], 'C:\\Temp')).toBeUndefined()
    expect(scegliRadiceProve([{ radice: 'C:\\', liberi: 10 * GB }, { radice: 'D:\\', liberi: 8 * GB }], 'C:\\Temp')).toBeUndefined()
    expect(scegliRadiceProve([{ radice: 'C:\\', liberi: 10 * GB }], 'C:\\Temp')).toBeUndefined()
    // Il disco della Temp non è fra quelli noti (non si sa quanto spazio ha): niente scelta.
    expect(scegliRadiceProve([{ radice: 'D:\\', liberi: 900 * GB }], 'C:\\Temp')).toBeUndefined()
    expect(scegliRadiceProve([], 'C:\\Temp')).toBeUndefined()
  })

  it('nei test il disco delle prove è spento: tutto resta nella Temp finta', () => {
    expect(radiceProve()).toBeUndefined()
    expect(radiceCriteri(undefined)).toBe(join(tmpdir(), 'sierradeck-criteri'))
    expect(radiceCriteri('G:\\SierraDeck-prove')).toBe(join('G:\\SierraDeck-prove', 'criteri'))
  })

  it('l’aiuto agli altri PC: senza disco delle prove resta in <dati>/aiuto; con, una cartella sua per ogni cartella dei dati', () => {
    expect(radiceLavoroAiuto('X:\\dati\\aiuto', undefined)).toBe('X:\\dati\\aiuto')
    const a = radiceLavoroAiuto('X:\\dati\\aiuto', 'G:\\SierraDeck-prove')
    const b = radiceLavoroAiuto('X:\\prova\\aiuto', 'G:\\SierraDeck-prove')
    expect(a.startsWith('G:\\SierraDeck-prove\\aiuto-')).toBe(true)
    expect(a).not.toBe(b)
    expect(radiceLavoroAiuto('X:\\dati\\aiuto', 'G:\\SierraDeck-prove')).toBe(a)
  })

  it('all’avvio via le cartelle dei criteri più vecchie di un giorno, solo dentro la loro cartella', () => {
    const radice = mkdtempSync(join(tmpdir(), 'criteri-'))
    const vecchia = join(radice, 'sierradeck-criterio-vecchia')
    const nuova = join(radice, 'sierradeck-criterio-nuova')
    for (const d of [vecchia, nuova]) { mkdirSync(join(d, 'dentro'), { recursive: true }); writeFileSync(join(d, 'dentro', 'f.txt'), 'x') }
    const ora = Date.now()
    const ieri = new Date(ora - ETA_MAX_CRITERI_MS - 60_000)
    utimesSync(vecchia, ieri, ieri)
    expect(spazzaCriteri(radice, ora)).toBe(1)
    expect(existsSync(vecchia)).toBe(false)
    expect(existsSync(nuova)).toBe(true)
    expect(existsSync(radice)).toBe(true)
    // Una cartella che non c'è: niente, nessun errore.
    expect(spazzaCriteri(join(radice, 'non-c-e'), ora)).toBe(0)
  })
})
