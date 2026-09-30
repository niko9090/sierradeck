import { describe, it, expect } from 'vitest'
import { conversazioniDomande, richiestaRisposta } from '@shared/domande-conversazioni'
import type { VoceDomanda } from '@shared/domande-telefono'
import { nuovoAutopilota } from '@shared/autopilota'

const ap = {
  ...nuovoAutopilota({ id: 'a1', nome: 'Sito', obiettivo: 'Rifai la home', cwd: 'C:/sito', criteri: [], iniziatoIl: '2026-09-30T08:00:00Z' }),
  dialogo: [{ quando: '2026-09-30T08:10:00Z', da: 'tu' as const, testo: 'usa il blu' }, { quando: '2026-09-30T08:11:00Z', da: 'lui' as const, testo: 'va bene' }]
}

describe('le Domande come conversazioni a messaggi', () => {
  it('con un autopilota si parla con lui: la sua storia, e in fondo la domanda aperta', () => {
    const voci: VoceDomanda[] = [{ tipo: 'autopilota', id: 'd1', autopilotaId: 'a1', autopilota: 'Sito', origine: 'lavoro', testo: 'Che font uso?' }]
    const [c] = conversazioniDomande({ voci, autopiloti: [ap] })
    expect(c).toMatchObject({ chiave: 'ap:a1', tipo: 'autopilota', chiede: true, risposta: { via: 'rispondi', domanda: 'd1' } })
    const testi = c!.messaggi.map((m) => `${m.da}:${m.testo}`)
    expect(testi[0]).toBe('tu:Rifai la home')
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

  it('si risponde dalle rotte di sempre, uguali sui tre lati', () => {
    expect(richiestaRisposta({ via: 'rispondi', domanda: 'd1' }, 'blu')).toEqual({ percorso: '/api/rispondi', corpo: { domanda: 'd1', risposta: 'blu' } })
    expect(richiestaRisposta({ via: 'scrivi', chat: 'c' }, 'vai')).toEqual({ percorso: '/api/scrivi', corpo: { chat: 'c', testo: 'vai' } })
    expect(richiestaRisposta({ via: 'dialogo', autopilota: 'a' }, 'ciao').percorso).toBe('/api/autopilota/dialogo')
  })
})
