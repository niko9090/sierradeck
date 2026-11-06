import { describe, it, expect } from 'vitest'
import { annunciabile, eTailscale, improntaPc, indirizziPerApp } from '../../src/main/rete-telefono'
import { chiedeIlServizio, nomiAnnuncio, pacchettoAnnuncio, SERVIZIO } from '../../src/main/annuncio-mdns'
import { rotteClient, rotteLibere, type DipendenzeRotte } from '../../src/main/client-rotte'
import { creaServerClient } from '../../src/main/client-server'
import type { AddressInfo } from 'node:net'
import { apriDispositivi } from '../../src/main/dispositivi'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Indirizzi di esempio generici (documentazione), mai quelli di una rete vera.
describe('indirizzi da raccontare all app', () => {
  it('tiene solo privati e Tailscale, la rete di casa prima della VPN', () => {
    const r = indirizziPerApp(['100.100.1.2', '192.168.10.5', '8.8.8.8', '10.1.2.3', '127.0.0.1', '172.32.0.1', '172.20.0.9'], 47640, 'pc-1')
    expect(r.indirizzi).toEqual([
      'http://192.168.10.5:47640', 'http://10.1.2.3:47640', 'http://172.20.0.9:47640', 'http://100.100.1.2:47640'
    ])
  })
  it('non ripete e scarta i nomi e gli IPv6', () => {
    const r = indirizziPerApp(['192.168.10.5', '192.168.10.5', 'fe80::1', 'pippo'], 1234, 'pc-1')
    expect(r.indirizzi).toEqual(['http://192.168.10.5:1234'])
  })
  it('l impronta e stabile, diversa per PC e non contiene l id', () => {
    expect(improntaPc('pc-1')).toBe(improntaPc('pc-1'))
    expect(improntaPc('pc-1')).not.toBe(improntaPc('pc-2'))
    expect(improntaPc('pc-1')).not.toContain('pc-1')
    expect(improntaPc('pc-1')).toMatch(/^[0-9a-f]{16}$/)
  })
  it('riconosce Tailscale e gli indirizzi annunciabili', () => {
    expect(eTailscale('100.64.0.1')).toBe(true)
    expect(eTailscale('100.128.0.1')).toBe(false)
    expect(annunciabile('203.0.113.7')).toBe(false)
    expect(annunciabile('169.254.1.1')).toBe(true)
  })
})

describe('annuncio mDNS', () => {
  it('il pacchetto ha PTR, SRV, TXT e un A per indirizzo privato', () => {
    const p = pacchettoAnnuncio({ impronta: 'abcdef0123456789', porta: 47640, ip: ['192.168.10.5', '8.8.8.8'], versione: '1.0.0' })
    expect(p.readUInt16BE(2)).toBe(0x8400)
    expect(p.readUInt16BE(6)).toBe(4) // PTR, SRV, TXT, 1 A
    expect(p.includes(Buffer.from('id=abcdef0123456789'))).toBe(true)
    expect(p.includes(Buffer.from([192, 168, 10, 5]))).toBe(true)
    expect(p.includes(Buffer.from([8, 8, 8, 8]))).toBe(false)
    expect(nomiAnnuncio('abcdef0123456789').istanza.endsWith(SERVIZIO)).toBe(true)
  })
  it('capisce una domanda sul nostro servizio e ignora il resto', () => {
    const domanda = (nome: string, tipo: number): Buffer => {
      const parti = nome.split('.').flatMap((x) => [Buffer.from([x.length]), Buffer.from(x)])
      const coda = Buffer.alloc(4)
      coda.writeUInt16BE(tipo, 0)
      coda.writeUInt16BE(1, 2)
      const testa = Buffer.alloc(12)
      testa.writeUInt16BE(1, 4)
      return Buffer.concat([testa, ...parti, Buffer.from([0]), coda])
    }
    expect(chiedeIlServizio(domanda(SERVIZIO, 12))).toBe(true)
    expect(chiedeIlServizio(domanda('_altro._tcp.local', 12))).toBe(false)
    expect(chiedeIlServizio(Buffer.from([1, 2, 3]))).toBe(false)
    expect(chiedeIlServizio(pacchettoAnnuncio({ impronta: 'abcdef0123456789', porta: 1, ip: [], versione: '1' }))).toBe(false)
  })
})

describe('rotte per l app', () => {
  const rete = { impronta: 'abcdef0123456789', porta: 47640, indirizzi: ['http://192.168.10.5:47640'] }
  const deps = (over: Partial<DipendenzeRotte> = {}): DipendenzeRotte =>
    ({ dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-rt-'))), versione: '0.5.0', reteApp: () => rete, ...over }) as unknown as DipendenzeRotte

  it('/api/ciao dice l impronta, e non gli indirizzi', async () => {
    const r = await rotteLibere(deps())({ metodo: 'GET', percorso: '/api/ciao', corpo: undefined })
    const c = r.corpo as Record<string, unknown>
    expect(c.impronta).toBe(rete.impronta)
    expect(JSON.stringify(c)).not.toContain('192.168')
  })
  it('/api/ciao senza reteApp resta come prima', async () => {
    const r = await rotteLibere(deps({ reteApp: undefined }))({ metodo: 'GET', percorso: '/api/ciao', corpo: undefined })
    expect((r.corpo as Record<string, unknown>).impronta).toBeUndefined()
  })
  it('/api/indirizzi non e fra le rotte libere: serve il gettone', async () => {
    const r = await rotteLibere(deps())({ metodo: 'GET', percorso: '/api/indirizzi', corpo: undefined })
    expect(r.stato).toBe(404)
  })
  it('/api/indirizzi da gli indirizzi alla rotta protetta', async () => {
    const r = await rotteClient(deps())({ metodo: 'GET', percorso: '/api/indirizzi', corpo: undefined })
    expect(r.corpo).toEqual(rete)
  })
  it('dal server, senza gettone /api/indirizzi risponde 401', async () => {
    const server = creaServerClient({ dispositivi: deps().dispositivi, rotta: async () => ({ stato: 200, corpo: rete }) })
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', () => ok()))
    try {
      const porta = (server.address() as AddressInfo).port
      const r = await fetch(`http://127.0.0.1:${porta}/api/indirizzi`)
      expect(r.status).toBe(401)
    } finally { server.close() }
  })
})
