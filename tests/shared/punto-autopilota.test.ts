import { describe, it, expect } from 'vitest'
import { nuovoAutopilota, ESITI_TRAGUARDO, type Autopilota, type ChatGovernata, type Traguardo } from '@shared/autopilota'
import { rigaTraguardo } from '@shared/chat-autopilota'
import { COLORE_SEGNALE, puntoDi, rigaLimiti, senzaSigle } from '@shared/punto-autopilota'

// 0.84.3 (Nicholas, 22/10 sera): l'autopilota è l'unico interlocutore. In
// cima alla sua conversazione un Punto sempre aggiornato, senza sigle, e una
// riga quando una chat parte, finisce, si blocca, viene unita o resta ferma.

const ORA = Date.parse('2026-10-22T20:00:00.000Z')
const fa = (min: number): string => new Date(ORA - min * 60_000).toISOString()

const chat = (id: string, extra: Partial<ChatGovernata> = {}): ChatGovernata => ({
  id, compito: `compito di ${id}`, stato: 'lavoro', cicli: 2, dal: fa(3), ...extra
})

function ap(chats: ChatGovernata[], extra: Partial<Autopilota> & { segniChat?: Record<string, string> } = {}): Autopilota & { segniChat?: Record<string, string>; segniDal?: string } {
  return {
    ...nuovoAutopilota({
      id: 'ap-1', nome: 'Gestionale', obiettivo: 'Il gestionale', cwd: 'C:/progetto',
      criteri: [{ descrizione: 'i test passano', soddisfatto: true }, { descrizione: 'compila', soddisfatto: false }, { descrizione: 'pubblicata', soddisfatto: false }],
      iniziatoIl: fa(120)
    }),
    stato: 'lavoro',
    chats,
    segniDal: fa(60),
    segniChat: Object.fromEntries(chats.map((c) => [c.id, fa(1)])),
    ...extra
  }
}

describe('senzaSigle: le sigle interne non arrivano a Nicholas', () => {
  it('toglie c-N, «gruppo N», i rami e gli autopiloti, tenendo la frase leggibile', () => {
    expect(senzaSigle('Chiudi tu a mano l’autopilota del gestionale (c-12) del gruppo 3')).toBe('Chiudi tu a mano l’autopilota del gestionale')
    expect(senzaSigle('aspetta la chat c-12')).toBe('aspetta la chat')
    expect(senzaSigle('unito il ramo ap/ap-f1e631f5/c-90 in main')).toBe('unito il ramo in main')
    expect(senzaSigle('c-14: il menu nuovo')).toBe('il menu nuovo')
    expect(senzaSigle('Il menu nuovo')).toBe('Il menu nuovo')
  })
})

