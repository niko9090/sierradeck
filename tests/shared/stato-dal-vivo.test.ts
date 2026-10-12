import { describe, it, expect } from 'vitest'
import { durata, etichettaSottofondo, oraBreve, statoAutopilotaDalVivo, statoMessaggi, SENZA_SEGNI_MS } from '@shared/stato-dal-vivo'

/**
 * Si vede sempre chi lavora (0.69.0): «io voglio sempre vedere tutto, almeno
 * vedere che stanno lavorando» (Nicholas, 12/10).
 */
const ORA = Date.parse('2026-10-12T20:30:00.000Z')
const base = { ultimoEvento: '2026-10-12T20:18:00.000Z', decisioni: [{ quando: '2026-10-12T20:18:00.000Z', cosa: 'la chat lavora e 1 messaggio aspettava da 3 min: glieli scrivo adesso,\n durante il turno' }] }

describe('lo stato di un autopilota, dal vivo', () => {
  it('quattro parole: al lavoro, aspetta te, fermo, finito', () => {
    expect(statoAutopilotaDalVivo({ ...base, stato: 'lavoro' }, ORA, ORA).etichetta).toBe('al lavoro')
    expect(statoAutopilotaDalVivo({ ...base, stato: 'attesa' }, ORA).etichetta).toBe('aspetta te')
    expect(statoAutopilotaDalVivo({ ...base, stato: 'lavoro', domanda: { testo: '?' } }, ORA).etichetta).toBe('aspetta te')
    // Senza domanda aperta `haDomandaAperta` dà false: resta «al lavoro» (visto dal vero il 12/10).
    expect(statoAutopilotaDalVivo({ ...base, stato: 'lavoro', domanda: false }, ORA, ORA).etichetta).toBe('al lavoro')
    expect(statoAutopilotaDalVivo({ ...base, stato: 'sospeso' }, ORA).etichetta).toBe('fermo')
    expect(statoAutopilotaDalVivo({ ...base, stato: 'finito' }, ORA).etichetta).toBe('finito')
  })
  it('da quanto, e l’ultima azione in una riga', () => {
    const s = statoAutopilotaDalVivo({ ...base, stato: 'lavoro' }, ORA, ORA)
    expect(s.da).toBe('12 min')
    expect(s.ultimaAzione).toBe('la chat lavora e 1 messaggio aspettava da 3 min: glieli scrivo adesso, durante il turno')
  })
  it('«nessun segno da 10 min» solo per chi è al lavoro e tace', () => {
    expect(statoAutopilotaDalVivo({ ...base, stato: 'lavoro' }, ORA, ORA - SENZA_SEGNI_MS).senzaSegni).toBe('nessun segno da 10 min')
    expect(statoAutopilotaDalVivo({ ...base, stato: 'lavoro' }, ORA, ORA - 60_000).senzaSegni).toBeUndefined()
    expect(statoAutopilotaDalVivo({ ...base, stato: 'sospeso' }, ORA, ORA - SENZA_SEGNI_MS * 3).senzaSegni).toBeUndefined()
  })
  it('le chat in sottofondo, nelle stesse parole', () => {
    expect(etichettaSottofondo('lavora')).toBe('al lavoro')
    expect(etichettaSottofondo('scelta')).toBe('aspetta te')
    expect(etichettaSottofondo('chiusa')).toBe('finito')
  })
  it('le durate si leggono', () => {
    expect(durata(30_000)).toBe('meno di un minuto')
    expect(durata(135 * 60_000)).toBe('2 h 15 min')
  })
})

describe('lo stato di ogni messaggio verso la chat', () => {
  it('in attesa con «Manda adesso», in consegna, consegnato alle…', () => {
    const m = statoMessaggi({
      stato: 'lavoro',
      daConsegnare: [{ id: 'm-1', quando: '2026-10-12T20:27:00.000Z', testo: 'controlla i test', chats: ['ap-1'] }],
      inVolo: [{ consegna: 'c-9', quando: '2026-10-12T20:29:00.000Z', messaggi: [{ id: 'm-2', quando: '2026-10-12T20:25:00.000Z', testo: 'e il log', chats: ['ap-1'] }] }],
      consegnatiDi: [{ id: 'm-0', testo: 'parti', quando: '2026-10-12T20:00:00.000Z', consegnatoIl: '2026-10-12T20:01:00.000Z' }]
    }, ORA, oraBreve)
    expect(m).toEqual([
      { id: 'm-1', testo: 'controlla i test', stato: 'in attesa', dettaglio: 'in attesa da 3 min', mandaAdesso: true },
      { id: 'm-2', testo: 'e il log', stato: 'in consegna', dettaglio: 'in consegna alla chat' },
      { id: 'm-0', testo: 'parti', stato: 'consegnato', dettaglio: 'consegnato alle 22:01' }
    ])
  })
  it('«Manda adesso» solo se l’autopilota è al lavoro', () => {
    const [m] = statoMessaggi({ stato: 'sospeso', daConsegnare: [{ id: 'm-1', quando: '2026-10-12T20:27:00.000Z', testo: 'x', chats: ['ap-1'] }] }, ORA, oraBreve)
    expect(m?.mandaAdesso).toBeUndefined()
  })
})
