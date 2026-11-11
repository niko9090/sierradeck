import { describe, it, expect } from 'vitest'
import { motivoInItaliano, senzaRiprovo, stessaRigaDiPrima } from '../../src/autopilot-host/turno-non-riuscito'

/**
 * 11/11: il 09/11 nella chat dell'autopilota, 11 volte in 70 minuti, «turno non
 * riuscito: You've hit your weekly limit · resets 1am (Europe/Rome)».
 */
describe('«turno non riuscito» in italiano', () => {
  it('il limite settimanale, con l’ora in cui si sblocca', () => {
    expect(motivoInItaliano('You\'ve hit your weekly limit · resets 1am (Europe/Rome)'))
      .toBe('limite settimanale di Claude raggiunto, si sblocca alle 01:00: fino ad allora non posso lavorare, poi riparto da solo')
    expect(motivoInItaliano('You\'ve hit your limit · resets 3:30pm (Europe/Rome)')).toContain('limite di utilizzo di Claude raggiunto, si sblocca alle 15:30')
    expect(motivoInItaliano('You\'ve hit your 5-hour limit · resets 12am')).toContain('si sblocca alle 00:00')
    expect(motivoInItaliano('Usage limit reached')).toBe('limite di utilizzo di Claude raggiunto: riparto da solo appena si sblocca')
  })

  it('l’accesso scaduto: è l’unica cosa che deve fare Nicholas, detta in chiaro', () => {
    const t = motivoInItaliano('Login expired · Please run /login')
    expect(t).toMatch(/l’accesso a Claude è scaduto: va rifatto da te/)
    expect(t).toMatch(/\/login/)
    expect(t).toMatch(/riparto da solo/)
    expect(motivoInItaliano('Invalid API key · Please run /login')).toBe(t)
  })

  it('i server sovraccarichi; la coda «riprovo fra» resta in fondo; uno sconosciuto resta com’è', () => {
    expect(motivoInItaliano('API Error: 529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}} — riprovo fra 30 s'))
      .toBe('i server di Claude sono sovraccarichi: non dipende da te, riparto da solo — riprovo fra 30 s')
    expect(motivoInItaliano('You\'ve hit your weekly limit · resets 1am (Europe/Rome) — riprovo fra 5 min')).toMatch(/^limite settimanale.* — riprovo fra 5 min$/)
    expect(motivoInItaliano('il turno era appeso (nessuna risposta dalla CLI da 20 minuti): l’ho fermato')).toBe('il turno era appeso (nessuna risposta dalla CLI da 20 minuti): l’ho fermato')
    expect(motivoInItaliano('boom — riprovo fra 1 s')).toBe('boom — riprovo fra 1 s')
  })

  it('la stessa riga non si ripete: conta solo l’ultima del dialogo, senza «riprovo fra»', () => {
    const riga = 'turno non riuscito: limite settimanale di Claude raggiunto, si sblocca alle 01:00: fino ad allora non posso lavorare, poi riparto da solo'
    expect(senzaRiprovo(`${riga} — riprovo fra 5 min`)).toBe(riga)
    expect(stessaRigaDiPrima({ da: 'evento', testo: riga }, `${riga} — riprovo fra 30 s`)).toBe(true)
    expect(stessaRigaDiPrima({ da: 'evento', testo: `${riga} — riprovo fra 30 s` }, `${riga} — riprovo fra 5 min`)).toBe(true)
    // In mezzo è successo altro, o è un altro guasto: si scrive di nuovo.
    expect(stessaRigaDiPrima({ da: 'tu', testo: '??' }, riga)).toBe(false)
    expect(stessaRigaDiPrima({ da: 'evento', testo: 'turno non riuscito: boom' }, riga)).toBe(false)
    expect(stessaRigaDiPrima(undefined, riga)).toBe(false)
  })
})
