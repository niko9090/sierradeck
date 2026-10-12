import { describe, it, expect } from 'vitest'
import {
  cartellaDaNomeWorkspace, cartellaVietataPerChat, conRitrovati, puntaAMe, riparaArchivio, riparaRiquadro, suAltriPc, workspaceRitrovati,
  type CopiaLista
} from '@shared/workspace-riparazioni'
import type { Archivio, PaneSalvato, WorkspaceSalvato } from '@shared/workspace'

const IO = 'pc-qui'
const ws = (nome: string, panes: PaneSalvato[] = []): WorkspaceSalvato => ({ nome, perSlot: { 1: { root: undefined, panes } } } as unknown as WorkspaceSalvato)
const archivio = (...w: WorkspaceSalvato[]): Archivio => ({ versione: 1, attivo: w[0]?.nome ?? '', workspace: w } as unknown as Archivio)

// Il caso «visitafacile» con dati d'esempio: il riquadro arrivato dal Drive guarda questo stesso PC.
const autoriferito: PaneSalvato = {
  id: 'p1', sessionUuid: 's-vuota', cwd: 'C:\\Users\\utente\\Progetti SierraDeck\\Documents', title: 'Documents',
  remoto: { pcId: IO, pcNome: 'PC-ESEMPIO', cwd: 'C:\\Users\\utente\\Documents', sessione: 's-vuota' }
}

describe('un PC non indica mai sé stesso come «altro PC»', () => {
  it('un riquadro che guarda questo PC torna locale, nella cartella dove la chat lavora davvero', () => {
    expect(puntaAMe(autoriferito, IO)).toBe(true)
    const r = riparaRiquadro(autoriferito, IO, { haChat: () => true, casaAltrove: () => undefined })
    expect(r.remoto).toBeUndefined()
    expect(r.cwd).toBe('C:\\Users\\utente\\Documents')
    expect(r.sessionUuid).toBe('s-vuota')
  })
  it('se la chat qui non c’è e la sua casa è un altro PC, guarda quello', () => {
    const r = riparaRiquadro(autoriferito, IO, { haChat: () => false, casaAltrove: () => ({ pc: 'pc-port', nome: 'PORTATILE-ESEMPIO' }) })
    expect(r.remoto).toMatchObject({ pcId: 'pc-port', pcNome: 'PORTATILE-ESEMPIO' })
  })
  it('un archivio intero: si contano i riparati, gli altri riquadri restano identici', () => {
    const giusto: PaneSalvato = { id: 'p2', sessionUuid: 's2', cwd: 'C:\\x', title: 'x', remoto: { pcId: 'pc-port', pcNome: 'P', cwd: 'C:\\x', sessione: 's2' } }
    const a = archivio(ws('visitafacile', [autoriferito]), ws('altro', [giusto]))
    const r = riparaArchivio(a, IO, { haChat: () => true, casaAltrove: () => undefined })
    expect(r.riparati).toEqual([{ workspace: 'visitafacile', sessione: 's-vuota', verso: 'locale' }])
    expect(r.archivio.workspace[1]).toBe(a.workspace[1])
    expect(riparaArchivio(archivio(ws('altro', [giusto])), IO, { haChat: () => true, casaAltrove: () => undefined }).riparati).toEqual([])
  })
})

