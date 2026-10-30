import { describe, it, expect } from 'vitest'
import { conversazioniDomande, domandaBreve, domandeALato, richiestaRisposta, type Conversazione } from '@shared/domande-conversazioni'
import type { VoceDomanda } from '@shared/domande-telefono'
import { nuovoAutopilota } from '@shared/autopilota'

const ap = {
  ...nuovoAutopilota({ id: 'a1', nome: 'Sito', obiettivo: 'Rifai la home', cwd: 'C:/sito', iniziatoIl: '2026-09-30T08:00:00Z' }),
  dialogo: [{ quando: '2026-09-30T08:10:00Z', da: 'tu' as const, testo: 'usa il blu' }, { quando: '2026-09-30T08:11:00Z', da: 'lui' as const, testo: 'va bene' }]
}

describe('le Domande come conversazioni a messaggi', () => {
  it('con un autopilota si parla con lui: la sua storia, e in fondo la domanda aperta', () => {
    const voci: VoceDomanda[] = [{ tipo: 'autopilota', id: 'd1', autopilotaId: 'a1', autopilota: 'Sito', origine: 'lavoro', testo: 'Che font uso?' }]
    const [c] = conversazioniDomande({ voci, autopiloti: [ap] })
    expect(c).toMatchObject({ chiave: 'ap:a1', tipo: 'autopilota', chiede: true, risposta: { via: 'rispondi', domanda: 'd1' } })
    const testi = c!.messaggi.map((m) => `${m.da}:${m.testo}`)
    expect(testi).toContain('tu:usa il blu')
    expect(testi).toContain('lui:va bene')
    expect(c!.messaggi[c!.messaggi.length - 1]).toMatchObject({ da: 'lui', testo: 'Che font uso?', tono: 'domanda' })
  })

  it('senza autopilota e la chat che aspetta a scrivere la sua domanda, con le opzioni da toccare', () => {
    const voci: VoceDomanda[] = [{
      tipo: 'scelta', chat: 'p-1', titolo: 'Permesso', cwd: 'D:/q', righe: ['Posso scrivere config.json?'],
      opzioni: [{ numero: 1, testo: 'Yes', scelta: true }, { numero: 2, testo: 'No', scelta: false }], corrente: 0
    }]
    const [c] = conversazioniDomande({ voci, autopiloti: [], inviati: { 'p-1': [{ quando: 'x', testo: 'fai piano' }] } })
    expect(c).toMatchObject({ chiave: 'chat:p-1', tipo: 'chat', chiede: true, risposta: { via: 'scrivi', chat: 'p-1' } })
    expect(c!.messaggi[0]).toMatchObject({ da: 'tu', testo: 'fai piano' })
    expect(c!.messaggi[1]).toMatchObject({ da: 'lui', testo: 'Posso scrivere config.json?', tono: 'domanda' })
    expect(c!.messaggi[1]!.opzioni?.map((o) => o.testo)).toEqual(['Yes', 'No'])
    expect(c!.scelte?.chat).toBe('p-1')
  })

  it('le chat che hanno solo finito il turno vengono dopo chi chiede', () => {
    const voci: VoceDomanda[] = [
      { tipo: 'chat', chat: 'f-1', titolo: 'Ferma', cwd: 'C:/f', righe: ['Fatto.'] },
      { tipo: 'autopilota', id: 'd1', autopilotaId: 'zz', autopilota: 'Un autopilota', origine: 'intervista', testo: 'Dove sono i test?' }
    ]
    const cs = conversazioniDomande({ voci, autopiloti: [] })
    expect(cs.map((c) => c.chiave)).toEqual(['ap:zz', 'chat:f-1'])
    expect(cs[0]!.sotto).toContain('prima di partire')
    expect(cs[1]).toMatchObject({ chiede: false, messaggi: [{ da: 'lui', testo: 'Fatto.' }] })
  })

  it('un autopilota pronto aspetta il via: ci si parla con il dialogo', () => {
    const pronto = { ...ap, stato: 'pronto' as const }
    const [c] = conversazioniDomande({ voci: [], autopiloti: [pronto] })
    expect(c).toMatchObject({ chiave: 'ap:a1', chiede: true, risposta: { via: 'dialogo', autopilota: 'a1' } })
    expect(c!.messaggi[c!.messaggi.length - 1]).toMatchObject({ da: 'lui', tono: 'domanda' })
    // Al lavoro non aspetta niente: non c'e'.
    expect(conversazioniDomande({ voci: [], autopiloti: [ap] })).toEqual([])
  })

  it('una preparazione con una domanda aperta produce un messaggio a cui si risponde, con le sue opzioni', () => {
    // La domanda iniziale sta anche nella storia (motivoSospensione): una sola, in fondo, con le opzioni.
    const prep = { ...ap, stato: 'intervista' as const, dialogo: [], motivoSospensione: 'Che formato deve leggere?' }
    const voci: VoceDomanda[] = [{ tipo: 'autopilota', id: 'd9', autopilotaId: 'a1', autopilota: 'Sito', origine: 'intervista', testo: 'Che formato deve leggere?', opzioni: ['YAML', 'JSON'] }]
    const [c] = conversazioniDomande({ voci, autopiloti: [prep] })
    expect(c).toMatchObject({ chiave: 'ap:a1', chiede: true, risposta: { via: 'rispondi', domanda: 'd9' } })
    expect(c!.sotto).toContain('si prepara')
    const domande = c!.messaggi.filter((m) => m.tono === 'domanda')
    expect(domande).toHaveLength(1)
    expect(domande[0]).toMatchObject({ da: 'lui', testo: 'Che formato deve leggere?' })
    expect(domande[0]!.opzioni?.map((o) => o.testo)).toEqual(['YAML', 'JSON'])
    // Nessuna «scelta» del terminale: toccare un'opzione e' rispondere con quel testo.
    expect(c!.scelte).toBeUndefined()
    expect(richiestaRisposta(c!.risposta, 'YAML')).toEqual({ percorso: '/api/rispondi', corpo: { domanda: 'd9', risposta: 'YAML' } })
  })

  it('si risponde dalle rotte di sempre, uguali sui tre lati', () => {
    expect(richiestaRisposta({ via: 'rispondi', domanda: 'd1' }, 'blu')).toEqual({ percorso: '/api/rispondi', corpo: { domanda: 'd1', risposta: 'blu' } })
    expect(richiestaRisposta({ via: 'scrivi', chat: 'c' }, 'vai')).toEqual({ percorso: '/api/scrivi', corpo: { chat: 'c', testo: 'vai' } })
    expect(richiestaRisposta({ via: 'dialogo', autopilota: 'a' }, 'ciao').percorso).toBe('/api/autopilota/dialogo')
  })
})

