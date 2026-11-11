import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import type { IncomingMessage, Server } from 'node:http'
import { annotaRotta, iniziaMisura, misuraRisposta, PESO_DA_DIRE, PESO_MASSIMO } from '../../src/main/client-misure'
import { creaServerClient, type Rotta } from '../../src/main/client-server'
import { apriDispositivi } from '../../src/main/dispositivi'

/**
 * Peso e tempo di ogni risposta: una riga nel registro oltre 1 s o 1 MB, 413
 * oltre 8 MB (il 31/10 l'app è caduta per 214 MB, e non si è saputo da dove).
 */

const finta = (url: string): IncomingMessage => ({ url, socket: { remoteAddress: '10.1.2.3' } }) as unknown as IncomingMessage

describe('la misura', () => {
  it('una risposta veloce e leggera non lascia righe', () => {
    const righe: string[] = []
    const req = finta('/api/stato?x=1')
    iniziaMisura(req, (_k, m) => righe.push(m), 1000)
    expect(misuraRisposta(req, '{"ok":true}', 200, 1200)).toBeUndefined()
    expect(righe).toEqual([])
  })

  it('lenta: una riga con la rotta (senza i parametri), i secondi e chi chiedeva', () => {
    const righe: string[] = []
    const req = finta('/api/storia?segreto=abc')
    iniziaMisura(req, (_k, m) => righe.push(m), 1000)
    misuraRisposta(req, '{}', 200, 3500)
    expect(righe).toHaveLength(1)
    expect(righe[0]).toContain('/api/storia')
    expect(righe[0]).toContain('2,5 s')
    expect(righe[0]).toContain('10.1.2.3')
    expect(righe[0]).not.toContain('segreto')
  })

  it('pesante: una riga con il peso', () => {
    const righe: string[] = []
    const req = finta('/api/autopilota')
    iniziaMisura(req, (_k, m) => righe.push(m), 1000)
    expect(misuraRisposta(req, 'x'.repeat(PESO_DA_DIRE + 1), 200, 1100)).toBeUndefined()
    expect(righe[0]).toMatch(/\/api\/autopilota: 0,1 s, 1 MB .*pesante/)
  })

  it('oltre 8 MB: 413 con rotta e peso, e la riga', () => {
    const righe: string[] = []
    const req = finta('/api/autopilota')
    iniziaMisura(req, (_k, m) => righe.push(m), 1000)
    const e = misuraRisposta(req, 'x'.repeat(PESO_MASSIMO + 1), 200, 1100)
    expect(e).toEqual({ stato: 413, corpo: { errore: 'troppo-grande', rotta: '/api/autopilota', peso: PESO_MASSIMO + 1 } })
    expect(righe[0]).toContain('413')
  })

  it('il peso conta i byte, non i caratteri', () => {
    const req = finta('/api/storia')
    iniziaMisura(req, () => {}, 0)
    // 3 MB di caratteri da 3 byte: 9 MB veri.
    expect(misuraRisposta(req, '€'.repeat(3 * 1024 * 1024), 200, 1)?.stato).toBe(413)
  })

  it('dal ponte si scrive la rotta di dentro, che è quella che pesa', () => {
    const righe: string[] = []
    const req = finta('/api/ponte')
    iniziaMisura(req, (_k, m) => righe.push(m), 0)
    annotaRotta(req, '/api/ponte', { pc: 'B', percorso: '/api/storia', corpo: {} })
    misuraRisposta(req, '{}', 200, 5000)
    expect(righe[0]).toContain('/api/ponte → /api/storia')
  })

  it('l’attesa lunga di /api/eventi non è lentezza', () => {
    const righe: string[] = []
    const req = finta('/api/eventi?avvisi=3&attesa=50')
    iniziaMisura(req, (_k, m) => righe.push(m), 0)
    misuraRisposta(req, '{}', 200, 50_000)
    expect(righe).toEqual([])
  })

  it('senza misura controlla lo stesso il peso', () => {
    expect(misuraRisposta(undefined, 'x'.repeat(PESO_MASSIMO + 1), 200)?.stato).toBe(413)
    expect(misuraRisposta(undefined, '{}', 200)).toBeUndefined()
  })
})

let server: Server | undefined
afterEach(() => { server?.close(); server = undefined })

describe('nel server del Client', () => {
  it('una rotta che risponderebbe 9 MB manda 413, compresso o no; le altre come prima', async () => {
    const dispositivi = apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-misure-')))
    const chiave = dispositivi.accoppia(dispositivi.apriAccoppiamento().codice, 'telefono di esempio')?.chiave ?? ''
    const registro: string[] = []
    const rotta: Rotta = ({ percorso }) => percorso === '/api/grande'
      ? { stato: 200, corpo: { testo: 'x'.repeat(9 * 1024 * 1024) } }
      : { stato: 200, corpo: { ok: true } }
    server = creaServerClient({ dispositivi, rotta, log: (m) => registro.push(m) })
    await new Promise<void>((r) => server?.listen(0, '127.0.0.1', () => r()))
    const porta = (server.address() as AddressInfo).port
    for (const comprimi of [false, true]) {
      const r = await fetch(`http://127.0.0.1:${porta}/api/grande`, { headers: { 'x-sierradeck-chiave': chiave, ...(comprimi ? {} : { 'accept-encoding': 'identity' }) } })
      expect(r.status).toBe(413)
      expect(await r.json()).toEqual({ errore: 'troppo-grande', rotta: '/api/grande', peso: 9 * 1024 * 1024 + 12 })
    }
    const ok = await fetch(`http://127.0.0.1:${porta}/api/piccola`, { headers: { 'x-sierradeck-chiave': chiave } })
    expect(ok.status).toBe(200)
    expect(registro.filter((m) => m.includes('troppo'))).toHaveLength(1)
    expect(registro.join('\n')).not.toContain(chiave)
  })
})
