import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fondiArchivi } from '../../src/main/cassaforte/unioni'
import { ordineValido, spostaDiUno, spostaPrima, stessoOrdine, trascinaSu } from '../../src/shared/riordina-workspace'
import { riordinaWorkspaceArchivio, type Archivio } from '../../src/shared/workspace'

/**
 * k-166w3: riordinare i workspace dal menu (trascinamento e tasti su/giù), con
 * l'ordine che viaggia sul Drive nel campo `ordine`.
 */
const leggi = (p: string): string => readFileSync(p, 'utf8')
const arch = (...nomi: string[]): Archivio => ({ versione: 1, attivo: nomi[0] ?? '', workspace: nomi.map((nome) => ({ nome, perSlot: {} })) })
const nomiDi = (a: Archivio | undefined): string[] => (a?.workspace ?? []).map((w) => w.nome)

describe('spostaDiUno', () => {
  it('scambia con il vicino', () => {
    expect(spostaDiUno(['A', 'B', 'C'], 'B', 'su')).toEqual(['B', 'A', 'C'])
    expect(spostaDiUno(['A', 'B', 'C'], 'B', 'giu')).toEqual(['A', 'C', 'B'])
  })
  it('ai bordi non cambia niente', () => {
    expect(spostaDiUno(['A', 'B'], 'A', 'su')).toEqual(['A', 'B'])
    expect(spostaDiUno(['A', 'B'], 'B', 'giu')).toEqual(['A', 'B'])
  })
  it('con i visibili scambia con il vicino che si vede', () => {
    expect(spostaDiUno(['A', 'R', 'B', 'C'], 'B', 'su', ['A', 'B', 'C'])).toEqual(['B', 'R', 'A', 'C'])
  })
  it('un nome che non c’è lascia l’elenco com’è', () => {
    expect(spostaDiUno(['A', 'B'], 'Z', 'su')).toEqual(['A', 'B'])
  })
})

describe('trascinamento', () => {
  it('verso l’alto va prima del bersaglio, verso il basso dopo', () => {
    expect(trascinaSu(['A', 'B', 'C'], 'C', 'A')).toEqual(['C', 'A', 'B'])
    expect(trascinaSu(['A', 'B', 'C'], 'A', 'B')).toEqual(['B', 'A', 'C'])
  })
  it('si arriva anche in fondo', () => {
    expect(trascinaSu(['A', 'B', 'C'], 'A', 'C')).toEqual(['B', 'C', 'A'])
  })
  it('su se stesso o su uno sconosciuto non cambia niente', () => {
    expect(trascinaSu(['A', 'B'], 'A', 'A')).toEqual(['A', 'B'])
    expect(trascinaSu(['A', 'B'], 'A', 'Z')).toEqual(['A', 'B'])
  })
  it('spostaPrima senza bersaglio mette in fondo', () => {
    expect(spostaPrima(['A', 'B', 'C'], 'A', undefined)).toEqual(['B', 'C', 'A'])
    expect(stessoOrdine(['A'], ['A'])).toBe(true)
  })
})

describe('ordineValido', () => {
  it('scarta ignoti e doppioni, e rimette in coda i mancanti nell’ordine di prima', () => {
    expect(ordineValido(['A', 'B', 'C', 'D'], ['C', 'X', 'C', 'A'])).toEqual(['C', 'A', 'B', 'D'])
  })
  it('riconosce lo stesso nome per spazi e maiuscole', () => {
    expect(ordineValido(['Lavoro', 'Casa'], ['casa ', 'lavoro'])).toEqual(['Casa', 'Lavoro'])
  })
})

describe('l’ordine salvato e portato agli altri PC', () => {
  it('riordinaWorkspaceArchivio mette l’ordine nell’archivio, i senza ordine in fondo come prima', () => {
    const a = riordinaWorkspaceArchivio(arch('A', 'B', 'C', 'D'), ['C', 'A'], '2026-11-20T10:00:00.000Z')
    expect(nomiDi(a)).toEqual(['C', 'A', 'B', 'D'])
    expect(a.ordine).toEqual({ nomi: ['C', 'A', 'B', 'D'], quando: '2026-11-20T10:00:00.000Z' })
  })
  it('un riordino fatto qui, più recente, vince sul Drive e arriva agli altri PC', () => {
    const qui = riordinaWorkspaceArchivio(arch('A', 'B', 'C'), ['C', 'B', 'A'], '2026-11-20T12:00:00.000Z')
    const drive = riordinaWorkspaceArchivio(arch('A', 'B', 'C'), ['A', 'B', 'C'], '2026-11-19T12:00:00.000Z')
    const fuso = fondiArchivi(qui, drive, 'unione', [], { perDrive: true })
    expect(nomiDi(fuso)).toEqual(['C', 'B', 'A'])
    // L'altro PC, che ha l'ordine vecchio, riceve quello nuovo.
    const altro = fondiArchivi(drive, fuso, 'unione', [], { perDrive: false })
    expect(nomiDi(altro)).toEqual(['C', 'B', 'A'])
  })
})

describe('collegamenti nel codice (i test leggono i file come testo)', () => {
  const menu = leggi('src/renderer/components/MenuWorkspace.tsx')
  const ipc = leggi('src/main/ipc.ts')
  const preload = leggi('src/preload/index.ts')
  const indice = leggi('src/main/index.ts')
  it('il menu si trascina e ha ▲▼ e Alt+frecce', () => {
    expect(menu).toContain('draggable={spostabile}')
    expect(menu).toContain('trascinaSu(')
    expect(menu).toContain('e.altKey')
    expect(menu).toContain('Sposta «${v.nome}» più su')
    expect(menu).toContain('Sposta «${v.nome}» più giù')
    expect(menu).toContain('window.gestore.workspace.riordina(')
  })
  it('l’azione in main salva l’ordine e fa partire la sincronizzazione', () => {
    expect(ipc).toContain("ipcMain.handle('workspace:riordina'")
    expect(ipc).toContain('riordinaWorkspaceArchivio(')
    expect(ipc).toContain('elimina.ordine?.()')
    expect(preload).toContain("ipcRenderer.invoke('workspace:riordina'")
    expect(indice).toContain('sincronia.driveAttivo()')
    expect(indice).toContain('ordine: async () =>')
  })
})
