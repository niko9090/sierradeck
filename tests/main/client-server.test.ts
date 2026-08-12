import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import {
  autorizzata, chiaveDa, creaServerClient, indirizziLocali, type Rotta
} from '../../src/main/client-server'
import { apriDispositivi } from '../../src/main/dispositivi'

let server: Server | undefined
afterEach(() => { server?.close(); server = undefined })

function ambiente(rotta?: Rotta): {
  server: Server
  dispositivi: ReturnType<typeof apriDispositivi>
} {
  const dispositivi = apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-cs-')))
  const predefinita: Rotta = ({ percorso, dispositivo }) =>
    ({ stato: 200, corpo: { percorso, dispositivo } })
  return { server: creaServerClient({ dispositivi, rotta: rotta ?? predefinita }), dispositivi }
}

async function chiama(
  s: Server,
  percorso: string,
  opzioni: { chiave?: string; metodo?: string; corpo?: unknown } = {}
): Promise<{ stato: number; dati: Record<string, unknown> }> {
  const porta = (s.address() as AddressInfo).port
  const risposta = await fetch(`http://127.0.0.1:${porta}${percorso}`, {
    method: opzioni.metodo ?? 'GET',
    ...(opzioni.chiave !== undefined ? { headers: { 'x-sierradeck-chiave': opzioni.chiave } } : {}),
    ...(opzioni.corpo !== undefined ? { body: JSON.stringify(opzioni.corpo) } : {})
  })
  return { stato: risposta.status, dati: (await risposta.json()) as Record<string, unknown> }
}

const ascolta = (s: Server): Promise<void> =>
  new Promise((r) => s.listen(0, '127.0.0.1', () => r()))

describe('chi puo entrare', () => {
  it('senza chiave non si passa', async () => {
    const a = ambiente()
    server = a.server
    await ascolta(server)
    const { stato } = await chiama(server, '/api/stato')
    expect(stato).toBe(401)
  })

  it('con la chiave di un dispositivo accoppiato si passa', async () => {
    const a = ambiente()
    server = a.server
    await ascolta(server)
    const esito = a.dispositivi.accoppia(a.dispositivi.apriAccoppiamento().codice, 'telefono')
    const { stato, dati } = await chiama(server, '/api/stato', { chiave: esito?.chiave })
    expect(stato).toBe(200)
    expect(dati.dispositivo).toBe(esito?.id)
  })

  it('una chiave revocata non vale piu', async () => {
    const a = ambiente()
    server = a.server
    await ascolta(server)
    const esito = a.dispositivi.accoppia(a.dispositivi.apriAccoppiamento().codice, 'telefono')
    a.dispositivi.revoca(esito?.id ?? '')
    expect((await chiama(server, '/api/stato', { chiave: esito?.chiave })).stato).toBe(401)
  })

  it('l ingresso resta aperto senza chiave, e solo quello', () => {
    // Accoppiarsi senza chiave e' l'unico modo per ottenerne una: se anche
    // quella porta chiedesse la chiave, nessuno potrebbe mai entrare.
    expect(autorizzata('/api/accoppia')).toBe(true)
    expect(autorizzata('/api/ciao')).toBe(true)
    expect(autorizzata('/api/stato')).toBe(false)
    expect(autorizzata('/api/comando')).toBe(false)
  })
})

describe('la chiave, dove viaggia', () => {
  it('si legge dall intestazione dedicata', () => {
    expect(chiaveDa({ 'x-sierradeck-chiave': ' abc ' })).toBe('abc')
  })

  it('si accetta anche come Bearer, che e la forma che tutti conoscono', () => {
    expect(chiaveDa({ authorization: 'Bearer xyz' })).toBe('xyz')
    expect(chiaveDa({ authorization: 'bearer xyz' })).toBe('xyz')
  })

  it('senza intestazione non si inventa niente', () => {
    expect(chiaveDa({})).toBe('')
    expect(chiaveDa({ authorization: 'Basic cGlwcG8=' })).toBe('')
  })
})

describe('indirizziLocali', () => {
  const finte = {
    'VirtualBox Host-Only Network': [{ address: '192.168.56.1', family: 'IPv4', internal: false }],
    'Wi-Fi': [{ address: '192.168.1.7', family: 'IPv4', internal: false }],
    'vEthernet (WSL)': [{ address: '172.20.0.1', family: 'IPv4', internal: false }],
    'Loopback': [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
    'VPN': [{ address: '8.8.4.4', family: 'IPv4', internal: false }]
  } as unknown as Parameters<typeof indirizziLocali>[0]

  it('mostra solo gli indirizzi privati, e non quelli interni', () => {
    expect(indirizziLocali(finte, undefined)).not.toContain('127.0.0.1')
    expect(indirizziLocali(finte, undefined)).not.toContain('8.8.4.4')
  })

  it('mette per primo quello da cui il computer esce davvero', () => {
    // Su una macchina di lavoro le schede sono cinque o sei e sono tutte
    // «locali» allo stesso modo: senza un ordine si provano a una a una.
    expect(indirizziLocali(finte, '192.168.1.7')[0]).toBe('192.168.1.7')
  })

  it('senza saperlo, preferisce le schede vere a quelle dei programmi', () => {
    // VirtualBox e WSL sono locali quanto le altre, ma un telefono non le
    // raggiunge quasi mai.
    const ordinati = indirizziLocali(finte, undefined)
    expect(ordinati[0]).toBe('192.168.1.7')
    expect(ordinati.indexOf('192.168.56.1')).toBeGreaterThan(0)
  })

  it('non nasconde mai nessuno', () => {
    // Una rete cablata, una VPN aziendale, un secondo wifi sono casi veri: chi
    // ci si trova dentro sa quale gli serve, e deve poterlo leggere.
    expect(indirizziLocali(finte, '192.168.1.7')).toHaveLength(3)
  })
})
