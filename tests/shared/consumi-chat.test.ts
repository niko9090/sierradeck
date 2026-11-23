import { describe, it, expect } from 'vitest'
import {
  aggiornaMemoria, consumiPerChat, leggiMemoriaConsumi, memoriaVuota, rimastoDaFinestra,
  chiaveGiorno, chiaveSettimana, type MemoriaConsumi
} from '@shared/consumi-chat'
import { statoFinestra, type QuadroLimiti } from '@shared/limiti-piano'
import type { SessionSummary } from '@shared/types'

// Date locali a mezzogiorno: i test non dipendono dal fuso.
const MERC = new Date(2026, 10, 18, 12).getTime() // mercoledì 18/11/2026
const GIOVE = new Date(2026, 10, 19, 12).getTime()
const LUNEDI_DOPO = new Date(2026, 10, 23, 12).getTime()
const iso = (ms: number): string => new Date(ms).toISOString()

function s(over: Partial<SessionSummary> = {}): SessionSummary {
  return {
    uuid: 'u-1', projectSlug: 'C--p', projectPath: 'C:\\lavoro\\alfa',
    aiTitle: 'Prima chat', cwd: undefined, gitBranch: undefined, model: undefined,
    permissionMode: undefined, claudeVersion: undefined, messageCount: 10,
    firstTimestamp: iso(MERC), lastTimestamp: iso(MERC),
    inputTokens: 1000, outputTokens: 500, cacheReadTokens: 8000, cacheWriteTokens: 200,
    primoPrompt: undefined, mtimeMs: 0, jsonlPath: 'x.jsonl', sizeBytes: 0, skippedLines: 0,
    ...over
  }
}

describe('consumi per chat', () => {
  it('divide per chat con workspace e PC, token = ingresso + uscita (cache esclusa)', () => {
    const m = aggiornaMemoria(memoriaVuota(MERC), [
      s(),
      s({ uuid: 'u-2', aiTitle: 'Seconda', projectPath: 'C:\\lavoro\\beta', inputTokens: 100, outputTokens: 50 })
    ], MERC)
    const c = consumiPerChat(m, undefined, 'PC-prova', MERC)
    expect(c.chat.map((x) => [x.chat, x.workspace, x.pc, x.oggi, x.settimana])).toEqual([
      ['Prima chat', 'alfa', 'PC-prova', 1500, 1500],
      ['Seconda', 'beta', 'PC-prova', 150, 150]
    ])
    expect(c.complessivo).toEqual({ oggi: 1650, settimana: 1650, chatOggi: 2, chatSettimana: 2 })
  })

  it('due sessioni della stessa chat sono una riga sola', () => {
    const m = aggiornaMemoria(memoriaVuota(MERC), [s(), s({ uuid: 'u-2' })], MERC)
    const c = consumiPerChat(m, undefined, 'pc', MERC)
    expect(c.chat).toHaveLength(1)
    expect(c.chat[0]?.oggi).toBe(3000)
  })

  it('senza titolo usa il primo prompt, poi un nome corto', () => {
    const m = aggiornaMemoria(memoriaVuota(MERC), [
      s({ aiTitle: undefined, primoPrompt: 'sistema il login' }),
      s({ uuid: 'abcdef123456', aiTitle: undefined })
    ], MERC)
    const nomi = consumiPerChat(m, undefined, 'pc', MERC).chat.map((x) => x.chat).sort()
    expect(nomi).toEqual(['chat abcdef12', 'sistema il login'])
  })

  it('una chat nuova ferma da ieri non pesa su oggi ma sì sulla settimana', () => {
    const ieri = MERC - 24 * 3600_000
    const m = aggiornaMemoria(memoriaVuota(MERC), [s({ lastTimestamp: iso(ieri) })], MERC)
    const r = consumiPerChat(m, undefined, 'pc', MERC).chat[0]
    expect(r?.oggi).toBe(0)
    expect(r?.settimana).toBe(1500)
  })

  it('le differenze fra due letture sono consumo vero di oggi e della settimana', () => {
    let m = aggiornaMemoria(memoriaVuota(MERC), [s({ lastTimestamp: iso(MERC - 3 * 24 * 3600_000) })], MERC)
    m = aggiornaMemoria(m, [s({ inputTokens: 1800, outputTokens: 700 })], MERC + 60_000)
    const r = consumiPerChat(m, undefined, 'pc', MERC).chat[0]
    expect(r?.oggi).toBe(1000) // 2500 - 1500
  })

  it('se i token calano (sessione cancellata) non nasce consumo negativo', () => {
    let m = aggiornaMemoria(memoriaVuota(MERC), [s()], MERC)
    m = aggiornaMemoria(m, [s({ inputTokens: 100, outputTokens: 0 })], MERC + 1000)
    expect(consumiPerChat(m, undefined, 'pc', MERC).chat[0]?.oggi).toBe(1500)
    m = aggiornaMemoria(m, [s({ inputTokens: 300, outputTokens: 0 })], MERC + 2000)
    expect(consumiPerChat(m, undefined, 'pc', MERC).chat[0]?.oggi).toBe(1700)
  })
})

