import { describe, it, expect } from 'vitest'
import type { AddressInfo } from 'node:net'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaClientPcRemoto } from '../../src/main/pc-remoto'
import { provaCasa } from '../../src/main/casa-firma'
import { indirizziTailscaleDi, statoPc, testoProva } from '../../src/shared/scoperta-pc'
import type { BattitoPc } from '../../src/shared/posta'

// Il caso del 10/10 (0.57.0): dal PC fisso le chat con casa sul portatile
// «sembrano collegarsi, poi il PC non risponde». Nomi e indirizzi qui sono
// d'esempio (regola: niente dati privati).
// - su Tailscale il portatile ha un nome diverso da quello di Windows, e gli
//   indirizzi Tailscale si cercavano solo per nome;
// - il portatile si collegava a questo PC dalla rete di casa, e quell'indirizzo
//   non veniva imparato;
// - un bussare andato a vuoto non lasciava traccia: non si sapeva a chi si era
//   bussato né cosa aveva risposto.

const ORA = Date.parse('2026-10-10T15:00:00.000Z')
const CHIAVE = 'chiave-di-casa-portatile'
const PORTATILE: BattitoPc = {
  pcId: 'portatile-id', nome: 'PC-ESEMPIO', versione: '0.57.0', battito: new Date(ORA - 60_000).toISOString(),
  cartelle: [], chat: [],
  // Il battito ha un indirizzo di casa che non risponde più e un Tailscale vecchio.
  indirizzi: ['192.168.1.20', '100.70.0.5', '169.254.1.1'], porta: 47640
}

