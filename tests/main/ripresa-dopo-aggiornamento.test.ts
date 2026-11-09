import { describe, it, expect, vi } from 'vitest'
import {
  attendiQuiete, leggiPausa, leggiPausaAnchePiena, pausaAncoraValida, pausaDaSalvare, pausaPerUscita,
  ripresaDaConsegnare, type ChatInVolo, type PausaSalvata
} from '../../src/main/pausa-aggiornamento'
import {
  messaggioSenzaRisposta, motivoSpecialistaDoppio, ripresaDopoRiavvio, serveRipresaDopoAggiornamento,
  MESSAGGIO_RECENTE_MS, type RigaDialogoRipresa
} from '../../src/autopilot-host/ripresa-riavvio'
import { giudicaGuardiaOrchestratore } from '../../src/autopilot-host/guardia-orchestratore'
import { compitoDallaDescrizione } from '../../src/shared/flusso-orchestratore'
import { codaVuota, type Coda } from '../../src/shared/coda-richieste'
import { pianoVuoto, type CompitoPiano, type Piano } from '../../src/shared/piano-orchestratore'

/**
 * «Dopo l'aggiornamento quello che andava prima DEVE riprendere davvero!»
 *
 * Le cause trovate nel registro e nel codice (09/11):
 *  1. i file `pausa-aggiornamento.json` di tre aggiornamenti di fila avevano
 *     `sessioni: []`: chi cominciava un turno **dopo** la quiete dichiarata
 *     (una consegna arrivata mentre si salvava) non entrava nell'elenco;
 *  2. le chat dei workspace tenuti vivi «dietro» non ricevevano mai l'avviso;
 *  3. il servizio muore con l'installer e l'autopilota riparte da zero: il
 *     messaggio che stava leggendo e i compiti in corso restavano muti;
 *  4. una chat a metà senza sessione non si può riprendere, e nessuno lo diceva.
 */

const chat = (id: string, o: Partial<ChatInVolo> = {}): ChatInVolo => ({ id, titolo: id, viva: true, ...o })

/** Il banco: orologio finto e attese che lo fanno avanzare. */
function banco(inizio = 1_000_000) {
  let t = inizio
  return {
    adesso: () => t,
    aspetta: async (ms: number): Promise<void> => { t += ms },
    avanza: (ms: number): void => { t += ms }
  }
}

