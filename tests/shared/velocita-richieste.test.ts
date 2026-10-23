import { describe, it, expect } from 'vitest'
import { nuovoAutopilota, parseAutopilota, VERSIONE_AUTOPILOTA, type Autopilota, type ChatGovernata, type Decisione, type ScambioDialogo } from '@shared/autopilota'
import { puntoDi } from '@shared/punto-autopilota'
import {
  durata,
  richiesteArrivate,
  riassuntoVelocita,
  tempiRichieste,
  testoVelocita,
  AIUTO_VELOCITA,
  type ReleaseUscita
} from '@shared/velocita-richieste'

// 0.85.0 — Velocità misurata (c-129). Per ogni richiesta di Nicholas: quando
// arriva, quando parte la prima chat, quando il suo ramo è unito, quando esce
// la versione; e il tempo perso fra i passi.

const MIN = 60_000
const INIZIO = Date.parse('2026-10-23T08:00:00.000Z')
const t = (min: number): string => new Date(INIZIO + min * MIN).toISOString()

const tu = (min: number, testo: string, extra: Partial<ScambioDialogo> = {}): ScambioDialogo => ({ quando: t(min), da: 'tu', testo, ...extra })
const lui = (min: number, testo: string): ScambioDialogo => ({ quando: t(min), da: 'lui', testo })
const apro = (min: number, id: string, compito: string): Decisione => ({ quando: t(min), cosa: `apro la chat ${id} (ramo ap/x/${id}): ${compito}`, traguardo: { chat: id, esito: 'aperta' } })
const tr = (min: number, chat: string, esito: NonNullable<Decisione['traguardo']>['esito'], di?: string): Decisione => ({
  quando: t(min), cosa: `${chat} ${esito}`, traguardo: { chat, esito, ...(di !== undefined ? { di } : {}) }
})
const chat = (id: string, extra: Partial<ChatGovernata> = {}): ChatGovernata => ({ id, compito: `compito di ${id}`, stato: 'finita', cicli: 2, ...extra })

function ap(p: { dialogo?: ScambioDialogo[]; decisioni?: Decisione[]; chats?: ChatGovernata[]; release?: ReleaseUscita[] }): Autopilota {
  return {
    ...nuovoAutopilota({ id: 'ap-1', nome: 'Lavoro', obiettivo: 'La 0.85.0', cwd: 'C:/progetto', criteri: [], iniziatoIl: t(-60) }),
    stato: 'lavoro',
    dialogo: p.dialogo ?? [],
    decisioni: p.decisioni ?? [],
    chats: p.chats ?? [],
    ...(p.release !== undefined ? { releaseUscite: p.release } : {})
  }
}

describe('le richieste arrivate', () => {
  it('ogni messaggio di Nicholas è una richiesta; risposte brevi e «Hai risposto» continuano quella di prima', () => {
    const r = richiesteArrivate(ap({
      dialogo: [
        tu(0, 'Le domande sui rifacimenti non devono più arrivare a me: trova tu la soluzione'),
        lui(1, 'Ricevuto'),
        tu(5, 'rifallo ancora'),
        tu(6, 'Hai risposto: dobbiamo trovare una soluzione', { risponde: 'Come vado avanti?' }),
        tu(7, 'una domanda già risposta', { traccia: true }),
        tu(30, 'Ogni richiesta deve diventare un obiettivo con criterio')
      ]
    }))
    expect(r.map((x) => x.quando)).toEqual([t(0), t(30)])
    expect(r[0]?.testo).toContain('rifacimenti')
  })

  it('una richiesta uscita dal dialogo si ritrova dalla risposta nel diario', () => {
    const r = richiesteArrivate(ap({
      dialogo: [tu(100, 'Seconda richiesta, ancora nel dialogo')],
      decisioni: [
        { quando: t(2), cosa: 'su tua richiesta: Fatto: ho tolto il freno. Da adesso i limiti non bloccano più' },
        { quando: t(101), cosa: 'su tua richiesta: Ricevuto, la faccio' }
      ]
    }))
    expect(r.map((x) => x.quando)).toEqual([t(2), t(100)])
    expect(r[0]?.testo).toContain('freno')
  })
})

