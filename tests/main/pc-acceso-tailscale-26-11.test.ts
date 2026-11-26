import { describe, it, expect } from 'vitest'
import { creaClientPcRemoto } from '../../src/main/pc-remoto'
import { criticitaDi, testoRapporto, giroControlloPc, type SaluteDiPc } from '../../src/main/controllo-pc'
import { decidiEstraneo, titoloDopoIlBussare, AVVIO_CALMO_MS, VERDETTO_ESTRANEO_DOPO_MS, TESTO_ACCESO_SENZA_SIERRADECK } from '@shared/scoperta-pc'
import { indirizziTailscaleDi } from '@shared/scoperta-pc'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { BattitoPc } from '@shared/posta'
import type { Salute } from '@shared/salute'

/**
 * 26/11: Nicholas, «nei PC mi dice che gli altri sono spenti». Il portatile era
 * acceso (Tailscale: in linea) con SierraDeck chiuso; e appena dopo un avvio una
 * risposta senza la prova di casa diventava «gli indirizzi sono di altri».
 */
const ADESSO = Date.parse('2026-11-26T10:20:00Z')
const VECCHIO = new Date(ADESSO - 12 * 3_600_000).toISOString()
const BATTITO: BattitoPc = { pcId: 'lap', nome: 'PORTATILE-ESEMPIO', versione: '0.121.0', battito: VECCHIO, cartelle: [], chat: [], indirizzi: ['100.64.0.20'], porta: 47640 }
type Risposta = { status: number; json: () => Promise<unknown> }
const risponde = (status: number, corpo: unknown = {}): Risposta => ({ status, json: async () => corpo })
const muto = (async (_url: string, init?: { signal?: AbortSignal }) => new Promise((_ok, ko) => init?.signal?.addEventListener('abort', () => ko(new Error('abort'))))) as unknown as typeof fetch
/** Un 200 senza prova giusta e senza impronta: la risposta del 26/11 alle 10:18:59. */
const senzaImpronta = (async () => risponde(200, { programma: 'SierraDeck' })) as unknown as typeof fetch

describe('Tailscale dice se un PC muto è acceso', () => {
  it('in linea su Tailscale, battito vecchio, nessuno risponde: «acceso, ma SierraDeck non risponde»', async () => {
    const c = creaClientPcRemoto({
      battiti: () => [BATTITO], chiavePer: () => 'k', mioNome: () => 'PC-Fisso', adesso: () => ADESSO, bussaMs: 30,
      fetch: muto, tailscaleOnline: async () => true
    })
    const s = await c.statoDi('lap')
    expect(s.stato).toBe('irraggiungibile')
    expect(s.titolo).toBe(`PORTATILE-ESEMPIO è ${TESTO_ACCESO_SENZA_SIERRADECK}`)
    expect(s.titolo).not.toMatch(/spento|Non so se/)
  })
  it('fuori linea, o senza Tailscale (anche se la domanda fallisce): come prima, «non so se è acceso»', async () => {
    for (const ts of [async () => false, async () => undefined, async () => { throw new Error('niente') }]) {
      const c = creaClientPcRemoto({ battiti: () => [BATTITO], chiavePer: () => 'k', mioNome: () => 'PC-Fisso', adesso: () => ADESSO, bussaMs: 30, fetch: muto, tailscaleOnline: ts })
      const s = await c.statoDi('lap')
      expect(s.stato).toBe('non-so')
    }
  })
  it('il riconoscimento è dagli indirizzi del battito, anche con un altro nome su Tailscale', () => {
    const stato = { Peer: { x: { HostName: 'nome-diverso', DNSName: 'nome-diverso.tail.ts.net.', TailscaleIPs: ['100.64.0.20'], Online: true } } }
    expect(indirizziTailscaleDi(stato, '', ['100.64.0.20']).online).toBe(true)
    expect(indirizziTailscaleDi(stato, '', ['100.64.0.99']).online).toBeUndefined()
  })
  it('titoloDopoIlBussare: Tailscale conta solo quando il battito è vecchio', () => {
    const base = { nome: 'X', ping: { esito: 'muto' as const, provati: ['a'] }, driveCollegato: true, porta: 47640 }
    expect(titoloDopoIlBussare({ ...base, battitoVivo: false, tailscaleOnline: true }).titolo).toContain(TESTO_ACCESO_SENZA_SIERRADECK)
    expect(titoloDopoIlBussare({ ...base, battitoVivo: false, tailscaleOnline: false }).stato).toBe('non-so')
    expect(titoloDopoIlBussare({ ...base, battitoVivo: true, tailscaleOnline: true }).titolo).toBe('X è acceso ma non risponde')
  })
})