describe('ripresa dopo l’aggiornamento — le chat di Nicholas', () => {
  it('salva prima dell’uscita, rilegge all’avvio, e riprende ogni chat che era a metà', async () => {
    const b = banco()
    // A metà: una con sessione; ferma: una; governata da un autopilota: la riprende il servizio.
    let chatOra: ChatInVolo[] = [
      chat('a', { sessione: 'sess-a', aspetta: false }),
      chat('b', { sessione: 'sess-b', aspetta: true }),
      chat('g', { sessione: 'sess-g', aspetta: false, governata: true })
    ]
    let annotata: PausaSalvata | undefined
    const scritti: string[] = []
    const esito = await attendiQuiete({
      chat: () => chatOra,
      pausaAutopiloti: async () => 1,
      scriviInChat: (id) => { scritti.push(id) },
      annota: (p) => { annotata = p },
      avvisa: () => undefined,
      adesso: b.adesso,
      aspetta: async (ms) => { b.avanza(ms); chatOra = chatOra.map((c) => ({ ...c, aspetta: true })) },
      versione: '0.97.3'
    })
    expect(esito).toBe(true)
    // Avvisate le chat al lavoro, non quella ferma.
    expect(scritti.sort()).toEqual(['a', 'g'])
    // Su disco: il file è JSON, lo rilegge un altro processo.
    const suDisco = JSON.parse(JSON.stringify(annotata))
    const letta = leggiPausa(suDisco)
    expect(letta?.sessioni).toEqual(['sess-a'])
    expect(letta !== undefined && pausaAncoraValida(letta, Date.parse(letta.quando) + 60_000)).toBe(true)
  })

  it('un file di tre ore fa vale, uno di ieri no', () => {
    const p = pausaDaSalvare([chat('a', { sessione: 's', aspetta: false })], '1', '2026-11-09T09:33:07.000Z')
    expect(pausaAncoraValida(p, Date.parse('2026-11-09T12:33:07.000Z'))).toBe(true)
    expect(pausaAncoraValida(p, Date.parse('2026-11-10T09:33:07.000Z'))).toBe(false)
  })

  it('causa 1: chi comincia un turno mentre si salva viene aspettato e annotato, non lasciato morire', async () => {
    const b = banco()
    let chatOra: ChatInVolo[] = [chat('a', { sessione: 'sess-a', aspetta: true })]
    let annotata: PausaSalvata | undefined
    let salvataggi = 0
    const esito = await attendiQuiete({
      chat: () => chatOra,
      pausaAutopiloti: async () => 0,
      scriviInChat: () => undefined,
      annota: (p) => { annotata = p },
      avvisa: () => undefined,
      adesso: b.adesso,
      // Dopo qualche giro il turno finisce.
      aspetta: async (ms) => {
        b.avanza(ms)
        if (salvataggi >= 1 && b.adesso() > 1_000_000 + 30_000) chatOra = chatOra.map((c) => ({ ...c, aspetta: true }))
      },
      alloScadere: 'installa',
      tetto: 5 * 60_000,
      // Il salvataggio dura: nel frattempo una consegna fa partire un turno (07/11 07:08:15).
      salvaSubito: async () => {
        salvataggi += 1
        if (salvataggi === 1) chatOra = [chat('a', { sessione: 'sess-a', aspetta: false })]
        b.avanza(10_000)
      },
      versione: '0.96.0'
    })
    expect(esito).toBe(true)
    // Non ha installato sopra il turno appena partito: ha aspettato che finisse, e lo ha annotato.
    expect(salvataggi).toBeGreaterThanOrEqual(2)
    expect(annotata?.sessioni).toEqual(['sess-a'])
  })

  it('causa 1 (ultimo istante): chi comincia fra la fine dell’attesa e l’uscita si somma all’elenco', () => {
    const attesa = pausaDaSalvare([chat('a', { sessione: 'sess-a', aspetta: false })], '0.97.3', '2026-11-09T09:33:07.000Z')
    const uscita = pausaPerUscita(
      attesa,
      [chat('a', { sessione: 'sess-a', aspetta: true }), chat('n', { sessione: 'sess-n', aspetta: false })],
      '0.97.3',
      '2026-11-09T09:33:12.000Z'
    )
    expect(uscita?.sessioni.sort()).toEqual(['sess-a', 'sess-n'])
    // Il momento è quello dell’attesa: la scadenza di 6 ore parte da lì.
    expect(uscita?.quando).toBe('2026-11-09T09:33:07.000Z')
  })

  it('causa 1 (file vuoto): un elenco senza sessioni si può ancora sommare, e si rilegge come «niente da fare»', () => {
    const vuoto = JSON.parse(JSON.stringify({ quando: '2026-11-09T09:33:07.304Z', versione: '0.97.0', sessioni: [] })) as unknown
    expect(leggiPausa(vuoto)).toBeUndefined()
    const piena = leggiPausaAnchePiena(vuoto)
    expect(piena?.sessioni).toEqual([])
    const uscita = pausaPerUscita(piena, [chat('x', { sessione: 'sess-x', aspetta: false })], '0.97.3', '2026-11-09T09:33:09.000Z')
    expect(leggiPausa(uscita)?.sessioni).toEqual(['sess-x'])
  })

  it('senza file non si scrive niente all’uscita: una chiusura normale non è un riavvio', () => {
    expect(pausaPerUscita(undefined, [chat('x', { sessione: 's', aspetta: false })])).toBeUndefined()
  })

  it('causa 2: la ripresa arriva alle chat con un riquadro, e resta in sospeso per chi non ce l’ha ancora', () => {
    const daRiprendere = new Set(['davanti', 'altrove'])
    const annunciate = [{ sessione: 'davanti' }, { sessione: undefined }, { sessione: 'estranea' }]
    const r = ripresaDaConsegnare(daRiprendere, annunciate)
    expect(r.consegna).toEqual(['davanti'])
    // Chi non è ancora comparso resta nell’elenco per la prossima finestra.
    expect(r.restano).toEqual(['altrove'])
  })

  it('difetto 1: una chat di un workspace tenuto dietro non si segna come avvisata, resta in sospeso', () => {
    // Dietro non c’è un riquadro nella finestra: l’avviso non arriverebbe, e segnarlo «mandato» lo perderebbe.
    const r = ripresaDaConsegnare(new Set(['dietro', 'davanti']), [{ sessione: 'dietro', dietro: true }, { sessione: 'davanti' }])
    expect(r.consegna).toEqual(['davanti'])
    expect(r.restano).toEqual(['dietro'])
    // Quando il workspace torna davanti, la stessa chat non è più «dietro» e l’avviso parte.
    const dopo = ripresaDaConsegnare(new Set(r.restano), [{ sessione: 'dietro' }])
    expect(dopo.consegna).toEqual(['dietro'])
    expect(dopo.restano).toEqual([])
  })
})

