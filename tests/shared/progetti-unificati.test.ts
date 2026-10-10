import { describe, it, expect } from 'vitest'
import {
  armonizzaCase, casaDelGruppo, eSenzaNome, gruppoDiCartella, nomeNormalizzato, raggruppaProgetti, workspaceDelGruppo, type MembroProgetto
} from '../../src/shared/progetti-unificati'
import { daRiprovare, pianoAllineamento, sceltaProgetto } from '../../src/shared/allineamento'
import { decidiCasa, leggiCase, type CaseChat } from '../../src/shared/una-casa'

// 0.60.0: «stesso nome = stesso progetto». Dati d'esempio, nessun percorso vero.
const HOME = 'C:\\Users\\Esempio'
const scelta = (id: string, pc: string, quando = '2026-10-10T22:47:00Z') => sceltaProgetto({ id, nome: id, pc: { id: pc, nome: pc.toUpperCase() }, chi: { id: 'pc-qui', nome: 'PC-ESEMPIO' }, quando })
const cc = (...voci: Record<string, unknown>[]): CaseChat => leggiCase({ versione: 1, case: Object.assign({}, ...voci) })

describe('il nome normalizzato', () => {
  it('maiuscole, spazi, trattini, punti, accenti e suffissi delle copie non contano', () => {
    expect(nomeNormalizzato('Home assistant')).toBe(nomeNormalizzato('HomeAssistant'))
    expect(nomeNormalizzato('Wdeck')).toBe(nomeNormalizzato('wdeck (2)'))
    expect(nomeNormalizzato('Gestore_sessioni_ClaudeCode')).toBe(nomeNormalizzato('gestore-sessioni-claudecode'))
    expect(nomeNormalizzato('Città')).toBe(nomeNormalizzato('citta'))
    expect(nomeNormalizzato('Sito - copia')).toBe(nomeNormalizzato('Sito'))
    expect(nomeNormalizzato('Sito [3]')).toBe(nomeNormalizzato('sito'))
    expect(nomeNormalizzato('Game2')).not.toBe(nomeNormalizzato('Game'))
  })
})

