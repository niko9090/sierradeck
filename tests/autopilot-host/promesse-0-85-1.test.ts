import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import { componiPromptDialogo, leggiEsitoDialogo } from '../../src/autopilot-host/dialogo'
import { nuovoAutopilota, parseAutopilota, type Autopilota } from '@shared/autopilota'
import { indicatoreDi } from '@shared/indicatore-autopilota'
import {
  frasiChePromettono, giroPromesse, promesseAperte, promesseDallaRisposta, promette, righePromesse, RINVII_MAX,
  type Promessa
} from '@shared/promesse'

/**
 * Le promesse mantenute (0.85.1).
 *
 * Nicholas, 23/10 sera: «dice spesso che mi tiene aggiornato ma questo non
 * succede mai». Le frasi qui sotto sono le risposte vere dell'autopilota del
 * 22 e 23/10, come stanno nel suo dialogo: nessuna era legata a niente, e
 * nessuna è stata mantenuta da sola.
 */

// 22/10 23:28 (ora italiana): la 0.84.2 proposta con il solo freno tolto.
const DEL_22_10_2128 = 'Fatto: ho tolto il freno.\n\n**Ti propongo:** pubblico adesso la 0.84.2 **solo con questa correzione**, così la installi stasera e il lavoro riparte subito con tutte le chat. Le altre correzioni andranno nella 0.84.3.\n\nScrivimi «pubblica» e la preparo; ti avviso io quando è pronta da installare.'
// 22/10 23:38: la pubblicazione ripartita; l'unica versione nominata è quella dell'app.
const DEL_22_10_2138 = 'La pubblicazione è in corso.\n\n**Cosa manca:** l\'installatore, poi l\'app Android (resta la 2.84.1, viene solo riallegata), poi il controllo che la release sia completa e non in bozza.\n\nAppena è pronta te lo scrivo qui. Poi la installi tu, quando vuoi, e le chat ripartono da sole.'
// 23/10 11:49.
const DEL_23_10_0949 = 'Ecco dove siamo (ho controllato adesso):\n\n**Installata da te:** la 0.84.3, stamattina alle 08:44.\n\nLe ho messe adesso in coda come lavori veri, per la **0.84.4**. Partono subito, insieme alla Revisione.\n\nDa te non serve niente: ti dico io quando la 0.84.4 è pronta da installare.'
// 23/10 14:28: la versione è nel titolo, non nella frase.
const DEL_23_10_1228 = '**0.84.4: tutte le correzioni che mi hai chiesto sono in main.**\n\n**Pubblicazione:** adesso due chat lavorano sulla release, una per l\'ultima revisione e una per il rilascio. Non è ancora pubblicata. Quando è pronta te lo dico qui, e la installi tu.\n\n**Cosa ti propongo per dopo la 0.84.4** (è una funzione nuova, quindi 0.85.0):'
// 23/10 14:39: una promessa che non si lega a nessun fatto.
const DEL_23_10_1239 = 'Ricevuto, la faccio: sarà la **0.85.0**.\n\nTi scrivo io a ogni passo importante. Da te serve solo installare, quando sono pronte.'
// 23/10 21:10.
const DEL_23_10_1910 = '**Domande:** le ricontrollo tutte, una per una, sul registro di oggi. Ogni domanda che non dovevi ricevere diventa un test, così non torna.\n\nDa te non serve niente. Ti avviso quando la 0.85.1 è pronta da installare.'
// 23/10 21:12: parla delle promesse, non ne fa.
const DEL_23_10_1912 = 'Hai ragione. Ho controllato e il motivo è semplice: quando ti scrivo «ti avviso io», **nel programma non c\'è niente che lo faccia davvero**. Io rispondo e poi parlo di nuovo solo se mi scrivi tu. La promessa resta nel testo e non è legata a niente. È colpa mia, e non ti scrivo più promesse vuote.\n\n**Cosa cambia nella 0.85.1:**\n1. Ogni volta che ti dico «ti avviso quando…», il programma la registra come promessa legata a un fatto preciso: versione pubblicata, lavoro unito, richiesta chiusa, chat che si blocca.\n2. Quando quel fatto succede, il messaggio ti arriva da solo, qui e sul telefono, con la prova.\n3. Se il fatto non arriva nel tempo previsto, ti scrivo lo stesso: «non ancora, perché…».\n4. Se non posso legare la promessa a niente, non la scrivo.'

