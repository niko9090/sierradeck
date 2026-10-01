import { describe, it, expect } from 'vitest'
import {
  quadroLimiti, unisciPolso, statoFinestra, contestoDa, etichettaContesto, letturaPiuRecente,
  limitiPerFreno, daQuanto, LETTURA_VECCHIA_MS
} from '@shared/limiti-piano'
import { leggiPolso, type Polso } from '@shared/polso-chat'
import { frenoDaiLimiti, testoFreno } from '@shared/harness'
import { leggiStatoProgramma } from '../../src/autopilot-host/coordinatore'

/**
 * Contesto e limiti affidabili (0.37.0): un'unica aggregazione pura, usata da
 * PC, pagina, app (attraverso `/api/consumi`) e dal freno degli autopiloti.
 */
const ORA = Date.parse('2026-10-01T12:00:00Z')
const MIN = 60_000
const polso = (sessione: string, quando: number, cinque?: { percento: number; resettaIl?: number; lettoIl?: number }, extra: Partial<Polso> = {}): Polso => ({
  sessione, quando, ...(cinque !== undefined ? { limiti: { cinqueOre: cinque } } : {}), ...extra
})

describe('limiti del piano: azzeramento', () => {
  it('dopo resets_at la finestra è «azzerata, in attesa di una lettura nuova», non il vecchio valore', () => {
    const q = quadroLimiti([polso('a', ORA - 30 * MIN, { percento: 92, resettaIl: ORA - MIN, lettoIl: ORA - 30 * MIN })], ORA)
    expect(q?.cinqueOre).toMatchObject({ stato: 'azzerata', percento: 0, percentoLetto: 92 })
    expect(q?.cinqueOre?.etichetta).toContain('in attesa di una lettura nuova')
  })

  it('Claude Code toglie la finestra azzerata: il polso senza finestra non la cancella, resta «azzerata»', () => {
    const prima = polso('a', ORA - 10 * MIN, { percento: 80, resettaIl: ORA - MIN, lettoIl: ORA - 10 * MIN })
    const dopo = unisciPolso(prima, polso('a', ORA))
    expect(quadroLimiti([dopo], ORA)?.cinqueOre?.stato).toBe('azzerata')
  })
})

describe('limiti del piano: la lettura più recente fra tutte le chat', () => {
  it('vince la finestra nuova, non la più alta: una chat ferma da ieri porta la finestra di ieri', () => {
    const ferma = polso('ferma', ORA - MIN, { percento: 90, resettaIl: ORA + 30 * MIN, lettoIl: ORA - 4 * 60 * MIN })
    const viva = polso('viva', ORA - 2 * MIN, { percento: 4, resettaIl: ORA + 4 * 60 * MIN, lettoIl: ORA - 2 * MIN })
    expect(quadroLimiti([ferma, viva], ORA)?.cinqueOre?.percento).toBe(4)
  })

  it('nella stessa finestra vince la lettura confermata più di recente, non l ultima chat che ha scritto', () => {
    const reset = ORA + 2 * 60 * MIN
    // «a» ha appena ridisegnato la riga (quando recente) ma con numeri letti un'ora fa.
    const a = polso('a', ORA, { percento: 40, resettaIl: reset, lettoIl: ORA - 60 * MIN })
    const b = polso('b', ORA - 5 * MIN, { percento: 47, resettaIl: reset + 20_000, lettoIl: ORA - 5 * MIN })
    expect(quadroLimiti([a, b], ORA)?.cinqueOre).toMatchObject({ percento: 47, lettoIl: ORA - 5 * MIN })
    expect(letturaPiuRecente([])).toBeUndefined()
  })

  it('una riga ridisegnata senza risposta nuova non ringiovanisce la lettura; con una risposta nuova sì', () => {
    const r = ORA + 60 * MIN
    const prima = polso('a', ORA - 30 * MIN, { percento: 30, resettaIl: r, lettoIl: ORA - 30 * MIN }, { costoUsd: 1 })
    const ridisegno = unisciPolso(prima, polso('a', ORA, { percento: 30, resettaIl: r, lettoIl: ORA }, { costoUsd: 1 }))
    expect(ridisegno.limiti?.cinqueOre?.lettoIl).toBe(ORA - 30 * MIN)
    const risposta = unisciPolso(prima, polso('a', ORA, { percento: 30, resettaIl: r, lettoIl: ORA }, { costoUsd: 1.2 }))
    expect(risposta.limiti?.cinqueOre?.lettoIl).toBe(ORA)
  })
})

