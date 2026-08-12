import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { cartellaDati } from '../../src/main/migra-dati'

function appData(): string {
  return mkdtempSync(join(tmpdir(), 'appdata-'))
}

function conVecchia(radice: string, contenuto = 'gli autopiloti'): string {
  const vecchia = join(radice, 'GestoreSessioni')
  mkdirSync(join(vecchia, 'autopiloti'), { recursive: true })
  writeFileSync(join(vecchia, 'autopiloti', 'ap-1.json'), contenuto, 'utf8')
  return vecchia
}

describe('cartellaDati', () => {
  it('porta con se i dati quando il programma cambia nome', () => {
    // Cambiare nome alla cartella senza spostare cio' che c'era dentro
    // significa, per chi usa il programma, aver perso autopiloti, salvataggi e
    // nomi delle chat da un avvio all'altro.
    const radice = appData()
    conVecchia(radice)

    const usata = cartellaDati(radice, 'GestoreSessioni', 'SierraDeck')

    expect(usata).toBe(join(radice, 'SierraDeck'))
    expect(readFileSync(join(usata, 'autopiloti', 'ap-1.json'), 'utf8')).toBe('gli autopiloti')
    expect(existsSync(join(radice, 'GestoreSessioni'))).toBe(false)
  })

  it('senza niente da migrare crea la cartella nuova', () => {
    const radice = appData()
    const usata = cartellaDati(radice, 'GestoreSessioni', 'SierraDeck')
    expect(usata).toBe(join(radice, 'SierraDeck'))
    expect(existsSync(usata)).toBe(true)
  })

  it('non tocca la cartella nuova se esiste gia', () => {
    // Al secondo avvio la migrazione e' gia' stata fatta: rifarla
    // sovrascriverebbe il lavoro di oggi con quello di ieri.
    const radice = appData()
    conVecchia(radice, 'vecchio')
    const nuova = join(radice, 'SierraDeck')
    mkdirSync(nuova, { recursive: true })
    writeFileSync(join(nuova, 'segno'), 'nuovo', 'utf8')

    const usata = cartellaDati(radice, 'GestoreSessioni', 'SierraDeck')

    expect(readFileSync(join(usata, 'segno'), 'utf8')).toBe('nuovo')
    // La vecchia resta dov'e': contiene dati di qualcuno, e cancellarla non
    // spetta a noi.
    expect(existsSync(join(radice, 'GestoreSessioni'))).toBe(true)
  })

  it('se lo spostamento non riesce continua a usare la vecchia', () => {
    // Con la cartella occupata — un altro processo, un antivirus — il rinomino
    // fallisce. Ripartire da una cartella vuota vorrebbe dire far sparire tutto:
    // meglio restare dove i dati sono davvero.
    const radice = appData()
    const vecchia = conVecchia(radice)
    const usata = cartellaDati(radice, 'GestoreSessioni', 'SierraDeck', () => {
      throw new Error('EBUSY')
    })
    expect(usata).toBe(vecchia)
  })
})
