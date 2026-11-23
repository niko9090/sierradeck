import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  ATTESA_MASSIMA_MS, creaGuardiaPc, giudicaMisura, giudicaPesanteAspettando, pcPiccolo, scalaPc, soglieDelPc,
  FINESTRA_BASE_MS, PROCESSORE_PER_MS, STORIA_MINIMA_BASE_MS, type GuardiaPc
} from '../../src/autopilot-host/guardia-pc'
import { creaTurni } from '../../src/autopilot-host/turni-criteri'
import type { MisuraPc } from '@shared/posti-chat'

/**
 * k-197g (23/11): la guardia del PC in proporzione al PC. Un PC piccolo (4 processori,
 * 8 GB) sempre al 90% non deve essere «carico» quasi sempre: tiene il suo passo pesante
 * che va avanti, e l'attesa ha un tetto. Un PC grande si comporta come prima.
 */

const ORA = Date.parse('2026-11-23T10:00:00.000Z')
const piccolo = (caricoPercento: number): MisuraPc => ({ processori: 4, memoriaLiberaMb: 2_800, memoriaTotaleMb: 8_192, caricoPercento })
const grande = (caricoPercento: number): MisuraPc => ({ processori: 16, memoriaLiberaMb: 20_000, memoriaTotaleMb: 32_768, caricoPercento })

function guardiaFinta(letture: () => MisuraPc) {
  let t = ORA
  const g = creaGuardiaPc({ misura: letture, ora: () => t, dormi: (ms) => { t += ms; return Promise.resolve() }, riprovaMs: 15_000 })
  return { g, avanza: (ms: number) => { t += ms }, ora: () => t }
}

/** Misura ogni 5 secondi per `ms`, come fa la guardia da sola. */
function misuraPer(f: ReturnType<typeof guardiaFinta>, ms: number): void {
  for (let passato = 0; passato < ms; passato += 5_000) { f.g.valuta(); f.avanza(5_000) }
}

afterEach(() => { vi.restoreAllMocks() })

describe('PC piccolo e PC grande', () => {
  it('piccolo: pochi processori o poca memoria; grande: come l’autore della soglia', () => {
    expect(pcPiccolo(piccolo(50))).toBe(true)
    expect(pcPiccolo({ processori: 16, memoriaLiberaMb: 4_000, memoriaTotaleMb: 8_192, caricoPercento: 0 })).toBe(true)
    expect(pcPiccolo(grande(50))).toBe(false)
    expect(pcPiccolo({ processori: 8, memoriaLiberaMb: 9_000, memoriaTotaleMb: 24_576, caricoPercento: 0 })).toBe(false)
  })

  it('le soglie: un PC grande ha sempre 75 e 60; uno piccolo sale sopra il suo fondo, non oltre il 99', () => {
    expect(soglieDelPc(grande(94), 94)).toEqual({ entrata: 75, rilascio: 60 })
    expect(soglieDelPc(piccolo(94), undefined)).toEqual({ entrata: 75, rilascio: 60 })
    expect(soglieDelPc(piccolo(94), 40)).toEqual({ entrata: 75, rilascio: 60 })
    expect(soglieDelPc(piccolo(94), 80)).toEqual({ entrata: 88, rilascio: 83 })
    expect(soglieDelPc(piccolo(94), 94)).toEqual({ entrata: 99, rilascio: 97 })
  })

  it('la scala dei tetti: 1 per un PC grande, meno per uno piccolo, mai sotto un quarto', () => {
    expect(scalaPc(grande(10))).toBe(1)
    expect(scalaPc(piccolo(10))).toBe(0.5)
    expect(scalaPc({ processori: 1, memoriaLiberaMb: 500, memoriaTotaleMb: 2_048, caricoPercento: 0 })).toBe(0.25)
  })
})

