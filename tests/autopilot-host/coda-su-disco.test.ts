import { describe, it, expect, vi } from 'vitest'
import { creaConsegne, type Consegna } from '../../src/autopilot-host/consegne'
import { avviaRitiro, chiaveConsegna } from '../../src/main/autopilota-consegne'

/**
 * 0.71.0: mai un ordine perso dopo un riavvio. La coda del servizio va su
 * disco; il Gestore ricorda su disco quali ha già scritto, così una consegna
 * ripresentata dopo il riavvio si conferma senza riscriverla.
 */
const base = { autopilotaId: 'ap-1', chatId: 'ch-1', cwd: 'C:/p', sessionId: 's-1', titolo: 'Prova', cosa: 'scrivi' as const, testo: 'continua' }

describe('la coda delle consegne su disco', () => {
  it('una consegna messa e non ritirata torna dopo il riavvio, con il numero che non torna indietro', () => {
    let disco: Consegna[] = []
    const c1 = creaConsegne({}, {}, { leggi: () => disco, scrivi: (c) => { disco = c } })
    const m = c1.metti(base)
    expect(disco.map((x) => x.id)).toEqual([m.id])

    const c2 = creaConsegne({}, {}, { leggi: () => disco, scrivi: (c) => { disco = c } })
    expect(c2.ritira().map((x) => x.id)).toEqual([m.id])
    const dopo = c2.metti({ ...base, chatId: 'ch-2' })
    expect(Number(dopo.id.slice(2))).toBeGreaterThan(Number(m.id.slice(2)))
    c2.conferma([m.id])
    expect(disco.map((x) => x.id)).toEqual([dopo.id])
  })

  it('tre chat: ognuna la sua consegna, nessuna sostituisce quella di un’altra, tutte tornano dopo il riavvio', () => {
    let disco: Consegna[] = []
    const c = creaConsegne({}, {}, { leggi: () => disco, scrivi: (x) => { disco = x } })
    for (const chat of ['c-1', 'c-2', 'c-3']) c.metti({ ...base, chatId: chat, testo: `per ${chat}` })
    const dopo = creaConsegne({}, {}, { leggi: () => disco, scrivi: (x) => { disco = x } }).ritira()
    expect(dopo.map((x) => `${x.chatId}:${x.testo}`)).toEqual(['c-1:per c-1', 'c-2:per c-2', 'c-3:per c-3'])
  })

  it('un file storto non ferma il servizio', () => {
    expect(creaConsegne({}, {}, { leggi: () => [{ id: 3 }, null, 'x'] }).inAttesa()).toBe(0)
  })
})

describe('il Gestore ricorda quali ha già scritto', () => {
  it('dopo un riavvio la consegna già scritta si conferma senza riscriverla', async () => {
    const consegna = { id: 'c-9', ...base }
    let ricordate: string[] = [chiaveConsegna(consegna)]
    const scritte: string[] = []
    const confermate: string[] = []
    const ferma = avviaRitiro({
      chiedi: () => Promise.resolve({ consegne: [consegna] }),
      consegna: (c) => { scritte.push(c.id) },
      conferma: (ids) => { confermate.push(...ids); return Promise.resolve() },
      attesaMs: 5,
      ricordate: { leggi: () => ricordate, scrivi: (x) => { ricordate = x } }
    })
    await vi.waitFor(() => expect(confermate.length).toBeGreaterThan(0))
    ferma()
    expect(scritte).toEqual([])
    expect(confermate[0]).toBe('c-9')
  })

  it('una consegna nuova si scrive e si ricorda su disco', async () => {
    let ricordate: string[] = []
    const consegna = { id: 'c-10', ...base }
    const ferma = avviaRitiro({
      chiedi: () => Promise.resolve({ consegne: [consegna] }),
      consegna: () => {},
      attesaMs: 5,
      ricordate: { leggi: () => ricordate, scrivi: (x) => { ricordate = x } }
    })
    await vi.waitFor(() => expect(ricordate).toEqual([chiaveConsegna(consegna)]))
    ferma()
  })
})