describe('i workspace spariti si ritrovano dalle copie, senza togliere niente', () => {
  const ora = '2026-10-12T14:00:00.000Z'
  const copie: CopiaLista[] = [
    { file: '0.64.0/workspaces.json', quando: '2026-10-11T09:00:00.000Z', archivio: archivio(ws('MT5'), ws('Money'), ws('GLOS')) },
    { file: '0.64.2/workspaces.json', quando: '2026-10-12T09:00:00.000Z', archivio: archivio(ws('MT5'), ws('Money')) },
    { file: 'workspaces.prima-dell-eliminazione.json', quando: '2026-10-11T12:00:00.000Z', archivio: archivio(ws('MT5'), ws('Money'), ws('Vecchio')), primaDiEliminare: true },
    { file: 'molto-vecchia.json', quando: '2026-09-01T09:00:00.000Z', archivio: archivio(ws('Antico')) }
  ]
  it('ritrova quelli che una copia recente aveva e adesso mancano, dalla copia più recente', () => {
    const r = workspaceRitrovati(archivio(ws('GLOS')), copie, [], '2026-09-28T00:00:00.000Z')
    expect(r.map((x) => [x.nome, x.da])).toEqual([['Money', '0.64.2/workspaces.json'], ['MT5', '0.64.2/workspaces.json']])
  })
  it('non ritrova quello eliminato da Nicholas: né annotato dopo l’ultima copia, né visto per l’ultima volta prima di un’eliminazione', () => {
    const r = workspaceRitrovati(archivio(), copie, [{ nome: 'Money', quando: '2026-10-12T10:00:00.000Z' }], '2026-09-28T00:00:00.000Z')
    expect(r.map((x) => x.nome)).toEqual(['GLOS', 'MT5'])
    expect(r.some((x) => x.nome === 'Vecchio')).toBe(false)
    expect(r.some((x) => x.nome === 'Antico')).toBe(false)
  })
  it('i ritrovati si aggiungono in fondo: la lista di adesso resta com’è, nell’ordine', () => {
    const adesso = archivio(ws('GLOS'), ws('Lavoro'))
    const r = workspaceRitrovati(adesso, copie, [], ora.slice(0, 0) + '2026-09-28T00:00:00.000Z')
    const dopo = conRitrovati(adesso, r)
    expect(dopo.workspace.map((w) => w.nome)).toEqual(['GLOS', 'Lavoro', 'Money', 'MT5'])
    expect(conRitrovati(adesso, [])).toBe(adesso)
  })
})

describe('«Su altri PC», a parte', () => {
  it('i workspace degli altri PC che qui non ci sono, PC per PC; i PC senza niente di nuovo non compaiono', () => {
    const r = suAltriPc(['SierraDeck', 'MT5'], [
      { pc: 'pc-port', nome: 'PORTATILE-ESEMPIO', workspace: ['MT5', 'GLOS', 'mt5'] },
      { pc: 'pc-2', nome: 'PC-DUE', workspace: ['SierraDeck'] },
      { pc: 'pc-3', nome: 'PC-VECCHIO' }
    ])
    expect(r).toEqual([{ pc: 'pc-port', nome: 'PORTATILE-ESEMPIO', workspace: ['GLOS'] }])
  })
})

describe('creare un workspace crea il progetto: la cartella giusta', () => {
  it('il nome della cartella è quello del workspace, pulito per Windows', () => {
    expect(cartellaDaNomeWorkspace('visitafacile')).toBe('visitafacile')
    expect(cartellaDaNomeWorkspace('Cliente: Rossi / 2026?')).toBe('Cliente- Rossi - 2026-')
    expect(cartellaDaNomeWorkspace('  ...  ')).toBe('Progetto')
  })
  it('mai la cartella utente, Documenti o la radice di un disco; una loro sottocartella va bene', () => {
    const v = { casa: 'C:\\Users\\utente', documenti: 'C:\\Users\\utente\\Documents' }
    expect(cartellaVietataPerChat('C:\\Users\\utente\\Documents', v)).toBe(true)
    expect(cartellaVietataPerChat('c:/users/utente/', v)).toBe(true)
    expect(cartellaVietataPerChat('E:\\', v)).toBe(true)
    expect(cartellaVietataPerChat('', v)).toBe(true)
    expect(cartellaVietataPerChat('C:\\Users\\utente\\Documents\\visitafacile', v)).toBe(false)
    expect(cartellaVietataPerChat('C:\\Users\\utente\\Progetti SierraDeck\\visitafacile', v)).toBe(false)
  })
})
