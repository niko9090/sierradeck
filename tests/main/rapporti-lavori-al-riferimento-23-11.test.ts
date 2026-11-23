import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { contaLavori, leggiRapportoLavori, rapportoPerLInvio, pesoRapporto, type RapportoLavori } from '../../src/shared/rapporto-lavori'
import { giroRapportoLavori, leggiRapportiArrivati, mandaRapporto, righeDeiRegistri, salvaRapportoArrivato, INTERVALLO_RAPPORTO_MS, type StatoRapporto } from '../../src/main/rapporti-lavori'
import type { AttesaInvio } from '../../src/shared/attesa-invio'

const riga = (iso: string, t: string): string => `${iso} [info] [servizio] ${t}`
const T = (min: number): string => new Date(Date.parse('2026-11-23T10:00:00.000Z') + min * 60_000).toISOString()

const LOG = [
  riga(T(0), '━━━ sessione avviata · SierraDeck v1 · win32 · Node 20 · Electron 30 ━━━'),
  riga(T(1), '[unione di prova] ramo-a: attesa del turno 12 s, prova 340 s'),
  riga(T(2), '[unione di prova] ramo-b: attesa del turno 60 s, prova 2700 s (scaduta mentre stava per misurare il criterio)'),
  riga(T(3), '[criterio] finito con 0 in 50 s: npx vitest run un-file.test.ts'),
  riga(T(4), '[criterio] finito con 1 in 20 s: npm run typecheck'),
  riga(T(5), '[orchestratore] ws-uno — k-1: unione in fila, 2ª, dopo k-0'),
  riga(T(6), '[aiuto] ws-uno — sviluppatore affidato a un-pc (Aiutante, 2 posti liberi là)'),
  riga(T(7), '[aiuto] ws-uno — revisore resta su questo PC: nessun altro libero'),
  riga(T(8), '[attesa] ws-uno — tetto di specialisti pieno: k-2 in fila, prompt salvato'),
  riga(T(9), '[orchestratore] ws-due — lavoro fermo da 20 minuti: lo sveglio (spinta 1)'),
  riga(T(10), '[servizio] fermo 12.5 s senza rispondere (3 volte oltre 5 s dall\'ultima riga)'),
  riga(T(11), '[orchestratore] ws-uno — risponde: testo privato della chat che non deve finire nel rapporto'),
  'una riga senza ora'
]

describe('contaLavori: dai registri ai conti', () => {
  const c = contaLavori(LOG)
  it('unioni: attesa, durata, scadenze e motivo', () => {
    const u = c.workspace.generale!.unioni
    expect(u.prove).toBe(2)
    expect(u.attesaMs).toBe(72_000)
    expect(u.attesaMaxMs).toBe(60_000)
    expect(u.provaMaxMs).toBe(2_700_000)
    expect(u.scadute).toBe(1)
    expect(Object.keys(u.motivi)[0]).toContain('scaduta: misurare il criterio')
  })
  it('criteri, compiti, avanzamento, fermate', () => {
    const g = c.workspace.generale!
    expect(g.criteri).toMatchObject({ finiti: 2, riusciti: 1, rossi: 1, durataMaxMs: 50_000 })
    expect(g.fermate.riavvii).toBe(1)
    expect(g.fermate.fermo).toBe(1)
    const w = c.workspace['ws-uno']!
    expect(w.unioni.inFila).toBe(1)
    expect(w.compiti).toMatchObject({ affidati: 1, restatiQui: 1, inFila: 1, ruoli: { sviluppatore: 1 } })
    expect(c.workspace['ws-due']!.avanzamento.svegli).toBe(1)
    expect(c.workspace['ws-due']!.fermate.fermoMaxMs).toBe(1_200_000)
  })
  it('privacy: niente testi delle chat nel rapporto', () => {
    expect(JSON.stringify(c.workspace)).not.toContain('testo privato')
    expect(JSON.stringify(c.workspace)).not.toContain('un-file.test')
  })
  it('riprende dopo una riga: conta solo le nuove', () => {
    const r = contaLavori(LOG, T(2))
    expect(r.workspace.generale!.unioni.prove).toBe(0)
    expect(r.workspace.generale!.criteri.finiti).toBe(2)
    expect(r.ultima).toBe(T(11))
  })
})