describe('4 processori e 8 GB al 94%', () => {
  it('dopo qualche minuto di fondo stabile non è «carico»: il passo pesante avanza subito', async () => {
    const f = guardiaFinta(() => piccolo(94))
    // Le prime misure, senza storia, lo dicono carico; col fondo noto (3 minuti) si libera dopo un minuto.
    misuraPer(f, STORIA_MINIMA_BASE_MS + 90_000)
    expect(f.g.stato()).toBeUndefined()
    const inizio = f.ora()
    await f.g.attendi('la suite')
    expect(f.ora() - inizio).toBe(0)
    // Un passo pesante alla volta resta: il secondo, dopo il primo, aspetta la quiete.
    expect(f.g.passoLibero?.(false)).toBe(false)
  })

  it('un picco vero (100% sopra il fondo) lo dichiara ancora carico, poi si libera', () => {
    let c = 94
    const f = guardiaFinta(() => piccolo(c))
    misuraPer(f, STORIA_MINIMA_BASE_MS + 30_000)
    c = 100
    misuraPer(f, PROCESSORE_PER_MS + 5_000)
    expect(f.g.stato()?.motivo).toMatch(/^processore al 100%/)
    c = 94
    misuraPer(f, 70_000)
    expect(f.g.stato()).toBeUndefined()
  })

  it('al primo avvio, senza storia, aspetta ma col tetto in proporzione: 1 minuto, non 2', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const avvisi = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const f = guardiaFinta(() => piccolo(94))
    f.g.valuta()
    f.avanza(PROCESSORE_PER_MS)
    const inizio = f.ora()
    await f.g.attendi('la suite')
    expect(f.ora() - inizio).toBe(ATTESA_MASSIMA_MS / 2)
    expect(avvisi.mock.calls.some((c) => String(c[0]).includes('il tetto dell\'attesa'))).toBe(true)
  })

  it('con 4 processori e 8 GB al 94% i posti pesanti dell’hook avanzano comunque entro il tetto', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const f = guardiaFinta(() => piccolo(94))
    f.g.valuta()
    f.avanza(PROCESSORE_PER_MS)
    f.g.valuta()
    expect(f.g.stato()).toBeDefined()
    let atteso = 0
    const r = await giudicaPesanteAspettando(
      { tool_name: 'Bash', tool_input: { command: 'npx vitest run' }, cwd: 'C:/p' },
      { chi: 'ap::c-1', cwd: 'C:/p', turni: creaTurni(), guardia: f.g, dormi: (ms) => { atteso += ms; f.avanza(ms); return Promise.resolve() }, riprovaMs: 5_000, tettoMs: 90_000 }
    )
    expect(r.ok).toBe(true)
    expect(atteso).toBeLessThanOrEqual(45_000)
  })
})

describe('16 processori: come oggi', () => {
  it('sopra il 75% per 20 secondi è carico, anche a 94% stabile', () => {
    const f = guardiaFinta(() => grande(94))
    misuraPer(f, STORIA_MINIMA_BASE_MS + 30_000)
    expect(f.g.stato()?.motivo).toMatch(/^processore al 94%/)
    expect(giudicaMisura(grande(94), {}, ORA).sopraDal).toBe(ORA)
    expect(giudicaMisura(grande(94), { sopraDal: ORA }, ORA + PROCESSORE_PER_MS).carico).toMatchObject({ risorsa: 'processore' })
  })

  it('il tetto dell’attesa resta di due minuti', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const f = guardiaFinta(() => grande(94))
    f.g.valuta()
    f.avanza(PROCESSORE_PER_MS)
    const inizio = f.ora()
    await f.g.attendi('la suite')
    expect(f.ora() - inizio).toBe(ATTESA_MASSIMA_MS)
    expect(f.g.scala?.()).toBe(1)
  })
})

describe('l’attesa ha un tetto', () => {
  it('anche con il PC pieno al 100% il passo parte entro il tetto, su un PC piccolo o grande', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (const misura of [piccolo(100), grande(100)]) {
      const f = guardiaFinta(() => misura)
      misuraPer(f, FINESTRA_BASE_MS)
      const inizio = f.ora()
      await f.g.attendi('la suite')
      expect(f.ora() - inizio).toBeLessThanOrEqual(ATTESA_MASSIMA_MS)
    }
  })

  it('senza la scala nella guardia (o senza guardia) il tetto dell’hook è quello di sempre', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const finta: GuardiaPc = { valuta: () => ({ motivo: 'x', dal: '' }), stato: () => ({ motivo: 'x', dal: '' }), attendi: () => Promise.resolve() }
    let atteso = 0
    await giudicaPesanteAspettando(
      { tool_name: 'Bash', tool_input: { command: 'npx vitest run' }, cwd: 'C:/p' },
      { chi: 'ap::c-2', cwd: 'C:/p', turni: creaTurni(), guardia: finta, dormi: (ms) => { atteso += ms; return Promise.resolve() }, riprovaMs: 5_000, tettoMs: 90_000 }
    )
    expect(atteso).toBe(90_000)
  })
})
