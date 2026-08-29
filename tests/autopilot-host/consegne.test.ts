import { describe, it, expect } from 'vitest'
import {
  creaConsegne,
  RICONSEGNA_MS,
  TENTATIVI_MAX,
  type Consegna
} from '../../src/autopilot-host/consegne'

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

describe('la conferma di consegna', () => {
  const una = (over: Partial<Consegna> = {}): Omit<Consegna, 'id'> => ({
    autopilotaId: 'ap-1', chatId: 'ch-1', cwd: 'C:' + String.fromCharCode(92) + 'p',
    sessionId: 's-1', titolo: 'prova', cosa: 'scrivi', testo: 'fai la cosa', ...over
  })

  it('ritirare NON svuota: si aspetta che qualcuno confermi', () => {
    // E' il difetto che si sta chiudendo: prima la coda si fidava della rete.
    // Una risposta persa per strada, o il Gestore chiuso un istante dopo, e
    // l'istruzione spariva — con l'autopilota fermo ad aspettare la risposta a
    // un messaggio che nessuno ha mai scritto.
    const c = creaConsegne()
    c.metti(una())
    expect(c.ritira(1000)).toHaveLength(1)
    expect(c.inAttesa()).toBe(1)
  })

  it('confermare la toglie', () => {
    const c = creaConsegne()
    c.metti(una())
    const [presa] = c.ritira(1000)
    expect(c.conferma([presa!.id])).toBe(1)
    expect(c.inAttesa()).toBe(0)
    expect(c.ritira(999_999)).toEqual([])
  })

  it('non la ripropone subito: chi l ha presa la sta ancora scrivendo', () => {
    // Il Gestore passa ogni secondo e mezzo: senza attesa la stessa istruzione
    // gli arriverebbe quattro volte prima che abbia finito di scriverla.
    const c = creaConsegne()
    c.metti(una())
    expect(c.ritira(1000)).toHaveLength(1)
    expect(c.ritira(2000)).toEqual([])
    expect(c.ritira(4000)).toEqual([])
  })

  it('senza conferma torna, che e tutto il punto', () => {
    const c = creaConsegne()
    c.metti(una())
    const [prima] = c.ritira(1000)
    const [dopo] = c.ritira(1000 + RICONSEGNA_MS)
    // Lo stesso id: chi la riceve deve poter capire che l'ha gia' vista.
    expect(dopo?.id).toBe(prima?.id)
  })

  it('dopo troppi tentativi la lascia andare invece di riproporla per sempre', () => {
    // Una consegna che non arriva mai — la chat non esiste piu' — resterebbe
    // in coda fino a spegnimento, riproposta ogni venti secondi.
    const c = creaConsegne()
    c.metti(una())
    let quando = 1000
    for (let giro = 0; giro < TENTATIVI_MAX; giro += 1) {
      expect(c.ritira(quando)).toHaveLength(1)
      quando += RICONSEGNA_MS
    }
    expect(c.ritira(quando)).toEqual([])
    expect(c.inAttesa()).toBe(0)
  })

  it('una consegna nuova per la stessa chat sostituisce quella in volo', () => {
    // Sono istruzioni successive dello stesso ragionamento: consegnare anche
    // quella vecchia farebbe lavorare la chat su un ordine gia' superato.
    const c = creaConsegne()
    c.metti(una({ testo: 'la prima' }))
    c.ritira(1000)
    c.metti(una({ testo: 'la seconda' }))
    expect(c.inAttesa()).toBe(1)
    expect(c.ritira(2000).map((x) => x.testo)).toEqual(['la seconda'])
  })

  it('dimenticare un autopilota toglie anche quelle gia in volo', () => {
    // Fermarlo non deve lasciargli ordini in giro: una consegna ritirata ma non
    // confermata tornerebbe altrimenti dopo che l'autopilota e' stato fermato.
    const c = creaConsegne()
    c.metti(una())
    c.ritira(1000)
    c.dimentica('ap-1')
    expect(c.inAttesa()).toBe(0)
  })
})
