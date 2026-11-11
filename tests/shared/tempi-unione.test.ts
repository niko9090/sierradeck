import { describe, expect, it } from 'vitest'
import { PROVA_MAX_MS } from '../../src/autopilot-host/server'
import { UNIONE_MAX_MS } from '../../src/autopilot-host/servizio-orchestratore'
import { conTurni, creaTurni, STIMA_PESANTE_MS, UNIONE_TURNO_MAX_MS } from '../../src/autopilot-host/turni-criteri'
import { attesaDopoScadenza, conScadenza, PROVA_MAX_MS as PROVA_DEI_TEMPI, UNIONE_MAX_MS as FILA_DEI_TEMPI } from '../../src/autopilot-host/tempi-unione'
import { annullato, TIMEOUT_SUITE_TEST_MS, type Esecutore } from '../../src/autopilot-host/verifiche'
import { ATTESA_MASSIMA_MS } from '../../src/autopilot-host/guardia-pc'

/** Durata misurata di tests/shared (circa 35 s); la suite completa dura qualche minuto (STIMA_PESANTE_MS). */
const SUITE_SHARED_MS = 35_000
const MINUTO = 60_000

describe('tempi delle unioni: prova, turno, fila', () => {
  it('la prova lascia margine alla suite: almeno 3 volte la stima di un pesante', () => {
    expect(PROVA_MAX_MS).toBeGreaterThanOrEqual(3 * STIMA_PESANTE_MS)
    expect(PROVA_MAX_MS).toBeGreaterThanOrEqual(10 * SUITE_SHARED_MS)
  })

  it('la fila è più lunga della prova: una prova che scade lo fa prima della fila', () => {
    expect(UNIONE_MAX_MS).toBeGreaterThan(PROVA_MAX_MS)
    expect(UNIONE_MAX_MS - PROVA_MAX_MS).toBeGreaterThanOrEqual(5 * MINUTO)
  })

  it('il turno dell’unione sta dentro la prova che lo contiene, con un margine', () => {
    expect(UNIONE_TURNO_MAX_MS).toBeLessThan(PROVA_MAX_MS)
    expect(PROVA_MAX_MS - UNIONE_TURNO_MAX_MS).toBeGreaterThanOrEqual(MINUTO)
  })

  it('il turno non è tanto corto da scadere durante una suite completa', () => {
    expect(UNIONE_TURNO_MAX_MS).toBeGreaterThan(2 * STIMA_PESANTE_MS)
  })

  // 11/11: il 07/11 ogni unione è scaduta per cinque ore. La prova (15 min) era più corta
  // della suite (20 min) e dell'attesa della guardia (30 min).
  it('11/11: la prova contiene due misure della suite, e l’attesa della guardia sta tutta dentro', () => {
    expect(PROVA_MAX_MS).toBe(45 * MINUTO)
    expect(UNIONE_MAX_MS).toBe(60 * MINUTO)
    expect(PROVA_DEI_TEMPI).toBe(PROVA_MAX_MS)
    expect(FILA_DEI_TEMPI).toBe(UNIONE_MAX_MS)
    expect(PROVA_MAX_MS).toBeGreaterThanOrEqual(2 * TIMEOUT_SUITE_TEST_MS)
    expect(ATTESA_MASSIMA_MS).toBe(2 * MINUTO)
    expect(ATTESA_MASSIMA_MS + TIMEOUT_SUITE_TEST_MS).toBeLessThan(PROVA_MAX_MS)
  })

  it('11/11: un’unione scaduta riprova dopo 30 secondi, poi 2, 5 e 15 minuti, e da lì sempre 15', () => {
    const passo = 30_000
    expect([1, 2, 3, 4, 5, 40].map((n) => attesaDopoScadenza(n, passo))).toEqual([30_000, 2 * MINUTO, 5 * MINUTO, 15 * MINUTO, 15 * MINUTO, 15 * MINUTO])
    expect(attesaDopoScadenza(0, passo)).toBe(30_000)
  })
})

describe('la prova con la scadenza e il segnale (11/11)', () => {
  it('senza scadenza torna il valore e scrive attesa ed esecuzione separate', async () => {
    let t = 0
    const scritti: { attesaMs: number; esecuzioneMs: number; scaduta: boolean }[] = []
    const r = await conScadenza(async (_s, iniziata) => { t += 3000; iniziata(); t += 7000; return 'ok' }, 1000, { ora: () => t, scrivi: (x) => scritti.push(x) })
    expect(r).toEqual({ scaduta: false, valore: 'ok' })
    expect(scritti).toEqual([{ attesaMs: 3000, esecuzioneMs: 7000, scaduta: false }])
  })

  it('alla scadenza ferma il comando figlio e rende il turno dei pesanti: il tentativo dopo parte subito', async () => {
    const turni = creaTurni()
    let fermato = false
    let partiti = 0
    // Esecutore finto: resta vivo finché il segnale non scatta.
    const finto: Esecutore = (_c, _d, _t, segnale) => new Promise((ris) => {
      partiti += 1
      segnale?.addEventListener('abort', () => { fermato = true; ris({ codice: 1, uscita: 'x\n[comando annullato: prova scaduta]' }) }, { once: true })
    })
    const esegui = conTurni(finto, turni)
    const r = await conScadenza((segnale) => esegui('npx vitest run', 'C:/prova', TIMEOUT_SUITE_TEST_MS, segnale), 30)
    expect(r.scaduta).toBe(true)
    await new Promise((ris) => setTimeout(ris, 10))
    expect(fermato).toBe(true)
    expect(turni.stato().inCorso).toBeUndefined()
    const secondo = conScadenza((segnale) => esegui('npx vitest run', 'C:/prova', TIMEOUT_SUITE_TEST_MS, segnale), 30)
    await new Promise((ris) => setTimeout(ris, 10))
    expect(partiti).toBe(2)
    await secondo
  })

  it('un comando già annullato non parte, nemmeno se scatta mentre aspetta il turno', async () => {
    const turni = creaTurni()
    let partiti = 0
    const finto: Esecutore = () => { partiti += 1; return Promise.resolve({ codice: 0, uscita: '' }) }
    const esegui = conTurni(finto, turni)
    const c = new AbortController()
    c.abort()
    const r = await esegui('npx vitest run', 'C:/prova', undefined, c.signal)
    expect(partiti).toBe(0)
    expect(r.codice).not.toBe(0)
    expect(annullato(r.uscita)).toBe(true)
    // In fila dietro un altro pesante: il segnale scatta nell'attesa, al suo turno non parte.
    let libera = (): void => {}
    const primo = turni.pesante('C:/altra', () => new Promise<void>((ris) => { libera = ris }))
    const d = new AbortController()
    const inFila = esegui('npx vitest run', 'C:/prova', undefined, d.signal)
    await new Promise((ris) => setTimeout(ris, 5))
    d.abort()
    libera()
    await primo
    expect(annullato((await inFila).uscita)).toBe(true)
    expect(partiti).toBe(0)
  })

  it('senza segnale l’esecutore si chiama come prima, con gli stessi argomenti', async () => {
    const chiamate: unknown[][] = []
    const finto: Esecutore = (...a) => { chiamate.push(a); return Promise.resolve({ codice: 0, uscita: '' }) }
    const esegui = conTurni(finto, creaTurni())
    await esegui('echo ciao', 'C:/prova')
    await esegui('echo ciao', 'C:/prova', 5000)
    expect(chiamate).toEqual([['echo ciao', 'C:/prova'], ['echo ciao', 'C:/prova', 5000]])
  })
})
