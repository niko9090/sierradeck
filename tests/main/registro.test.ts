import { describe, it, expect, vi, afterEach } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { apriRegistro } from '../../src/main/registro'

afterEach(() => { vi.useRealTimers() })

describe('il registro', () => {
  it('scrive nel file del giorno in cui scrive, non in quello dell avvio', () => {
    // Una plancia si lascia aperta. Con il nome calcolato una volta sola,
    // tutto quello che succedeva dal secondo giorno in poi finiva nel file del
    // primo: chi cercava la prova di stamattina apriva il file di oggi e lo
    // trovava vuoto.
    const dati = mkdtempSync(join(tmpdir(), 'sd-registro-'))
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-30T22:00:00.000Z'))
    const r = apriRegistro(dati, '1.2.3')
    r.info('prima di mezzanotte')

    vi.setSystemTime(new Date('2026-08-31T09:00:00.000Z'))
    r.info('il giorno dopo')

    const cartella = join(dati, 'log')
    const nomi = readdirSync(cartella).sort()
    expect(nomi).toContain('sierradeck-2026-08-30.log')
    expect(nomi).toContain('sierradeck-2026-08-31.log')
    expect(readFileSync(join(cartella, 'sierradeck-2026-08-31.log'), 'utf8'))
      .toContain('il giorno dopo')
    // E `file()` indica quello di adesso, che e' quello che il tasto apre.
    expect(r.file()).toBe(join(cartella, 'sierradeck-2026-08-31.log'))
  })

  it('oltre le righe al secondo consentite conta invece di scrivere', () => {
    // Un salvataggio rifiutato in un giro senza fine: la stessa riga
    // cinquecento volte al secondo per nove ore, sette gigabyte. Di quaranta
    // milioni di righe uguali ne bastano cinquanta, le altre si contano.
    const dati = mkdtempSync(join(tmpdir(), 'sd-registro-'))
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-03T11:07:43.000Z'))
    const r = apriRegistro(dati, '1.2.3', 'app', { righeAlSecondo: 10, byteAlGiorno: 1024 * 1024 })
    for (let i = 0; i < 100; i += 1) r.info(`RIFIUTATO ${i}`)
    const file = join(dati, 'log', 'sierradeck-2026-09-03.log')
    // La riga d'avvio piu' nove: dieci in tutto in quel secondo.
    expect(readFileSync(file, 'utf8').split('\n').filter((x) => x !== '')).toHaveLength(10)

    vi.setSystemTime(new Date('2026-09-03T11:07:44.000Z'))
    r.info('il secondo dopo')
    const testo = readFileSync(file, 'utf8')
    expect(testo).toContain('91 righe tralasciate')
    expect(testo).toContain('il secondo dopo')
  })

  it('oltre i byte del giorno il file si chiude con una riga che lo dice', () => {
    const dati = mkdtempSync(join(tmpdir(), 'sd-registro-'))
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-03T11:07:43.000Z'))
    const r = apriRegistro(dati, '1.2.3', 'app', { righeAlSecondo: 1000, byteAlGiorno: 600 })
    for (let i = 0; i < 50; i += 1) r.info(`riga numero ${i}`)
    const file = join(dati, 'log', 'sierradeck-2026-09-03.log')
    const testo = readFileSync(file, 'utf8')
    expect(testo).toContain('registro chiuso per oggi')
    expect(testo).not.toContain('riga numero 49')
    // Il giorno dopo si riparte.
    vi.setSystemTime(new Date('2026-09-04T09:00:00.000Z'))
    r.info('nuovo giorno')
    expect(readFileSync(join(dati, 'log', 'sierradeck-2026-09-04.log'), 'utf8')).toContain('nuovo giorno')
  })

  it('dice quale processo ha scritto la riga', () => {
    // Il servizio autopiloti scrive nello stesso file del programma: senza un
    // nome, due «sessione avviata» identiche per ogni avvio e nessun modo di
    // attribuire un errore.
    const dati = mkdtempSync(join(tmpdir(), 'sd-registro-'))
    apriRegistro(dati, '1.2.3').info('dall app')
    apriRegistro(dati, '1.2.3', 'servizio').errore('dal servizio')

    const cartella = join(dati, 'log')
    const testo = readFileSync(join(cartella, readdirSync(cartella)[0] as string), 'utf8')
    expect(testo).toContain('[info] [app] dall app')
    expect(testo).toContain('[ERRORE] [servizio] dal servizio')
  })
})
