import { describe, it, expect } from 'vitest'
import { attesaRitento, creaFreno, MESSAGGIO_DRIVE_PIENO, RICONTROLLO_PIENO_MS, ATTESA_LIMITE_MIN_MS, ATTESA_LIMITE_MAX_MS } from '../../src/main/cassaforte/freno-drive'
import { creaArchivioDrive } from '../../src/main/cassaforte/google-drive'
import { creaSpazioDrive } from '../../src/main/spazio-drive'
import type { Archivio } from '../../src/main/cassaforte/archivio'
import type { Manifesto } from '../../src/main/cassaforte/incrementale'
import type { RevisioneDrive } from '@shared/spazio-drive'

/**
 * k-192. Dal controllo di tutti i PC: «scrittura fallito (403) — storage quota
 * exceeded» ripetuto a raffica, e troppe richieste al minuto.
 */
const PIENO = JSON.stringify({ error: { code: 403, message: 'The user\'s Drive storage quota has been exceeded.', errors: [{ reason: 'storageQuotaExceeded' }] } })
const LIMITE = JSON.stringify({ error: { code: 403, message: 'Rate Limit Exceeded', errors: [{ reason: 'userRateLimitExceeded' }] } })

describe('403 di spazio esaurito: non si ripete a raffica', () => {
  it('un solo tentativo, nessuna pausa di ritento, poi niente rete per 15 minuti e un solo nuovo tentativo dopo', async () => {
    let t = 0
    const freno = creaFreno(() => t)
    let scritture = 0
    const pause: number[] = []
    const fetchFinto = (async (u: string, i?: RequestInit) => {
      if (/q=name/.test(decodeURIComponent(String(u)))) return new Response('{"files":[]}', { status: 200 })
      if ((i?.method ?? 'GET') !== 'GET') scritture += 1
      return new Response(PIENO, { status: 403 })
    }) as unknown as typeof fetch
    const a = creaArchivioDrive({ token: async () => 't', fetch: fetchFinto, freno, finestraConflittoMs: 0, pausa: async (ms) => { pause.push(ms) } })
    for (let i = 0; i < 24; i += 1) await expect(a.carica('x', Buffer.from('1'))).rejects.toThrow(MESSAGGIO_DRIVE_PIENO)
    expect(scritture).toBe(1)
    expect(pause).toEqual([])
    expect(RICONTROLLO_PIENO_MS).toBe(15 * 60_000)
    t += RICONTROLLO_PIENO_MS - 1
    await expect(a.carica('x', Buffer.from('1'))).rejects.toThrow(MESSAGGIO_DRIVE_PIENO)
    expect(scritture).toBe(1)
    t += 1
    await expect(a.carica('x', Buffer.from('1'))).rejects.toThrow(MESSAGGIO_DRIVE_PIENO)
    expect(scritture).toBe(2)
  })

  it('lo segnala una volta sola', () => {
    const freno = creaFreno()
    const eventi: string[] = []
    freno.suCambio((e) => eventi.push(e))
    for (let i = 0; i < 24; i += 1) freno.spazioPieno()
    expect(eventi).toEqual(['pieno'])
  })
})

describe('rifiuti di frequenza: attesa che cresce, con un po\' di casualita\'', () => {
  it('attesaRitento raddoppia a ogni tentativo e sta fra meta\' e una volta e mezza', () => {
    expect(attesaRitento(0, 2000, 0.5)).toBe(2000)
    expect(attesaRitento(1, 2000, 0.5)).toBe(4000)
    expect(attesaRitento(3, 2000, 0.5)).toBe(16000)
    expect(attesaRitento(2, 2000, 0)).toBe(4000)
    expect(attesaRitento(2, 2000, 0.999)).toBe(Math.round(8000 * 1.499))
  })

  it('il freno: l\'attesa cresce, ha casualita\' (±25%) e non supera il massimo', () => {
    let t = 0
    const basso = creaFreno(() => t, () => 0)
    const alto = creaFreno(() => t, () => 0.9999)
    basso.limiteRaggiunto(); alto.limiteRaggiunto()
    expect(basso.attesaMs()).toBe(Math.round(ATTESA_LIMITE_MIN_MS * 0.75))
    expect(alto.attesaMs()).toBeGreaterThan(ATTESA_LIMITE_MIN_MS * 1.2)
    expect(alto.attesaMs()).toBeLessThanOrEqual(ATTESA_LIMITE_MIN_MS * 1.25)
    const f = creaFreno(() => t, () => 0.9999)
    let prima = 0
    for (let i = 0; i < 3; i += 1) { f.limiteRaggiunto(); expect(f.attesaMs()).toBeGreaterThan(prima); prima = f.attesaMs(); t += prima }
    for (let i = 0; i < 12; i += 1) { f.limiteRaggiunto(); t += f.attesaMs() }
    f.limiteRaggiunto()
    expect(f.attesaMs()).toBe(ATTESA_LIMITE_MAX_MS)
  })

  it('l\'archivio: 429 e 403 rateLimit si ritentano con pause crescenti, senza moltiplicare i tentativi', async () => {
    for (const [stato, corpo] of [[429, '{}'], [403, LIMITE]] as const) {
      let richieste = 0
      const pause: number[] = []
      const fetchFinto = (async () => { richieste += 1; return richieste <= 3 ? new Response(corpo, { status: stato }) : new Response('{}', { status: 200 }) }) as unknown as typeof fetch
      const a = creaArchivioDrive({ token: async () => 't', fetch: fetchFinto, freno: creaFreno(), caso: () => 0.5, pausa: async (ms) => { pause.push(ms) } })
      await a.cancellaId!('x')
      expect(richieste).toBe(4)
      expect(pause).toEqual([2000, 4000, 8000])
    }
  })

  it('dopo 5 rifiuti si ferma e non insiste', async () => {
    let richieste = 0
    const a = creaArchivioDrive({ token: async () => 't', fetch: (async () => { richieste += 1; return new Response('{}', { status: 429 }) }) as unknown as typeof fetch, freno: creaFreno(), caso: () => 0.5, pausa: async () => undefined })
    await expect(a.cancellaId!('x')).rejects.toThrow()
    expect(richieste).toBe(5)
  })
})