function finto(rispondono: Record<string, 'sierradeck' | 'estraneo'>): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const u = new URL(String(url))
    const chi = rispondono[u.hostname]
    if (chi === undefined) throw new TypeError('fetch failed: ECONNREFUSED')
    if (u.pathname === '/api/casa') {
      const prova = chi === 'sierradeck' ? provaCasa(CHIAVE, u.searchParams.get('sfida') ?? '') : 'non-so'
      return new Response(JSON.stringify({ programma: 'SierraDeck', prova }), { status: 200 })
    }
    void init
    return new Response(JSON.stringify({ chat: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
}

describe('Tailscale riconosce il PC anche se là ha un altro nome (0.57.1)', () => {
  const status = {
    Peer: {
      k1: { HostName: 'laptop-esempio-casa', DNSName: 'laptop-esempio-casa.tailnet-esempio.ts.net.', TailscaleIPs: ['100.80.0.9', 'fd7a::1'], Online: true },
      k2: { HostName: 'altro', DNSName: 'pc-esempio.tailnet-esempio.ts.net.', TailscaleIPs: ['100.90.0.3'] }
    }
  }
  it('per indirizzo del battito, quando il nome non torna', () => {
    expect(indirizziTailscaleDi(status, 'PC-NON-COSI', ['192.168.1.20', '100.80.0.9']).indirizzi).toEqual(['100.80.0.9'])
  })
  it('per nome DNS', () => {
    expect(indirizziTailscaleDi(status, 'PC-ESEMPIO').indirizzi).toEqual(['100.90.0.3'])
  })
  it('per nome di Windows, come prima', () => {
    expect(indirizziTailscaleDi(status, 'LAPTOP-ESEMPIO-CASA').indirizzi).toEqual(['100.80.0.9'])
  })
  it('nessun abbinamento: niente', () => {
    expect(indirizziTailscaleDi(status, 'sconosciuto', ['10.0.0.1']).indirizzi).toEqual([])
  })
})

describe('il bussare racconta cosa ha provato (0.57.1)', () => {
  it('il battito non basta, Tailscale trovato per indirizzo sì: si entra, e il registro lo dice', async () => {
    const log: string[] = []
    const c = creaClientPcRemoto({
      battiti: () => [PORTATILE], chiavePer: () => CHIAVE, mioNome: () => 'PC-FISSO', adesso: () => ORA, attesaMs: 50, bussaMs: 200,
      fetch: finto({ '100.80.0.9': 'sierradeck' }),
      altriIndirizzi: async (_id, nome) => ({ tailscale: indirizziTailscaleDi({ Peer: { k: { HostName: 'laptop-esempio-casa', TailscaleIPs: ['100.80.0.9', '100.70.0.5'] } } }, nome, PORTATILE.indirizzi).indirizzi }),
      log: (m) => { log.push(m) }
    })
    expect(await c.chiama('portatile-id', '/api/stato')).toEqual({ chat: [] })
    expect(c.indirizzoBuono('portatile-id')).toBe('100.80.0.9')
    expect(log.join('\n')).toContain('PC-ESEMPIO risponde su 100.80.0.9 (Tailscale)')
  })

  it('nessuno va bene: una riga nel registro con ogni indirizzo e la sua risposta, e il riquadro la ripete', async () => {
    const log: string[] = []
    const c = creaClientPcRemoto({
      battiti: () => [PORTATILE], chiavePer: () => CHIAVE, mioNome: () => 'PC-FISSO', adesso: () => ORA, attesaMs: 50, bussaMs: 200,
      fetch: finto({ '100.70.0.5': 'estraneo' }),
      log: (m) => { log.push(m) }
    })
    const p = await c.bussa('portatile-id')
    const riga = log.find((m) => m.includes('bussato a')) ?? ''
    expect(riga).toContain('192.168.1.20 (rete locale): nessuna risposta')
    expect(riga).toContain('100.70.0.5 (Tailscale): risponde, ma non prova la chiave di casa')
    expect(riga).not.toContain('169.254')
    const s = statoPc({ nome: 'PC-ESEMPIO', ping: p, battitoVivo: true, driveCollegato: true, porta: 47640 })
    expect(s.cosaFare).toContain('Cosa ho provato')
    // Lo stesso esito non si riscrive a ogni giro del riquadro.
    await c.bussa('portatile-id')
    expect(log.filter((m) => m.includes('bussato a'))).toHaveLength(1)
  })

  it('senza nessun indirizzo lo dice, non tace', async () => {
    const log: string[] = []
    const c = creaClientPcRemoto({
      battiti: () => [{ ...PORTATILE, indirizzi: [] }], chiavePer: () => CHIAVE, mioNome: () => 'PC-FISSO', adesso: () => ORA,
      fetch: finto({}), log: (m) => { log.push(m) }
    })
    expect((await c.bussa('portatile-id')).esito).toBe('senza-indirizzi')
    expect(log.join('\n')).toContain('non ho nessun indirizzo a cui bussare')
  })

  it('le righe di prova', () => {
    expect(testoProva({ indirizzo: '100.80.0.9', esito: 'risponde' })).toBe('100.80.0.9 (Tailscale): risponde e prova la chiave di casa')
    expect(testoProva({ indirizzo: '192.168.1.20', esito: 'cassaforte', stato: 401 })).toContain('cassaforte è chiusa')
  })
})

describe('il PC che ci chiama con la firma di casa lascia il suo indirizzo (0.57.1)', () => {
  it('una richiesta firmata da un PC: pcVisto con il suo id e l indirizzo senza ::ffff:', async () => {
    const { creaServerClient } = await import('../../src/main/client-server')
    const { apriDispositivi } = await import('../../src/main/dispositivi')
    const { firmaRichiesta, nonceConVisore, INTESTAZIONE_FIRMA } = await import('../../src/main/casa-firma')
    const visti: Array<[string, string]> = []
    const s = creaServerClient({
      dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-pv-'))),
      chiaveDiCasa: () => CHIAVE,
      pcVisto: (id, ind) => { visti.push([id, ind]) },
      rotta: async () => ({ stato: 200, corpo: { ok: true } })
    })
    await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()))
    const porta = (s.address() as AddressInfo).port
    const percorso = '/api/stato'
    const r = await fetch(`http://127.0.0.1:${porta}${percorso}`, {
      headers: { [INTESTAZIONE_FIRMA]: firmaRichiesta(CHIAVE, 'GET', percorso, Date.now(), nonceConVisore('portatile-id')), 'x-sierradeck-pc': 'PC-ESEMPIO' }
    })
    s.close()
    expect(r.status).toBe(200)
    expect(visti).toEqual([['portatile-id', '127.0.0.1']])
  })
})
