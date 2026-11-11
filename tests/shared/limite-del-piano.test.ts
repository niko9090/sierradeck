import { describe, it, expect } from 'vitest'
import {
  ATTESA_LIMITE_MAX_MS, ATTESA_LIMITE_RIPIEGO_MS, attesaLimiteMs, azzeramentoDaiLimiti, azzeramentoDalTesto, eLimiteDelPiano, fraseLimite, quandoInParole
} from '../../src/shared/limite-del-piano'
import { eErroreDiRete } from '../../src/shared/errori-rete'

/**
 * 11/11: il 09/11 l'autopilota ha scritto 11 volte in un'ora, come ERRORE,
 * «turno non riuscito: You've hit your weekly limit · resets 1am (Europe/Rome)».
 * Il limite del piano non è un guasto: si riconosce, si legge l'ora e si aspetta.
 */
const VERO = "You've hit your weekly limit · resets 1am (Europe/Rome)"
const t = (iso: string): number => Date.parse(iso)

describe('eLimiteDelPiano', () => {
  it.each([
    VERO,
    "You've hit your session limit · resets 3:45pm (Europe/Rome)",
    "You've hit your limit · resets 2pm",
    "You've hit your Opus weekly limit · resets Nov 12, 1am (Europe/Rome)",
    'Claude usage limit reached. Your limit will reset at 5pm.',
    'rate_limit: Claude usage limit reached. Your limit will reset at 5pm.',
    'Claude AI usage limit reached|1760000000'
  ])('riconosce «%s»', (testo) => {
    expect(eLimiteDelPiano(testo)).toBe(true)
  })

  it.each([
    "API Error: Can't reach the API server — check your internet or DNS (ENOTFOUND)",
    'API Error: 529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}',
    'API Error: 429 {"type":"error","error":{"type":"rate_limit_error"}}',
    'sovraccarico',
    'il turno era appeso (nessuna risposta dalla CLI da 20 minuti): l’ho fermato',
    'No conversation found with session ID: x',
    ''
  ])('un altro guasto resta un guasto: «%s»', (testo) => {
    expect(eLimiteDelPiano(testo)).toBe(false)
  })

  it('non è un errore di rete: sono due casi diversi', () => {
    expect(eErroreDiRete(VERO)).toBe(false)
  })
})

describe('azzeramentoDalTesto: l’ora la dice la CLI', () => {
  it('«resets 1am (Europe/Rome)»: la prossima volta che là è l’una', () => {
    // Il caso vero: le 17:09 di Roma del 09/11, l'una è quella del 10/11 (mezzanotte UTC).
    expect(azzeramentoDalTesto(VERO, t('2026-11-09T16:09:06.000Z'))).toBe(t('2026-11-10T00:00:00.000Z'))
    // Alle 00:30 di Roma l'una è fra mezz'ora, lo stesso giorno.
    expect(azzeramentoDalTesto(VERO, t('2026-11-09T23:30:00.000Z'))).toBe(t('2026-11-10T00:00:00.000Z'))
    // All'una e un minuto, quella di domani.
    expect(azzeramentoDalTesto(VERO, t('2026-11-10T00:01:00.000Z'))).toBe(t('2026-11-11T00:00:00.000Z'))
  })

  it('con i minuti, il pomeriggio, mezzogiorno e mezzanotte', () => {
    const ora = t('2026-11-09T08:00:00.000Z')
    expect(azzeramentoDalTesto("You've hit your session limit · resets 3:45pm (Europe/Rome)", ora)).toBe(t('2026-11-09T14:45:00.000Z'))
    expect(azzeramentoDalTesto('limit will reset at 12pm (Europe/Rome)', ora)).toBe(t('2026-11-09T11:00:00.000Z'))
    expect(azzeramentoDalTesto('limit will reset at 12am (Europe/Rome)', ora)).toBe(t('2026-11-09T23:00:00.000Z'))
    expect(azzeramentoDalTesto("You've hit your limit · resets 18:30 (Europe/Rome)", ora)).toBe(t('2026-11-09T17:30:00.000Z'))
  })

  it('d’estate lo scarto è quello dell’ora legale', () => {
    expect(azzeramentoDalTesto(VERO, t('2026-07-01T12:00:00.000Z'))).toBe(t('2026-07-01T23:00:00.000Z'))
  })

  it('con il giorno scritto vale quel giorno, anche a cavallo dell’anno', () => {
    expect(azzeramentoDalTesto("You've hit your weekly limit · resets Nov 12, 1am (Europe/Rome)", t('2026-11-09T16:00:00.000Z'))).toBe(t('2026-11-12T00:00:00.000Z'))
    expect(azzeramentoDalTesto("You've hit your weekly limit · resets Jan 2 at 9am (Europe/Rome)", t('2026-12-30T10:00:00.000Z'))).toBe(t('2027-01-02T08:00:00.000Z'))
  })

  it('un altro fuso', () => {
    expect(azzeramentoDalTesto("You've hit your weekly limit · resets 1am (America/New_York)", t('2026-11-09T16:00:00.000Z'))).toBe(t('2026-11-10T06:00:00.000Z'))
  })

  it('senza fuso vale l’orologio del PC: entro un giorno, a quell’ora', () => {
    const ora = t('2026-11-09T16:00:00.000Z')
    const quando = azzeramentoDalTesto('Claude usage limit reached. Your limit will reset at 5pm.', ora)!
    expect(quando).toBeGreaterThan(ora)
    expect(quando - ora).toBeLessThanOrEqual(24 * 60 * 60_000)
    expect(new Date(quando).getHours()).toBe(17)
    expect(new Date(quando).getMinutes()).toBe(0)
  })

  it('l’istante scritto dopo la barra (secondi o millisecondi)', () => {
    expect(azzeramentoDalTesto('Claude AI usage limit reached|1760000000', 0)).toBe(1_760_000_000_000)
    expect(azzeramentoDalTesto('Claude AI usage limit reached|1760000000000', 0)).toBe(1_760_000_000_000)
  })

  it('senza un’ora non inventa niente', () => {
    expect(azzeramentoDalTesto("You've hit your weekly limit", 0)).toBeUndefined()
    expect(azzeramentoDalTesto("You've hit your weekly limit · resets soon", 0)).toBeUndefined()
    expect(azzeramentoDalTesto('', 0)).toBeUndefined()
  })
})

