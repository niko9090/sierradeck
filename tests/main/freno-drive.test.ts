import { describe, it, expect } from 'vitest'
import {
  creaFreno, conFreno, eSpazioPieno, MESSAGGIO_DRIVE_PIENO, RICONTROLLO_PIENO_MS, RICONTROLLO_PIENO_MIN, ATTESA_LIMITE_MIN_MS, ATTESA_LIMITE_MAX_MS,
  type EventoFreno
} from '../../src/main/cassaforte/freno-drive'
import { creaArchivioDrive } from '../../src/main/cassaforte/google-drive'
import { archivioInMemoria, type Archivio } from '../../src/main/cassaforte/archivio'
import { salvaIncrementale, manifestoVuoto, PARALLELI } from '../../src/main/cassaforte/incrementale'
import { apriSincronia } from '../../src/main/cassaforte/sincronia'
import { magazzinoInMemoria, type Magazzino } from '../../src/main/cassaforte/magazzino'
import { apriRegistroProgetti } from '../../src/main/progetti/registro'
import { creaLavoro } from '../../src/main/cassaforte/lavoro-in-corso'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaPostino, type Scatola } from '../../src/main/progetti/posta'

/**
 * k-65. Dal controllo di tutti i PC: troppe richieste al minuto, e a Drive
 * pieno SALVA e l'automatico ritentavano decine di volte.
 */
const PIENO = JSON.stringify({ error: { code: 403, message: 'The user\'s Drive storage quota has been exceeded.', errors: [{ reason: 'storageQuotaExceeded' }] } })

describe('il freno: limite di velocita', () => {
  it('l\'attesa cresce a ogni rifiuto vero e non cambia dentro la stessa attesa', () => {
    let t = 1_000_000
    const f = creaFreno(() => t)
    expect(f.attesaMs()).toBe(0)
    f.limiteRaggiunto()
    expect(f.attesaMs()).toBe(ATTESA_LIMITE_MIN_MS)
    f.limiteRaggiunto() // dentro l'attesa: conta una volta
    expect(f.attesaMs()).toBe(ATTESA_LIMITE_MIN_MS)
    expect(f.fermo()).toBe(true)
    t += ATTESA_LIMITE_MIN_MS
    expect(f.fermo()).toBe(false)
    f.limiteRaggiunto()
    expect(f.attesaMs()).toBe(2 * ATTESA_LIMITE_MIN_MS)
    for (let i = 0; i < 12; i += 1) { t += f.attesaMs(); f.limiteRaggiunto() }
    expect(f.attesaMs()).toBe(ATTESA_LIMITE_MAX_MS)
  })

  it('dopo un successo a via libera l\'attesa riparte dal minimo', () => {
    let t = 0
    const f = creaFreno(() => t)
    f.limiteRaggiunto(); t += ATTESA_LIMITE_MIN_MS
    f.limiteRaggiunto(); t += 2 * ATTESA_LIMITE_MIN_MS
    f.tuttoBene()
    f.limiteRaggiunto()
    expect(f.attesaMs()).toBe(ATTESA_LIMITE_MIN_MS)
  })
})

