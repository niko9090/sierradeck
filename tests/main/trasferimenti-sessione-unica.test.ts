import { describe, it, expect, vi } from 'vitest'

/**
 * Due richieste vicine non devono aprire due canali SSH.
 *
 * Aprire una sessione costa un secondo abbondante, e in quel secondo la mappa
 * delle sessioni aperte e' ancora vuota: la coda che lavora mentre tu sfogli —
 * il caso normale — passava il controllo due volte e apriva due canali. Il
 * secondo prendeva il posto del primo nella mappa, e il primo restava aperto e
 * invisibile: ne' la potatura ne' la chiusura finale lo vedevano piu'.
 */
const aperture = vi.hoisted(() => ({ quante: 0, chiudi: vi.fn() }))

vi.mock('../../src/main/trasferimenti/sftp', async (importOriginal) => {
  const originale = await importOriginal<typeof import('../../src/main/trasferimenti/sftp')>()
  return {
    ...originale,
    apriSessione: async () => {
      aperture.quante += 1
      // L'attesa e' il punto: senza, le due chiamate non si sovrappongono e il
      // difetto non si vedrebbe nemmeno quando c'e'.
      await new Promise((r) => setTimeout(r, 20))
      return {
        elenca: async () => [],
        chiudi: aperture.chiudi
      } as unknown as import('../../src/main/trasferimenti/sftp').Sessione
    }
  }
})

const { creaTrasferimenti } = await import('../../src/main/trasferimenti/servizio')

function archivioFinto(): never {
  return {
    destinazioniDi: () => [],
    trova: () => ({ id: 'srv', nome: 'srv', host: 'h', porta: 22, utente: 'u', cartella: '/' }),
    segretoDi: () => ({ tipo: 'password', password: 'x' }),
    fidati: () => undefined,
    aggiungi: () => undefined,
    rimuovi: () => undefined
  } as never
}

describe('una sola sessione per destinazione', () => {
  it('due richieste sovrapposte aprono un canale solo', async () => {
    aperture.quante = 0
    const t = creaTrasferimenti(archivioFinto())
    // Due elenchi remoti insieme: e' la coda che lavora mentre tu sfogli.
    await Promise.all([
      t.elencaRemoto('srv', '/').catch(() => undefined),
      t.elencaRemoto('srv', '/').catch(() => undefined)
    ])
    expect(aperture.quante).toBe(1)
    t.chiudiTutto()
  })
})
