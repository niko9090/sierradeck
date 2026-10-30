import { describe, it, expect } from 'vitest'
import { creaClientPcRemoto } from '../../src/main/pc-remoto'
import { improntaPc, provaCasa } from '../../src/main/casa-firma'
import { indirizziDaAnnunciare, mieiIndirizzi, schedaVirtuale } from '../../src/main/client-server'
import { indirizziDaProvare } from '../../src/shared/scoperta-pc'
import type { BattitoPc } from '../../src/shared/posta'

// Il caso del 30/10: i battiti degli altri PC portavano gli indirizzi delle
// schede virtuali (VirtualBox 192.168.56.1, la condivisione di Windows
// 192.168.137.1, Hyper-V/WSL 172.16–31.x). Esistono uguali su tanti PC: chi
// bussava al 192.168.56.1 di un altro trovava il proprio SierraDeck («risponde
// un ALTRO SierraDeck»). Indirizzi d'esempio, MAC inventati con il prefisso giusto.

type Interfacce = Parameters<typeof indirizziDaAnnunciare>[0]

const PC_FISSO = {
  Tailscale: [{ address: '100.100.0.14', family: 'IPv4', internal: false, mac: '00:00:00:00:00:00' }],
  'Ethernet 2': [{ address: '192.168.1.191', family: 'IPv4', internal: false, mac: 'ac:22:0b:00:00:01' }],
  // La scheda «solo host» di VirtualBox: su Windows si chiama come una vera.
  'Ethernet 3': [{ address: '192.168.56.1', family: 'IPv4', internal: false, mac: '0a:00:27:00:00:0e' }],
  'Loopback Pseudo-Interface 1': [{ address: '127.0.0.1', family: 'IPv4', internal: true, mac: '00:00:00:00:00:00' }],
  'vEthernet (Default Switch)': [{ address: '172.27.192.1', family: 'IPv4', internal: false, mac: '00:15:5d:00:00:01' }]
} as unknown as Interfacce

describe('le schede virtuali non vanno nel battito', () => {
  it('le riconosce per nome, per produttore della scheda e per rete', () => {
    expect(schedaVirtuale('Ethernet 3', { address: '192.168.56.1', mac: '0a:00:27:00:00:0e' })).toBe(true)
    expect(schedaVirtuale('Ethernet 7', { address: '192.168.56.1' })).toBe(true)
    expect(schedaVirtuale('vEthernet (WSL)', { address: '172.29.80.1' })).toBe(true)
    expect(schedaVirtuale('Ethernet 5', { address: '172.17.64.1', mac: '00:15:5d:aa:bb:cc' })).toBe(true)
    expect(schedaVirtuale('VMware Network Adapter VMnet8', { address: '192.168.112.1' })).toBe(true)
    expect(schedaVirtuale('Connessione alla rete locale* 2', { address: '192.168.137.1' })).toBe(true)
    expect(schedaVirtuale('docker0', { address: '172.17.0.1', mac: '02:42:ac:11:00:01' })).toBe(true)
    expect(schedaVirtuale('Bluetooth Network Connection', { address: '10.0.0.5' })).toBe(true)
  })

  it('le schede vere e Tailscale restano', () => {
    expect(schedaVirtuale('Ethernet 2', { address: '192.168.1.191', mac: 'ac:22:0b:00:00:01' })).toBe(false)
    expect(schedaVirtuale('Wi-Fi', { address: '192.168.68.103', mac: '3c:22:fb:00:00:01' })).toBe(false)
    expect(schedaVirtuale('Tailscale', { address: '100.100.0.14', mac: '00:00:00:00:00:00' })).toBe(false)
    // Chi sta dietro la condivisione di un altro PC ha un 192.168.137.x vero.
    expect(schedaVirtuale('Wi-Fi', { address: '192.168.137.24' })).toBe(false)
    // Una macchina virtuale, da dentro, ha una scheda vera (08:00:27).
    expect(schedaVirtuale('Ethernet', { address: '10.0.2.15', mac: '08:00:27:00:00:01' })).toBe(false)
  })

  it('il battito del PC-Fisso: rete di casa e Tailscale, niente VirtualBox né Hyper-V', () => {
    const annunciati = indirizziDaAnnunciare(PC_FISSO, '192.168.1.191')
    expect(annunciati).toEqual(['192.168.1.191', '100.100.0.14'])
  })

  it('quello da cui il PC esce davvero resta anche se la scheda pare virtuale (switch esterno di Hyper-V)', () => {
    const interfacce = {
      'vEthernet (Esterno)': [{ address: '192.168.1.50', family: 'IPv4', internal: false, mac: '00:15:5d:00:00:09' }],
      'vEthernet (WSL)': [{ address: '172.29.80.1', family: 'IPv4', internal: false, mac: '00:15:5d:00:00:0a' }]
    } as unknown as Interfacce
    expect(indirizziDaAnnunciare(interfacce, '192.168.1.50')).toEqual(['192.168.1.50'])
  })

  it('se restano solo virtuali, si annunciano tutte: meglio un indirizzo forse inutile che nessuno', () => {
    const interfacce = {
      'vEthernet (Esterno)': [{ address: '192.168.1.50', family: 'IPv4', internal: false, mac: '00:15:5d:00:00:09' }]
    } as unknown as Interfacce
    expect(indirizziDaAnnunciare(interfacce, undefined)).toEqual(['192.168.1.50'])
  })

  it('i miei indirizzi: tutti, anche i virtuali e il loopback', () => {
    expect(mieiIndirizzi(PC_FISSO).sort()).toEqual(['100.100.0.14', '127.0.0.1', '172.27.192.1', '192.168.1.191', '192.168.56.1'].sort())
  })
})