const uscite = (...v: string[]): Autopilota['releaseUscite'] => v.map((versione, i) => ({ versione, quando: new Date(Date.parse('2026-10-20T10:00:00Z') + i * 3_600_000).toISOString() }))

function ap(p: Partial<Autopilota> = {}): Autopilota {
  return {
    ...nuovoAutopilota({
      id: 'ap-pro',
      nome: 'Prova',
      obiettivo: 'Il programma',
      cwd: process.cwd(),
      criteri: [
        { descrizione: '0.85.1 — Il supervisore risponde', comando: 'true', soddisfatto: true },
        { descrizione: '0.85.1 — Promesse mantenute', soddisfatto: false },
        { descrizione: '0.85.1 — Guardia del PC', soddisfatto: false }
      ],
      iniziatoIl: '2026-10-23T06:00:00.000Z'
    }),
    stato: 'lavoro',
    ...p
  }
}

describe('quali frasi promettono (pura)', () => {
  it('le promesse vere del 22 e 23/10 sì', () => {
    expect(promette('Scrivimi «pubblica» e la preparo; ti avviso io quando è pronta da installare.')).toBe(true)
    expect(promette('Appena è pronta te lo scrivo qui.')).toBe(true)
    expect(promette('Da te non serve niente: ti dico io quando la 0.84.4 è pronta da installare.')).toBe(true)
    expect(promette('Quando è pronta te lo dico qui, e la installi tu.')).toBe(true)
    expect(promette('Ti scrivo io a ogni passo importante.')).toBe(true)
    expect(promette('Ti avviso quando la 0.85.1 è pronta da installare.')).toBe(true)
    expect(promette('Ti tengo aggiornato.')).toBe(true)
  })

  it('chi parla delle promesse, racconta o dice «adesso» no', () => {
    expect(frasiChePromettono(DEL_23_10_1912)).toEqual([])
    expect(promette('Ti dico com\'è andata davvero, poi come cambio.')).toBe(false)
    expect(promette('Il primo tentativo si è fermato a metà, ti dico perché.')).toBe(false)
    expect(promette('Se il fatto non arriva nel tempo previsto, ti scrivo lo stesso.')).toBe(false)
    expect(promette('Non ti avviso più a vuoto.')).toBe(false)
  })
})