describe('0.76.0: le domande brevi a lato', () => {
  const conv = (chiave: string, domanda: string, scelte: number, x: Partial<Conversazione> = {}): Conversazione => ({
    chiave, tipo: 'chat', titolo: 't', sotto: '', chiede: true, messaggi: [], risposta: { tipo: 'chat', chat: chiave.slice(5) } as never, segnaposto: '',
    scheda: { chi: 'Chat', domanda, scelte: Array.from({ length: scelte }, (_, i) => ({ testo: `s${i}` })), dettagli: [], segnaposto: '' },
    ...x
  })
  it('breve: fino a 200 caratteri e 4 scelte («Scrivi tu» non conta); oltre, solo nella sezione Domande', () => {
    expect(domandaBreve(conv('chat:p1', 'Rosso o blu?', 4))).toBe(true)
    expect(domandaBreve(conv('chat:p1', 'Rosso o blu?', 5))).toBe(false)
    expect(domandaBreve(conv('chat:p1', 'x'.repeat(201), 2))).toBe(false)
    expect(domandaBreve(conv('chat:p1', `${'x'.repeat(198)}…`, 2))).toBe(false)
    const conLibera = conv('chat:p1', 'Rosso o blu?', 4)
    conLibera.scheda!.scelte.push({ testo: 'Type something.', libera: true })
    expect(domandaBreve(conLibera)).toBe(true)
    expect(domandaBreve({ ...conv('chat:p1', 'ok?', 2), chiede: false })).toBe(false)
  })
  it('a lato solo quelle di qui (il workspace aperto o la chat aperta sul telefono)', () => {
    const tutte = [conv('chat:p1', 'Rosso o blu?', 2), conv('chat:p2', 'Verde?', 2), conv('chat:p3', 'x'.repeat(300), 2)]
    expect(domandeALato(tutte, new Set(['chat:p1', 'chat:p3'])).map((c) => c.chiave)).toEqual(['chat:p1'])
  })
})

describe('0.76.0: i dettagli dietro il «?» non rendono lunga una domanda', () => {
  it('il caso della copia di prova: «Preferisci il rosso o il blu?» con 415 caratteri di contesto è breve', () => {
    const c: Conversazione = {
      chiave: 'chat:p1', tipo: 'chat', titolo: 't', sotto: '', chiede: true, messaggi: [], risposta: { via: 'scrivi', chat: 'p1' } as never, segnaposto: '',
      scheda: { chi: 'Chat', domanda: 'Preferisci il rosso o il blu?', scelte: [{ testo: 'Rosso' }, { testo: 'Blu' }, { testo: 'Type something.', libera: true }, { testo: 'Chat about this' }], dettagli: [{ etichetta: 'a', testo: 'x'.repeat(43) }, { etichetta: 'b', testo: 'y'.repeat(372) }], segnaposto: '' }
    }
    expect(domandaBreve(c)).toBe(true)
    expect(domandaBreve({ ...c, scheda: { ...c.scheda!, dettagli: [{ etichetta: 'a', testo: 'z'.repeat(1600) }] } })).toBe(false)
  })
})