describe('ripresa dopo l’aggiornamento — quello che non si può riprendere', () => {
  it('causa 4: una chat a metà senza sessione si conta e si dice, non si perde in silenzio', async () => {
    const b = banco()
    let chatOra: ChatInVolo[] = [chat('nuova', { aspetta: false }), chat('vecchia', { sessione: 'sess-v', aspetta: false })]
    let annotata: PausaSalvata | undefined
    let detta: { senzaSessione?: number } | undefined
    await attendiQuiete({
      chat: () => chatOra,
      pausaAutopiloti: async () => 0,
      scriviInChat: () => undefined,
      annota: (p) => { annotata = p },
      avvisa: () => undefined,
      adesso: b.adesso,
      aspetta: async (ms) => { b.avanza(ms); chatOra = chatOra.map((c) => ({ ...c, aspetta: true })) },
      chiusa: (e) => { detta = e },
      versione: '0.97.3'
    })
    expect(annotata?.sessioni).toEqual(['sess-v'])
    expect(annotata?.senzaSessione).toBe(1)
    expect(detta?.senzaSessione).toBe(1)
    // Il numero attraversa il riavvio.
    expect(leggiPausaAnchePiena(JSON.parse(JSON.stringify(annotata)))?.senzaSessione).toBe(1)
  })

  it('l’aggiornamento aspetta finché la chat non si ferma: non installa sopra un turno che non si può riprendere', async () => {
    const b = banco()
    let chatOra: ChatInVolo[] = [chat('nuova', { aspetta: false })]
    let giri = 0
    const annota = vi.fn()
    const esito = await attendiQuiete({
      chat: () => chatOra,
      pausaAutopiloti: async () => 0,
      scriviInChat: () => undefined,
      annota,
      avvisa: () => undefined,
      adesso: b.adesso,
      aspetta: async (ms) => {
        b.avanza(ms)
        giri += 1
        if (giri === 20) chatOra = [chat('nuova', { aspetta: true })]
      },
      versione: '0.97.3'
    })
    expect(esito).toBe(true)
    // Ha atteso 20 giri (40 s), non ha concluso al primo controllo.
    expect(giri).toBeGreaterThanOrEqual(20)
    expect(annota).toHaveBeenCalledTimes(1)
  })

  it('se la quiete non arriva entro il tetto (senza «installa comunque») non installa e rimette tutto a posto', async () => {
    const b = banco()
    const pausa = vi.fn(async () => 0)
    const annota = vi.fn()
    const esito = await attendiQuiete({
      chat: () => [chat('nuova', { aspetta: false })],
      pausaAutopiloti: pausa,
      scriviInChat: () => undefined,
      annota,
      avvisa: () => undefined,
      adesso: b.adesso,
      aspetta: b.aspetta,
      tetto: 60_000,
      versione: '0.97.3'
    })
    expect(esito).toBe(false)
    expect(annota).not.toHaveBeenCalled()
    // Gli autopiloti sono usciti dalla pausa: niente resta fermo ad aspettare un riavvio che non c’è.
    expect(pausa).toHaveBeenLastCalledWith(false)
  })
})