describe('i tempi di una richiesta', () => {
  const catena = ap({
    dialogo: [tu(0, 'Misura la velocità dalla richiesta alla versione pubblicata')],
    decisioni: [
      apro(10, 'c-1', 'Velocità misurata'),
      tr(70, 'c-1', 'finito'),
      apro(72, 'c-2', 'Revisione di c-1'),
      tr(100, 'c-2', 'approvato', 'c-1'),
      tr(105, 'c-1', 'unito')
    ],
    chats: [chat('c-1', { conclusa: { il: t(105), come: 'unito' } }), chat('c-2', { ruolo: 'revisione', revisioneDi: 'c-1' })],
    release: [{ versione: '0.84.4', quando: t(50) }, { versione: '0.85.0', quando: t(165) }, { versione: '0.85.1', quando: t(400) }]
  })

  it('dalla richiesta alla versione, passo per passo', () => {
    const [r] = tempiRichieste(catena, INIZIO + 500 * MIN)
    expect(r?.stato).toBe('pubblicata')
    expect(r?.chats).toEqual(['c-1', 'c-2'])
    expect(r?.primaChat).toBe(t(10))
    expect(r?.consegnata).toBe(t(70))
    expect(r?.unita).toBe(t(105))
    expect(r?.versione).toEqual({ versione: '0.85.0', quando: t(165) })
    expect(r?.totale).toBe(165 * MIN)
    expect(r?.persi).toEqual({ partenza: 10 * MIN, attese: 0, revisione: 30 * MIN, unione: 5 * MIN, pubblicazione: 60 * MIN })
  })

  it('le attese di una chat (domanda, ferma, messa da parte) sono tempo perso', () => {
    const a = ap({
      dialogo: [tu(0, 'Correggi la consegna delle risposte')],
      decisioni: [apro(5, 'c-1', 'Risposte prese'), tr(20, 'c-1', 'chiede-te'), tr(45, 'c-1', 'finito'), tr(60, 'c-1', 'unito')],
      chats: [chat('c-1')]
    })
    const [r] = tempiRichieste(a, INIZIO + 100 * MIN)
    expect(r?.persi.attese).toBe(25 * MIN)
    expect(r?.stato).toBe('unita')
    expect(r?.versione).toBeUndefined()
    expect(r?.persi.pubblicazione).toBeUndefined()
  })

  it('una chat ancora al lavoro tiene la richiesta «in corso»', () => {
    const a = ap({
      dialogo: [tu(0, 'Rifai la pagina del telefono')],
      decisioni: [apro(5, 'c-1', 'Pagina'), apro(5, 'c-2', 'App'), tr(40, 'c-1', 'unito')],
      chats: [chat('c-1', { conclusa: { il: t(40), come: 'unito' } }), chat('c-2', { stato: 'lavoro' })]
    })
    expect(tempiRichieste(a, INIZIO + 60 * MIN)[0]?.stato).toBe('in-corso')
  })

  it('una domanda senza lavoro non è una richiesta da misurare', () => {
    const a = ap({
      dialogo: [tu(0, 'a che punto siamo?'), tu(30, 'Togli la domanda sui rifacimenti')],
      decisioni: [apro(32, 'c-1', 'Rifacimenti')],
      chats: [chat('c-1', { stato: 'lavoro' })]
    })
    const r = tempiRichieste(a, INIZIO + 60 * MIN)
    expect(r.map((x) => x.stato)).toEqual(['domanda', 'in-corso'])
    expect(r[1]?.chats).toEqual(['c-1'])
  })

  it('una richiesta appena arrivata, senza chat, è «da fare»', () => {
    const a = ap({ dialogo: [tu(0, 'Aggiungi la velocità al Punto')] })
    expect(tempiRichieste(a, INIZIO + 3 * MIN)[0]?.stato).toBe('da-fare')
  })

  it('un compito messo in coda per una richiesta resta suo anche se la chat parte dopo la richiesta seguente', () => {
    const a = ap({
      dialogo: [tu(0, 'Prima richiesta: il registro dei tempi'), tu(50, 'Seconda richiesta: il Punto sul telefono')],
      decisioni: [
        { quando: t(2), cosa: 'nuovo compito in coda: Registro dei tempi di ogni richiesta, con test' },
        apro(55, 'c-1', 'Registro dei tempi di ogni richiesta, con test'),
        apro(56, 'c-2', 'Il Punto sul telefono')
      ],
      chats: [chat('c-1', { stato: 'lavoro', compito: 'Registro dei tempi di ogni richiesta, con test' }), chat('c-2', { stato: 'lavoro', compito: 'Il Punto sul telefono' })]
    })
    const r = tempiRichieste(a, INIZIO + 60 * MIN)
    expect(r[0]?.chats).toEqual(['c-1'])
    expect(r[1]?.chats).toEqual(['c-2'])
  })

  it('una chat aperta al posto di un’altra lavora per la stessa richiesta', () => {
    const a = ap({
      dialogo: [tu(0, 'Prima richiesta lunga'), tu(20, 'Seconda richiesta, un altro lavoro')],
      decisioni: [apro(2, 'c-1', 'Primo lavoro'), apro(22, 'c-2', 'Secondo lavoro'), apro(30, 'c-3', 'Primo lavoro')],
      chats: [chat('c-1'), chat('c-2', { stato: 'lavoro' }), chat('c-3', { stato: 'lavoro', sostituisce: 'c-1' })]
    })
    const r = tempiRichieste(a, INIZIO + 60 * MIN)
    expect(r[0]?.chats).toEqual(['c-1', 'c-3'])
    expect(r[1]?.chats).toEqual(['c-2'])
  })
})