describe('il freno: spazio pieno', () => {
  it('riconosce l\'errore del Drive', () => {
    expect(eSpazioPieno('The user\'s Drive storage quota has been exceeded.')).toBe(true)
    expect(eSpazioPieno('{"errors":[{"reason":"storageQuotaExceeded"}]}')).toBe(true)
    expect(eSpazioPieno('rateLimitExceeded')).toBe(false)
  })

  it('lo dice una volta sola, si ricontrolla dopo 15 minuti, e ripartire dice «libero»', () => {
    let t = 0
    const f = creaFreno(() => t)
    const eventi: EventoFreno[] = []
    f.suCambio((e) => eventi.push(e))
    f.spazioPieno(); f.spazioPieno(); f.spazioPieno()
    expect(eventi).toEqual(['pieno'])
    expect(f.pieno()).toBe(true)
    t += RICONTROLLO_PIENO_MS - 1
    expect(f.pieno()).toBe(true)
    t += 1
    expect(f.pieno()).toBe(false) // ora si riprova una scrittura
    f.spazioPieno() // e se e' ancora pieno: silenzio, e altri 15 minuti
    expect(eventi).toEqual(['pieno'])
    expect(f.pieno()).toBe(true)
    f.spazioLibero()
    expect(eventi).toEqual(['pieno', 'libero'])
    expect(f.pieno()).toBe(false)
  })

  it('«pieno detto» resta vero dopo il ricontrollo, finché lo spazio non torna', () => {
    let t = 0
    const f = creaFreno(() => t)
    expect(f.pienoDetto()).toBe(false)
    f.spazioPieno()
    t += RICONTROLLO_PIENO_MS
    expect(f.pieno()).toBe(false)
    expect(f.pienoDetto()).toBe(true)
    f.spazioLibero()
    expect(f.pienoDetto()).toBe(false)
  })

  it('«pieno detto» torna falso anche dopo una scrittura riuscita', async () => {
    let t = 0
    const f = creaFreno(() => t)
    const risposte = [new Response('{}', { status: 200 })]
    const g = conFreno((async () => risposte.shift()!) as unknown as typeof fetch, f)
    f.spazioPieno()
    t += RICONTROLLO_PIENO_MS
    expect(f.pienoDetto()).toBe(true)
    await g('https://www.googleapis.com/drive/v3/files', { method: 'POST' })
    expect(f.pienoDetto()).toBe(false)
  })

  it('i testi dicono gli stessi minuti della costante', () => {
    expect(RICONTROLLO_PIENO_MIN * 60_000).toBe(RICONTROLLO_PIENO_MS)
    expect(RICONTROLLO_PIENO_MIN).toBe(15)
  })
})

