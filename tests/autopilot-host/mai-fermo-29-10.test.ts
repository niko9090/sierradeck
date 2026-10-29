import { describe, it, expect } from 'vitest'
import {
  giroMaiFermo, sogliaDi, testoRipresa, testoPassaggio, compitoDiRipresa,
  RADDOPPI_MAX, RIPRESA_SENZA_RISPOSTA_MS, NESSUNO_AL_LAVORO_MS, ULTIME_NELLA_RIPRESA, type VistaMaiFermo
} from '../../src/autopilot-host/mai-fermo'
import { nuovoAutopilota, type Autopilota, type ChatGovernata } from '@shared/autopilota'

// 29/10 — «mai fermo» riapriva lavoro già fatto: il 27/10 c-157 aveva detto
// «fatto», il suo ramo era già nel principale, e il giro da solo la riprendeva
// con «Dimmi il punto» (8.000 caratteri di ultima istruzione) ogni 10 minuti,
// poi passava il compito a una chat nuova che lo rifaceva da capo.

const MIN = 60_000
const ORA = Date.parse('2026-10-27T03:00:00.000Z')

function ap(chats: ChatGovernata[], extra: Partial<Autopilota> = {}): Autopilota {
  return {
    ...nuovoAutopilota({ id: 'ap-1', nome: 'Notte', obiettivo: 'Chiudere la 0.86.0', cwd: 'C:/progetto', criteri: [{ descrizione: 'i test passano', comando: 'npm test', soddisfatto: true }], iniziatoIl: '2026-10-26T19:00:00.000Z' }),
    stato: 'lavoro',
    chats,
    ...extra
  }
}

function vista(extra: Partial<VistaMaiFermo> = {}): VistaMaiFermo {
  return {
    ora: ORA,
    avvioServizio: ORA - 10 * 60 * MIN,
    ultimoSegnale: () => undefined,
    inGiudizio: () => false,
    fermaAlPrompt: () => false,
    domandeAperte: 0,
    ...extra
  }
}

const chat = (id: string, extra: Partial<ChatGovernata> = {}): ChatGovernata => ({ id, compito: `compito di ${id}`, stato: 'lavoro', cicli: 3, sessionId: `s-${id}`, ramo: `ap/ap-1/${id}`, cartella: `C:/wt/${id}`, dal: '2026-10-27T01:00:00.000Z', ...extra })
const FATTO = { tipo: 'fatto' as const, quando: '2026-10-27T01:00:00.000Z', dichiarato: true }

describe('29/10: mai fermo non riapre il lavoro già fatto', () => {
  it('lavoro compiuto: nessun giro', () => {
    const a = ap([chat('c-157', { segnale: FATTO })])
    expect(giroMaiFermo(a, vista())).toBeDefined()
    expect(giroMaiFermo(a, vista({ compiuto: true }))).toBeUndefined()
  })

  it('c-157: ha detto «fatto» e il suo ramo è già nel principale → si chiude, non si riprende', () => {
    const a = ap([chat('c-157', { segnale: FATTO })])
    const g = giroMaiFermo(a, vista({ giaFatto: (c) => c.id === 'c-157' }))
    expect(g?.mosse).toEqual([{ tipo: 'chiudi', chatId: 'c-157' }])
    expect(g?.righe[0]).toContain('già nel principale')
  })

  it('una muta già ripresa senza risposta col lavoro nel principale: si chiude invece di darla a una chat nuova', () => {
    const ripresa = { il: new Date(ORA - 30 * MIN).toISOString(), volte: 1 }
    const a = ap([chat('c-158', { ripresa })])
    expect(giroMaiFermo(a, vista())?.mosse[0]?.tipo).toBe('sostituisci')
    expect(giroMaiFermo(a, vista({ giaFatto: () => true }))?.mosse).toEqual([{ tipo: 'chiudi', chatId: 'c-158' }])
  })

  it('niente da fare (tutto verde, nessun commit nuovo): la muta si riprende, nessuna chat nuova', () => {
    const ripresa = { il: new Date(ORA - 30 * MIN).toISOString(), volte: 1 }
    const a = ap([chat('c-159', { ripresa })])
    const m = giroMaiFermo(a, vista({ qualcosaDaFare: false }))?.mosse[0]
    expect(m?.tipo).toBe('riprendi')
  })

  it('chi ha detto «fatto» non passa mai a una chat nuova', () => {
    const ripresa = { il: new Date(ORA - 30 * MIN).toISOString(), volte: 1 }
    const a = ap([chat('c-160', { ripresa, segnale: FATTO })])
    expect(giroMaiFermo(a, vista({ qualcosaDaFare: true, giaFatto: () => false }))?.mosse[0]?.tipo).toBe('riprendi')
  })

  it('nessuna chat al lavoro e niente da fare: nessun «riprendi l’obiettivo»', () => {
    const a = ap([chat('c-161', { stato: 'finita' })], { giroDaSolo: new Date(ORA - 60 * MIN).toISOString() })
    expect(giroMaiFermo(a, vista())?.mosse).toEqual([{ tipo: 'nuovoCompito', compito: compitoDiRipresa(a) }])
    expect(giroMaiFermo(a, vista({ qualcosaDaFare: false }))).toBeUndefined()
  })

  it('il compito di ripresa non rimanda al quaderno e chiede di non rifare il già fatto', () => {
    const t = compitoDiRipresa(ap([]))
    expect(t).not.toContain('quaderno')
    expect(t).toContain('non rifare')
    expect(t).toContain('SEGNALE: fatto')
  })
})

describe('29/10: le riprese senza risposta si diradano', () => {
  it('l’attesa raddoppia a ogni ripresa, fino a RADDOPPI_MAX volte', () => {
    expect(sogliaDi({})).toBe(NESSUNO_AL_LAVORO_MS)
    expect(sogliaDi({ ripresa: { volte: 1 } })).toBe(RIPRESA_SENZA_RISPOSTA_MS)
    expect(sogliaDi({ ripresa: { volte: 2 } })).toBe(2 * RIPRESA_SENZA_RISPOSTA_MS)
    expect(sogliaDi({ ripresa: { volte: 3 } })).toBe(4 * RIPRESA_SENZA_RISPOSTA_MS)
    expect(sogliaDi({ ripresa: { volte: 50 } })).toBe(2 ** RADDOPPI_MAX * RIPRESA_SENZA_RISPOSTA_MS)
  })

  it('una chat ripresa 3 volte non si tocca dopo 10 minuti, sì dopo 40', () => {
    const c = (min: number): ChatGovernata => chat('c-157', { ripresa: { il: new Date(ORA - min * MIN).toISOString(), volte: 3 }, sostituzioni: 2 })
    expect(giroMaiFermo(ap([c(15)]), vista())).toBeUndefined()
    expect(giroMaiFermo(ap([c(41)]), vista())?.mosse[0]?.tipo).toBe('riprendi')
  })

  it('«Dimmi il punto» riporta al massimo ULTIME_NELLA_RIPRESA caratteri dell’ultima istruzione', () => {
    const lunga = 'x'.repeat(8000)
    const c = chat('c-157', { ultimeIstruzioni: lunga })
    expect(testoRipresa(ap([c]), c, 15 * MIN)).not.toContain('x'.repeat(ULTIME_NELLA_RIPRESA + 1))
    expect(testoRipresa(ap([c]), c, 15 * MIN)).toContain('x'.repeat(ULTIME_NELLA_RIPRESA - 1))
    expect(testoPassaggio(c)).not.toContain('x'.repeat(ULTIME_NELLA_RIPRESA + 1))
  })
})