describe('i gruppi del registro', () => {
  // Come nel registro vero del 10/10: quattro «Wdeck», tre con la stessa cartella qui, uno solo del portatile.
  const progetti: MembroProgetto[] = [
    { id: 'w1', nome: 'Wdeck', percorsi: { 'pc-qui': 'C:\\Progetti\\Wdeck' }, aggiuntoIl: '2026-09-01T00:00:00Z' },
    { id: 'w2', nome: 'Wdeck', percorsi: { 'pc-qui': 'C:\\Progetti\\Wdeck' }, aggiuntoIl: '2026-09-02T00:00:00Z' },
    { id: 'w3', nome: 'Wdeck', percorsi: { 'pc-port': 'C:\\Progetti\\Wdeck' }, aggiuntoIl: '2026-09-03T00:00:00Z' },
    { id: 'w4', nome: 'wdeck (2)', percorsi: { 'pc-qui': 'c:/progetti/wdeck/' }, aggiuntoIl: '2026-09-04T00:00:00Z' },
    { id: 's1', nome: 'SierraDeck', percorsi: { 'pc-port': 'C:\\Progetti\\SierraDeck' }, aggiuntoIl: '2026-09-05T00:00:00Z' },
    { id: 'x1', nome: 'Altro', percorsi: { 'pc-qui': 'C:\\Progetti\\Altro' } }
  ]
  it('stesso nome = un gruppo solo, con le cartelle senza doppioni', () => {
    const g = raggruppaProgetti(progetti)
    expect(g.map((x) => x.nome)).toEqual(['Altro', 'SierraDeck', 'Wdeck'])
    const w = g.find((x) => x.chiave === 'wdeck')
    expect(w?.ids).toEqual(['w1', 'w2', 'w3', 'w4'])
    expect(w?.percorsi.map((p) => p.pc)).toEqual(['pc-qui', 'pc-port'])
  })
  it('il principale: quello con la scelta di Nicholas più recente, altrimenti il più vecchio', () => {
    expect(raggruppaProgetti(progetti).find((x) => x.chiave === 'wdeck')?.id).toBe('w1')
    const c = cc(scelta('w3', 'pc-qui', '2026-10-10T22:48:02Z'), scelta('w2', 'pc-qui', '2026-10-10T22:46:56Z'))
    expect(raggruppaProgetti(progetti, c).find((x) => x.chiave === 'wdeck')?.id).toBe('w3')
    expect(casaDelGruppo(c, ['w1', 'w2', 'w3', 'w4'])?.decisaIl).toBe('2026-10-10T22:48:02Z')
  })
  it('un id unito a mano segue il suo principale anche con un altro nome; «separato» (vuoto) no', () => {
    const conUnito: MembroProgetto[] = [...progetti, { id: 'y', nome: 'Vecchio nome', percorsi: {}, unitoIn: 'x1' }, { id: 'z', nome: 'Zeta', percorsi: {}, unitoIn: '' }]
    const g = raggruppaProgetti(conUnito)
    expect(g.find((x) => x.id === 'x1')?.ids).toEqual(['x1', 'y'])
    expect(g.find((x) => x.id === 'z')?.ids).toEqual(['z'])
  })
  it('la cartella di una chat: prima quelle registrate, poi il nome (anche se qui non è registrata)', () => {
    const g = raggruppaProgetti(progetti)
    expect(gruppoDiCartella('C:\\Progetti\\Wdeck\\src', g)?.gruppo.chiave).toBe('wdeck')
    const s = gruppoDiCartella('E:\\Documenti\\SierraDeck\\android', g)
    expect(s?.gruppo.id).toBe('s1')
    expect(s?.perNome).toBe(true)
    expect(s?.radice).toBe('E:\\Documenti\\SierraDeck')
    expect(gruppoDiCartella('E:\\Documenti\\Nessuno', g)).toBeUndefined()
  })
  it('i workspace con lo stesso nome, quello col nome esatto per primo', () => {
    expect(workspaceDelGruppo(['wdeck (2)', 'Altro', 'Wdeck', 'WDECK'], { chiave: 'wdeck', nome: 'Wdeck' })).toEqual(['Wdeck', 'WDECK', 'wdeck (2)'])
  })
})

describe('«Rendi residente» del 10/10: la causa trovata nel registro', () => {
  // [allinea] porta qui «SierraDeck» (questo PC è il residente, la cartella non c'era): …
  // SierraDeck era registrato solo con la cartella del portatile; questo PC ha
  // il suo SierraDeck in un'altra cartella. Lo stesso per un «Wdeck».
  const progetti: MembroProgetto[] = [
    { id: 'w-qui', nome: 'Wdeck', percorsi: { 'pc-qui': 'C:\\Progetti\\Wdeck' }, aggiuntoIl: '2026-09-01T00:00:00Z' },
    { id: 'w-port', nome: 'Wdeck', percorsi: { 'pc-port': 'C:\\Progetti\\Wdeck' }, aggiuntoIl: '2026-09-03T00:00:00Z' },
    { id: 's-port', nome: 'SierraDeck', percorsi: { 'pc-port': 'C:\\Progetti\\SierraDeck' }, aggiuntoIl: '2026-09-05T00:00:00Z' }
  ]
  const casa = cc(scelta('w-port', 'pc-qui'), scelta('s-port', 'pc-qui'))
  const esiste = (p: string): boolean => p === 'C:\\Progetti\\Wdeck' || p === 'E:\\Documenti\\SierraDeck'
  it('prima della 0.60 il piano partiva da solo a riscaricarli accanto; adesso no', () => {
    const piano = pianoAllineamento({ io: 'pc-qui', home: HOME, esiste, progetti, case: casa, trovate: { 's-port': 'E:\\Documenti\\SierraDeck' } })
    // Wdeck: c'è (un altro suo id ha la cartella qui) → niente.
    expect(piano.azioni.some((a) => a.nome === 'Wdeck')).toBe(false)
    // SierraDeck: c'è una cartella con lo stesso nome → si chiede, non si scarica da solo.
    const s = piano.azioni.find((a) => a.nome === 'SierraDeck')
    expect(s?.tipo === 'porta-qui' && s.automatica).toBe(false)
    expect(s?.perche).toContain('E:\\Documenti\\SierraDeck')
  })
  it('un «porta qui» fermato da un lavoro sul Drive in corso si riprova', () => {
    expect(daRiprovare("LAVORO_IN_CORSO: sul Drive sta gia' girando «Salvo sul Drive».")).toBe(true)
    expect(daRiprovare('Collega prima Google Drive.')).toBe(false)
  })
})

