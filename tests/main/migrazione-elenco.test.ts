import { describe, it, expect, beforeEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaMigrazione } from '../../src/main/migrazione-elenco'
import { parseArchivio, type Archivio } from '@shared/workspace'
import { dormienteDi, pianoMigrazione } from '@shared/migrazione-elenco'

/**
 * 0.74.1. DECISIONE DI NICHOLAS: «trasformare TUTTI i workspace, anche quelli
 * esistenti … verifica attentamente che non ci saranno problemi perché
 * rischiamo un fermo di tutti i PC». Qui: niente che lavora si tocca, copia
 * prima di cambiare, idempotente, riavvio a metà, guasto, «Torna come prima».
 */
const pane = (id: string, cwd: string, extra: Record<string, unknown> = {}) => ({ id, sessionUuid: `s-${id}`, cwd, title: `chat ${id}`, ...extra })
const ARCHIVIO = {
  versione: 1,
  attivo: 'Lavoro',
  workspace: [
    { nome: 'Lavoro', perSlot: { 1: { root: { type: 'pane', id: 'a' }, panes: [pane('a', 'E:\\p\\lavoro')] } } },
    {
      nome: 'Tante', perSlot: {
        1: { root: { type: 'split', id: 'x', direction: 'horizontal', children: [{ type: 'pane', id: 'b' }, { type: 'pane', id: 'c' }], sizes: [0.5, 0.5] }, panes: [pane('b', 'E:\\p\\tante'), pane('c', 'E:\\p\\tante.sierradeck-wt\\ap-1-c-1', { autopilota: { id: 'ap-1', chat: 'c-1' } })] },
        2: { root: { type: 'pane', id: 'd' }, panes: [pane('d', 'E:\\p\\altro', { remoto: { pcId: 'pc-2', pcNome: 'PORTATILE-ESEMPIO', cwd: 'C:\\x', sessione: 's-r' } })] }
      }
    },
    { nome: 'Vuoto', perSlot: {} },
    { nome: 'nome «strano» / con # e ünicode', perSlot: { 1: { root: { type: 'pane', id: 'e' }, panes: [pane('e', 'E:\\p\\strano')] } } }
  ]
}

let dati = ''
let elenco: string[] = []
let righe: string[] = []
const archivio = (): Archivio => parseArchivio(JSON.parse(readFileSync(join(dati, 'workspaces.json'), 'utf8'))).archivio
const istantanea = (): Record<string, string> => Object.fromEntries(['workspaces.json', 'case-chat.json', 'finestre.json', 'sottofondo.json'].map((f) => [f, readFileSync(join(dati, f), 'utf8')]))
function migrazione(guasto?: Parameters<typeof creaMigrazione>[0]['guasto']) {
  return creaMigrazione({
    dati, leggiArchivio: archivio, leggiElenco: () => [...elenco], scriviElenco: (l) => { elenco = [...l] }, log: (r) => { righe.push(r) },
    adesso: () => new Date('2026-10-15T21:00:00Z'), ...(guasto !== undefined ? { guasto } : {})
  })
}

beforeEach(() => {
  dati = mkdtempSync(join(tmpdir(), 'sd-migra-'))
  writeFileSync(join(dati, 'workspaces.json'), JSON.stringify(ARCHIVIO))
  writeFileSync(join(dati, 'case-chat.json'), '{"versione":1,"case":{}}')
  writeFileSync(join(dati, 'finestre.json'), '{"finestre":[]}')
  writeFileSync(join(dati, 'sottofondo.json'), '{"versione":1,"chat":[{"chat":"s-z","workspace":"Lavoro"}]}')
  mkdirSync(join(dati, 'autopiloti'))
  writeFileSync(join(dati, 'autopiloti', 'ap-1.json'), '{"id":"ap-1"}')
  elenco = ['Lavoro']
  righe = []
})

