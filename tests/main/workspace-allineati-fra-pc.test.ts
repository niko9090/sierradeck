import { describe, it, expect } from 'vitest'
import { fondiArchivi } from '../../src/main/cassaforte/unioni'
import {
  aggiungiPaneA,
  parseArchivio,
  riordinaWorkspaceArchivio,
  type Archivio,
  type PaneSalvato,
  type WorkspaceSalvato
} from '@shared/workspace'

/**
 * Nicholas: «workspace non allineati fra i PC». Due cause: l'unione confrontava
 * i nomi alla lettera («Lavoro» e «lavoro » erano due voci) e l'ordine era
 * quello dell'array, diverso su ogni PC.
 */

const pane = (id: string): PaneSalvato => ({ id, sessionUuid: `uuid-${id}`, cwd: 'C:/x', title: id }) as PaneSalvato

function ws(nome: string, ...chat: string[]): WorkspaceSalvato {
  let l = { root: undefined, panes: [] } as Archivio['workspace'][number]['perSlot'][string]
  for (const c of chat) l = aggiungiPaneA(l, pane(c))
  return { nome, perSlot: { '1': l } }
}

const arch = (attivo: string, ...workspace: WorkspaceSalvato[]): Archivio => ({ versione: 1, attivo, workspace })
const nomi = (a: Archivio | undefined): string[] => (a?.workspace ?? []).map((w) => w.nome)
const chat = (a: Archivio | undefined, nome: string): string[] =>
  (a?.workspace.find((w) => w.nome === nome)?.perSlot['1']?.panes ?? []).map((p) => p.id).sort()

describe('nomi che differiscono per spazi e maiuscole', () => {
  it('una voce sola, con le chat di tutte e due, e il nome del Drive', () => {
    const pc = arch('Lavoro', ws('Lavoro', 'a'), ws('Casa', 'c'))
    const drive = arch('lavoro', ws('lavoro ', 'b'))
    for (const perDrive of [true, false]) {
      const fuso = fondiArchivi(pc, drive, 'unione', [], { perDrive })
      expect(nomi(fuso)).toHaveLength(2)
      expect(nomi(fuso)).toContain('lavoro ')
      expect(chat(fuso, 'lavoro ')).toEqual(['a', 'b'])
    }
  })

  it('spazi interni multipli: stesso workspace', () => {
    const fuso = fondiArchivi(arch('x', ws('Mio   lavoro', 'a')), arch('x', ws('mio lavoro', 'b')), 'unione', [], { perDrive: true })
    expect(nomi(fuso)).toEqual(['mio lavoro'])
    expect(chat(fuso, 'mio lavoro')).toEqual(['a', 'b'])
  })

  it('una lapide con il nome scritto diverso toglie ancora dal Drive', () => {
    const pc = arch('a', ws('a'), ws('Vecchio'))
    const drive: Archivio = { ...arch('a', ws('a')), tolti: { vecchio: { quando: '2026-09-14T10:00:00.000Z', pcId: 'A' } } }
    expect(nomi(fondiArchivi(pc, drive, 'unione', [], { perDrive: true }))).toEqual(['a'])
  })
})

describe('l\'ordine viaggia fra i PC', () => {
  it('riordino su A: dopo l\'unione sul Drive e su B l\'ordine e\' lo stesso', () => {
    const base = [ws('uno', 'a'), ws('due', 'b'), ws('tre', 'c')]
    // Stato iniziale uguale ovunque; poi A porta «tre» in testa.
    const driveVecchio = arch('uno', ...base)
    const a = riordinaWorkspaceArchivio(arch('uno', ...base), ['tre', 'uno', 'due'], '2026-11-20T10:00:00.000Z')
    const sulDrive = fondiArchivi(a, driveVecchio, 'unione', [], { perDrive: true })
    expect(nomi(sulDrive)).toEqual(['tre', 'uno', 'due'])
    // B ha ancora l'ordine vecchio e non ha mai riordinato.
    const b = arch('due', ...base)
    const dopoB = fondiArchivi(b, parseArchivio(JSON.parse(JSON.stringify(sulDrive))).archivio, 'unione', [], { io: 'B' })
    expect(nomi(dopoB)).toEqual(['tre', 'uno', 'due'])
  })

  it('vince il riordino piu\' recente, anche se e\' quello del Drive', () => {
    const base = [ws('uno'), ws('due'), ws('tre')]
    const pc = riordinaWorkspaceArchivio(arch('uno', ...base), ['due', 'tre', 'uno'], '2026-11-20T09:00:00.000Z')
    const drive = riordinaWorkspaceArchivio(arch('uno', ...base), ['tre', 'due', 'uno'], '2026-11-20T11:00:00.000Z')
    expect(nomi(fondiArchivi(pc, drive, 'unione', [], { perDrive: true }))).toEqual(['tre', 'due', 'uno'])
    expect(nomi(fondiArchivi(drive, pc, 'unione', [], { perDrive: true }))).toEqual(['tre', 'due', 'uno'])
  })

  it('l\'ordine sopravvive alla lettura e un workspace nuovo va in coda', () => {
    const a = riordinaWorkspaceArchivio(arch('uno', ws('uno'), ws('due')), ['due', 'uno'], '2026-11-20T10:00:00.000Z')
    const letto = parseArchivio(JSON.parse(JSON.stringify(a))).archivio
    expect(letto.ordine?.nomi).toEqual(['due', 'uno'])
    const fuso = fondiArchivi(letto, arch('uno', ws('uno'), ws('due'), ws('nuovo')), 'unione', [], { perDrive: true })
    expect(nomi(fuso)).toEqual(['due', 'uno', 'nuovo'])
  })
})

describe('casi di prima', () => {
  it('senza ordine registrato: PC e poi la coda del Drive', () => {
    const fuso = fondiArchivi(arch('a', ws('a'), ws('b')), arch('a', ws('c'), ws('a')), 'unione', [], { perDrive: true })
    expect(nomi(fuso)).toEqual(['a', 'b', 'c'])
  })
})
