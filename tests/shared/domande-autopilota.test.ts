import { describe, it, expect } from 'vitest'
import {
  domandeScheda, contoDomandeScheda, richiestaScheda, tracciaDopoRisposta, dopoLaRisposta, domandaArrivata,
  etichettaOrigine, TESTO_VIA, OPZIONE_VIA
} from '@shared/domande-autopilota'
import { nuovoAutopilota, parseAutopilota, type Autopilota } from '@shared/autopilota'
import { conversazione, staPensando } from '@shared/chat-autopilota'

/**
 * La linguetta «Domande» della scheda dell'autopilota (0.38.0): quali
 * domande, in che ordine, come si risponde, cosa entra nella chat dopo.
 */
const ap = (over: Partial<Autopilota> = {}): Autopilota => ({
  ...nuovoAutopilota({ id: 'ap-1', nome: 'Sito', obiettivo: 'o', cwd: 'C:/s', criteri: [{ descrizione: 'c', soddisfatto: false }], iniziatoIl: '2026-10-01T08:00:00.000Z' }),
  ...over
})
const aperte = [
  { id: 'd-2', autopilotaId: 'ap-1', testo: 'Il lavoro «Sito» è finito e verificato. Pubblico adesso?', apertaIl: 20, opzioni: ['sì, pubblica', 'no, lascia così'] },
  { id: 'd-1', autopilotaId: 'ap-1', testo: 'Serve la chiave dell’API: dove la trovo?', apertaIl: 10 },
  { id: 'd-x', autopilotaId: 'altro', testo: 'Non sua', apertaIl: 5 }
]

describe('le domande della linguetta', () => {
  it('solo le sue, dalla più vecchia, con le opzioni e da dove vengono', () => {
    const s = domandeScheda(ap({ stato: 'lavoro' }), aperte)
    expect(s.map((d) => d.chiave)).toEqual(['d:d-1', 'd:d-2'])
    expect(s[1]).toMatchObject({ origine: 'pubblica', opzioni: ['sì, pubblica', 'no, lascia così'] })
    expect(s[0]?.origine).toBe('lavoro')
    expect(contoDomandeScheda(ap({ stato: 'lavoro' }), aperte)).toBe(2)
    expect(etichettaOrigine(s[0]!)).toContain('domanda durante il lavoro')
  })

  it('in preparazione sono domande iniziali; pronto aggiunge il via, per ultimo', () => {
    expect(domandeScheda(ap({ stato: 'intervista', criteri: [] }), [aperte[1]!])[0]?.origine).toBe('preparazione')
    const pronto = domandeScheda(ap({ stato: 'pronto' }), [])
    expect(pronto).toEqual([{ chiave: 'via:ap-1', tipo: 'via', testo: TESTO_VIA, opzioni: [OPZIONE_VIA], origine: 'via' }])
  })

  it('si risponde alla domanda; il via con «Vai», altrimenti è un messaggio per lui', () => {
    const [d] = domandeScheda(ap({ stato: 'lavoro' }), aperte)
    expect(richiestaScheda(d!, 'ap-1', 'nel file .env')).toEqual({ percorso: '/api/rispondi', corpo: { domanda: 'd-1', risposta: 'nel file .env' } })
    const [via] = domandeScheda(ap({ stato: 'pronto' }), [])
    expect(richiestaScheda(via!, 'ap-1', 'Vai').percorso).toBe('/api/autopilota/vai')
    expect(richiestaScheda(via!, 'ap-1', 'prima togli il criterio 2')).toEqual({ percorso: '/api/autopilota/dialogo', corpo: { autopilota: 'ap-1', testo: 'prima togli il criterio 2' } })
  })

  it('una domanda nuova fa avanti la linguetta; quelle già viste no', () => {
    const s = domandeScheda(ap({ stato: 'lavoro' }), aperte)
    expect(domandaArrivata([], s)).toBe(true)
    expect(domandaArrivata(['d:d-1', 'd:d-2'], s)).toBe(false)
  })
})

describe('dopo la risposta: domanda e risposta nella chat, la linguetta va avanti o si chiude', () => {
  it('la traccia entra nella chat, una sotto l altra, e non fa dire «sta pensando»', () => {
    const traccia = tracciaDopoRisposta('Serve la chiave dell’API: dove la trovo?', 'nel file .env', '2026-10-01T09:00:00.000Z')
    const a = ap({ stato: 'lavoro', dialogo: traccia })
    const chat = conversazione(a)
    const i = chat.findIndex((b) => b.testo === 'Serve la chiave dell’API: dove la trovo?')
    expect(chat[i]).toMatchObject({ da: 'lui' })
    expect(chat[i + 1]).toMatchObject({ da: 'tu', testo: 'nel file .env' })
    expect(staPensando(a)).toBe(false)
    // E la traccia sopravvive alla rilettura del file.
    const letto = parseAutopilota(JSON.parse(JSON.stringify({ ...a, versione: 1 })))
    expect(letto.autopilota?.dialogo[1]).toMatchObject({ traccia: true })
  })

  it('con altre domande si passa alla successiva; finite, la linguetta si chiude', () => {
    const tutte = domandeScheda(ap({ stato: 'lavoro' }), aperte)
    expect(dopoLaRisposta(tutte.slice(1))).toEqual({ chiudi: false, prossima: tutte[1] })
    expect(dopoLaRisposta([])).toEqual({ chiudi: true })
  })
})