describe('la trasformazione di tutti i workspace di questo PC', () => {
  it('tutti a elenco, con un autopilota dormiente ciascuno; i file delle chat non cambiano di un byte', () => {
    const prima = istantanea()
    const e = migrazione().esegui()
    expect(e.esito).toBe('fatta')
    expect(elenco).toEqual(['Lavoro', 'Tante', 'Vuoto', 'nome «strano» / con # e ünicode'])
    expect(e.stato?.aggiunti).toEqual(['Tante', 'Vuoto', 'nome «strano» / con # e ünicode'])
    expect(e.stato?.dormienti).toEqual([
      { workspace: 'Lavoro', cwd: 'E:\\p\\lavoro', chat: 1 },
      // Il worktree conta per il suo progetto; la chat remota non decide la cartella.
      { workspace: 'Tante', cwd: 'E:\\p\\tante', chat: 3 },
      { workspace: 'Vuoto', chat: 0 },
      { workspace: 'nome «strano» / con # e ünicode', cwd: 'E:\\p\\strano', chat: 1 }
    ])
    expect(istantanea()).toEqual(prima)
    // Nessuna chat persa: le stesse 5 di prima, nello stesso archivio.
    expect(archivio().workspace.flatMap((w) => Object.values(w.perSlot).flatMap((l) => l.panes.map((p) => p.sessionUuid)))).toEqual(['s-a', 's-b', 's-c', 's-d', 's-e'])
    expect(righe.some((r) => r.startsWith('[migrazione] fatta: 4 workspace a elenco (3 nuovi), 5 chat'))).toBe(true)
  })

  it('prima di cambiare, la copia atomica (nessuna cartella .tmp rimasta)', () => {
    const e = migrazione().esegui()
    const copie = readdirSync(join(dati, 'copie-di-versione'))
    expect(copie).toEqual([e.stato?.copia])
    const c = join(dati, 'copie-di-versione', copie[0]!)
    expect(readdirSync(c).sort()).toEqual(['autopiloti', 'case-chat.json', 'finestre.json', 'sottofondo.json', 'workspaces.json'])
    expect(readFileSync(join(c, 'autopiloti', 'ap-1.json'), 'utf8')).toBe('{"id":"ap-1"}')
  })

  it('idempotente: al secondo avvio non rifà niente; rifatta a mano non duplica', () => {
    migrazione().esegui()
    const dopo = [...elenco]
    expect(migrazione().esegui().esito).toBe('gia')
    expect(migrazione().rifai().esito).toBe('fatta')
    expect(elenco).toEqual(dopo)
  })

  it('riavvio a metà (stato «in-corso» rimasto): si rimette com’era e si rifà da capo', () => {
    // Come se il PC si fosse spento dopo aver acceso la vista e prima di scrivere «fatta».
    expect(() => migrazione((p) => { if (p === 'dopo-elenco') throw Object.assign(new Error('spento'), { spento: true }) }).esegui()).not.toThrow()
    // Il guasto è un errore gestito: tutto com'era. Ora il caso del processo morto davvero:
    writeFileSync(join(dati, 'migrazione-elenco.json'), JSON.stringify({ versione: 1, stato: 'in-corso', iniziata: 'x', prima: { workspaceElenco: ['Lavoro'] }, aggiunti: [], dormienti: [] }))
    elenco = ['Lavoro', 'Tante']
    const e = migrazione().esegui()
    expect(e.esito).toBe('fatta')
    expect(e.stato?.prima.workspaceElenco).toEqual(['Lavoro'])
    expect(elenco).toEqual(['Lavoro', 'Tante', 'Vuoto', 'nome «strano» / con # e ünicode'])
    expect(righe.some((r) => r.includes('trovata a metà'))).toBe(true)
  })

  it('un guasto a metà: tutto com’era, stato «fallita» con il motivo nel registro, e non riprova da sola', () => {
    const prima = istantanea()
    const e = migrazione((p) => { if (p === 'dopo-elenco') throw new Error('disco pieno') }).esegui()
    expect(e.esito).toBe('fallita')
    expect(e.stato?.motivo).toBe('disco pieno')
    expect(elenco).toEqual(['Lavoro'])
    expect(istantanea()).toEqual(prima)
    expect(righe.some((r) => r === "[migrazione] non riuscita, tutto com'era prima: disco pieno")).toBe(true)
    expect(migrazione().esegui().esito).toBe('fallita')
    expect(elenco).toEqual(['Lavoro'])
    // «Rifai la trasformazione» la porta a termine.
    expect(migrazione().rifai().esito).toBe('fatta')
  })

  it('l’archivio illeggibile non ferma il programma: fallita, niente cambiato', () => {
    writeFileSync(join(dati, 'workspaces.json'), 'non è json')
    const m = creaMigrazione({ dati, leggiArchivio: () => undefined, leggiElenco: () => elenco, scriviElenco: (l) => { elenco = l }, log: (r) => { righe.push(r) } })
    expect(m.esegui().esito).toBe('fallita')
    expect(elenco).toEqual(['Lavoro'])
  })

  it('«Torna come prima»: la vista esattamente com’era, i dormienti tolti, le chat intatte; poi si può rifare', () => {
    const prima = istantanea()
    const m = migrazione()
    m.esegui()
    const r = m.tornaComePrima()
    expect(r.ok).toBe(true)
    expect(elenco).toEqual(['Lavoro'])
    expect(m.stato()?.stato).toBe('annullata')
    expect(dormienteDi(m.stato(), 'Tante')).toBeUndefined()
    expect(istantanea()).toEqual(prima)
    expect(m.esegui().esito).toBe('gia')
    expect(m.tornaComePrima().ok).toBe(false)
    expect(m.rifai().esito).toBe('fatta')
    expect(dormienteDi(m.stato(), 'Tante')?.cwd).toBe('E:\\p\\tante')
  })

  it('solo i workspace di questo PC: quelli «Su altri PC» non sono nell’archivio e non si toccano', () => {
    const p = pianoMigrazione(archivio(), [])
    expect(p.righe.map((r) => r.workspace)).toEqual(['Lavoro', 'Tante', 'Vuoto', 'nome «strano» / con # e ünicode'])
    expect(p.righe[1]!.diventa).toContain('(1 di altri PC, dal vivo)')
    expect(existsSync(join(dati, 'migrazione-elenco.json'))).toBe(false)
  })
})