describe('le case armonizzate', () => {
  const gruppi = raggruppaProgetti([
    { id: 't1', nome: 'Trading', percorsi: { 'pc-port': 'D:\\Trading' } },
    { id: 't2', nome: 'trading', percorsi: { 'pc-altro': 'C:\\Lavoro\\Trading' } }
  ])
  it('la scelta di Nicholas per il progetto vale per le sue chat decise dalla regola (il caso «MT5»)', () => {
    const c = cc(
      scelta('t1', 'pc-port', '2026-10-10T20:00:00Z'),
      { 'mt5': { pc: 'pc-altro', pcNome: 'ALTRO', motivo: 'la sua cartella c’è solo su ALTRO', decisaIl: '2026-10-02T00:00:00Z', da: 'regola' } },
      { 'dopo': { pc: 'pc-altro', pcNome: 'ALTRO', motivo: 'scelta', decisaIl: '2026-10-10T21:00:00Z', da: 'nicholas' } }
    )
    const nuove = armonizzaCase(c, gruppi, () => ['mt5', 'dopo', 'nuova'])
    expect(nuove.mt5?.pc).toBe('pc-port')
    expect(nuove.mt5?.motivo).toContain('stesso nome, stesso progetto')
    expect(nuove.nuova?.pc).toBe('pc-port')
    // Una scelta per la singola chat fatta dopo resta.
    expect(nuove.dopo).toBeUndefined()
  })
  it('senza una scelta di Nicholas per il progetto non cambia niente', () => {
    expect(armonizzaCase(cc(), gruppi, () => ['mt5'])).toEqual({})
  })
  it('la regola «la cartella c’è solo su quel PC» non decide se un altro PC ha una cartella con lo stesso nome', () => {
    const io = { id: 'pc-qui', nome: 'PC-ESEMPIO' }
    const base = { sessione: 's', cwd: 'C:\\Lavoro\\Trading', cartellaQui: false }
    const solo = decidiCasa({ ...base, altri: [{ pcId: 'pc-altro', nome: 'ALTRO', haCartella: true, aperta: false }] }, io)
    expect(solo.regola).toBe('cartella')
    const conNome = decidiCasa({ ...base, altri: [{ pcId: 'pc-altro', nome: 'ALTRO', haCartella: true, aperta: false }, { pcId: 'pc-port', nome: 'PORTATILE', haCartella: false, aperta: true, stessoNome: true }] }, io)
    expect(conNome.regola).not.toBe('cartella')
    expect(conNome.pc).toBe('pc-port')
  })
})

describe('le chat senza nome', () => {
  it('nessun titolo, l’id, «chat 1a2b3c4d», «senza titolo»: senza nome; un titolo vero no', () => {
    expect(eSenzaNome(undefined)).toBe(true)
    expect(eSenzaNome('  ')).toBe(true)
    expect(eSenzaNome('senza titolo')).toBe(true)
    expect(eSenzaNome('chat 1a2b3c4d')).toBe(true)
    expect(eSenzaNome('1a2b3c4d-0000-4000-8000-000000000000')).toBe(true)
    expect(eSenzaNome('chat s-tre', 's-tre')).toBe(true)
    expect(eSenzaNome('Fatture di ottobre')).toBe(false)
  })
})
