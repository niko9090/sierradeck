import { describe, it, expect } from 'vitest'
import { EventEmitter } from 'node:events'
import type { IncomingMessage } from 'node:http'
import { leggiCorpoJson } from '../../src/shared/corpo-richiesta'

/**
 * Il difetto: si ascoltavano solo `data` e `end`.
 *
 * Una richiesta che muore a meta' — il telefono che esce dalla galleria, il
 * cavo staccato, il processo dall'altra parte chiuso — non manda nessun `end`.
 * La promessa non si risolveva mai, e chi la stava aspettando restava li' per
 * sempre con tutto quello che si porta dietro. Su un servizio che gira per
 * giorni e' memoria che non torna piu' indietro.
 */

/** Una richiesta finta: e' un flusso di eventi, e qui interessano solo quelli. */
function finta(): IncomingMessage & { chiuso: boolean } {
  const e = new EventEmitter() as IncomingMessage & { chiuso: boolean }
  e.chiuso = false
  ;(e as unknown as { destroy: () => void }).destroy = (): void => { e.chiuso = true }
  return e
}

describe('il corpo arriva tutto', () => {
  it('legge il JSON', async () => {
    const req = finta()
    const p = leggiCorpoJson(req)
    req.emit('data', '{"a":1}')
    req.emit('end')
    expect(await p).toEqual({ a: 1 })
  })

  it('un corpo vuoto e undefined, non un errore', async () => {
    const req = finta()
    const p = leggiCorpoJson(req)
    req.emit('end')
    expect(await p).toBeUndefined()
  })

  it('un corpo illeggibile non fa cadere niente', async () => {
    const req = finta()
    const p = leggiCorpoJson(req)
    req.emit('data', 'non sono JSON')
    req.emit('end')
    expect(await p).toBeUndefined()
  })
})

describe('IL DIFETTO: le richieste che finiscono senza finire', () => {
  it('una richiesta chiusa a meta risolve lo stesso', async () => {
    const req = finta()
    const p = leggiCorpoJson(req)
    req.emit('data', '{"a":')
    req.emit('close')
    expect(await p).toBeUndefined()
  })

  it('una richiesta interrotta risolve lo stesso', async () => {
    const req = finta()
    const p = leggiCorpoJson(req)
    req.emit('aborted')
    expect(await p).toBeUndefined()
  })

  it('una richiesta in errore risolve lo stesso', async () => {
    const req = finta()
    const p = leggiCorpoJson(req)
    req.emit('error', new Error('rete caduta'))
    expect(await p).toBeUndefined()
  })
})

describe('il tetto', () => {
  it('oltre il tetto si smette di accumulare e si chiude la porta', async () => {
    const req = finta()
    const p = leggiCorpoJson(req, 10)
    req.emit('data', 'x'.repeat(11))
    expect(await p).toBeUndefined()
    expect(req.chiuso).toBe(true)
  })

  it('e la chiusura non lascia comunque niente in sospeso', async () => {
    // Chiudere la porta fa arrivare `close`: se si fosse chiuso **prima** di
    // rispondere, sarebbe stato quell'evento a risolvere. Adesso la risposta
    // e' gia' data, e la seconda non conta.
    const req = finta()
    const p = leggiCorpoJson(req, 10)
    req.emit('data', 'x'.repeat(11))
    req.emit('close')
    expect(await p).toBeUndefined()
  })

  it('sotto il tetto non cambia niente', async () => {
    const req = finta()
    const p = leggiCorpoJson(req, 100)
    req.emit('data', '{"ok":true}')
    req.emit('end')
    expect(await p).toEqual({ ok: true })
    expect(req.chiuso).toBe(false)
  })
})