describe('rapporti dei lavori: invio e salvataggio con cartelle vere', () => {
  let dati: string
  let radice: string
  beforeEach(() => { dati = mkdtempSync(join(tmpdir(), 'rap-dati-')); radice = mkdtempSync(join(tmpdir(), 'rap-rif-')) })
  afterEach(() => { rmSync(dati, { recursive: true, force: true }); rmSync(radice, { recursive: true, force: true }) })

  const scriviLog = (righe: string[]): string => {
    const cartella = join(dati, 'log')
    mkdirSync(cartella, { recursive: true })
    writeFileSync(join(cartella, 'sierradeck-2026-11-23.log'), righe.join('\n'))
    return cartella
  }

  function giro(cartella: string, o: { adesso: number; manda: (r: RapportoLavori) => Promise<{ ok: boolean; messaggio: string }>; forza?: boolean }) {
    const file = join(dati, 'stato.json')
    let attesa: AttesaInvio | undefined
    return giroRapportoLavori({
      righe: (g) => righeDeiRegistri(cartella, g),
      stato: { leggi: () => { try { return JSON.parse(readFileSync(file, 'utf8')) as StatoRapporto } catch { return undefined } }, scrivi: (s) => writeFileSync(file, JSON.stringify(s)) },
      pcRiferimento: () => 'pc-fisso',
      adesso: () => o.adesso,
      da: () => 'PC-prova',
      versione: '1.0.0',
      manda: o.manda,
      log: () => {},
      attesa: { leggi: () => attesa, scrivi: (a) => { attesa = a } },
      ...(o.forza !== undefined ? { forza: o.forza } : {})
    })
  }

  it('manda una volta, riprende da dove era e non rimanda le stesse righe', async () => {
    const cartella = scriviLog(LOG)
    const inviati: RapportoLavori[] = []
    const manda = async (r: RapportoLavori) => { inviati.push(r); return { ok: true, messaggio: 'ok' } }
    const adesso = Date.parse(T(60))
    expect((await giro(cartella, { adesso, manda })).ok).toBe(true)
    expect(inviati).toHaveLength(1)
    expect(inviati[0]!.al).toBe(T(11))
    // Subito dopo: troppo presto. Dopo l'intervallo: niente di nuovo, niente invio.
    expect((await giro(cartella, { adesso: adesso + 1000, manda })).ok).toBe(true)
    expect((await giro(cartella, { adesso: adesso + INTERVALLO_RAPPORTO_MS + 1, manda })).ok).toBe(false)
    expect(inviati).toHaveLength(1)
    // Righe nuove: parte solo il nuovo.
    writeFileSync(join(cartella, 'sierradeck-2026-11-23.log'), [...LOG, riga(T(70), '[criterio] finito con 0 in 5 s: x')].join('\n'))
    await giro(cartella, { adesso: adesso + 2 * INTERVALLO_RAPPORTO_MS, manda })
    expect(inviati).toHaveLength(2)
    expect(inviati[1]!.workspace.generale!.criteri.finiti).toBe(1)
    expect(inviati[1]!.workspace.generale!.unioni.prove).toBe(0)
  })

  it('se l’invio fallisce non segna niente: al giro dopo partono le stesse righe', async () => {
    const cartella = scriviLog(LOG)
    const adesso = Date.parse(T(60))
    const r1 = await giro(cartella, { adesso, manda: async () => ({ ok: false, messaggio: 'giù' }) })
    expect(r1.ok).toBe(false)
    const inviati: RapportoLavori[] = []
    await giro(cartella, { adesso: adesso + 1, forza: true, manda: async (r) => { inviati.push(r); return { ok: true, messaggio: 'ok' } } })
    expect(inviati[0]!.workspace.generale!.unioni.prove).toBe(2)
  })

  it('il PC di riferimento salva e raggruppa per PC e giorno; il doppione non si somma', () => {
    const r: RapportoLavori = { da: 'PC-prova', giorno: '2026-11-23', dal: T(0), al: T(11), workspace: contaLavori(LOG).workspace }
    const a = salvaRapportoArrivato(radice, r)
    expect(a.ok && !a.doppio).toBe(true)
    const b = salvaRapportoArrivato(radice, r)
    expect(b.ok && b.doppio).toBe(true)
    salvaRapportoArrivato(radice, { ...r, dal: T(11), al: T(30) })
    salvaRapportoArrivato(radice, { ...r, da: 'Altro PC' })
    expect(readdirSync(join(radice, '.sierradeck', 'rapporti-lavori-arrivati')).sort()).toEqual(['Altro PC', 'PC-prova'])
    expect(leggiRapportiArrivati(radice, { da: 'PC-prova', giorno: '2026-11-23' })).toHaveLength(2)
    expect(leggiRapportiArrivati(radice, { giorno: '2026-11-24' })).toHaveLength(0)
    expect(leggiRapportiArrivati(radice)).toHaveLength(3)
  })

  it('mandaRapporto: dritto, per posta se non risponde, qui se è il riferimento', async () => {
    const r: RapportoLavori = { da: 'PC-prova', giorno: '2026-11-23', dal: T(0), al: T(11), workspace: contaLavori(LOG).workspace }
    const base = { rapporto: r, nomeDi: () => undefined, log: () => {}, salvaQui: () => ({ ok: true as const, file: 'f' }) }
    const chiamate: string[] = []
    const dritto = await mandaRapporto({ ...base, pcRiferimento: 'pc-fisso', io: { id: 'io', nome: 'io' }, chiama: async (_pc, perc) => { chiamate.push(perc) } })
    expect(dritto.ok).toBe(true)
    expect(chiamate).toEqual(['/api/rapporti/arrivati'])
    let posta = 0
    const peP = await mandaRapporto({ ...base, pcRiferimento: 'pc-fisso', io: { id: 'io', nome: 'io' }, chiama: async () => { throw new Error('spento') }, perPosta: async () => { posta += 1; return true } })
    expect(peP.ok).toBe(true); expect(posta).toBe(1)
    const no = await mandaRapporto({ ...base, pcRiferimento: 'pc-fisso', io: { id: 'io', nome: 'io' }, chiama: async () => { throw new Error('spento') } })
    expect(no.ok).toBe(false)
    let chiamato = false
    const qui = await mandaRapporto({ ...base, pcRiferimento: 'io', io: { id: 'io', nome: 'io' }, chiama: async () => { chiamato = true } })
    expect(qui.ok).toBe(true); expect(chiamato).toBe(false)
  })
})

