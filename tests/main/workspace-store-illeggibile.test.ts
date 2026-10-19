import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdtempSync, readFileSync as leggiVero } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { VERSIONE_ARCHIVIO, type Archivio } from '@shared/workspace'

/**
 * 0.80.0: `workspaces.json` preso un attimo (antivirus, un'altra scrittura).
 * Prima la lettura tornava l'archivio vuoto e chi aggiungeva un workspace
 * riscriveva il file con quello solo: tutti gli altri sparivano.
 */
const guasto = { volte: 0, file: 'workspaces.json' }
vi.mock('node:fs', async (originale) => {
  const vero = await originale<typeof import('node:fs')>()
  return {
    ...vero,
    readFileSync: (...a: Parameters<typeof vero.readFileSync>) => {
      if (guasto.volte > 0 && String(a[0]).endsWith(guasto.file)) {
        guasto.volte -= 1
        throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' })
      }
      return vero.readFileSync(...a)
    }
  }
})

const { apriWorkspaceStore } = await import('../../src/main/workspace-store')
const { creaChiuseStore } = await import('../../src/main/chiuse-store')
const { annotaEliminato, leggiEliminati } = await import('../../src/main/workspace-ritrova')

const due: Archivio = {
  versione: VERSIONE_ARCHIVIO,
  attivo: 'Uno',
  workspace: [{ nome: 'Uno', perSlot: {} }, { nome: 'Due', perSlot: {} }]
}

let dir = ''
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'sd-ws-busy-')); guasto.volte = 0; guasto.file = 'workspaces.json' })

describe('workspaces.json che non si legge un istante (0.80.0)', () => {
  it('un intoppo solo: si riprova e si legge', () => {
    const a = apriWorkspaceStore(dir)
    a.scrivi(due)
    const b = apriWorkspaceStore(dir)
    guasto.volte = 1
    expect(b.leggi().workspace.map((w) => w.nome)).toEqual(['Uno', 'Due'])
  })

  it('dopo una lettura buona: torna l’ultimo letto bene, non il vuoto', () => {
    const s = apriWorkspaceStore(dir)
    s.scrivi(due)
    expect(s.leggi().workspace).toHaveLength(2)
    // Il file cambia (scritto da fuori) e poi non si legge due volte di fila.
    apriWorkspaceStore(dir).scrivi({ ...due, attivo: 'Due' })
    guasto.volte = 2
    expect(s.leggi().workspace.map((w) => w.nome)).toEqual(['Uno', 'Due'])
  })

  it('senza nessuna lettura buona: vuoto, e scrivere sopra si rifiuta finché non si legge', () => {
    apriWorkspaceStore(dir).scrivi(due)
    const s = apriWorkspaceStore(dir)
    guasto.volte = 2
    const letto = s.leggi()
    expect(letto.workspace).toEqual([])
    // Chi aggiunge un workspace a quel vuoto finto non deve cancellare gli altri.
    expect(s.scrivi({ ...letto, workspace: [{ nome: 'Nuovo', perSlot: {} }] })).toBe(false)
    const sulDisco = JSON.parse(leggiVero(join(dir, 'workspaces.json'), 'utf8')) as { workspace: { nome: string }[] }
    expect(sulDisco.workspace.map((w) => w.nome)).toEqual(['Uno', 'Due'])
    // Appena si legge, si torna a scrivere.
    expect(s.leggi().workspace).toHaveLength(2)
    expect(s.scrivi({ ...due, workspace: [...due.workspace, { nome: 'Nuovo', perSlot: {} }] })).toBe(true)
  })
})

describe('lo stesso per le chat chiuse e i workspace eliminati (0.80.0)', () => {
  it('chiuse.json che non si legge: la chiusura nuova non cancella quelle di prima', () => {
    const righe: string[] = []
    creaChiuseStore({ dati: dir, log: () => undefined }).segna('aaaaaaaa-1111-4111-8111-111111111111', 'Prima')
    const s = creaChiuseStore({ dati: dir, log: (m) => righe.push(m) })
    guasto.file = 'chiuse.json'
    guasto.volte = 2
    s.segna('bbbbbbbb-2222-4222-8222-222222222222', 'Seconda')
    expect(righe.some((r) => r.includes('non si legge'))).toBe(true)
    const sulDisco = JSON.parse(leggiVero(join(dir, 'chiuse.json'), 'utf8')) as { chiuse: { sessione: string }[] }
    expect(sulDisco.chiuse.map((c) => c.sessione)).toEqual(['aaaaaaaa-1111-4111-8111-111111111111'])
    // Appena si legge, la chiusura nuova si aggiunge alle altre.
    s.segna('bbbbbbbb-2222-4222-8222-222222222222', 'Seconda')
    expect(s.elenco().map((c) => c.sessione).sort()).toEqual(['aaaaaaaa-1111-4111-8111-111111111111', 'bbbbbbbb-2222-4222-8222-222222222222'])
  })

  it('workspaces-eliminati.json che non si legge: non si riscrive con la sola voce nuova', () => {
    annotaEliminato(dir, 'Vecchio', '2026-10-19T10:00:00.000Z')
    guasto.file = 'workspaces-eliminati.json'
    guasto.volte = 2
    annotaEliminato(dir, 'Nuovo', '2026-10-19T11:00:00.000Z')
    expect(leggiEliminati(dir).map((e) => e.nome)).toEqual(['Vecchio'])
    guasto.volte = 1
    annotaEliminato(dir, 'Nuovo', '2026-10-19T11:00:00.000Z')
    expect(leggiEliminati(dir).map((e) => e.nome)).toEqual(['Vecchio', 'Nuovo'])
  })
})
