import { describe, it, expect } from 'vitest'
import { INTERVALLO_MIN_MS, QUIETE_INVIO_MS, decidiInvio, giroInvioErrori, pcSviluppoDi, vociNuove, type StatoInvio } from '../../src/main/errori-invio-automatico'
import type { StoricoErrori, VoceErrore } from '@shared/storico-errori'

const T0 = Date.parse('2026-10-30T10:00:00.000Z')
const voce = (ultima: string, messaggio = 'boom'): VoceErrore => ({ quando: ultima, ultima, dove: 'pc', volte: 1, messaggio })

describe('l’invio automatico degli errori (0.88.4)', () => {
  it('manda solo gli errori visti dopo l’ultimo invio, quando lo storico è zitto, mai troppo spesso', () => {
    const s: StoricoErrori = { voci: [voce('2026-10-30T08:00:00.000Z', 'vecchio'), voce('2026-10-30T09:50:00.000Z', 'nuovo')] }
    const nuove = vociNuove(s, '2026-10-30T09:00:00.000Z')
    expect(nuove.map((v) => v.messaggio)).toEqual(['nuovo'])
    const ultima = Date.parse('2026-10-30T09:50:00.000Z')
    expect(decidiInvio({ nuove, stato: {}, adesso: ultima + QUIETE_INVIO_MS - 1, pcSviluppo: 'pc-1' }).manda).toBe(false)
    expect(decidiInvio({ nuove, stato: {}, adesso: ultima + QUIETE_INVIO_MS, pcSviluppo: 'pc-1' })).toEqual({ manda: true, fino: '2026-10-30T09:50:00.000Z' })
    expect(decidiInvio({ nuove, stato: { il: new Date(T0 - INTERVALLO_MIN_MS + 1).toISOString() }, adesso: T0, pcSviluppo: 'pc-1' }).manda).toBe(false)
    expect(decidiInvio({ nuove, stato: {}, adesso: T0, pcSviluppo: undefined }).manda).toBe(false)
    expect(decidiInvio({ nuove: [], stato: {}, adesso: T0, pcSviluppo: 'pc-1' }).manda).toBe(false)
  })

  it('il PC di sviluppo: quello scelto, o il proprietario di SierraDeck', () => {
    const progetti = [{ nome: 'GLOS', proprietario: 'pc-2' }, { nome: 'SierraDeck', proprietario: 'pc-fisso' }]
    expect(pcSviluppoDi('pc-scelto', progetti)).toBe('pc-scelto')
    expect(pcSviluppoDi(undefined, progetti)).toBe('pc-fisso')
    expect(pcSviluppoDi(undefined, [{ nome: 'GLOS' }])).toBeUndefined()
  })

  it('il giro: la prima volta parte da un giorno fa; se l’invio fallisce si riprova con gli stessi errori', async () => {
    let stato: StatoInvio | undefined
    const mandati: StoricoErrori[] = []
    let ok = false
    const d = {
      storico: (): StoricoErrori => ({ voci: [voce('2026-10-20T08:00:00.000Z', 'di dieci giorni fa'), voce('2026-10-30T09:00:00.000Z', 'di oggi')] }),
      stato: { leggi: () => stato, scrivi: (s: StatoInvio) => { stato = s } },
      pcSviluppo: () => 'pc-fisso',
      adesso: () => T0,
      manda: async (s: StoricoErrori) => { mandati.push(s); return ok ? { ok: true, messaggio: 'Mandati' } : { ok: false, messaggio: 'Drive spento' } },
      log: () => undefined
    }
    await giroInvioErrori(d)
    expect(mandati[0]?.voci.map((v) => v.messaggio)).toEqual(['di oggi'])
    expect(stato?.il).toBeUndefined()
    ok = true
    await giroInvioErrori(d)
    expect(mandati[1]?.voci.map((v) => v.messaggio)).toEqual(['di oggi'])
    expect(stato).toEqual({ fino: '2026-10-30T09:00:00.000Z', il: new Date(T0).toISOString() })
    // Niente di nuovo: niente invio.
    await giroInvioErrori(d)
    expect(mandati).toHaveLength(2)
  })
})
