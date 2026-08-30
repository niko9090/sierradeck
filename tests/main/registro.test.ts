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
