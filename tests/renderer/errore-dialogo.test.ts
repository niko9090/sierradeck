import { describe, it, expect } from 'vitest'
import { SERVIZIO_OCCUPATO, testoErroreDialogo } from '../../src/renderer/errore-dialogo'

describe('testoErroreDialogo (k-42)', () => {
  it('il timeout grezzo diventa «servizio occupato», senza il prefisso di Electron', () => {
    const grezzo = new Error("Error invoking remote method 'autopilota:dialoga': Error: il servizio autopilota non risponde sulla porta 4000: TimeoutError: The operation was aborted due to timeout")
    expect(testoErroreDialogo(grezzo)).toBe(SERVIZIO_OCCUPATO)
  })

  it('«non risponde sulla porta 47630: TimeoutError» (risposta a una domanda) è servizio occupato', () => {
    const e = new Error("Error invoking remote method 'domande:chiama': Error: il servizio autopilota non risponde sulla porta 47630: TimeoutError")
    expect(testoErroreDialogo(e)).toBe(SERVIZIO_OCCUPATO)
  })

  it('un altro errore resta com\'è, solo senza prefisso', () => {
    const e = new Error("Error invoking remote method 'autopilota:dialoga': Error: richiesta IPC non valida: non hai scritto niente")
    expect(testoErroreDialogo(e)).toBe('richiesta IPC non valida: non hai scritto niente')
    expect(testoErroreDialogo('boh')).toBe('boh')
  })
})