describe('dalla risposta alla promessa registrata (pura, risposte vere)', () => {
  const quando = '2026-10-23T19:10:21.264Z'

  it('23/10 21:10: «ti avviso quando la 0.85.1 è pronta» → la 0.85.1 pubblicata, entro 6 ore', () => {
    const r = promesseDallaRisposta({ risposta: DEL_23_10_1910, proposte: [], a: ap({ releaseUscite: uscite('0.84.4', '0.85.0') }), quando })
    expect(r.tolte).toEqual([])
    expect(r.risposta).toBe(DEL_23_10_1910)
    expect(r.nuove).toEqual([{ id: 'p-1', quando, frase: 'Ti avviso quando la 0.85.1 è pronta da installare.', fatto: { tipo: 'release', versione: '0.85.1' }, scadenza: '2026-10-24T01:10:21.264Z', da: 'programma' }])
  })

  it('23/10 11:49 e 14:28: la 0.84.4, anche quando la versione è solo nel titolo', () => {
    const a = ap({ releaseUscite: uscite('0.84.2', '0.84.3') })
    expect(promesseDallaRisposta({ risposta: DEL_23_10_0949, proposte: [], a, quando }).nuove[0]!.fatto).toEqual({ tipo: 'release', versione: '0.84.4' })
    expect(promesseDallaRisposta({ risposta: DEL_23_10_1228, proposte: [], a, quando }).nuove[0]!.fatto).toEqual({ tipo: 'release', versione: '0.84.4' })
  })

  it('22/10 23:28: la 0.84.2 proposta, non la 0.84.3 nominata dopo', () => {
    const r = promesseDallaRisposta({ risposta: DEL_22_10_2128, proposte: [], a: ap({ releaseUscite: uscite('0.84.0', '0.84.1') }), quando })
    expect(r.nuove.map((p) => p.fatto)).toEqual([{ tipo: 'release', versione: '0.84.2' }])
  })

  it('22/10 23:38: la 2.84.1 è l’app, non conta; vale la prossima versione dei criteri', () => {
    const r = promesseDallaRisposta({ risposta: DEL_22_10_2138, proposte: [], a: ap({ releaseUscite: uscite('0.85.0') }), quando })
    expect(r.nuove.map((p) => p.fatto)).toEqual([{ tipo: 'release', versione: '0.85.1' }])
  })

  it('23/10 14:39: «ti scrivo io a ogni passo importante» non si lega a niente e si toglie', () => {
    const r = promesseDallaRisposta({ risposta: DEL_23_10_1239, proposte: [], a: ap(), quando })
    expect(r.nuove).toEqual([])
    expect(r.tolte).toEqual(['Ti scrivo io a ogni passo importante.'])
    expect(r.risposta).toBe('Ricevuto, la faccio: sarà la **0.85.0**.\n\nDa te serve solo installare, quando sono pronte.')
  })

  it('23/10 21:12: nessuna promessa, niente tolto', () => {
    const r = promesseDallaRisposta({ risposta: DEL_23_10_1912, proposte: [], a: ap(), quando })
    expect(r).toEqual({ risposta: DEL_23_10_1912, nuove: [], tolte: [] })
  })

  it('il fatto del supervisore vince se si controlla; una promessa uguale già aperta non si duplica', () => {
    const a = ap({ chats: [{ id: 'c-147', compito: 'promesse mantenute', stato: 'lavoro', cicli: 1, ramo: 'ap/c-147' }] })
    const risposta = 'La correzione è quasi pronta. Ti scrivo appena il lavoro delle promesse è unito.'
    const r = promesseDallaRisposta({ risposta, proposte: [{ frase: 'Ti scrivo appena il lavoro delle promesse è unito.', fatto: { tipo: 'unito', chat: 'c-147' }, entroOre: 2 }], a, quando })
    expect(r.nuove).toMatchObject([{ fatto: { tipo: 'unito', chat: 'c-147' }, da: 'supervisore', scadenza: '2026-10-23T21:10:21.264Z' }])
    const dopo = { ...a, promesse: r.nuove }
    expect(promesseDallaRisposta({ risposta, proposte: [{ frase: 'Ti scrivo appena il lavoro delle promesse è unito.', fatto: { tipo: 'unito', chat: 'c-147' } }], a: dopo, quando }).nuove).toEqual([])
    // Una chat che non c'è non si controlla: la frase senza altro fatto si toglie.
    const finta = promesseDallaRisposta({ risposta, proposte: [{ frase: 'Ti scrivo appena il lavoro delle promesse è unito.', fatto: { tipo: 'unito', chat: 'c-999' } }], a, quando })
    expect(finta.nuove).toEqual([])
    expect(finta.tolte).toHaveLength(1)
  })

  it('il JSON del supervisore porta le promesse; il prompt vieta quelle senza fatto e mostra le aperte', () => {
    const e = leggiEsitoDialogo(JSON.stringify({ risposta: 'Ti avviso quando la 0.85.1 è pubblicata.', promesse: [{ frase: 'Ti avviso quando la 0.85.1 è pubblicata.', fatto: 'release', di: 'v0.85.1', entroOre: 4 }, { frase: 'x', fatto: 'boh' }] }))
    expect(e?.promesse).toEqual([{ frase: 'Ti avviso quando la 0.85.1 è pubblicata.', fatto: { tipo: 'release', versione: '0.85.1' }, entroOre: 4 }])
    const aperta: Promessa = { id: 'p-1', quando, frase: 'Ti avviso quando la 0.85.1 è pronta da installare.', fatto: { tipo: 'release', versione: '0.85.1' }, scadenza: '2026-10-24T01:10:21.264Z', da: 'programma' }
    const prompt = componiPromptDialogo(ap({ promesse: [aperta] }), 'a che punto siamo?')
    expect(prompt).toContain('**Vietato** promettere ciò che non si lega a')
    expect(prompt).toContain('"promesse": [{"frase"')
    expect(prompt).toContain('- «Ti avviso quando la 0.85.1 è pronta da installare.» → la 0.85.1 pubblicata')
  })
})