describe('il controllo di tutti i PC e Tailscale', () => {
  const salute: Salute = { scritto: '', tono: 'ok', riassunto: 'tutto bene', voci: [] }
  const io: SaluteDiPc = { pcId: 'io', nome: 'PC-Fisso', salute }
  it('acceso su Tailscale: non fra i «PC spenti», niente «si toglie fra», non una criticità', () => {
    const lap: SaluteDiPc = { pcId: 'lap', nome: 'Portatile', battito: VECCHIO, errore: 'nessuna risposta', tailscaleOnline: true }
    expect(criticitaDi([io, lap], [], ADESSO)).toEqual([])
    const r = testoRapporto({ quando: new Date(ADESSO).toISOString(), saluti: [io, lap], criticita: [], adesso: ADESSO })
    expect(r).not.toContain('PC spenti')
    expect(r).not.toContain('si toglie fra')
    expect(r).toContain(TESTO_ACCESO_SENZA_SIERRADECK)
  })
  it('fuori linea su Tailscale (o non si sa): resta fra i PC spenti, come prima', () => {
    for (const tailscaleOnline of [false, undefined]) {
      const lap: SaluteDiPc = { pcId: 'lap', nome: 'Portatile', battito: VECCHIO, errore: 'nessuna risposta', ...(tailscaleOnline !== undefined ? { tailscaleOnline } : {}) }
      const r = testoRapporto({ quando: new Date(ADESSO).toISOString(), saluti: [io, lap], criticita: [], adesso: ADESSO })
      expect(r).toContain('## PC spenti (1)')
      expect(r).toContain('si toglie fra')
    }
  })
  it('battito fresco e muto: resta «non risponde» anche se Tailscale lo vede', () => {
    const lap: SaluteDiPc = { pcId: 'lap', nome: 'Portatile', battito: new Date(ADESSO - 60_000).toISOString(), errore: 'nessuna risposta', tailscaleOnline: true }
    expect(criticitaDi([io, lap], [], ADESSO).map((c) => c.cosa)).toEqual(['non risponde'])
  })
  it('il giro chiede a Tailscale solo per chi non risponde', async () => {
    const chiesti: string[] = []
    const radice = mkdtempSync(join(tmpdir(), 'ctrl-ts-'))
    const r = await giroControlloPc({
      radice: () => radice, io: () => ({ id: 'io', nome: 'PC-Fisso' }),
      altri: () => [{ pcId: 'lap', nome: 'Portatile', battito: VECCHIO }, { pcId: 'ok', nome: 'Desktop', battito: VECCHIO }],
      saluteQui: async () => salute,
      saluteDi: async (pc) => { if (pc === 'lap') throw new Error('nessuna risposta'); return salute },
      tailscaleOnline: async (pc) => { chiesti.push(pc); return true },
      autopiloti: async () => [], affida: async () => {}, adesso: () => ADESSO, log: () => {}
    })
    expect(chiesti).toEqual(['lap'])
    expect(r.criticita).toBe(0)
  })
})