describe('azzeramento di giorno e settimana', () => {
  const dopo = (m: MemoriaConsumi, t: number, tok = 1500): MemoriaConsumi =>
    aggiornaMemoria(m, [s({ inputTokens: tok, outputTokens: 0 })], t)

  it('al cambio di giorno azzera oggi e tiene la settimana', () => {
    let m = aggiornaMemoria(memoriaVuota(MERC), [s({ inputTokens: 1000, outputTokens: 0 })], MERC)
    m = dopo(m, GIOVE, 1400)
    const r = consumiPerChat(m, undefined, 'pc', GIOVE)
    expect(r.giorno).toBe(chiaveGiorno(GIOVE))
    expect(r.chat[0]?.oggi).toBe(400)
    expect(r.chat[0]?.settimana).toBe(1400)
  })

  it('al cambio di settimana azzera anche la settimana', () => {
    let m = aggiornaMemoria(memoriaVuota(MERC), [s({ inputTokens: 1000, outputTokens: 0 })], MERC)
    m = dopo(m, LUNEDI_DOPO, 1250)
    const r = consumiPerChat(m, undefined, 'pc', LUNEDI_DOPO)
    expect(r.settimanaDal).toBe(chiaveSettimana(LUNEDI_DOPO))
    expect(r.settimanaDal).not.toBe(chiaveSettimana(MERC))
    expect(r.chat[0]?.oggi).toBe(250)
    expect(r.chat[0]?.settimana).toBe(250)
  })

  it('la settimana comincia di lunedì', () => {
    expect(chiaveSettimana(new Date(2026, 10, 22, 23).getTime())).toBe('2026-11-16') // domenica
    expect(chiaveSettimana(new Date(2026, 10, 23, 0, 5).getTime())).toBe('2026-11-23') // lunedì
  })

  it('una chat ferma da settimane esce dalla memoria', () => {
    const vecchia = MERC - 30 * 24 * 3600_000
    let m = aggiornaMemoria(memoriaVuota(vecchia), [s({ lastTimestamp: iso(vecchia) })], vecchia)
    m = aggiornaMemoria(m, [], MERC)
    expect(Object.keys(m.voci)).toHaveLength(0)
  })
})

describe('quanto resta', () => {
  const adesso = MERC
  const lettura = (percento: number, resettaIl: number, lettoIl = adesso) => statoFinestra({ percento, resettaIl, lettoIl }, adesso)

  it('dai limiti del piano: percentuale rimasta e ora di azzeramento', () => {
    const limiti: QuadroLimiti = {
      cinqueOre: lettura(30, adesso + 2 * 3600_000),
      settimana: lettura(64.4, adesso + 3 * 24 * 3600_000),
      letti: adesso, vecchio: false
    }
    const c = consumiPerChat(memoriaVuota(adesso), limiti, 'pc', adesso)
    expect(c.rimasto.settimana).toMatchObject({ noto: true, percentoUsato: 64, percentoRimasto: 36, azzeraIl: adesso + 3 * 24 * 3600_000 })
    expect(c.rimasto.settimana.azzeraEtichetta).toMatch(/^[a-z]{3} \d\d:\d\d$/)
    expect(c.rimasto.cinqueOre).toMatchObject({ noto: true, percentoRimasto: 70 })
  })

  it('senza limiti letti non inventa: noto false con il motivo', () => {
    const c = consumiPerChat(memoriaVuota(adesso), undefined, 'pc', adesso)
    expect(c.rimasto.cinqueOre).toEqual({ noto: false, motivo: expect.stringContaining('non ancora letto') })
    expect(c.rimasto.settimana.noto).toBe(false)
    expect(c.rimasto.settimana.percentoRimasto).toBeUndefined()
  })

  it('la giornata non ha un limite di Claude: non nota, ma dice quando riparte il conteggio', () => {
    const g = consumiPerChat(memoriaVuota(adesso), undefined, 'pc', adesso).rimasto.giornata
    expect(g.noto).toBe(false)
    expect(g.percentoRimasto).toBeUndefined()
    expect(g.azzeraIl).toBe(new Date(2026, 10, 19).getTime())
  })

  it('una finestra azzerata e non riletta non è un «100% rimasto»', () => {
    const r = rimastoDaFinestra(lettura(90, adesso - 1000, adesso - 3600_000))
    expect(r.noto).toBe(false)
    expect(r.percentoRimasto).toBeUndefined()
    expect(r.motivo).toContain('azzerata')
  })

  it('una lettura vecchia è segnata', () => {
    const r = rimastoDaFinestra(lettura(50, adesso + 3600_000, adesso - 3 * 3600_000))
    expect(r).toMatchObject({ noto: true, percentoRimasto: 50, vecchia: true })
  })
})

describe('lettura della memoria dal disco', () => {
  it.each([null, 42, 'testo', [], {}, { versione: 99, giorno: 'x', settimanaDal: 'y', voci: {} }])('un contenuto storto (%j) dà una memoria vuota', (raw) => {
    const m = leggiMemoriaConsumi(raw, MERC)
    expect(m.voci).toEqual({})
    expect(m.giorno).toBe(chiaveGiorno(MERC))
  })

  it('le voci rovinate si saltano, quelle buone restano', () => {
    const m = leggiMemoriaConsumi({
      versione: 1, giorno: '2026-11-18', settimanaDal: '2026-11-16', aggiornatoIl: 5,
      voci: {
        buona: { chat: 'ok', workspace: 'w', visti: 10, oggi: 4, settimana: 6, ultimo: 100 },
        senzaNome: { visti: 1, oggi: 1, settimana: 1, ultimo: 1 },
        negativa: { chat: 'x', visti: -5, oggi: 0, settimana: 0, ultimo: 1 },
        nulla: null
      }
    }, MERC)
    expect(Object.keys(m.voci)).toEqual(['buona'])
  })
})