describe('chi bussa non bussa a sé stesso', () => {
  it('indirizziDaProvare toglie gli indirizzi di questo PC, da qualunque fonte arrivino', () => {
    expect(indirizziDaProvare({
      buono: '192.168.56.1',
      ricordati: ['192.168.137.1'],
      tailscale: ['100.107.0.25'],
      battito: ['192.168.1.180', '192.168.56.1'],
      mie: ['192.168.56.1', '192.168.137.1', '192.168.1.191']
    })).toEqual(['100.107.0.25', '192.168.1.180'])
  })

  const ORA = Date.parse('2026-10-30T21:44:56.000Z')
  const NB: BattitoPc = {
    pcId: 'nb-id', nome: 'NB-ESEMPIO', versione: '0.79.0', battito: new Date(ORA - 60_000).toISOString(),
    cartelle: [], chat: [], indirizzi: ['100.107.0.25', '192.168.1.180', '192.168.56.1'], porta: 47640
  }

  it('il 192.168.56.1 del battito di un altro PC non si prova quando è anche mio', async () => {
    const bussati: string[] = []
    const log: string[] = []
    const c = creaClientPcRemoto({
      battiti: () => [NB], chiavePer: () => 'chiave-nb', mioNome: () => 'PC-FISSO', adesso: () => ORA, bussaMs: 200,
      mieiIndirizzi: () => mieiIndirizzi(PC_FISSO),
      fetch: (async (url: string | URL | Request): Promise<Response> => {
        const u = new URL(String(url))
        bussati.push(u.hostname)
        // A 192.168.56.1 risponderebbe il SierraDeck di questo PC.
        if (u.hostname === '192.168.56.1') {
          return new Response(JSON.stringify({ programma: 'SierraDeck', prova: 'altra', impronta: improntaPc('pc-fisso-id') }), { status: 200 })
        }
        throw new TypeError('fetch failed')
      }) as typeof fetch,
      log: (m) => { log.push(m) }
    })
    const p = await c.bussa('nb-id')
    expect(bussati).not.toContain('192.168.56.1')
    expect(p.esito).toBe('muto')
    expect(log.join('\n')).not.toContain('ALTRO SierraDeck')
  })
})

describe('una prova di casa che non dice chi è si riprova una volta', () => {
  const ORA = Date.parse('2026-10-30T22:14:06.000Z')
  const CHIAVE = 'chiave-desktop'
  const DESKTOP: BattitoPc = {
    pcId: 'desktop-id', nome: 'DESKTOP-ESEMPIO', versione: '0.88.3', battito: new Date(ORA - 60_000).toISOString(),
    cartelle: [], chat: [], indirizzi: ['100.113.0.97'], porta: 47640
  }

  function desktop(prime: Array<'illeggibile' | 'errore' | 'giusta' | 'altra-cassaforte'>): { fetch: typeof fetch; chiamate: () => number } {
    let n = 0
    const f = (async (url: string | URL | Request): Promise<Response> => {
      const u = new URL(String(url))
      const cosa = prime[Math.min(n, prime.length - 1)]
      n += 1
      if (cosa === 'illeggibile') return new Response('{"programma":"Sierra', { status: 200 })
      if (cosa === 'errore') return new Response('{}', { status: 500 })
      const prova = cosa === 'giusta' ? provaCasa(CHIAVE, u.searchParams.get('sfida') ?? '') : 'sbagliata'
      return new Response(JSON.stringify({ programma: 'SierraDeck', prova, impronta: improntaPc('desktop-id') }), { status: 200 })
    }) as typeof fetch
    return { fetch: f, chiamate: () => n }
  }

  const cliente = (f: typeof fetch, log: string[] = []): ReturnType<typeof creaClientPcRemoto> => creaClientPcRemoto({
    battiti: () => [DESKTOP], chiavePer: () => CHIAVE, mioNome: () => 'PC-FISSO', adesso: () => ORA, bussaMs: 200, riprovaCasaMs: 5,
    fetch: f, log: (m) => { log.push(m) }
  })

  it('un corpo arrivato a metà, poi la prova giusta: si entra', async () => {
    const d = desktop(['illeggibile', 'giusta'])
    const p = await cliente(d.fetch).bussa('desktop-id')
    expect(p).toMatchObject({ esito: 'risponde', indirizzo: '100.113.0.97' })
    expect(d.chiamate()).toBe(2)
  })

  it('un errore del server, poi la prova giusta: si entra', async () => {
    const d = desktop(['errore', 'giusta'])
    expect((await cliente(d.fetch).bussa('desktop-id')).esito).toBe('risponde')
  })

  it('illeggibile due volte: estraneo, e il registro dice perché', async () => {
    const log: string[] = []
    const d = desktop(['illeggibile', 'illeggibile'])
    const p = await cliente(d.fetch, log).bussa('desktop-id')
    expect(p.esito).toBe('chiave')
    expect(d.chiamate()).toBe(2)
    expect(log.join('\n')).toContain('risposta 200 illeggibile, anche riprovando')
  })

  it('una prova sbagliata con l\'impronta è una risposta chiara: nessun secondo tentativo', async () => {
    const d = desktop(['altra-cassaforte'])
    const p = await cliente(d.fetch).bussa('desktop-id')
    expect(p.esito).toBe('chiave')
    expect(d.chiamate()).toBe(1)
  })
})