describe('pulizia automatica delle versioni vecchie, a Drive pieno', () => {
  const GIORNO = 86_400_000
  const ADESSO = Date.parse('2026-11-05T12:00:00.000Z')
  const rev = (id: string, giorni: number): RevisioneDrive => ({ id, modificato: new Date(ADESSO - giorni * GIORNO).toISOString(), byte: 100 })
  const n = (k: number, p: string): RevisioneDrive[] => Array.from({ length: k }, (_, i) => rev(`${p}${i}`, k - i))

  function banco(opz: { pieno: boolean; inAttesa?: boolean }) {
    const file = [
      { nome: 'f_chat', byte: 1000, id: 'id-chat', modificato: '2026-11-04T10:00:00Z' },
      { nome: 'sierradeck.lapidi', byte: 30, id: 'id-lap', modificato: '2026-11-04T10:00:00Z' },
      { nome: 'pulizie-drive', byte: 30, id: 'id-pul', modificato: '2026-11-04T10:00:00Z' },
      { nome: 'f_prog', byte: 500, id: 'id-prog', modificato: '2026-11-04T10:00:00Z' }
    ]
    const revisioni = new Map<string, RevisioneDrive[]>([['id-chat', n(6, 'c')], ['id-lap', n(9, 'l')], ['id-pul', n(9, 'u')], ['id-prog', n(9, 'p')]])
    const cancellate: string[] = []
    const a = {
      elenca: async () => new Map(), scarica: async () => undefined, carica: async () => undefined, cancella: async () => undefined,
      elencaConDimensioni: async () => file,
      cancellaId: async () => undefined,
      elencaRevisioni: async (id: string) => revisioni.get(id) ?? [],
      cancellaRevisione: async (id: string, r: string) => { cancellate.push(`${id}/${r}`); return 'ok' as const }
    } as unknown as Archivio
    const manifesto: Manifesto = {
      versione: 1, creatoIl: '',
      file: { 'chat/slug/aaaa.jsonl': { nome: 'f_chat', size: 900, mtime: ADESSO - GIORNO }, 'progetto-p1/a.ts': { nome: 'f_prog', size: 400, mtime: ADESSO - GIORNO } }
    }
    const oggetti = new Map<string, unknown>()
    let ora = ADESSO
    const spazio = creaSpazioDrive({
      archivio: () => a,
      scatola: () => ({ leggi: async <T>(x: string) => oggetti.get(x) as T | undefined, scrivi: async (x: string, o: unknown) => { oggetti.set(x, JSON.parse(JSON.stringify(o))) } }) as never,
      manifestoDrive: async () => manifesto,
      modificaManifesto: async () => ({ ok: true }),
      copieSuiPc: () => new Map(),
      io: () => ({ id: 'pc-qui', nome: 'PC-ESEMPIO' }),
      log: () => undefined,
      adesso: () => ora,
      pieno: () => opz.pieno,
      inAttesa: () => opz.inAttesa === true
    })
    return { spazio, cancellate, avanti: (ms: number) => { ora += ms } }
  }

  it('a Drive pieno toglie le versioni vecchie delle sole chat (tiene ultima + 2), e non piu\' di una volta ogni 6 ore', async () => {
    const b = banco({ pieno: true })
    await b.spazio.giro()
    // chat: 6 revisioni, si tengono l'ultima e le 2 prima: 3 da togliere, le piu' vecchie.
    expect(b.cancellate.sort()).toEqual(['id-chat/c0', 'id-chat/c1', 'id-chat/c2'])
    b.avanti(60 * 60_000)
    await b.spazio.giro()
    expect(b.cancellate).toHaveLength(3)
  })

  it('mai lapidi, registro delle pulizie e file dei progetti', async () => {
    const b = banco({ pieno: true })
    await b.spazio.giro()
    expect(b.cancellate.some((c) => /id-lap|id-pul|id-prog/.test(c))).toBe(false)
  })

  it('con spazio libero non cancella niente; con il Drive che chiede di rallentare il giro sta fermo', async () => {
    const libero = banco({ pieno: false })
    await libero.spazio.giro()
    expect(libero.cancellate).toEqual([])
    const fermo = banco({ pieno: true, inAttesa: true })
    await fermo.spazio.giro()
    expect(fermo.cancellate).toEqual([])
  })
})
