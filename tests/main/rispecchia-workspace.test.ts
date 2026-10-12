import { describe, it, expect } from 'vitest'
import { creaRispecchia, type StatoDiCasa } from '../../src/main/rispecchia-workspace'
import type { Archivio, PaneSalvato } from '@shared/workspace'

/**
 * Il caso vero di Nicholas (12/10), con nomi finti: nel workspace «Trading» di
 * qui, che nessuna finestra mostra, due riquadri di chat del portatile; là
 * «Trading» ne ha una sola, l'altra è stata chiusa senza chiusura registrata.
 */

const CHIUSA = 'aaaaaaaa-0000-4000-8000-000000000001'
const APERTA = 'bbbbbbbb-0000-4000-8000-000000000002'
const ALTROVE = 'cccccccc-0000-4000-8000-000000000003'
const VECCHIO = '2026-10-01T10:00:00.000Z'
const ADESSO = Date.parse('2026-10-12T12:00:00.000Z')

const remota = (id: string, sessione: string, titolo: string, dal: string | undefined = VECCHIO): PaneSalvato => ({
  id, sessionUuid: sessione, cwd: 'C:\\progetti\\trading', title: titolo,
  remoto: { pcId: 'pc-portatile', pcNome: 'Portatile', cwd: 'C:\\progetti\\trading', sessione, ...(dal !== undefined ? { dal } : {}) }
})
const locale: PaneSalvato = { id: 'p-qui', sessionUuid: 'dddddddd-0000-4000-8000-000000000004', cwd: 'C:\\qui', title: 'Di qui' }

function archivio(panes: PaneSalvato[]): Archivio {
  return {
    versione: 2,
    attivo: 'SierraDeck',
    workspace: [
      { nome: 'SierraDeck', perSlot: { 1: { root: { tipo: 'pane', id: 'p-sd' } as never, panes: [{ id: 'p-sd', sessionUuid: 'eeeeeeee-0000-4000-8000-000000000005', cwd: 'C:\\sd', title: 'SierraDeck' }] } } },
      { nome: 'Trading', perSlot: { 1: { root: undefined, panes } } }
    ]
  } as unknown as Archivio
}

function su(a: Archivio, stato: StatoDiCasa | Error, mostrati = new Set(['SierraDeck'])) {
  let scritto: Archivio | undefined
  const righe: string[] = []
  const r = creaRispecchia({
    leggi: () => scritto ?? a,
    scrivi: (x) => { scritto = x },
    mostrati: () => mostrati,
    statoDi: () => stato instanceof Error ? Promise.reject(stato) : Promise.resolve(stato),
    nomePc: (_id, salvato) => salvato,
    // La casa memorizzata di ogni chat del banco è il portatile (0.67.0).
    casaDi: () => 'pc-portatile',
    log: (m) => { righe.push(m) },
    adesso: () => ADESSO
  })
  return { r, righe, scritto: () => scritto }
}
const sessioniDi = (a: Archivio | undefined, ws: string): string[] =>
  (a?.workspace.find((w) => w.nome === ws)?.perSlot[1]?.panes ?? []).map((p) => p.sessionUuid)