describe('il giro delle promesse (pura)', () => {
  const promessa = (p: Partial<Promessa> = {}): Promessa => ({ id: 'p-1', quando: '2026-10-23T19:10:21.264Z', frase: 'Ti avviso quando la 0.85.1 è pronta da installare.', fatto: { tipo: 'release', versione: '0.85.1' }, scadenza: '2026-10-24T01:10:21.264Z', da: 'programma', ...p })

  it('la release esce: il messaggio con la prova, e la promessa si chiude', () => {
    const a = ap({ promesse: [promessa()], releaseUscite: [{ versione: '0.85.0', quando: '2026-10-23T15:10:00.000Z' }, { versione: '0.85.1', quando: '2026-10-23T23:40:00.000Z' }] })
    const g = giroPromesse(a, '2026-10-23T23:41:00.000Z')!
    expect(g.messaggi).toEqual([{
      promessa: 'p-1',
      titolo: 'Come promesso: la 0.85.1 pubblicata',
      testo: 'Come promesso il 23/10 21:10 («Ti avviso quando la 0.85.1 è pronta da installare.»): la 0.85.1 pubblicata. Prova: la 0.85.1 è pubblicata: release v0.85.1 su GitHub, uscita il 24/10 01:40, non in bozza.'
    }])
    expect(g.promesse[0]!.chiusa).toMatchObject({ come: 'mantenuta', il: '2026-10-23T23:41:00.000Z' })
    expect(giroPromesse({ ...a, promesse: g.promesse }, '2026-10-23T23:42:00.000Z')).toBeUndefined()
  })

  it('esce una versione dopo (la 0.84.2 saltata per la 0.84.3): mantenuta lo stesso', () => {
    const a = ap({ promesse: [promessa({ fatto: { tipo: 'release', versione: '0.84.2' } })], releaseUscite: uscite('0.84.1', '0.84.3') })
    expect(giroPromesse(a, '2026-10-23T20:00:00.000Z')!.messaggi[0]!.testo).toContain('è uscita la 0.84.3, che contiene la 0.84.2')
  })

  it('alla scadenza senza il fatto: «non ancora, perché…» coi pezzi che mancano, e rimanda; dopo 3 volte non rimanda più', () => {
    let a = ap({ promesse: [promessa()], releaseUscite: uscite('0.85.0') })
    expect(giroPromesse(a, '2026-10-24T01:00:00.000Z')).toBeUndefined()
    const g = giroPromesse(a, '2026-10-24T01:11:00.000Z')!
    expect(g.messaggi[0]!.testo).toBe('Non ancora: il 23/10 21:10 ti ho promesso «Ti avviso quando la 0.85.1 è pronta da installare.» entro le 24/10 03:10. Perché: della 0.85.1 sono pronti 1 pezzi su 3; manca «Promesse mantenute» e altri 1 · nessuna chat al lavoro adesso. Te lo scrivo appena succede, o entro il 24/10 09:11 con il punto.')
    expect(g.promesse[0]).toMatchObject({ rinvii: 1, scadenza: '2026-10-24T07:11:00.000Z' })
    a = { ...a, promesse: g.promesse }
    for (let i = 1; i < RINVII_MAX; i += 1) a = { ...a, promesse: giroPromesse(a, a.promesse![0]!.scadenza)!.promesse }
    expect(a.promesse![0]!.rinvii).toBe(RINVII_MAX)
    expect(giroPromesse(a, '2026-10-30T00:00:00.000Z')).toBeUndefined()
    expect(righePromesse(a, Date.parse('2026-10-30T00:00:00.000Z'))[0]).toMatch(/^Ti ho promesso: la 0\.85\.1 pubblicata · in ritardo di /)
    // E quando esce, la promessa si mantiene lo stesso.
    expect(giroPromesse({ ...a, releaseUscite: uscite('0.85.0', '0.85.1') }, '2026-10-30T00:00:00.000Z')!.messaggi[0]!.titolo).toBe('Come promesso: la 0.85.1 pubblicata')
  })

  it('il ramo unito dal programma; la chat chiusa senza unire chiude la promessa con il perché', () => {
    const chat = { id: 'c-147', compito: 'promesse mantenute', stato: 'lavoro' as const, cicli: 1, ramo: 'ap/c-147' }
    const unito = ap({
      promesse: [promessa({ frase: 'Ti scrivo appena è unito.', fatto: { tipo: 'unito', chat: 'c-147' } })],
      chats: [chat],
      decisioni: [{ quando: '2026-10-23T22:00:00.000Z', cosa: 'unito il ramo ap/c-147 in main', traguardo: { chat: 'c-147', esito: 'unito' } }]
    })
    expect(giroPromesse(unito, '2026-10-23T22:01:00.000Z')!.messaggi[0]!.testo).toContain('Prova: unito il ramo in main (24/10 00:00)')
    const tolta = ap({
      promesse: [promessa({ frase: 'Ti scrivo appena è unito.', fatto: { tipo: 'unito', chat: 'c-147' } })],
      chats: [{ ...chat, stato: 'finita', lasciataFuori: { il: '2026-10-23T22:00:00.000Z', perche: 'doppione di c-146, già in main' } }]
    })
    const g = giroPromesse(tolta, '2026-10-23T22:01:00.000Z')!
    expect(g.promesse[0]!.chiusa?.come).toBe('superata')
    expect(g.messaggi[0]!.testo).toContain('è stata chiusa senza unire il suo ramo: doppione di c-146, già in main')
  })

  it('la chat che si blocca dopo la promessa, la richiesta fatta, il criterio verde', () => {
    const bloccata = ap({
      promesse: [promessa({ frase: 'Se una chat si blocca ti avviso.', fatto: { tipo: 'bloccata' } })],
      chats: [{ id: 'c-1', compito: 'il menu', stato: 'lavoro', cicli: 1, segnale: { tipo: 'bloccata', motivo: 'manca la chiave di GitHub', quando: '2026-10-23T20:00:00.000Z', dichiarato: true } }]
    })
    expect(giroPromesse(bloccata, '2026-10-23T20:01:00.000Z')!.messaggi[0]!.testo).toContain('è bloccata: manca la chiave di GitHub')
    const richiesta = ap({
      promesse: [promessa({ frase: 'Te lo dico appena la richiesta è fatta.', fatto: { tipo: 'richiesta', richiesta: 'r-1' } })],
      richieste: [{ id: 'r-1', quando: '2026-10-23T19:00:00.000Z', testo: 'mantieni le promesse', titolo: 'Promesse mantenute', criterio: '0.85.1 — Promesse mantenute', compiti: [], da: 'programma', commit: 'abc1234' }],
      criteri: [{ descrizione: '0.85.1 — Promesse mantenute', soddisfatto: true }]
    })
    expect(giroPromesse(richiesta, '2026-10-23T20:01:00.000Z')!.messaggi[0]!.testo).toContain('Prova: criterio soddisfatto: «0.85.1 — Promesse mantenute» · commit abc1234')
    const criterio = ap({ promesse: [promessa({ frase: 'Ti avviso quando la guardia è verde.', fatto: { tipo: 'criterio', criterio: '0.85.1 — Guardia del PC' } })] })
    expect(giroPromesse(criterio, '2026-10-23T20:01:00.000Z')).toBeUndefined()
    const verde = { ...criterio, criteri: criterio.criteri.map((c) => ({ ...c, soddisfatto: true })) }
    expect(giroPromesse(verde, '2026-10-23T20:01:00.000Z')!.messaggi[0]!.titolo).toBe('Come promesso: il criterio «Guardia del PC» soddisfatto')
  })

  it('su disco e nell’indicatore, uguale su PC, pagina e app', () => {
    const a = ap({ promesse: [promessa(), promessa({ id: 'p-2', chiusa: { il: '2026-10-23T20:00:00.000Z', come: 'mantenuta', prova: 'x' } }), { id: 'rotta' } as unknown as Promessa] })
    const letto = parseAutopilota({ ...JSON.parse(JSON.stringify(a)), versione: 1 })
    expect(letto.autopilota?.promesse?.map((p) => p.id)).toEqual(['p-1', 'p-2'])
    expect(promesseAperte(letto.autopilota!)).toHaveLength(1)
    expect(indicatoreDi(letto.autopilota!, Date.parse('2026-10-23T20:00:00.000Z')).promesse).toEqual(['Ti ho promesso: la 0.85.1 pubblicata · entro il 24/10 03:10'])
  })
})

