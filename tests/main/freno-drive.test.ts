import { describe, it, expect } from 'vitest'
import {
  creaFreno, conFreno, eSpazioPieno, MESSAGGIO_DRIVE_PIENO, RICONTROLLO_PIENO_MS, RICONTROLLO_PIENO_MIN, ATTESA_LIMITE_MIN_MS, ATTESA_LIMITE_MAX_MS,
  type EventoFreno
} from '../../src/main/cassaforte/freno-drive'
import { creaArchivioDrive } from '../../src/main/cassaforte/google-drive'
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
