import { describe, it, expect } from 'vitest'
import {
  creaRonda, nomePresenza, nomeStaffetta, nomeCoda, presenzaViva, PRESENZA_SCADUTA_MS, BATTITO_OGNI_MS, RILASCIO_DOPO_MS,
  ATTESA_TESTIMONE_MS, type Scatola, type Presenza, type AvvisoProgetto
} from '../../src/main/progetti/presenza'
import { registroVuoto, aggiungiProgetto, type RegistroProgetti } from '../../src/main/progetti/registro'

/**
 * Due PC sullo stesso progetto: chi lo ha in mano lo dice sul Drive, chi
 * arriva dopo lo viene a sapere, e il testimone passa in ordine.
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

function ambiente(opts: { pcId: string; nome: string; scatola: Scatola; registro: RegistroProgetti }) {
  let reg = opts.registro
  let orologio = Date.parse('2026-09-04T18:00:00.000Z')
  let vive: string[] = []
  const avvisi: AvvisoProgetto[] = []
  const ibernate: string[][] = []
  let salvataggi = 0
  let ripristini: string[] = []
  const ronda = creaRonda({
    scatola: () => opts.scatola,
    registro: { leggi: () => reg, scrivi: (r) => { reg = r } },
    pcId: () => opts.pcId,
    pcNome: () => opts.nome,
    vive: () => vive,
    progettoDi: (cwd) => reg.progetti.find((p) => cwd.startsWith(p.percorsi[opts.pcId] ?? '\u0000')),
    salva: () => { salvataggi += 1; return Promise.resolve({ ok: true }) },
    ripristinaProgetto: (id) => { ripristini.push(id); return Promise.resolve({ ok: true }) },
    iberna: (s) => { ibernate.push(s) },
    avvisa: (a) => { avvisi.push(a) },
    adesso: () => orologio,
    // Aspettare fa passare il tempo, e da' all'altro PC l'occasione di rispondere.
    aspetta: (ms) => { orologio += ms; return Promise.resolve() }
  })
  return {
    ronda, avvisi, ibernate,
    salvataggi: () => salvataggi, ripristini: () => ripristini,
    vive: (v: string[]) => { vive = v },
    avanza: (ms: number) => { orologio += ms },
    adesso: () => orologio
  }
}

describe('la ronda dei progetti', () => {
  const registro = aggiungiProgetto(registroVuoto(), { pcId: 'A', percorso: 'E:\\SD', adesso: 'ieri', id: 'p1' }).registro
  const conB = { ...registro, progetti: registro.progetti.map((p) => ({ ...p, percorsi: { ...p.percorsi, B: 'C:\\SD' } })) }

  it('con una chat viva in un progetto libero, la presenza e mia', async () => {
    const scatola = scatolaInMemoria()
    const a = ambiente({ pcId: 'A', nome: 'Torre', scatola, registro })
    a.vive(['s1'])
    await a.ronda.giro()
    const p = scatola.dati.get(nomePresenza('p1')) as Presenza
    expect(p.pcId).toBe('A')
    expect(p.pcNome).toBe('Torre')
    expect(a.ronda.statoDi('p1')?.chi).toBe('io')
    expect(a.ronda.statoDiCwd('E:\\SD\\src')?.chi).toBe('io')
  })

  it('il battito si rinnova mentre lavoro, e senza chat vive la presenza si lascia dopo un po', async () => {
    const scatola = scatolaInMemoria()
    const a = ambiente({ pcId: 'A', nome: 'Torre', scatola, registro })
    a.vive(['s1'])
    await a.ronda.giro()
    const prima = (scatola.dati.get(nomePresenza('p1')) as Presenza).battito
    a.avanza(BATTITO_OGNI_MS + 1000)
    await a.ronda.giro()
    expect((scatola.dati.get(nomePresenza('p1')) as Presenza).battito).not.toBe(prima)
    // Chiudo le chat: per un po' resta mia, poi la lascio.
    a.vive([])
    a.avanza(RILASCIO_DOPO_MS - 60_000)
    await a.ronda.giro()
    expect(scatola.dati.has(nomePresenza('p1'))).toBe(true)
    a.avanza(120_000)
    await a.ronda.giro()
    expect(scatola.dati.has(nomePresenza('p1'))).toBe(false)
    expect(a.ronda.statoDi('p1')?.chi).toBe('libero')
  })

  it('un altro PC lo ha in mano: lo si vede, si avvisa una volta sola, e da qui non si salva', async () => {
    const scatola = scatolaInMemoria()
    const a = ambiente({ pcId: 'A', nome: 'Torre', scatola, registro })
    a.vive(['s1'])
    await a.ronda.giro()
    const b = ambiente({ pcId: 'B', nome: 'Portatile', scatola, registro: conB })
    b.vive(['s9'])
    await b.ronda.giro()
    await b.ronda.giro()
    expect(b.ronda.statoDi('p1')).toMatchObject({ chi: 'altro', pcNome: 'Torre' })
    expect(b.avvisi).toHaveLength(1)
    expect(b.avvisi[0]).toMatchObject({ tipo: 'occupato', pcNome: 'Torre', nome: 'SD' })
    expect(b.ronda.inManoAdAltri().has('p1')).toBe(true)
    // E prima di aprire un'altra chat, non si riavvisa.
    b.ronda.primaDiAprire('C:\\SD\\android')
    expect(b.avvisi).toHaveLength(1)
  })

  it('una presenza scaduta non vale: il progetto e libero', async () => {
    const scatola = scatolaInMemoria()
    const a = ambiente({ pcId: 'A', nome: 'Torre', scatola, registro })
    a.vive(['s1'])
    await a.ronda.giro()
    const b = ambiente({ pcId: 'B', nome: 'Portatile', scatola, registro: conB })
    b.avanza(PRESENZA_SCADUTA_MS + 1000)
    expect(presenzaViva(scatola.dati.get(nomePresenza('p1')) as Presenza, b.adesso())).toBe(false)
    b.vive(['s9'])
    await b.ronda.giro()
    expect((scatola.dati.get(nomePresenza('p1')) as Presenza).pcId).toBe('B')
    expect(b.avvisi).toHaveLength(0)
  })

  it('il passaggio di testimone: B chiede, A salva, iberna e cede, B ripristina e prende', async () => {
    const scatola = scatolaInMemoria()
    const a = ambiente({ pcId: 'A', nome: 'Torre', scatola, registro })
    a.vive(['s1', 's2'])
    await a.ronda.giro()
    const b = ambiente({ pcId: 'B', nome: 'Portatile', scatola, registro: conB })
    // L'attesa di B fa girare A: e' cosi' che «l'altro PC risponde».
    const ronde = { n: 0 }
    const bAspettando = creaRonda({
      scatola: () => scatola,
      registro: { leggi: () => conB, scrivi: () => {} },
      pcId: () => 'B', pcNome: () => 'Portatile',
      vive: () => [], progettoDi: () => undefined,
      salva: () => Promise.resolve({ ok: true }),
      ripristinaProgetto: (id) => { b.ripristini().push(id); return Promise.resolve({ ok: true }) },
      iberna: () => {}, avvisa: () => {},
      adesso: () => b.adesso(),
      aspetta: async () => { ronde.n += 1; b.avanza(3000); await a.ronda.giro() }
    })
    const esito = await bAspettando.prendiTestimone('p1')
    expect(esito).toEqual({ ok: true })
    expect(a.salvataggi()).toBe(1)
    expect(a.ibernate).toEqual([['s1', 's2']])
    expect(a.avvisi.at(-1)).toMatchObject({ tipo: 'ceduto', aNome: 'Portatile', sessioni: ['s1', 's2'] })
    expect(b.ripristini()).toEqual(['p1'])
    expect((scatola.dati.get(nomePresenza('p1')) as Presenza).pcId).toBe('B')
    expect(scatola.dati.has(nomeStaffetta('p1'))).toBe(false)
    expect(bAspettando.statoDi('p1')?.chi).toBe('io')
  })

  it('se l altro PC non risponde lo si dice, e con la forza si prende lo stesso', async () => {
    const scatola = scatolaInMemoria()
    const a = ambiente({ pcId: 'A', nome: 'Torre', scatola, registro })
    a.vive(['s1'])
    await a.ronda.giro()
    // A e' spento: nessuno gira dalla sua parte.
    const b = ambiente({ pcId: 'B', nome: 'Portatile', scatola, registro: conB })
    const inizio = b.adesso()
    const esito = await b.ronda.prendiTestimone('p1')
    expect(esito).toEqual({ ok: false, nonRisponde: true, pcNome: 'Torre' })
    expect(b.adesso() - inizio).toBeGreaterThanOrEqual(ATTESA_TESTIMONE_MS)
    expect(b.ripristini()).toEqual([])
    expect(scatola.dati.has(nomeStaffetta('p1'))).toBe(true)
    const forzato = await b.ronda.prendiTestimone('p1', true)
    expect(forzato).toEqual({ ok: true })
    expect(b.ripristini()).toEqual(['p1'])
    expect((scatola.dati.get(nomePresenza('p1')) as Presenza).pcId).toBe('B')
    expect(scatola.dati.has(nomeStaffetta('p1'))).toBe(false)
  })

  it('la coda condivisa: si scrive da un PC, la consegna chi ha il testimone, una per giro', async () => {
    const scatola = scatolaInMemoria()
    // B mette in fila due comandi, senza avere il testimone.
    const b = ambiente({ pcId: 'B', nome: 'Portatile', scatola, registro: conB })
    let n = 0
    const rondaB = creaRonda({
      scatola: () => scatola, registro: { leggi: () => conB, scrivi: () => {} },
      pcId: () => 'B', pcNome: () => 'Portatile', vive: () => [], progettoDi: () => undefined,
      salva: () => Promise.resolve({ ok: true }), ripristinaProgetto: () => Promise.resolve({ ok: true }),
      iberna: () => {}, avvisa: () => {}, adesso: () => b.adesso(), nuovoId: () => `v${(n += 1)}`
    })
    const c1 = await rondaB.aggiungiInCoda('p1', 'lancia i test')
    expect(c1?.voci.map((v) => [v.id, v.stato, v.daNome])).toEqual([['v1', 'attesa', 'Portatile']])
    await rondaB.aggiungiInCoda('p1', 'poi aggiorna i documenti', 's2')
    await rondaB.modificaInCoda('p1', 'v2', 'poi aggiorna la documentazione')
    expect((await rondaB.coda('p1'))?.voci[1]).toMatchObject({ testo: 'poi aggiorna la documentazione', sessione: 's2', stato: 'attesa' })
    expect(await rondaB.aggiungiInCoda('p1', '   ')).toBeUndefined()

    // A ha il testimone e una chat che aspetta: consegna una voce per giro.
    const consegne: { testo: string; sessione?: string }[] = []
    let pronte: string[] = ['s1']
    const a = ambiente({ pcId: 'A', nome: 'Torre', scatola, registro })
    const rondaA = creaRonda({
      scatola: () => scatola, registro: { leggi: () => registro, scrivi: () => {} },
      pcId: () => 'A', pcNome: () => 'Torre', vive: () => ['s1', 's2'], progettoDi: () => undefined,
      salva: () => Promise.resolve({ ok: true }), ripristinaProgetto: () => Promise.resolve({ ok: true }),
      iberna: () => {}, avvisa: () => {}, adesso: () => a.adesso(),
      consegna: (_p, voce) => {
        const sessione = voce.sessione ?? pronte[0]
        if (sessione === undefined || !pronte.includes(sessione)) return Promise.resolve(undefined)
        consegne.push({ testo: voce.testo, sessione })
        return Promise.resolve({ sessione })
      }
    })
    await rondaA.giro()
    expect(consegne).toEqual([{ testo: 'lancia i test', sessione: 's1' }])
    expect(rondaA.statoDi('p1')?.inCoda).toBe(1)
    // La seconda e' per s2, che non aspetta ancora: resta in coda.
    await rondaA.giro()
    expect(consegne).toHaveLength(1)
    pronte = ['s1', 's2']
    await rondaA.giro()
    expect(consegne).toEqual([{ testo: 'lancia i test', sessione: 's1' }, { testo: 'poi aggiorna la documentazione', sessione: 's2' }])
    const coda = await rondaA.coda('p1')
    expect(coda?.voci.map((v) => [v.stato, v.aNome, v.aSessione])).toEqual([['consegnata', 'Torre', 's1'], ['consegnata', 'Torre', 's2']])
    expect(rondaA.statoDi('p1')?.inCoda).toBe(0)
    // B lo vede, pulisce le consegnate, e la coda sparisce dal Drive.
    expect((await rondaB.pulisciCoda('p1'))?.voci).toEqual([])
    expect(scatola.dati.has(nomeCoda('p1'))).toBe(false)
  })

  it('chi non ha il testimone non consegna niente', async () => {
    const scatola = scatolaInMemoria()
    const a = ambiente({ pcId: 'A', nome: 'Torre', scatola, registro })
    a.vive(['s1'])
    await a.ronda.giro()
    await a.ronda.aggiungiInCoda('p1', 'fai qualcosa')
    const consegne: string[] = []
    const b = ambiente({ pcId: 'B', nome: 'Portatile', scatola, registro: conB })
    const rondaB = creaRonda({
      scatola: () => scatola, registro: { leggi: () => conB, scrivi: () => {} },
      pcId: () => 'B', pcNome: () => 'Portatile', vive: () => ['s9'], progettoDi: () => undefined,
      salva: () => Promise.resolve({ ok: true }), ripristinaProgetto: () => Promise.resolve({ ok: true }),
      iberna: () => {}, avvisa: () => {}, adesso: () => b.adesso(),
      consegna: (_p, voce) => { consegne.push(voce.testo); return Promise.resolve({}) }
    })
    await rondaB.giro()
    expect(consegne).toEqual([])
    expect(rondaB.statoDi('p1')).toMatchObject({ chi: 'altro', inCoda: 1 })
  })

  it('senza scatola (cassaforte chiusa) la ronda tace e il testimone lo dice', async () => {
    const reg = registro
    const ronda = creaRonda({
      scatola: () => undefined, registro: { leggi: () => reg, scrivi: () => {} },
      pcId: () => 'A', pcNome: () => 'Torre', vive: () => ['s1'], progettoDi: () => undefined,
      salva: () => Promise.resolve({ ok: true }), ripristinaProgetto: () => Promise.resolve({ ok: true }),
      iberna: () => {}, avvisa: () => {}
    })
    await ronda.giro()
    expect(ronda.stati()).toEqual([])
    expect(await ronda.prendiTestimone('p1')).toMatchObject({ ok: false })
  })
})
