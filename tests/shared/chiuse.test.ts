import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chiusaDopo, leggiChiuse, pota, rigaChiusaACasa, segnaChiusa, togliChiusa, CHIUSE_GIORNI } from '../../src/shared/chiuse'
import { creaChiuseStore } from '../../src/main/chiuse-store'
import { parseArchivio, VERSIONE_ARCHIVIO } from '../../src/shared/workspace'

/**
 * 0.60.9, Nicholas: «nel PC residente ho chiuso una chat e qui continua a
 * cercarla; se la chiudo sul residente deve chiudersi anche sul client».
 * Dati d'esempio.
 */
const S = '11111111-2222-4333-8444-555555555555'
const T = '66666666-7777-4888-9999-aaaaaaaaaaaa'

describe('le chiusure volute', () => {
  it('si segnano con l’ora, la più recente vince, e riaprire le toglie', () => {
    let l = segnaChiusa([], S, '2026-10-11T15:00:00.000Z')
    l = segnaChiusa(l, S, '2026-10-11T15:47:00.000Z')
    expect(l).toEqual([{ sessione: S, il: '2026-10-11T15:47:00.000Z' }])
    l = segnaChiusa(l, T, '2026-10-11T16:00:00.000Z')
    expect(togliChiusa(l, S).map((c) => c.sessione)).toEqual([T])
    // Una sessione che non è una conversazione non entra.
    expect(segnaChiusa([], 'pane-1', '2026-10-11T15:00:00.000Z')).toEqual([])
  })
  it('si dimenticano dopo trenta giorni', () => {
    const adesso = Date.parse('2026-10-11T12:00:00.000Z')
    const vecchia = new Date(adesso - (CHIUSE_GIORNI + 1) * 86_400_000).toISOString()
    expect(pota([{ sessione: S, il: vecchia }, { sessione: T, il: '2026-10-10T12:00:00.000Z' }], adesso).map((c) => c.sessione)).toEqual([T])
  })
  it('dalla rete o dal disco: solo voci valide', () => {
    expect(leggiChiuse({ chiuse: [{ sessione: S, il: '2026-10-11T15:47:00.000Z' }, { sessione: 'x', il: 'ieri' }, null] })).toEqual([{ sessione: S, il: '2026-10-11T15:47:00.000Z' }])
    expect(leggiChiuse(undefined)).toEqual([])
  })
})

describe('il riquadro che la guarda da un altro PC', () => {
  const chiuse = [{ sessione: S, il: '2026-10-11T15:47:00.000Z' }]
  it('si chiude se l’hai chiusa a casa dopo averlo aperto', () => {
    expect(chiusaDopo(chiuse, S, '2026-10-11T15:00:00.000Z')).toEqual(chiuse[0])
    // Salvato prima della 0.60.9 (senza `dal`): vale come aperto da sempre.
    expect(chiusaDopo(chiuse, S, undefined)).toEqual(chiuse[0])
  })
  it('resta se l’hai riaperto qui dopo la chiusura (vale l’ultima azione), se è un’altra chat, o se il PC è vecchio', () => {
    expect(chiusaDopo(chiuse, S, '2026-10-11T16:00:00.000Z')).toBeUndefined()
    expect(chiusaDopo(chiuse, T, undefined)).toBeUndefined()
    expect(chiusaDopo(undefined, S, undefined)).toBeUndefined()
  })
  it('la riga del registro dice dove e cosa resta', () => {
    const r = rigaChiusaACasa('PORTATILE-ESEMPIO', '2026-10-11T15:47:00.000Z')
    expect(r).toContain('chiusa sul PC di casa (PORTATILE-ESEMPIO')
    expect(r).toContain('chiudo anche qui')
    expect(r).toContain('Riprendi una conversazione')
  })
  it('il riquadro remoto salvato tiene `dal` dopo un riavvio', () => {
    const raw = {
      versione: VERSIONE_ARCHIVIO, attivo: 'A',
      workspace: [{ nome: 'A', perSlot: { '1': { root: { type: 'pane', id: 'pane-1' }, panes: [{ id: 'pane-1', sessionUuid: S, cwd: 'C:\\Progetti\\Prova', title: 'Prova', remoto: { pcId: 'pc-esempio', pcNome: 'Portatile', cwd: 'C:\\Progetti\\Prova', sessione: S, dal: '2026-10-11T15:00:00.000Z' } }] } } }]
    }
    const a = parseArchivio(raw).archivio
    const pane = a?.workspace[0]?.perSlot['1']?.panes[0]
    expect(pane?.remoto?.dal).toBe('2026-10-11T15:00:00.000Z')
  })
})

describe('il registro su disco del PC di casa', () => {
  it('sopravvive a un riavvio; riaprire la toglie; un riavvio non la scrive', () => {
    const dati = mkdtempSync(join(tmpdir(), 'sd-chiuse-'))
    const righe: string[] = []
    let ora = Date.parse('2026-10-11T15:47:00.000Z')
    const a = creaChiuseStore({ dati, log: (m) => righe.push(m), adesso: () => ora })
    a.segna(S, 'Prova', 'dal telefono')
    expect(righe.join('\n')).toContain('chiusa da te (dal telefono)')
    // «Riavvio»: un altro store sulla stessa cartella la ritrova.
    const b = creaChiuseStore({ dati, log: (m) => righe.push(m), adesso: () => ora })
    expect(b.elenco()).toEqual([{ sessione: S, il: '2026-10-11T15:47:00.000Z' }])
    ora += 60_000
    b.togli(S)
    expect(b.elenco()).toEqual([])
    expect(righe.join('\n')).toContain('riaperta: non è più «chiusa»')
    expect(creaChiuseStore({ dati, log: () => {} }).elenco()).toEqual([])
  })
})
