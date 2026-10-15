import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Terminal } from '@xterm/headless'
import type { HostToCore } from '../../src/shared/protocol'
import { creaSottofondo, type TerminaleMuto } from '../../src/main/sottofondo'
import { leggiConsegne } from '../../src/main/autopilota-consegne'
import { chatConCodaVecchia, IN_CODA_AL_LAVORO_MS } from '../../src/autopilot-host/guardiano'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'

/**
 * «STO SCRIVENDO NEGLI AUTOPILOTI MA NON RIESCONO AD IMPARTIRE ORDINI ALLE
 * CHAT» (Nicholas, 12/10): una chat che lavora per ore non si ferma mai, e la
 * coda aspettava la fine del turno. Dalla 0.69.0 un messaggio in coda da più di
 * due minuti si scrive anche durante il turno. Provato dal vero il 12/10 su una
 * chat di prova: Claude Code non interrompe quello che fa e lo legge appena può.
 */
const ORA = Date.parse('2026-10-12T20:00:00.000Z')
const conCoda = (minuti: number, stato: Autopilota['stato'] = 'lavoro'): Autopilota => ({
  ...nuovoAutopilota({ id: 'ap-1', nome: 'x', obiettivo: 'o', cwd: 'C:\\p', criteri: [], iniziatoIl: '2026-10-12T19:00:00.000Z' }),
  stato,
  daConsegnare: [{ id: 'm-1', quando: new Date(ORA - minuti * 60_000).toISOString(), testo: 'fai anche questo', chats: ['ap-1'] }]
})

describe('quali chat ricevono la coda durante il turno', () => {
  it('un messaggio in coda da più di due minuti a una chat che lavora', () => {
    expect(chatConCodaVecchia(conCoda(3), ORA, IN_CODA_AL_LAVORO_MS, new Set())).toEqual([{ da: 3 * 60_000 }])
  })
  it('non prima dei due minuti, non a una chat già ferma (la porta il giro delle ferme), non a un autopilota fermo', () => {
    expect(chatConCodaVecchia(conCoda(1), ORA, IN_CODA_AL_LAVORO_MS, new Set())).toEqual([])
    expect(chatConCodaVecchia(conCoda(3), ORA, IN_CODA_AL_LAVORO_MS, new Set(['ap-1']))).toEqual([])
    expect(chatConCodaVecchia(conCoda(3, 'sospeso'), ORA, IN_CODA_AL_LAVORO_MS, new Set())).toEqual([])
  })
})

describe('il segno «anche al lavoro» arriva al Gestore', () => {
  it('leggiConsegne lo tiene', () => {
    const [c] = leggiConsegne({ consegne: [{ id: 'c-1', autopilotaId: 'ap-1', chatId: 'ap-1', cwd: 'C:\\p', sessionId: '11111111-2222-4333-8444-555555555555', titolo: 't', cosa: 'scrivi', testo: 'fai anche questo', ancheAlLavoro: true }] })
    expect(c?.ancheAlLavoro).toBe(true)
  })
})

describe('in sottofondo: si scrive durante il turno solo un testo «anche al lavoro»', () => {
  function finto() {
    let ora = 1_000_000
    const ascolti = new Map<string, (m: HostToCore) => void>()
    const scritto: string[] = []
    const s = creaSottofondo({
      dati: mkdtempSync(join(tmpdir(), 'sd-turno-')),
      avviaPty: () => 'pty-1',
      ascolta: (id, cb) => { ascolti.set(id, cb) },
      smetti: () => undefined,
      scrivi: (_id, data) => { scritto.push(data) },
      ferma: () => undefined,
      creaTerminale: (cols, rows) => new Terminal({ cols, rows, allowProposedApi: true }) as unknown as TerminaleMuto,
      log: () => undefined,
      adesso: () => ora,
      timer: (f) => f()
    })
    /** Claude Code che lavora: il campo c'è, sotto «esc to interrupt». */
    const lavora = (): void => ascolti.get('pty-1')?.({ id: 'pty-1', kind: 'data', data: '\x1b[2J\x1b[H Benvenuto\r\n\r\n✻ Pensando… (12s · esc to interrupt)\r\n❯ \r\n  ? for shortcuts' })
    return { s, scritto, lavora, avanti: (ms: number) => { ora += ms } }
  }
  const SESSIONE = '11111111-2222-4333-8444-555555555555'
  const digerisci = (): Promise<void> => new Promise((r) => setTimeout(r, 20))
  it('un testo normale aspetta la fine del turno', async () => {
    const f = finto()
    f.s.avvia({ sessione: SESSIONE, cwd: 'C:\\p', titolo: 'p', perChi: { id: 'x', nome: 'x' }, testo: 'normale', idMessaggio: 'm-1' })
    f.lavora(); await digerisci(); f.avanti(5000); f.s.giro()
    expect(f.scritto).toEqual([])
  })
  it('un testo «anche al lavoro» si scrive subito, con Invio', async () => {
    const f = finto()
    f.s.avvia({ sessione: SESSIONE, cwd: 'C:\\p', titolo: 'p', perChi: { id: 'x', nome: 'x' }, testo: 'urgente', idMessaggio: 'm-2', ancheAlLavoro: true })
    f.lavora(); await digerisci(); f.avanti(5000); f.s.giro()
    expect(f.scritto).toEqual(['urgente', '\r'])
  })
})