describe('il Core rispecchia il PC di casa nei workspace nascosti', () => {
  it('toglie il riquadro della chat che là non è aperta da nessuna parte, anche senza chiusura registrata; lascia quella aperta', async () => {
    const a = archivio([remota('p-1', CHIUSA, 'Spostamento progetto'), remota('p-2', APERTA, 'Controllo resa'), locale])
    const { r, righe, scritto } = su(a, { chat: [{ sessione: APERTA }], salvate: [APERTA] })
    const tolti = await r.giro()
    expect(tolti.map((t) => t.sessione)).toEqual([CHIUSA])
    expect(sessioniDi(scritto(), 'Trading')).toEqual([APERTA, locale.sessionUuid])
    expect(righe.join('\n')).toContain('«Spostamento progetto» (aaaaaaaa) dal workspace «Trading», che nessuna finestra mostra: non aperta sul PC di casa (Portatile')
  })

  it('una chat salvata in un altro workspace di là è aperta là: resta', async () => {
    const a = archivio([remota('p-3', ALTROVE, 'In un altro workspace')])
    const { r, scritto } = su(a, { chat: [], salvate: [ALTROVE] })
    expect(await r.giro()).toEqual([])
    expect(scritto()).toBeUndefined()
  })

  it('il PC di casa non risponde: non si toglie niente, e lo si dice una volta', async () => {
    const a = archivio([remota('p-1', CHIUSA, 'Spostamento progetto')])
    const { r, righe, scritto } = su(a, new Error('timeout'))
    expect(await r.giro()).toEqual([])
    expect(await r.giro()).toEqual([])
    expect(scritto()).toBeUndefined()
    expect(righe.filter((x) => x.includes('non raggiungibile'))).toHaveLength(1)
  })

  it('un PC vecchio che non manda le chat dei suoi workspace: non si toglie niente', async () => {
    const a = archivio([remota('p-1', CHIUSA, 'Spostamento progetto')])
    const { r, scritto } = su(a, { chat: [] })
    expect(await r.giro()).toEqual([])
    expect(scritto()).toBeUndefined()
  })

  it('un riquadro aperto da poco resta per qualche minuto', async () => {
    const a = archivio([remota('p-1', CHIUSA, 'Appena aperta', new Date(ADESSO - 60_000).toISOString())])
    const { r } = su(a, { chat: [], salvate: [] })
    expect(await r.giro()).toEqual([])
  })

  it('i workspace a schermo non si toccano: lì giudica il riquadro stesso', async () => {
    const a = archivio([remota('p-1', CHIUSA, 'Spostamento progetto')])
    const { r, scritto } = su(a, { chat: [], salvate: [] }, new Set(['SierraDeck', 'Trading']))
    expect(await r.giro()).toEqual([])
    expect(scritto()).toBeUndefined()
  })

  it('un riquadro «remoto» che punta a questo stesso PC non si chiede a nessuno e non si tocca', async () => {
    const a = archivio([remota('p-1', CHIUSA, 'Punta qui')])
    const righe: string[] = []
    const chiesti: string[] = []
    const r = creaRispecchia({
      leggi: () => a, scrivi: () => { throw new Error('non deve scrivere') }, mostrati: () => new Set(['SierraDeck']),
      statoDi: (pc) => { chiesti.push(pc); return Promise.reject(new Error('mai')) },
      nomePc: (_id, s) => s, io: () => 'pc-portatile', log: (m) => { righe.push(m) }, adesso: () => ADESSO
    })
    expect(await r.giro()).toEqual([])
    expect(chiesti).toEqual([])
    expect(righe).toEqual([])
  })

  it('una chat la cui casa non è il PC guardato non si toglie mai, anche se là non è aperta (0.67.0)', async () => {
    const a = archivio([remota('p-1', CHIUSA, 'Casa altrove')])
    let scritto = false
    const r = creaRispecchia({
      leggi: () => a, scrivi: () => { scritto = true }, mostrati: () => new Set(['SierraDeck']),
      statoDi: () => Promise.resolve({ chat: [], salvate: [] }), nomePc: (_id, s) => s,
      casaDi: () => 'pc-altro', log: () => {}, adesso: () => ADESSO
    })
    expect(await r.giro()).toEqual([])
    expect(scritto).toBe(false)
  })

  it('una chiusura registrata là si scrive con la riga della 0.60.9', async () => {
    const a = archivio([remota('p-1', CHIUSA, 'Chiusa da te')])
    const { r, righe } = su(a, { chat: [], salvate: [], chiuse: [{ sessione: CHIUSA, il: '2026-10-12T11:00:00.000Z' }] })
    expect((await r.giro()).map((t) => t.perche)).toEqual(['chiusa'])
    expect(righe.join('\n')).toContain('chiusa sul PC di casa (Portatile')
  })
})
