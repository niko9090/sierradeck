import { describe, it, expect, vi } from 'vitest'
import { leggiConsegne, avviaRitiro, type Consegna } from '../../src/main/autopilota-consegne'

const buona = {
  id: 'c-1',
  autopilotaId: 'ap-1',
  chatId: 'ch-1',
  cwd: 'C:\\p',
  sessionId: 'sess-1',
  titolo: 'Notte',
  cosa: 'scrivi',
  testo: 'continua'
}

describe('leggere le consegne', () => {
  it('legge quelle buone', () => {
    expect(leggiConsegne({ consegne: [buona] })).toHaveLength(1)
  })

  it('non solleva mai, qualunque cosa arrivi', () => {
    // Un servizio vecchio rimasto vivo dopo un aggiornamento non deve far
    // cadere il Gestore: deve far cadere la consegna.
    for (const rotta of [undefined, null, 'testo', 42, {}, { consegne: 'no' }, { consegne: [null, 7] }]) {
      expect(() => leggiConsegne(rotta)).not.toThrow()
      expect(leggiConsegne(rotta)).toEqual([])
    }
  })

  it('scarta le istruzioni vuote', () => {
    // Premere invio in una chat senza dirle niente la farebbe ripartire a
    // vuoto, e l'autopilota aspetterebbe la risposta a una domanda mai fatta.
    expect(leggiConsegne({ consegne: [{ ...buona, testo: '   ' }] })).toEqual([])
  })

  it('ma un interrompi non ha bisogno di testo', () => {
    const lette = leggiConsegne({ consegne: [{ ...buona, cosa: 'interrompi', testo: '' }] })
    expect(lette.map((c) => c.cosa)).toEqual(['interrompi'])
  })

  it('scarta chi non dice quale chat o quale sessione', () => {
    expect(leggiConsegne({ consegne: [{ ...buona, chatId: '' }] })).toEqual([])
    expect(leggiConsegne({ consegne: [{ ...buona, sessionId: '' }] })).toEqual([])
  })
})

describe('il ritiro', () => {
  it('consegna quello che trova', async () => {
    const viste: Consegna[] = []
    const ferma = avviaRitiro({
      chiedi: () => Promise.resolve({ consegne: [buona] }),
      consegna: (c) => { viste.push(c) },
      attesaMs: 5
    })
    await vi.waitFor(() => expect(viste.length).toBeGreaterThan(0))
    ferma()
    expect(viste[0]?.testo).toBe('continua')
  })

  it('un giro che fallisce non ferma i successivi', async () => {
    // Il servizio spento non è un guasto: è lo stato normale finché nessuno ha
    // creato un autopilota.
    let giri = 0
    const viste: Consegna[] = []
    const ferma = avviaRitiro({
      chiedi: () => {
        giri += 1
        if (giri < 3) return Promise.reject(new Error('servizio spento'))
        return Promise.resolve({ consegne: [buona] })
      },
      consegna: (c) => { viste.push(c) },
      attesaMs: 5
    })
    await vi.waitFor(() => expect(viste.length).toBeGreaterThan(0))
    ferma()
  })

  it('smette quando glielo si dice', async () => {
    let giri = 0
    const ferma = avviaRitiro({
      chiedi: () => { giri += 1; return Promise.resolve({}) },
      consegna: () => undefined,
      attesaMs: 5
    })
    await vi.waitFor(() => expect(giri).toBeGreaterThan(0))
    ferma()
    const dopoLoStop = giri
    await new Promise((r) => setTimeout(r, 30))
    // Al più il giro già cominciato: nessuno nuovo.
    expect(giri).toBeLessThanOrEqual(dopoLoStop + 1)
  })
})
