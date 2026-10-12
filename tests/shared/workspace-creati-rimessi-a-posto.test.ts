import { describe, it, expect } from 'vitest'
import { MAX_RIQUADRI_CREATI, progettoDallaCartella, riordinaCreatiDalProgramma, workspaceDaCreare } from '@shared/workspace-riparazioni'
import { eNomeDiSistema, gruppoDiCartella, raggruppaProgetti } from '@shared/progetti-unificati'
import type { Archivio, PaneSalvato } from '@shared/workspace'

/**
 * I workspace creati per sbaglio dalla 0.67.1 (0.67.4), con nomi d'esempio.
 * Il 12/10: «Documents» (un progetto nato da chat che lavoravano in
 * Documenti) si era preso 541 chat di «Portfolio», e «NAS-film» era nato
 * accanto a «Nas film».
 */
const pane = (s: string, cwd: string): PaneSalvato => ({ id: `p-${s}`, sessionUuid: s, cwd, title: s })
const archivio = (ws: Record<string, PaneSalvato[]>, attivo?: string): Archivio => ({
  versione: 1,
  attivo: attivo ?? Object.keys(ws)[0] ?? '',
  workspace: Object.entries(ws).map(([nome, panes]) => ({ nome, perSlot: panes.length === 0 ? {} : { 1: { root: undefined, panes } } }))
} as unknown as Archivio)
const sessioni = (a: Archivio, nome: string): string[] =>
  (a.workspace.find((w) => w.nome === nome)?.perSlot[1]?.panes ?? []).map((p) => p.sessionUuid ?? '')

describe('le cartelle di sistema non sono progetti', () => {
  it('Documents, Desktop, Downloads (anche in italiano) e la radice dei progetti', () => {
    for (const n of ['Documents', 'Documenti', 'Desktop', 'Scrivania', 'Downloads', 'Progetti SierraDeck']) expect(eNomeDiSistema(n)).toBe(true)
    for (const n of ['Portfolio', 'gen', 'NAS-film', 'fionda apl']) expect(eNomeDiSistema(n)).toBe(false)
  })
  it('una chat sotto Documenti non va al progetto «Documents» per nome', () => {
    const gruppi = raggruppaProgetti([{ id: 'pd', nome: 'Documents', percorsi: { 'pc-a': 'D:\\Progetti\\Documents' } }])
    expect(gruppoDiCartella('C:\\Utente\\Documents\\Portfolio', gruppi)).toBeUndefined()
  })
  it('non si crea un workspace per un progetto con il nome di una cartella di sistema', () => {
    const chat = [{ sessione: 's1', titolo: 'x', cwd: 'C:\\Utente\\Documents' }]
    expect(workspaceDaCreare([{ nome: 'Documents', residenteQui: true, chat }], archivio({ Lavoro: [] }), [])).toEqual([])
  })
  it('un workspace creato tiene al massimo otto chat, le più recenti (arrivano per prime)', () => {
    const chat = Array.from({ length: 20 }, (_, i) => ({ sessione: `s${i}`, titolo: `t${i}`, cwd: 'D:\\Progetti\\Portfolio' }))
    const r = workspaceDaCreare([{ nome: 'Portfolio', residenteQui: true, chat }], archivio({ Lavoro: [] }), [])
    expect(r[0]?.panes.map((p) => p.sessionUuid)).toEqual(chat.slice(0, MAX_RIQUADRI_CREATI).map((c) => c.sessione))
  })
})

describe('il progetto di una chat dalla sua cartella', () => {
  it('l’ultima cartella, se non è di sistema né la cartella utente', () => {
    expect(progettoDallaCartella('C:\\Utente\\Documents\\Portfolio')).toBe('Portfolio')
    expect(progettoDallaCartella('C:\\Utente\\Documents')).toBeUndefined()
    expect(progettoDallaCartella('C:\\Users\\qualcuno')).toBeUndefined()
    expect(progettoDallaCartella('D:\\')).toBeUndefined()
  })
})

describe('i workspace creati dal programma rimessi a posto', () => {
  const prima = archivio({ 'Nas film': [pane('n1', 'D:\\Progetti\\NAS-film')], NexoraOS: [], Predefinito: [] })
  it('il doppione per nome si unisce a quello di Nicholas, senza perdere niente e senza doppioni', () => {
    const ora = archivio({
      'Nas film': [pane('n1', 'D:\\Progetti\\NAS-film')],
      NexoraOS: [], Predefinito: [],
      'NAS-film': [pane('n1', 'D:\\Progetti\\NAS-film'), pane('n2', 'D:\\Progetti\\NAS-film')]
    })
    const r = riordinaCreatiDalProgramma(ora, prima)
    expect(r.archivio.workspace.map((w) => w.nome)).toEqual(['Nas film', 'NexoraOS', 'Predefinito'])
    expect(sessioni(r.archivio, 'Nas film')).toEqual(['n1', 'n2'])
    expect(r.fatto).toEqual([{ tipo: 'unito', da: 'NAS-film', in: 'Nas film', riquadri: 1 }])
  })
  it('«Documents» se ne va: ogni chat nel workspace del suo progetto se c’è, sennò in Predefinito; al massimo otto', () => {
    const portfolio = Array.from({ length: 12 }, (_, i) => pane(`p${i}`, 'C:\\Utente\\Documents\\Portfolio'))
    const ora = archivio({
      'Nas film': [], NexoraOS: [], Predefinito: [],
      Documents: [pane('x1', 'C:\\Utente\\Documents\\NexoraOS'), pane('d1', 'C:\\Utente\\Documents'), ...portfolio]
    }, 'Documents')
    const r = riordinaCreatiDalProgramma(ora, prima)
    expect(r.archivio.workspace.map((w) => w.nome)).toEqual(['Nas film', 'NexoraOS', 'Predefinito'])
    expect(sessioni(r.archivio, 'NexoraOS')).toEqual(['x1'])
    expect(sessioni(r.archivio, 'Predefinito')).toEqual(['d1', ...portfolio.slice(0, MAX_RIQUADRI_CREATI).map((p) => p.sessionUuid)])
    expect(r.fatto).toEqual([{ tipo: 'tolto', nome: 'Documents', spostati: [{ in: 'NexoraOS', riquadri: 1 }, { in: 'Predefinito', riquadri: 1 }, { in: 'Predefinito', riquadri: MAX_RIQUADRI_CREATI }], nonRiportati: 12 - MAX_RIQUADRI_CREATI }])
    // Era quello attivo: si passa a un altro, mai a uno che non c'è.
    expect(r.archivio.workspace.some((w) => w.nome === r.archivio.attivo)).toBe(true)
  })
  it('i workspace di Nicholas non si toccano mai, nemmeno se si chiamano «Documents»', () => {
    const suo = archivio({ Documents: [pane('d1', 'C:\\Utente\\Documents')], Predefinito: [] })
    const r = riordinaCreatiDalProgramma(suo, suo)
    expect(r.fatto).toEqual([])
    expect(r.archivio).toBe(suo)
  })
})