describe('azzeramentoDaiLimiti: l’ora che il programma legge dalle chat', () => {
  const ora = t('2026-11-09T16:00:00.000Z')
  const limiti = { cinqueOre: { percento: 40, resettaIl: ora + 2 * 3_600_000 }, settimana: { percento: 100, resettaIl: ora + 8 * 3_600_000 } }

  it('la finestra che il messaggio nomina', () => {
    expect(azzeramentoDaiLimiti(limiti, "You've hit your weekly limit", ora)).toBe(ora + 8 * 3_600_000)
    expect(azzeramentoDaiLimiti(limiti, "You've hit your session limit", ora)).toBe(ora + 2 * 3_600_000)
    expect(azzeramentoDaiLimiti(limiti, "You've hit your 5-hour limit", ora)).toBe(ora + 2 * 3_600_000)
  })

  it('se non la nomina, quella piena; se nessuna è piena, non si sa', () => {
    expect(azzeramentoDaiLimiti(limiti, 'Claude usage limit reached.', ora)).toBe(ora + 8 * 3_600_000)
    expect(azzeramentoDaiLimiti({ cinqueOre: { percento: 40, resettaIl: ora + 1 }, settimana: { percento: 50, resettaIl: ora + 2 } }, 'Claude usage limit reached.', ora)).toBeUndefined()
  })

  it('un azzeramento già passato, o nessun limite letto: non si sa', () => {
    expect(azzeramentoDaiLimiti({ settimana: { percento: 100, resettaIl: ora - 1 } }, "You've hit your weekly limit", ora)).toBeUndefined()
    expect(azzeramentoDaiLimiti({ settimana: { percento: 100 } }, "You've hit your weekly limit", ora)).toBeUndefined()
    expect(azzeramentoDaiLimiti(undefined, "You've hit your weekly limit", ora)).toBeUndefined()
  })
})

describe('attesaLimiteMs', () => {
  const ora = 1_000_000_000_000
  it('fino all’azzeramento più un minuto, al più un’ora; senza saperlo un quarto d’ora', () => {
    expect(attesaLimiteMs(ora + 20 * 60_000, ora)).toBe(21 * 60_000)
    expect(attesaLimiteMs(ora + 8 * 3_600_000, ora)).toBe(ATTESA_LIMITE_MAX_MS)
    expect(attesaLimiteMs(undefined, ora)).toBe(ATTESA_LIMITE_RIPIEGO_MS)
    expect(attesaLimiteMs(ora - 5, ora)).toBe(ATTESA_LIMITE_RIPIEGO_MS)
    expect(ATTESA_LIMITE_RIPIEGO_MS).toBe(15 * 60_000)
    expect(ATTESA_LIMITE_MAX_MS).toBe(60 * 60_000)
  })
})

describe('le parole per Nicholas', () => {
  // Istanti costruiti sull'orologio del PC: la frase è la stessa in ogni fuso.
  const adesso = new Date(2026, 10, 9, 17, 9).getTime()
  it('oggi, domani, un altro giorno', () => {
    expect(quandoInParole(new Date(2026, 10, 9, 23, 30).getTime(), adesso)).toBe('alle 23:30')
    expect(quandoInParole(new Date(2026, 10, 10, 1, 0).getTime(), adesso)).toBe('domani alle 01:00')
    expect(quandoInParole(new Date(2026, 10, 12, 1, 0).getTime(), adesso)).toBe('gio 12/11 alle 01:00')
  })

  it('la riga del dialogo: una frase in italiano, con l’ora in cui riparte', () => {
    expect(fraseLimite({ azzeraIl: new Date(2026, 10, 10, 1, 0).getTime(), adesso }))
      .toBe('Limite del piano raggiunto: riparto da solo domani alle 01:00. I tuoi messaggi restano in attesa e partono allora.')
    expect(fraseLimite({ adesso }))
      .toBe('Limite del piano raggiunto: non so quando si azzera, riprovo da solo ogni 15 minuti. I tuoi messaggi restano in attesa e partono allora.')
  })
})
