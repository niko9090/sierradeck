import { describe, it, expect } from 'vitest'
import { creaConsegne, type Consegna } from '../../src/autopilot-host/consegne'

const base = (over: Partial<Consegna> = {}): Omit<Consegna, 'id'> => ({
  autopilotaId: 'ap-1',
  chatId: 'ch-1',
  cwd: 'C:\\progetto',
  sessionId: '11111111-1111-4111-8111-111111111111',
  titolo: 'Notte',
  cosa: 'scrivi',
  testo: 'continua',
  ...over
})

describe('la coda delle consegne', () => {
  it('tiene quello che va consegnato finche qualcuno non passa a ritirarlo', () => {
    const c = creaConsegne()
    c.metti(base())
    expect(c.inAttesa()).toBe(1)
    const ritirate = c.preleva()
    expect(ritirate.map((x) => x.testo)).toEqual(['continua'])
    // Chi ritira si prende la responsabilità: la coda resta vuota.
    expect(c.inAttesa()).toBe(0)
  })

  it('una istruzione nuova sostituisce quella non ancora ritirata', () => {
    // Sono istruzioni successive dello stesso ragionamento: consegnarle
    // entrambe farebbe lavorare la chat su un ordine già superato prima ancora
    // di leggere quello buono.
    const c = creaConsegne()
    c.metti(base({ testo: 'prova questo' }))
    c.metti(base({ testo: 'no, prova quest altro' }))
    expect(c.preleva().map((x) => x.testo)).toEqual(['no, prova quest altro'])
  })

  it('ma non fra chat diverse, che stanno facendo cose diverse', () => {
    const c = creaConsegne()
    c.metti(base({ chatId: 'ch-1', testo: 'a' }))
    c.metti(base({ chatId: 'ch-2', testo: 'b' }))
    expect(c.preleva()).toHaveLength(2)
  })

  it('interrompere non cancella lo scrivere: sono due ordini diversi', () => {
    const c = creaConsegne()
    c.metti(base({ testo: 'lavora' }))
    c.metti(base({ cosa: 'interrompi', testo: '' }))
    expect(c.preleva().map((x) => x.cosa)).toEqual(['scrivi', 'interrompi'])
  })

  it('fermare un autopilota gli toglie gli ordini in coda', () => {
    // Consegnargli istruzioni dopo che è stato fermato vorrebbe dire farlo
    // ripartire senza che nessuno l'abbia chiesto.
    const c = creaConsegne()
    c.metti(base({ autopilotaId: 'ap-1' }))
    c.metti(base({ autopilotaId: 'ap-2', chatId: 'ch-9' }))
    c.dimentica('ap-1')
    expect(c.preleva().map((x) => x.autopilotaId)).toEqual(['ap-2'])
  })

  it('non cresce all infinito quando nessuno ritira', () => {
    // Il Gestore chiuso, o senza finestre: accumulare per ore significherebbe
    // scrivere cento messaggi dentro una chat al suo ritorno.
    const c = creaConsegne()
    for (let i = 0; i < 200; i += 1) c.metti(base({ chatId: `ch-${i}` }))
    expect(c.inAttesa()).toBeLessThanOrEqual(50)
    // Restano le più recenti, che sono quelle che contano.
    expect(c.preleva().at(-1)?.chatId).toBe('ch-199')
  })
})
