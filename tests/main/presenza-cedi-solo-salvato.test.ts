import { describe, it, expect } from 'vitest'
import { creaRonda, nomePresenza, nomeStaffetta, type Scatola, type Presenza, type Staffetta } from '../../src/main/progetti/presenza'
import { registroVuoto, aggiungiProgetto } from '../../src/main/progetti/registro'

/**
 * 0.86.2 (I3): chi ha il testimone lo cede solo dopo un salvataggio
 * riuscito. Prima, con il salvataggio fallito, cedeva lo stesso («cedo lo
 * stesso»): l'altro PC scaricava uno stato vecchio. Ora risponde «riprova fra
 * poco» e tiene il progetto; al giro dopo, se il salvataggio riesce, cede.
 */
function scatolaInMemoria(): Scatola & { dati: Map<string, unknown> } {
  const dati = new Map<string, unknown>()
  return {
    dati,
    leggi: <T,>(nome: string) => Promise.resolve(dati.get(nome) as T | undefined),
    scrivi: (nome, oggetto) => { dati.set(nome, JSON.parse(JSON.stringify(oggetto))); return Promise.resolve() },
    cancella: (nome) => { dati.delete(nome); return Promise.resolve() }
  }
}

describe('il testimone si cede solo dopo un salvataggio riuscito', () => {
  const registro = aggiungiProgetto(registroVuoto(), { pcId: 'A', percorso: 'E:\\SD', adesso: 'ieri', id: 'p1' }).registro
  const conB = { ...registro, progetti: registro.progetti.map((p) => ({ ...p, percorsi: { ...p.percorsi, B: 'C:\\SD' } })) }

  function pcA(scatola: Scatola, esitoSalva: () => { ok: boolean; messaggio?: string; annullato?: boolean }, orologio: { t: number }) {
    const ibernate: string[][] = []
    const ronda = creaRonda({
      scatola: () => scatola,
      registro: { leggi: () => registro, scrivi: () => {} },
      pcId: () => 'A', pcNome: () => 'Torre',
      vive: () => ['s1'],
      progettoDi: () => undefined,
      salva: () => Promise.resolve(esitoSalva()),
      ripristinaProgetto: () => Promise.resolve({ ok: true }),
      iberna: (s) => { ibernate.push(s) },
      avvisa: () => {},
      adesso: () => orologio.t
    })
    return { ronda, ibernate }
  }

  it('salvataggio fallito: A non cede, risponde «riprova», e B lo sa subito', async () => {
    const scatola = scatolaInMemoria()
    const orologio = { t: Date.parse('2026-10-30T09:00:00.000Z') }
    let salvaOk = false
    const a = pcA(scatola, () => (salvaOk ? { ok: true } : { ok: false, messaggio: 'LAVORO_IN_CORSO' }), orologio)
    await a.ronda.giro()
    expect((scatola.dati.get(nomePresenza('p1')) as Presenza).pcId).toBe('A')

    const ripristini: string[] = []
    const b = creaRonda({
      scatola: () => scatola,
      registro: { leggi: () => conB, scrivi: () => {} },
      pcId: () => 'B', pcNome: () => 'Portatile',
      vive: () => [], progettoDi: () => undefined,
      salva: () => Promise.resolve({ ok: true }),
      ripristinaProgetto: (id) => { ripristini.push(id); return Promise.resolve({ ok: true }) },
      iberna: () => {}, avvisa: () => {},
      adesso: () => orologio.t,
      // L'attesa di B fa girare A: e' cosi' che «l'altro PC risponde».
      aspetta: async (ms) => { orologio.t += ms; await a.ronda.giro() }
    })
    const esito = await b.prendiTestimone('p1')
    expect(esito.ok).toBe(false)
    expect('messaggio' in esito ? esito.messaggio : '').toMatch(/Riprova fra poco/)
    expect('messaggio' in esito ? esito.messaggio : '').toMatch(/LAVORO_IN_CORSO/)
    // A ha tenuto il testimone e le chat: niente ibernate, presenza sua.
    expect(a.ibernate).toEqual([])
    expect((scatola.dati.get(nomePresenza('p1')) as Presenza).pcId).toBe('A')
    expect(a.ronda.statoDi('p1')?.chi).toBe('io')
    // B non ha scaricato niente, e la richiesta e' ritirata.
    expect(ripristini).toEqual([])
    expect(scatola.dati.has(nomeStaffetta('p1'))).toBe(false)

    // Riprovando, con il salvataggio che ora riesce, il testimone passa.
    salvaOk = true
    const di = await b.prendiTestimone('p1')
    expect(di).toEqual({ ok: true })
    expect(a.ibernate).toEqual([['s1']])
    expect(ripristini).toEqual(['p1'])
    expect((scatola.dati.get(nomePresenza('p1')) as Presenza).pcId).toBe('B')
  })

  it('un salvataggio annullato non vale come riuscito', async () => {
    const scatola = scatolaInMemoria()
    const orologio = { t: Date.parse('2026-10-30T09:00:00.000Z') }
    const a = pcA(scatola, () => ({ ok: true, annullato: true }), orologio)
    await a.ronda.giro()
    // Una richiesta di un client vecchio: senza campi nuovi.
    await scatola.scrivi(nomeStaffetta('p1'), { daPc: 'B', daNome: 'Vecchio', quando: new Date(orologio.t).toISOString() } satisfies Staffetta)
    await a.ronda.giro()
    expect(a.ibernate).toEqual([])
    expect((scatola.dati.get(nomePresenza('p1')) as Presenza).pcId).toBe('A')
    // La risposta e' dentro la staffetta, accanto ai campi che il client vecchio conosce.
    expect(scatola.dati.get(nomeStaffetta('p1'))).toMatchObject({ daPc: 'B', daNome: 'Vecchio', risposta: 'riprova', motivo: 'salvataggio annullato' })
  })
})