describe('limiti e lettura sicura', () => {
  it('il rapporto troppo grosso si stringe sotto il tetto', () => {
    const workspace: RapportoLavori['workspace'] = {}
    const base = contaLavori(LOG).workspace.generale!
    for (let i = 0; i < 40; i += 1) workspace[`ws-${i}`] = { ...base, unioni: { ...base.unioni, prove: i + 1, motivi: Object.fromEntries(Array.from({ length: 12 }, (_, k) => [`motivo ${k} ${'x'.repeat(60)}`, 1])) } }
    const grosso: RapportoLavori = { da: 'p', giorno: '2026-11-23', dal: T(0), al: T(1), workspace }
    const piccolo = rapportoPerLInvio(grosso, 8 * 1024)
    expect(pesoRapporto(piccolo)).toBeLessThanOrEqual(8 * 1024)
    expect(Object.keys(piccolo.workspace).length).toBeGreaterThan(0)
  })
  it('leggiRapportoLavori rifiuta il rotto e ripulisce i numeri', () => {
    expect(leggiRapportoLavori(undefined).ok).toBe(false)
    expect(leggiRapportoLavori({ da: '', dal: T(0), al: T(1) }).ok).toBe(false)
    expect(leggiRapportoLavori({ da: 'x', dal: 'ieri', al: T(1) }).ok).toBe(false)
    const l = leggiRapportoLavori({ da: 'x', dal: T(0), al: T(1), workspace: { w: { unioni: { prove: -3, provaMs: 'tanto' } } } })
    expect(l.ok && l.rapporto.workspace.w!.unioni.prove).toBe(0)
    expect(l.ok && l.rapporto.giorno).toBe('2026-11-23')
  })
})