describe('puntoDi', () => {
  it('passo in corso, una riga per chat col compito in parole semplici e il segnale coi colori del PC', () => {
    const a = ap([
      chat('c-3', { ruolo: 'sviluppo', compito: 'Il menu nuovo (c-3). Poi i test.', segnale: { tipo: 'avanti', quando: fa(2), dichiarato: true, motivo: 'scrivo i test' } }),
      chat('c-4', { compito: 'La pagina del telefono', segnale: { tipo: 'aspetto', di: 'c-3', quando: fa(1), dichiarato: true } }),
      chat('c-5', { ruolo: 'collaudo', compito: 'Collaudo del gruppo 3', stato: 'bloccata', segnale: { tipo: 'bloccata', quando: fa(1), dichiarato: true, motivo: 'manca la chiave' } })
    ])
    const p = puntoDi(a, ORA, { domandeAperte: 1 })
    expect(p.passo).toBe('Lavora: 1 di 3 criteri soddisfatti')
    const testo = JSON.stringify(p.chat.map((r) => [r.chi, r.compito, r.testo, r.segnale?.parola]))
    expect(testo).not.toMatch(/\bc-\d+/)
    expect(testo).not.toMatch(/gruppo \d/)
    const sviluppo = p.chat.find((r) => r.id === 'c-3')!
    expect(sviluppo.chi).toBe('Sviluppo')
    expect(sviluppo.compito).toBe('Il menu nuovo')
    expect(sviluppo.colore).toBe('verde')
    expect(sviluppo.segnale).toMatchObject({ tipo: 'avanti', colore: COLORE_SEGNALE.avanti, parola: 'va avanti: scrivo i test' })
    // Senza ruolo non si chiama più «c-4»: «Una chat», e la sorella che aspetta si dice col ruolo e il compito.
    const senzaRuolo = p.chat.find((r) => r.id === 'c-4')!
    expect(senzaRuolo.chi).toBe('Una chat')
    expect(senzaRuolo.segnale?.parola).toBe('aspetta Sviluppo («Il menu nuovo»)')
    expect(senzaRuolo.segnale?.colore).toBe('ambra')
    const bloccata = p.chat.find((r) => r.id === 'c-5')!
    expect(bloccata.segnale).toMatchObject({ tipo: 'bloccata', colore: 'rosso', simbolo: '■' })
    expect(p.daTe).toEqual(['Una risposta: la domanda è nella linguetta «Domande».'])
  })

  it('finito, dopo (prima la Revisione, poi la coda) e niente da Nicholas', () => {
    const a = ap([
      chat('c-1', { ruolo: 'sviluppo', compito: 'Il motore', stato: 'finita', approvata: true }),
      chat('c-2', { ruolo: 'sviluppo', compito: 'La pagina', stato: 'finita' }),
      chat('c-6', { ruolo: 'sviluppo', compito: 'Il riquadro' })
    ], { compitiDaFare: ['Le notifiche', 'Il rilascio'] })
    const p = puntoDi(a, ORA)
    expect(p.fatto).toEqual(['Il motore'])
    expect(p.fattoTotale).toBe(1)
    expect(p.dopo).toEqual(['La pagina: lo rilegge la Revisione', 'Le notifiche', 'Il rilascio'])
    expect(p.finite).toBe(2)
    expect(p.daTe).toEqual([])
    expect(p.limiti).toBeUndefined()
  })

  it('i limiti del piano solo come informazione', () => {
    const p = puntoDi(ap([chat('c-1')]), ORA, { limiti: { cinqueOre: 42.4, settimana: 18 } })
    expect(p.limiti).toBe('Limiti del piano: 5 ore 42%, settimana 18%. Solo per informazione: le chat non si fermano per questo.')
    expect(rigaLimiti({})).toBeUndefined()
    expect(rigaLimiti({ settimana: 120 })).toContain('settimana 100%')
  })

  it('pronto e fermo dicono cosa serve da Nicholas', () => {
    expect(puntoDi(ap([], { stato: 'pronto' }), ORA).daTe).toEqual(['Il tuo via, per cominciare.'])
    const fermo = puntoDi(ap([], { stato: 'sospeso', motivoSospensione: 'la chat c-12 non risponde' }), ORA)
    expect(fermo.passo).toBe('Fermo: la chat non risponde · 1 di 3 criteri soddisfatti')
    expect(fermo.daTe).toHaveLength(1)
  })

  it('una chat ferma da tanto sta in cima, in rosso', () => {
    const a = ap([chat('c-1', { ruolo: 'sviluppo' }), chat('c-2', { ruolo: 'interfaccia' })], { segniChat: { 'c-1': fa(1), 'c-2': fa(20) } })
    const p = puntoDi(a, ORA)
    expect(p.chat[0]).toMatchObject({ id: 'c-2', tono: 'ferma', colore: 'rosso' })
  })
})

describe('le righe della conversazione: parte, finisce, si blocca, viene unita, resta ferma', () => {
  const a = ap([chat('c-7', { ruolo: 'sviluppo', compito: 'Il menu (c-7)' })])
  const riga = (t: Omit<Traguardo, 'chat'>): string => rigaTraguardo(a, { chat: 'c-7', ...t }) ?? ''
  it('ogni momento ha la sua riga, senza sigle', () => {
    const righe = [
      riga({ esito: 'aperta' }),
      riga({ esito: 'finito' }),
      riga({ esito: 'bloccata', nota: 'manca la chiave' }),
      riga({ esito: 'unito' }),
      riga({ esito: 'ferma', nota: 'è ferma da 16 minuti senza segnali: le riscrivo l’ultima istruzione' })
    ]
    expect(righe[0]).toBe('Sviluppo: comincia «Il menu».')
    expect(righe[1]).toBe('Sviluppo: ha finito «Il menu».')
    expect(righe[2]).toBe('Sviluppo («Il menu») si è bloccata: manca la chiave. Decido io come sbloccarla; se serve qualcosa che sai solo tu, te lo chiedo.')
    expect(righe[3]).toBe('Sviluppo: «Il menu» unito.')
    expect(righe[4]).toBe('Sviluppo («Il menu») è ferma da 16 minuti senza segnali: le riscrivo l’ultima istruzione.')
    for (const r of righe) expect(r).not.toMatch(/\bc-\d/)
  })
  it('i due esiti nuovi stanno fra quelli letti dal disco', () => {
    expect(ESITI_TRAGUARDO).toContain('bloccata')
    expect(ESITI_TRAGUARDO).toContain('ferma')
  })
})