describe('conFreno e il Drive vero (finto)', () => {
  function finto(corpo: string, stato = 403) {
    let richieste = 0
    const base = (async () => { richieste += 1; return new Response(corpo, { status: stato }) }) as unknown as typeof fetch
    return { base, conta: () => richieste }
  }

  it('a Drive pieno la seconda scrittura non esce nemmeno, le letture si', async () => {
    const f = creaFreno()
    const d = finto(PIENO)
    const fr = conFreno(d.base, f)
    const url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart'
    expect((await fr(url, { method: 'POST' })).status).toBe(403)
    expect(d.conta()).toBe(1)
    expect(f.pieno()).toBe(true)
    for (let i = 0; i < 5; i += 1) expect((await fr(url, { method: 'PATCH' })).status).toBe(403)
    expect(d.conta()).toBe(1)
    await fr('https://www.googleapis.com/drive/v3/files?q=x')
    expect(d.conta()).toBe(2)
  })

  it('429 e 403 rateLimit alzano il freno', async () => {
    const f = creaFreno()
    await conFreno(finto('{}', 429).base, f)('https://www.googleapis.com/drive/v3/files')
    expect(f.attesaMs()).toBeGreaterThan(0)
    const g = creaFreno()
    await conFreno(finto('{"error":{"errors":[{"reason":"userRateLimitExceeded"}]}}').base, g)('https://www.googleapis.com/drive/v3/files')
    expect(g.attesaMs()).toBeGreaterThan(0)
  })

  it('la scrittura che riesce dice che lo spazio c\'e\'', async () => {
    const f = creaFreno()
    f.spazioPieno()
    let t = RICONTROLLO_PIENO_MS
    const g = creaFreno(() => t)
    g.spazioPieno(); t += RICONTROLLO_PIENO_MS
    const ok = (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch
    await conFreno(ok, g)('https://www.googleapis.com/upload/drive/v3/files/x?uploadType=media', { method: 'PATCH' })
    expect(g.pieno()).toBe(false)
  })

  it('l\'archivio: un solo tentativo, messaggio breve in italiano, poi niente rete', async () => {
    const f = creaFreno()
    const d = finto(PIENO)
    const a = creaArchivioDrive({ token: async () => 't', fetch: ((u: string, i?: RequestInit) => (/q=name/.test(decodeURIComponent(String(u))) ? Promise.resolve(new Response('{"files":[]}', { status: 200 })) : d.base(u, i))) as unknown as typeof fetch, freno: f, finestraConflittoMs: 0 })
    await expect(a.carica('x', Buffer.from('1'))).rejects.toThrow(MESSAGGIO_DRIVE_PIENO)
    expect(d.conta()).toBe(1)
    for (let i = 0; i < 10; i += 1) await expect(a.carica('x', Buffer.from('1'))).rejects.toThrow(MESSAGGIO_DRIVE_PIENO)
    expect(d.conta()).toBe(1)
  })
})

describe('a Drive pieno le scritture non fanno nemmeno la ricerca (k-315)', () => {
  it('carica e caricaSe: zero chiamate di rete, errore di spazio pieno', async () => {
    const f = creaFreno()
    f.spazioPieno()
    let chiamate = 0
    const rete = (async () => { chiamate += 1; return new Response('{"files":[]}', { status: 200 }) }) as unknown as typeof fetch
    const a = creaArchivioDrive({ token: async () => 't', fetch: rete, freno: f })
    await expect(a.carica('x', Buffer.from('1'))).rejects.toMatchObject({ message: MESSAGGIO_DRIVE_PIENO, drivePieno: true, stato: 403 })
    await expect(a.caricaSe!('x', Buffer.from('1'), null)).rejects.toMatchObject({ message: MESSAGGIO_DRIVE_PIENO, drivePieno: true })
    expect(chiamate).toBe(0)
  })

  it('dopo il ricontrollo (15 minuti) la ricerca torna a partire', async () => {
    let t = 0
    const f = creaFreno(() => t)
    f.spazioPieno()
    t += RICONTROLLO_PIENO_MS
    let chiamate = 0
    const rete = (async () => { chiamate += 1; return new Response('{"files":[]}', { status: 200 }) }) as unknown as typeof fetch
    const a = creaArchivioDrive({ token: async () => 't', fetch: rete, freno: f })
    await a.carica('x', Buffer.from('1')).catch(() => undefined)
    expect(chiamate).toBeGreaterThan(0)
  })
})

describe('il salvataggio incrementale a Drive pieno (k-315)', () => {
  it('dopo il primo errore di spazio pieno le voci rimaste non toccano la rete', async () => {
    const cartella = mkdtempSync(join(tmpdir(), 'sd-pieno-'))
    mkdirSync(join(cartella, 'c'), { recursive: true })
    for (let i = 0; i < 40; i += 1) writeFileSync(join(cartella, 'c', `${i}.jsonl`), `chat ${i}`)
    const base = archivioInMemoria()
    const chiamate: string[] = []
    const pieno = (): Error & { stato: number; drivePieno: boolean } => Object.assign(new Error(MESSAGGIO_DRIVE_PIENO), { stato: 403, drivePieno: true })
    const archivio = new Proxy(base, {
      get(t, k) {
        const v = (t as unknown as Record<string, unknown>)[k as string]
        if (typeof v !== 'function') return v
        return (...a: unknown[]) => {
          chiamate.push(String(k))
          if (k === 'carica' || k === 'caricaSe') return Promise.reject(pieno())
          return (v as (...x: unknown[]) => unknown).apply(t, a)
        }
      }
    })
    await expect(salvaIncrementale({ radici: [{ prefisso: 'chat', cartella }], maestra: Buffer.alloc(32, 1), archivio, manifestoPrec: manifestoVuoto(), adesso: 'x' })).rejects.toThrow(MESSAGGIO_DRIVE_PIENO)
    // Al piu' le voci gia' partite insieme al primo errore (PARALLELI), non le 40.
    const tentativi = chiamate.filter((c) => c === 'carica' || c === 'caricaSe').length
    expect(tentativi).toBeGreaterThan(0)
    expect(tentativi).toBeLessThanOrEqual(PARALLELI)
    expect(chiamate.length).toBeLessThan(40)
  })
})

describe('la posta rispetta il freno', () => {
  function scatolaConta() {
    let n = 0
    const s: Scatola = {
      leggi: <T,>() => { n += 1; return Promise.resolve(undefined as T | undefined) },
      scrivi: () => { n += 1; return Promise.resolve() },
      cancella: () => { n += 1; return Promise.resolve() },
      elenca: () => { n += 1; return Promise.resolve([]) }
    }
    return { s, conta: () => n }
  }
  const crea = (s: Scatola, freno: ReturnType<typeof creaFreno>, ora: () => number) => creaPostino({
    scatola: () => s, pcId: () => 'A', pcNome: () => 'Torre', versione: () => '1', chat: () => [], cartelle: () => [],
    cartellaEsiste: () => true, apriChat: () => undefined, riprendiChat: () => undefined, scrivi: () => undefined,
    adesso: ora, freno
  })

  it('con il Drive pieno o il limite il giro sta fermo; poi riparte', async () => {
    let t = 10_000_000
    const { s, conta } = scatolaConta()
    const freno = creaFreno(() => t)
    const p = crea(s, freno, () => t)
    freno.spazioPieno()
    await p.giro(); await p.giro()
    expect(conta()).toBe(0)
    freno.spazioLibero()
    freno.limiteRaggiunto()
    await p.giro()
    expect(conta()).toBe(0)
    t += ATTESA_LIMITE_MIN_MS
    await p.giro()
    expect(conta()).toBeGreaterThan(0)
  })

  it('da fermi la posta in arrivo si legge ogni minuto e mezzo, non a ogni giro', async () => {
    let t = 10_000_000
    const { s, conta } = scatolaConta()
    const p = crea(s, creaFreno(() => t), () => t)
    await p.giro()
    const dopoIlPrimo = conta()
    t += 30_000
    await p.giro() // battito invariato, posta non ancora da rileggere
    expect(conta()).toBe(dopoIlPrimo)
    t += 60_000
    await p.giro()
    expect(conta()).toBeGreaterThan(dopoIlPrimo)
  })
})

describe('le letture fuori dai giri a limite di velocità (k-320)', () => {
  it('la lista dei PC (telefono, controllo) non rilegge il Drive mentre Google chiede di aspettare', async () => {
    let t = 10_000_000
    let n = 0
    const s: Scatola = {
      leggi: <T,>() => { n += 1; return Promise.resolve(undefined as T | undefined) },
      scrivi: () => Promise.resolve(),
      cancella: () => Promise.resolve(),
      elenca: () => { n += 1; return Promise.resolve([]) }
    }
    const freno = creaFreno(() => t)
    const p = creaPostino({
      scatola: () => s, pcId: () => 'A', pcNome: () => 'Torre', versione: () => '1', chat: () => [], cartelle: () => [],
      cartellaEsiste: () => true, apriChat: () => undefined, riprendiChat: () => undefined, scrivi: () => undefined,
      adesso: () => t, freno
    })
    freno.limiteRaggiunto()
    await p.pcSubito(); await p.pcSubito(); await p.pcSubito()
    expect(n).toBe(0)
    t += ATTESA_LIMITE_MIN_MS
    await p.pcSubito()
    expect(n).toBeGreaterThan(0)
  })

  it('arrivo e «progetti con file sul Drive» non fanno richieste durante l\'attesa', async () => {
    let t = 10_000_000
    const freno = creaFreno(() => t)
    const radice = mkdtempSync(join(tmpdir(), 'sd-freno-'))
    try {
      const dati = join(radice, 'dati')
      mkdirSync(dati, { recursive: true })
      mkdirSync(join(radice, 'claude', 'projects'), { recursive: true })
      const arch = archivioInMemoria()
      let chiamate = 0
      const conta = new Proxy(arch, {
        get: (o, k) => {
          const v = (o as unknown as Record<string | symbol, unknown>)[k]
          return typeof v === 'function' ? (...a: unknown[]) => { chiamate += 1; return (v as (...x: unknown[]) => unknown).apply(o, a) } : v
        }
      }) as Archivio
      const registro = apriRegistroProgetti(dati)
      const mags = new Map<string, Magazzino>()
      const sync = apriSincronia({
        dati, radiceClaude: join(radice, 'claude'), driveConnesso: () => true,
        magazzino: (nome = 'sierradeck.cassaforte') => { let m = mags.get(nome); if (m === undefined) { m = magazzinoInMemoria(); mags.set(nome, m) } return m },
        archivio: () => conta, lavoro: creaLavoro(), pcId: () => 'A', cartellaProgetti: () => join(radice, 'Progetti'),
        registroProgetti: { leggi: () => registro.leggi(), scrivi: (r) => registro.scrivi(r) },
        freno
      })
      expect((await sync.creaPassphrase('passphrase-robusta-1')).ok).toBe(true)
      freno.limiteRaggiunto()
      chiamate = 0
      expect(await sync.progettiConFileSulDrive()).toBeUndefined()
      expect(await sync.arrivo()).toEqual({ ok: true, scritti: 0 })
      expect(chiamate).toBe(0)
      t += ATTESA_LIMITE_MIN_MS
      await sync.progettiConFileSulDrive()
      expect(chiamate).toBeGreaterThan(0)
    } finally { rmSync(radice, { recursive: true, force: true }) }
  })
})
