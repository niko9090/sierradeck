import { describe, it, expect } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { annotaEliminato, riparaListaAllAvvio } from '../../src/main/workspace-ritrova'
import { apriWorkspaceStore } from '../../src/main/workspace-store'

/**
 * La lista dei workspace all'avvio (0.65.1), su una cartella dei dati finta:
 * un PC a cui sono spariti dei workspace (una «Porta qui» o un «Ripristina»
 * gli aveva sostituito la lista) e un riquadro che guardava sé stesso.
 */
const ws = (nome: string, panes: unknown[] = []): unknown => ({ nome, perSlot: { 1: { root: panes.length > 0 ? { type: 'pane', id: (panes[0] as { id: string }).id } : undefined, panes } } })

function banco() {
  const dati = mkdtempSync(join(tmpdir(), 'ritrova-'))
  const claude = join(dati, 'claude-projects')
  mkdirSync(join(claude, 'C--prova'), { recursive: true })
  writeFileSync(join(claude, 'C--prova', 's-vera.jsonl'), '{}\n')
  const adesso = Date.parse('2026-10-12T14:00:00Z')
  // Prima: tre workspace. Una copia di versione di stamattina li ha tutti.
  mkdirSync(join(dati, 'copie-di-versione', '0.64.2-20261012-090000'), { recursive: true })
  writeFileSync(join(dati, 'copie-di-versione', '0.64.2-20261012-090000', 'workspaces.json'), JSON.stringify({ versione: 1, attivo: 'MT5', workspace: [ws('MT5'), ws('Money'), ws('Lavoro')] }))
  // Adesso: la lista è stata sostituita, e c'è un riquadro che guarda questo PC.
  writeFileSync(join(dati, 'workspaces.json'), JSON.stringify({
    versione: 1, attivo: 'Lavoro',
    workspace: [ws('Lavoro', [{ id: 'p1', sessionUuid: 's-vera', cwd: 'C:\\finta', title: 't', remoto: { pcId: 'pc-io', pcNome: 'IO', cwd: 'C:\\prova', sessione: 's-vera' } }])]
  }))
  return { dati, claude, adesso, store: apriWorkspaceStore(dati) }
}

describe('all’avvio la lista dei workspace si ripara da sola, senza togliere niente', () => {
  it('ritrova i workspace spariti dalla copia, ripara il riquadro che guarda sé stesso, tiene una copia di com’era', () => {
    const b = banco()
    const righe: string[] = []
    const e = riparaListaAllAvvio({ dati: b.dati, store: b.store, io: { id: 'pc-io', nome: 'IO' }, radiceProgetti: b.claude, log: (m) => { righe.push(m) }, adesso: () => b.adesso })
    expect(e.ritrovati.map((x) => x.nome)).toEqual(['Money', 'MT5'])
    expect(e.riparati).toEqual([{ workspace: 'Lavoro', sessione: 's-vera', verso: 'locale' }])
    const dopo = b.store.leggi()
    expect(dopo.workspace.map((w) => w.nome)).toEqual(['Lavoro', 'Money', 'MT5'])
    expect(dopo.workspace[0]!.perSlot[1]!.panes[0]!.remoto).toBeUndefined()
    expect(dopo.workspace[0]!.perSlot[1]!.panes[0]!.cwd).toBe('C:\\prova')
    expect(existsSync(join(b.dati, 'workspaces.prima-della-riparazione.json'))).toBe(true)
    expect(JSON.parse(readFileSync(join(b.dati, 'workspaces.prima-della-riparazione.json'), 'utf8')).workspace).toHaveLength(1)
    expect(righe.join('\n')).toContain('ritrovato «Money»')
    // La seconda volta non c'è più niente da fare.
    expect(riparaListaAllAvvio({ dati: b.dati, store: b.store, io: { id: 'pc-io', nome: 'IO' }, radiceProgetti: b.claude, log: () => {}, adesso: () => b.adesso })).toEqual({ ritrovati: [], riparati: [] })
  })

  it('un workspace eliminato da Nicholas non torna', () => {
    const b = banco()
    annotaEliminato(b.dati, 'Money', '2026-10-12T10:00:00.000Z')
    const e = riparaListaAllAvvio({ dati: b.dati, store: b.store, io: { id: 'pc-io', nome: 'IO' }, radiceProgetti: b.claude, log: () => {}, adesso: () => b.adesso })
    expect(e.ritrovati.map((x) => x.nome)).toEqual(['MT5'])
  })
})