describe('il riassunto e il testo corto', () => {
  it('durata in parole', () => {
    expect(durata(35 * MIN)).toBe('35 min')
    expect(durata(125 * MIN)).toBe('2 h 05 min')
    expect(durata(26 * 60 * MIN)).toBe('1 g 2 h')
    expect(durata(20_000)).toBe('meno di 1 min')
  })

  it('le mediane contano solo le richieste pubblicate; domande fuori', () => {
    const r = riassuntoVelocita([
      { quando: t(0), testo: 'a', chats: ['c-1'], stato: 'pubblicata', totale: 100 * MIN, persi: { partenza: 10 * MIN, attese: 0, revisione: 20 * MIN, unione: 5 * MIN, pubblicazione: 40 * MIN } },
      { quando: t(1), testo: 'b', chats: ['c-2'], stato: 'pubblicata', totale: 300 * MIN, persi: { partenza: 30 * MIN, attese: 10 * MIN, revisione: 60 * MIN, unione: 5 * MIN, pubblicazione: 100 * MIN } },
      { quando: t(2), testo: 'c', chats: ['c-3'], stato: 'pubblicata', totale: 200 * MIN, persi: { partenza: 20 * MIN, attese: 0, revisione: 40 * MIN, unione: 5 * MIN, pubblicazione: 60 * MIN } },
      { quando: t(3), testo: 'd', chats: [], stato: 'domanda', persi: { attese: 0 } },
      { quando: t(4), testo: 'e', chats: ['c-4'], stato: 'in-corso', persi: { partenza: 5 * MIN, attese: 0 } }
    ])
    expect(r.pubblicate).toBe(3)
    expect(r.aperte).toBe(1)
    expect(r.mediana).toBe(200 * MIN)
    expect(r.persi.pubblicazione).toBe(60 * MIN)
    expect(r.persi.revisione).toBe(40 * MIN)
    const testo = testoVelocita(r)
    expect(testo).toContain('3 h 20 min')
    expect(testo).toContain('pubblicazione 1 h')
    expect(testo!.length).toBeLessThan(160)
  })

  it('senza richieste pubblicate non c’è niente da dire', () => {
    expect(testoVelocita(riassuntoVelocita([]))).toBeUndefined()
  })

  it('il Punto mostra la velocità con la sua spiegazione', () => {
    const a = ap({
      dialogo: [tu(0, 'Misura la velocità')],
      decisioni: [apro(10, 'c-1', 'Velocità'), tr(70, 'c-1', 'finito'), tr(105, 'c-1', 'unito')],
      chats: [chat('c-1', { conclusa: { il: t(105), come: 'unito' } })],
      release: [{ versione: '0.85.0', quando: t(165) }]
    })
    const p = puntoDi(a, INIZIO + 200 * MIN)
    expect(p.velocita?.testo).toContain('2 h 45 min')
    expect(p.velocita?.aiuto).toBe(AIUTO_VELOCITA)
    expect(puntoDi(ap({}), INIZIO).velocita).toBeUndefined()
  })

  it('le release uscite si salvano e si rileggono con l’autopilota', () => {
    const a = ap({ release: [{ versione: '0.85.0', quando: t(165) }] })
    const { autopilota } = parseAutopilota(JSON.parse(JSON.stringify({ ...a, versione: VERSIONE_AUTOPILOTA })))
    expect(autopilota?.releaseUscite).toEqual([{ versione: '0.85.0', quando: t(165) }])
  })
})

describe('i casi veri del registro', () => {
  it('il ramo si unisce a ogni fine turno: conta l’ultima unione, e nessun tempo è negativo', () => {
    const a = ap({
      dialogo: [tu(0, 'Le chat non devono più fermarsi')],
      decisioni: [apro(5, 'c-1', 'Guardiano'), tr(20, 'c-1', 'unito'), tr(50, 'c-1', 'finito'), tr(80, 'c-1', 'unito')],
      chats: [chat('c-1', { conclusa: { il: t(80), come: 'unito' } })],
      release: [{ versione: '0.84.0', quando: t(30) }, { versione: '0.84.1', quando: t(200) }]
    })
    const [r] = tempiRichieste(a, INIZIO + 300 * MIN)
    expect(r?.unita).toBe(t(80))
    expect(r?.versione?.versione).toBe('0.84.1')
    expect(r?.persi.revisione).toBe(30 * MIN)
    expect(Object.values(r!.persi).every((v) => v === undefined || v >= 0)).toBe(true)
  })
})