describe('in sottofondo: mai più di un messaggio in coda in Claude Code (0.72.0)', () => {
  function finto() {
    let ora = 1_000_000
    const ascolti = new Map<string, (m: HostToCore) => void>()
    const scritto: string[] = []
    const s = creaSottofondo({
      dati: mkdtempSync(join(tmpdir(), 'sd-turno-')),
      avviaPty: () => 'pty-1',
      ascolta: (id, cb) => { ascolti.set(id, cb) },
      smetti: () => undefined,
      scrivi: (_id, data) => { scritto.push(data) },
      ferma: () => undefined,
      creaTerminale: (cols, rows) => new Terminal({ cols, rows, allowProposedApi: true }) as unknown as TerminaleMuto,
      log: () => undefined,
      adesso: () => ora,
      timer: (f) => f()
    })
    const schermo = (d: string): void => ascolti.get('pty-1')?.({ id: 'pty-1', kind: 'data', data: d })
    /** Al lavoro, con il campo vuoto: il testo scritto è fra i messaggi in coda, in alto. */
    const lavora = (): void => schermo('\x1b[2J\x1b[H Benvenuto\r\n\r\n✻ Pensando… (12s · esc to interrupt)\r\n❯ \r\n  ? for shortcuts')
    return { s, scritto, lavora, avanti: (ms: number) => { ora += ms } }
  }
  const SESSIONE = '11111111-2222-4333-8444-555555555555'
  const digerisci = (): Promise<void> => new Promise((r) => setTimeout(r, 20))
  it('due testi «anche al lavoro» nello stesso turno: se ne scrive uno, il secondo aspetta', async () => {
    const f = finto()
    const chi = { id: 'x', nome: 'x' }
    f.s.avvia({ sessione: SESSIONE, cwd: 'C:\\p', titolo: 'p', perChi: chi, testo: 'primo urgente', idMessaggio: 'm-1', ancheAlLavoro: true })
    f.lavora(); await digerisci(); f.avanti(5000); f.s.giro()
    expect(f.scritto).toEqual(['primo urgente', '\r'])
    f.s.avvia({ sessione: SESSIONE, cwd: 'C:\\p', titolo: 'p', perChi: chi, testo: 'secondo urgente', idMessaggio: 'm-2', ancheAlLavoro: true })
    // Il primo non è più nel campo (è fra i messaggi in coda): consegnato, mai riscritto.
    f.lavora(); await digerisci()
    for (let i = 0; i < 6; i++) { f.avanti(5000); f.s.giro() }
    expect(f.scritto).toEqual(['primo urgente', '\r'])
  })
})

describe('in sottofondo il servizio sa che la consegna è partita (0.69.0)', () => {
  it('dall’id del testo si risale alla consegna', async () => {
    const { consegnaDaIdTesto, idTestoConsegna } = await import('../../src/main/autopilota-consegne')
    const id = idTestoConsegna({ id: 'c-12', autopilotaId: 'ap-1', chatId: 'ap-1', cwd: 'C:\p', sessionId: 's', titolo: 't', cosa: 'scrivi', testo: 'fai anche questo' })
    expect(consegnaDaIdTesto(id)).toBe('c-12')
    expect(consegnaDaIdTesto('w-abc')).toBeUndefined()
  })
})