describe('una risposta senza la prova di casa subito dopo l’avvio (26/11)', () => {
  it('decidiEstraneo: cassaforte di qui chiusa, appena partiti, poche prove → si aspetta; solo dopo minuti il verdetto', () => {
    const avvioIl = ADESSO - 10 * 60_000
    expect(decidiEstraneo({ adesso: ADESSO, avvioIl, chiavePronta: false, primoIl: ADESSO - 3_600_000, volte: 20 })).toBe('cassaforte-qui')
    expect(decidiEstraneo({ adesso: ADESSO, avvioIl: ADESSO - 1000, chiavePronta: true, primoIl: ADESSO - 3_600_000, volte: 20 })).toBe('avvio')
    expect(decidiEstraneo({ adesso: ADESSO, avvioIl, chiavePronta: true, primoIl: ADESSO, volte: 1 })).toBe('riprovo')
    expect(decidiEstraneo({ adesso: ADESSO, avvioIl, chiavePronta: true, primoIl: ADESSO - VERDETTO_ESTRANEO_DOPO_MS, volte: 2 })).toBe('riprovo')
    expect(decidiEstraneo({ adesso: ADESSO, avvioIl, chiavePronta: true, primoIl: ADESSO - VERDETTO_ESTRANEO_DOPO_MS, volte: 3 })).toBe('verdetto')
  })

  const crea = (orologio: { t: number }, avvioIl: number, log: string[], chiusa = false) => creaClientPcRemoto({
    battiti: () => [BATTITO], chiavePer: () => (chiusa ? undefined : 'k'), mioNome: () => 'PC-Fisso', adesso: () => orologio.t,
    bussaMs: 50, riprovaCasaMs: 1, fetch: senzaImpronta, log: (m) => { log.push(m) },
    calmaAllAvvio: { avvioIl, riprovaMs: 3_600_000 }
  })

  it('appena partiti: niente «gli indirizzi sono di altri», niente riga «non prova la chiave», si riprova', async () => {
    const orologio = { t: ADESSO }
    const log: string[] = []
    const c = crea(orologio, ADESSO - 5_000, log)
    const p = await c.bussa('lap')
    expect(p.esito).toBe('muto')
    expect(p.inVerifica).toBe('avvio')
    const s = await c.statoDi('lap')
    expect(s.titolo).toBe('Controllo PORTATILE-ESEMPIO: riprovo fra poco')
    expect(s.cosaFare).not.toContain('sono di altri')
    expect(log.join('\n')).not.toContain('non prova la chiave di casa')
  })

  it('con la cassaforte di qui chiusa non si dà la colpa all’altro PC', async () => {
    const c = crea({ t: ADESSO }, ADESSO - 3_600_000, [], true)
    expect((await c.bussa('lap')).inVerifica).toBe('cassaforte-qui')
  })

  it('dopo minuti di risposte sbagliate, più volte, il verdetto arriva come prima', async () => {
    const orologio = { t: ADESSO }
    const log: string[] = []
    const c = crea(orologio, ADESSO - AVVIO_CALMO_MS - 1, log)
    expect((await c.bussa('lap')).esito).toBe('muto')
    orologio.t += 60_000
    expect((await c.bussa('lap')).esito).toBe('muto')
    orologio.t += 60_000
    const p = await c.bussa('lap')
    expect(p.esito).toBe('altro')
    expect((await c.statoDi('lap')).cosaFare).toContain('sono di altri')
    expect(log.join('\n')).toContain('non prova la chiave di casa')
  })

  it('una risposta buona azzera i dubbi', async () => {
    const orologio = { t: ADESSO }
    let buono = false
    const c = creaClientPcRemoto({
      battiti: () => [BATTITO], chiavePer: () => 'k', mioNome: () => 'PC-Fisso', adesso: () => orologio.t, bussaMs: 50, riprovaCasaMs: 1,
      calmaAllAvvio: { avvioIl: ADESSO - 3_600_000, riprovaMs: 3_600_000 },
      fetch: (async (url: string) => {
        if (!buono) return risponde(200, {})
        const { provaCasa } = await import('../../src/main/casa-firma')
        return risponde(200, { prova: provaCasa('k', new URL(url).searchParams.get('sfida') ?? '') })
      }) as unknown as typeof fetch
    })
    await c.bussa('lap'); orologio.t += 60_000; await c.bussa('lap')
    buono = true; orologio.t += 60_000
    expect((await c.bussa('lap')).esito).toBe('risponde')
    buono = false; orologio.t += 60_000
    expect((await c.bussa('lap')).inVerifica).toBe('riprovo')
  })
})