// ---- Il servizio vero ----

let server: ServerAutopiloti | undefined
let porta: number
let archivio: Archivio
let orologio = '2026-10-23T19:10:21.264Z'
const avvisi: string[] = []

async function avvia(risposta: () => string): Promise<void> {
  archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-pro-')))
  avvisi.length = 0
  const s = creaServer({
    archivio,
    memoria: apriMemoria(mkdtempSync(join(tmpdir(), 'ap-pro-mem-'))),
    versione: '0.85.1',
    esegui: () => Promise.resolve({ codice: 1, uscita: 'non ancora' }),
    interroga: () => Promise.resolve({ testo: risposta() }),
    avviaLavoro: () => Promise.resolve(),
    fermaLavoro: () => {},
    avvisa: (_t, _a, testo) => { avvisi.push(testo ?? ''); return Promise.resolve() },
    domande: creaRegistroDomande({ adesso: () => Date.now() }),
    ultimoDetto: () => 'sto lavorando',
    scadenzaDomandaMs: 5000,
    scadenzaInterviataMs: 5000,
    adesso: () => orologio
  })
  server = s
  await new Promise<void>((ris) => s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }))
}

afterEach(() => { server?.close(); server = undefined; vi.restoreAllMocks() })

const scrivi = (testo: string): Promise<Response> => fetch(`http://127.0.0.1:${porta}/autopiloti/ap-pro/dialogo`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ testo })
})
async function attendi(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 160 && !cond(); i += 1) await new Promise((r) => setTimeout(r, 25))
}
const sua = (): Autopilota => archivio.leggi('ap-pro')!