describe('limiti del piano: età della lettura', () => {
  it('dice da quanto è letta, e oltre la soglia la segna vecchia', () => {
    const fresca = statoFinestra({ percento: 20, resettaIl: ORA + 60 * MIN, lettoIl: ORA - 3 * MIN }, ORA)
    expect(fresca.stato).toBe('fresca')
    expect(fresca.etichetta).toContain('letto 3 minuti fa')
    const vecchia = statoFinestra({ percento: 20, resettaIl: ORA + 60 * MIN, lettoIl: ORA - LETTURA_VECCHIA_MS - MIN }, ORA)
    expect(vecchia.stato).toBe('vecchia')
    expect(vecchia.etichetta).toContain('lettura vecchia')
    expect(quadroLimiti([polso('a', ORA, { percento: 20, lettoIl: ORA - 2 * 60 * MIN })], ORA)?.vecchio).toBe(true)
    expect(daQuanto(30_000)).toBe('adesso')
  })
})

describe('limiti del piano: chat senza rate_limits', () => {
  it('una chat con chiave API o un modello senza limiti non cancella il valore buono', () => {
    const buona = polso('a', ORA - 5 * MIN, { percento: 33, resettaIl: ORA + 60 * MIN, lettoIl: ORA - 5 * MIN }, { costoUsd: 1 })
    const senza = leggiPolso({ session_id: 'a', cost: { total_cost_usd: 1.5 } }, ORA)
    expect(senza?.limiti).toBeUndefined()
    const unito = unisciPolso(buona, senza!)
    expect(quadroLimiti([unito], ORA)?.cinqueOre?.percento).toBe(33)
    // E un'altra chat senza limiti non pesa sul quadro.
    expect(quadroLimiti([buona, polso('b', ORA)], ORA)?.cinqueOre?.percento).toBe(33)
  })
})

describe('il contesto di una chat, come lo calcola Claude Code', () => {
  it('solo i token in ingresso, non quelli in uscita', () => {
    const c = contestoDa({ used_percentage: 42, context_window_size: 200000, current_usage: { input_tokens: 80000, cache_creation_input_tokens: 1000, cache_read_input_tokens: 3000, output_tokens: 9000 } })
    expect(c).toEqual({ percento: 42, usati: 84000, dimensione: 200000 })
    expect(etichettaContesto(c)).toBe('42% · 84k di 200k token')
  })
  it('senza used_percentage si ricava dagli stessi numeri; dopo /compact non si conosce', () => {
    expect(contestoDa({ context_window_size: 1000000, total_input_tokens: 250000 })).toEqual({ percento: 25, usati: 250000, dimensione: 1000000 })
    expect(contestoDa({ context_window_size: 200000, current_usage: null, used_percentage: null })).toBeUndefined()
    expect(etichettaContesto(undefined)).toContain('non ancora letto')
  })
})

describe('il freno degli autopiloti usa la stessa lettura', () => {
  it('finestra azzerata: via libera in attesa della lettura nuova; lettura vecchia: lo dice nel motivo', () => {
    const azzerata = quadroLimiti([polso('a', ORA - 60 * MIN, { percento: 97, resettaIl: ORA - MIN, lettoIl: ORA - 60 * MIN })], ORA)
    const f = frenoDaiLimiti(limitiPerFreno(azzerata), ORA)
    expect(f.livello).toBe('pieno')
    expect(f.motivo).toContain('appena azzerata')
    const vecchia = quadroLimiti([polso('a', ORA, { percento: 85, resettaIl: ORA + 60 * MIN, lettoIl: ORA - 40 * MIN })], ORA)
    const g = frenoDaiLimiti(limitiPerFreno(vecchia), ORA)
    expect(g.livello).toBe('una')
    expect(g.motivo).toContain('lettura di 40 minuti fa')
    expect(testoFreno(g).titolo).toBe('Una chat sola')
  })

  it('il servizio riceve dal Gestore la percentuale letta e il momento della lettura', () => {
    const q = quadroLimiti([polso('a', ORA - 60 * MIN, { percento: 97, resettaIl: ORA - MIN, lettoIl: ORA - 60 * MIN })], ORA)
    const s = leggiStatoProgramma(JSON.parse(JSON.stringify({ letto: ORA, chat: [], limiti: q, domandeAperte: 0, progetti: [], altriPc: [] })), ORA)
    expect(s?.limiti?.cinqueOre).toEqual({ percento: 97, resettaIl: ORA - MIN, lettoIl: ORA - 60 * MIN })
    // E il freno del servizio arriva alla stessa conclusione del Gestore.
    expect(frenoDaiLimiti(s?.limiti, ORA).livello).toBe(frenoDaiLimiti(limitiPerFreno(q), ORA).livello)
  })
})