describe('ripresa dopo l’aggiornamento — l’autopilota e i suoi specialisti', () => {
  const compito = (id: string, stato: CompitoPiano['stato'], o: Partial<CompitoPiano> = {}): CompitoPiano => ({
    id, richiesta: 'r-1', titolo: `compito ${id}`, criterio: '`npm test`', dopo: [], peso: 1, stato, creato: '2026-11-09T08:00:00.000Z', ...o
  })
  const codaConRichiesta = (): Coda => {
    const c = codaVuota('ws')
    return {
      ...c,
      richieste: [{
        id: 'r-1', creata: '2026-11-09T08:00:00.000Z', titolo: 'finestra all’apertura', testo: 'finestra all’apertura',
        originali: [], punti: [], unioni: [], stato: 'aperta', compiti: ['a', 'b']
      } as unknown as Coda['richieste'][number]]
    }
  }
  const pianoCon = (compiti: CompitoPiano[]): Piano => ({ ...pianoVuoto(), compiti })
  const adesso = Date.parse('2026-11-09T09:35:00.000Z')

  it('causa 3: uno specialista a metà prima dell’aggiornamento viene rilanciato subito, dal disco', () => {
    const r = ripresaDopoRiavvio({
      coda: codaConRichiesta(),
      piano: pianoCon([compito('a', 'in-corso', { chat: 'spec-1' }), compito('b', 'da-fare')]),
      dialogo: [],
      adesso
    })
    expect(r).toBeDefined()
    expect(r?.interrotti).toBe(1)
    expect(r?.testo).toContain('a risulta in corso ma nessuno specialista ci lavora più')
    expect(r?.testo).toContain('Rilancia adesso gli specialisti interrotti')
    expect(r?.firma).toContain('a:orfano')
  })

  it('causa 3: il messaggio di Nicholas che il turno stava leggendo si rimanda', () => {
    const dialogo: RigaDialogoRipresa[] = [
      { quando: '2026-11-09T09:20:00.000Z', da: 'lui', testo: 'fatto' },
      { quando: '2026-11-09T09:32:00.000Z', da: 'tu', testo: 'adesso sistema la finestra all’apertura' },
      { quando: '2026-11-09T09:32:30.000Z', da: 'evento', testo: 'richiesta r-4 in coda' }
    ]
    const r = ripresaDopoRiavvio({ coda: codaVuota('ws'), piano: pianoVuoto(), dialogo, adesso })
    expect(r?.messaggioPerso).toBe(true)
    expect(r?.testo).toContain('adesso sistema la finestra all’apertura')
    expect(r?.firma).toBeUndefined()
  })

  it('un messaggio a cui l’autopilota ha già risposto non si rimanda', () => {
    const dialogo: RigaDialogoRipresa[] = [
      { quando: '2026-11-09T09:30:00.000Z', da: 'tu', testo: 'ciao' },
      { quando: '2026-11-09T09:31:00.000Z', da: 'lui', testo: 'eccomi' }
    ]
    expect(messaggioSenzaRisposta(dialogo, adesso)).toBeUndefined()
    expect(ripresaDopoRiavvio({ coda: codaVuota('ws'), piano: pianoVuoto(), dialogo, adesso })).toBeUndefined()
  })

  it('un messaggio vecchio senza risposta (una chiusa muta) non si rimanda a ogni riavvio', () => {
    const vecchio: RigaDialogoRipresa[] = [{ quando: new Date(adesso - MESSAGGIO_RECENTE_MS - 60_000).toISOString(), da: 'tu', testo: 'ok' }]
    expect(messaggioSenzaRisposta(vecchio, adesso)).toBeUndefined()
  })

  it('niente a metà, niente da dire: l’autopilota non viene svegliato per niente', () => {
    expect(ripresaDopoRiavvio({ coda: codaVuota('ws'), piano: pianoVuoto(), dialogo: [], adesso })).toBeUndefined()
  })

  it('difetto 2: uno specialista già ripartito per lo stesso compito non si lancia una seconda volta', () => {
    const vivi = [{ compito: 'a', ruolo: 'sviluppatore', descrizione: 'a: finestra all’apertura' }]
    const motivo = motivoSpecialistaDoppio({ descrizione: 'a: finestra all’apertura (ripresa)', tipo: 'sviluppatore' }, vivi, compitoDallaDescrizione)
    expect(motivo).toContain('già uno specialista al lavoro')
    // Un altro compito, o un altro ruolo (il revisore), passano.
    expect(motivoSpecialistaDoppio({ descrizione: 'b: altro', tipo: 'sviluppatore' }, vivi, compitoDallaDescrizione)).toBeUndefined()
    expect(motivoSpecialistaDoppio({ descrizione: 'a: rilettura', tipo: 'revisore' }, vivi, compitoDallaDescrizione)).toBeUndefined()
    expect(motivoSpecialistaDoppio({ descrizione: 'a: ripartenza', tipo: 'sviluppatore' }, [], compitoDallaDescrizione)).toBeUndefined()
  })

  it('difetto 2: la guardia rifiuta il secondo Agent per lo stesso compito, prima di metterlo in fila', () => {
    const vivi = [{ compito: 'a', ruolo: 'sviluppatore', descrizione: 'a: finestra all’apertura' }]
    const fila = vi.fn(() => ({ passa: true as const }))
    const g = giudicaGuardiaOrchestratore(
      { tool_name: 'Agent', tool_input: { subagent_type: 'sviluppatore', description: 'a: finestra all’apertura', prompt: 'riprendi' } },
      {
        radice: '/progetto', specialistiSulPc: 1, tettoPc: 4, tipiSpecialisti: ['sviluppatore', 'revisore'], fila,
        doppio: (r) => motivoSpecialistaDoppio(r, vivi, compitoDallaDescrizione)
      }
    )
    expect(g.ok).toBe(false)
    expect(fila).not.toHaveBeenCalled()
  })

  it('difetto 3: la ripresa dell’autopilota scatta solo dopo un aggiornamento, non a ogni accensione del PC', () => {
    // Accensione del PC o crash: il servizio riparte, ma nessun segno di aggiornamento.
    expect(serveRipresaDopoAggiornamento({ servizioAppenaPartito: true, avevaFermatiPerAggiornamento: false, riepilogoAggiornamento: false })).toBe(false)
    // Aggiornamento: gli autopiloti erano stati fermati apposta, oppure il programma porta il riepilogo.
    expect(serveRipresaDopoAggiornamento({ servizioAppenaPartito: true, avevaFermatiPerAggiornamento: true, riepilogoAggiornamento: false })).toBe(true)
    expect(serveRipresaDopoAggiornamento({ servizioAppenaPartito: true, avevaFermatiPerAggiornamento: false, riepilogoAggiornamento: true })).toBe(true)
    // Se il servizio non è appena ripartito, non c'è niente da riprendere.
    expect(serveRipresaDopoAggiornamento({ servizioAppenaPartito: false, avevaFermatiPerAggiornamento: true, riepilogoAggiornamento: true })).toBe(false)
  })
})