describe('il servizio: la promessa del 23/10 alle 21:10 mantenuta da sola', () => {
  it('la risposta la registra, la frase senza fatto esce, e all’uscita della 0.85.1 scrive da solo con la prova e la notifica', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    orologio = '2026-10-23T19:10:21.264Z'
    await avvia(() => JSON.stringify({ risposta: `${DEL_23_10_1910}\n\nTi scrivo io a ogni passo importante.`, richieste: [] }))
    archivio.scrivi(ap({ releaseUscite: uscite('0.84.4', '0.85.0') }))
    expect((await scrivi('il testo va a scatti, e dici che mi avvisi ma non succede mai')).status).toBe(202)
    await attendi(() => sua().dialogo.some((s) => s.da === 'lui'))
    let a = sua()
    const detta = a.dialogo.at(-1)!
    expect(detta.testo).toContain('Ti avviso quando la 0.85.1 è pronta da installare.')
    expect(detta.testo).not.toContain('a ogni passo importante')
    expect(detta.esito).toContain('promessa registrata: p-1')
    expect(detta.esito).toContain('tolta una promessa non legata a un fatto')
    expect(promesseAperte(a)).toMatchObject([{ id: 'p-1', fatto: { tipo: 'release', versione: '0.85.1' } }])

    // Un minuto dopo: niente da dire.
    orologio = '2026-10-23T19:11:21.264Z'
    expect(server!.controllaPromesse()).toBe(0)

    // Esce la 0.85.1 (la rilegge il servizio da GitHub): il messaggio arriva da solo.
    archivio.scrivi({ ...sua(), releaseUscite: uscite('0.84.4', '0.85.0', '0.85.1') })
    orologio = '2026-10-23T23:41:00.000Z'
    expect(server!.controllaPromesse()).toBe(1)
    a = sua()
    expect(a.dialogo.at(-1)).toMatchObject({ da: 'lui', traccia: true })
    expect(a.dialogo.at(-1)!.testo).toMatch(/^Come promesso il 23\/10 21:10 \(«Ti avviso quando la 0\.85\.1 è pronta da installare\.»\): la 0\.85\.1 pubblicata\. Prova: la 0\.85\.1 è pubblicata: release v0\.85\.1 su GitHub/)
    expect(a.annuncio?.titolo).toBe('Come promesso: la 0.85.1 pubblicata')
    expect(avvisi).toEqual([a.dialogo.at(-1)!.testo])
    expect(promesseAperte(a)).toEqual([])
    expect(server!.controllaPromesse()).toBe(0)
  })
})
