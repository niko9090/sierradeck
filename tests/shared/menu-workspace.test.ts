import { describe, it, expect } from 'vitest'
import {
  azioniMenuWorkspace, filtraWorkspace, gruppiMenuWorkspace, postoTendina, recentiValidi, ricordaRecente,
  rinominaRecente, RECENTI_MAX, vociInFila
} from '../../src/shared/menu-workspace'

/** 30 workspace finti, come nella copia di prova. */
const trenta = Array.from({ length: 30 }, (_, i) => `Prova ${String(i + 1).padStart(2, '0')}`)

describe('il menu dei workspace (0.82.0): gruppi', () => {
  it('«Recenti» con dove sei in cima, poi «Questo PC» con gli altri; ognuno una volta sola', () => {
    const g = gruppiMenuWorkspace({ nomi: trenta, attivo: 'Prova 07', recenti: ['Prova 03', 'Prova 07', 'Prova 20'], nomePc: 'PC prova' })
    expect(g.map((x) => x.titolo)).toEqual(['Recenti', 'Questo PC · PC prova'])
    expect(g[0]!.voci.map((v) => v.nome)).toEqual(['Prova 07', 'Prova 03', 'Prova 20'])
    expect(g[1]!.voci).toHaveLength(27)
    const fila = vociInFila(g).map((v) => v.nome)
    expect(new Set(fila).size).toBe(30)
  })

  it('al massimo RECENTI_MAX recenti; un recente che non esiste più non c’è', () => {
    const g = gruppiMenuWorkspace({ nomi: trenta, attivo: 'Prova 01', recenti: ['Sparito', 'Prova 02', 'Prova 03', 'Prova 04', 'Prova 05', 'Prova 06', 'Prova 08'] })
    expect(g[0]!.voci.map((v) => v.nome)).toEqual(['Prova 01', 'Prova 02', 'Prova 03', 'Prova 04', 'Prova 05'])
    expect(g[0]!.voci).toHaveLength(RECENTI_MAX)
  })

  it('con pochi workspace, tutti recenti, niente «Recenti»: un gruppo solo', () => {
    const g = gruppiMenuWorkspace({ nomi: ['A', 'B'], attivo: 'A', recenti: ['B'] })
    expect(g.map((x) => x.chiave)).toEqual(['qui'])
    expect(g[0]!.voci.map((v) => v.nome)).toEqual(['A', 'B'])
  })

  it('un gruppo per ogni altro PC, con i suoi workspace che qui non ci sono', () => {
    const g = gruppiMenuWorkspace({
      nomi: ['A', 'B'], attivo: 'A',
      altrove: [{ pc: 'p2', nome: 'Portatile', workspace: ['B', 'C'] }, { pc: 'p3', nome: 'Fisso', workspace: [] }]
    })
    expect(g.map((x) => x.titolo)).toEqual(['Questo PC', 'Portatile'])
    expect(g[1]!.voci).toEqual([{ nome: 'C', qui: false, pc: { id: 'p2', nome: 'Portatile' } }])
  })

  it('la ricerca filtra tutti i gruppi, senza accenti né maiuscole; i gruppi vuoti spariscono', () => {
    const g = gruppiMenuWorkspace({
      nomi: [...trenta, 'Dèsk'], attivo: 'Prova 01', recenti: ['Prova 02'], filtro: ' DESK ',
      altrove: [{ pc: 'p2', nome: 'Portatile', workspace: ['desk di là', 'altro'] }]
    })
    expect(vociInFila(g).map((v) => v.nome)).toEqual(['Dèsk', 'desk di là'])
    expect(g.map((x) => x.chiave)).toEqual(['qui', 'pc:p2'])
    expect(gruppiMenuWorkspace({ nomi: trenta, attivo: 'Prova 01', filtro: 'zzz' })).toEqual([])
  })

  it('è una funzione sola, senza dipendenze: la pagina la riceve con toString()', () => {
    const copia = new Function(`return (${gruppiMenuWorkspace.toString()})`)() as typeof gruppiMenuWorkspace
    expect(copia({ nomi: trenta, attivo: 'Prova 05', recenti: ['Prova 09'], filtro: 'prova 0' })).toEqual(
      gruppiMenuWorkspace({ nomi: trenta, attivo: 'Prova 05', recenti: ['Prova 09'], filtro: 'prova 0' }))
    const posto = new Function(`return (${postoTendina.toString()})`)() as typeof postoTendina
    const p = { ancora: { top: 10, bottom: 30, left: 900, right: 960 }, finestra: { larghezza: 1000, altezza: 400 }, larghezza: 440 }
    expect(posto(p)).toEqual(postoTendina(p))
  })
})

describe('il menu dei workspace (0.82.0): le azioni dietro «⋯»', () => {
  it('un workspace di qui: apri, rinomina, Apri cartella, Elimina — nessuna tolta, niente più «Sposta» (0.88.0)', () => {
    const a = azioniMenuWorkspace({ nome: 'B', qui: true }, { attivo: 'A', quanti: 3 })
    expect(a.map((x) => x.azione)).toEqual(['apri', 'rinomina', 'cartella', 'elimina'])
    expect(a.every((x) => x.spenta === undefined)).toBe(true)
    expect(a.find((x) => x.azione === 'elimina')?.pericolo).toBe(true)
  })

  it('dove sei non si «apre» di nuovo; l’ultimo workspace non si elimina', () => {
    const a = azioniMenuWorkspace({ nome: 'A', qui: true }, { attivo: 'A', quanti: 1 })
    expect(a.find((x) => x.azione === 'apri')?.spenta).toBeDefined()
    expect(a.find((x) => x.azione === 'elimina')?.spenta).toContain('L’ultimo workspace')
    expect(azioniMenuWorkspace({ nome: 'A', qui: true }, { attivo: 'B', quanti: 2, cartella: false }).some((x) => x.azione === 'cartella')).toBe(false)
  })

  it('un workspace di un altro PC: Apri e Porta qui, come prima', () => {
    const a = azioniMenuWorkspace({ nome: 'C', qui: false, pc: { id: 'p2', nome: 'Portatile' } }, { attivo: 'A', quanti: 2 })
    expect(a.map((x) => x.azione)).toEqual(['apri', 'portaQui'])
    expect(a[0]!.spiega).toContain('Portatile')
  })
})

describe('il menu dei workspace (0.82.0): sempre dentro lo schermo', () => {
  const finestre = [
    { larghezza: 1920, altezza: 1080 },
    { larghezza: 800, altezza: 500 },
    { larghezza: 520, altezza: 360 },
    { larghezza: 320, altezza: 240 }
  ]
  const tasti = [
    { top: 6, bottom: 34, left: 10, right: 200 },
    { top: 6, bottom: 34, left: 700, right: 790 },
    { top: 200, bottom: 228, left: 300, right: 330 },
    { top: 320, bottom: 348, left: 480, right: 510 }
  ]

  it('per ogni finestra e ogni tasto, la tendina sta tutta dentro (con il margine)', () => {
    for (const f of finestre) {
      for (const t of tasti) {
        for (const larghezza of [440, 240]) {
          for (const altezza of [undefined, 30 * 32, 120]) {
            const p = postoTendina({ ancora: t, finestra: f, larghezza, ...(altezza !== undefined ? { altezza } : {}) })
            const caso = JSON.stringify({ f, t, larghezza, altezza, p })
            expect(p.left, caso).toBeGreaterThanOrEqual(8)
            expect(p.left + p.larghezza, caso).toBeLessThanOrEqual(f.larghezza - 8)
            expect(p.top, caso).toBeGreaterThanOrEqual(8)
            expect(p.top + p.altezzaMax, caso).toBeLessThanOrEqual(f.altezza - 8)
            expect(p.altezzaMax, caso).toBeGreaterThanOrEqual(0)
          }
        }
      }
    }
  })

  it('con tanti workspace l’altezza è quella che resta sotto il tasto, e dentro si scorre', () => {
    const p = postoTendina({ ancora: { top: 6, bottom: 34, left: 10, right: 200 }, finestra: { larghezza: 800, altezza: 500 }, larghezza: 440, altezza: 30 * 32 })
    expect(p.sopra).toBe(false)
    expect(p.top).toBe(38)
    expect(p.altezzaMax).toBe(500 - 38 - 8)
  })

  it('vicino al bordo destro si sposta a sinistra; il «⋯» si allinea al suo tasto', () => {
    expect(postoTendina({ ancora: { top: 6, bottom: 34, left: 700, right: 790 }, finestra: { larghezza: 800, altezza: 500 }, larghezza: 440 }).left).toBe(800 - 440 - 8)
    expect(postoTendina({ ancora: { top: 100, bottom: 120, left: 400, right: 420 }, finestra: { larghezza: 800, altezza: 500 }, larghezza: 240, aDestra: true }).left).toBe(420 - 240)
  })

  it('vicino al fondo si apre sopra il tasto', () => {
    const p = postoTendina({ ancora: { top: 440, bottom: 460, left: 100, right: 120 }, finestra: { larghezza: 800, altezza: 500 }, larghezza: 240, altezza: 200 })
    expect(p.sopra).toBe(true)
    expect(p.top + p.altezzaMax).toBeLessThanOrEqual(440)
    expect(p.altezzaMax).toBe(200)
  })

  it('una finestra più stretta della tendina la stringe', () => {
    expect(postoTendina({ ancora: { top: 6, bottom: 34, left: 10, right: 200 }, finestra: { larghezza: 320, altezza: 240 }, larghezza: 440 }).larghezza).toBe(320 - 16)
  })
})

describe('i recenti dei workspace', () => {
  it('in cima l’ultimo scelto, senza doppioni, al massimo cinque', () => {
    let r: string[] = []
    for (const n of ['A', 'B', 'C', 'A', 'D', 'E', 'F']) r = ricordaRecente(r, n)
    expect(r).toEqual(['F', 'E', 'D', 'A', 'C'])
    expect(ricordaRecente(r, '')).toEqual(r)
  })

  it('una rinomina tiene il posto; un file storto vale vuoto', () => {
    expect(rinominaRecente(['A', 'B', 'C'], 'B', 'Bis')).toEqual(['A', 'Bis', 'C'])
    expect(rinominaRecente(['A', 'B'], 'A', 'B')).toEqual(['B'])
    expect(recentiValidi({ no: 1 })).toEqual([])
    expect(recentiValidi(['A', 3, '', 'A', 'B', 'C', 'D', 'E', 'F'])).toEqual(['A', 'B', 'C', 'D', 'E'])
  })

  it('il filtro di sempre resta uguale', () => {
    expect(filtraWorkspace(['Dèsk', 'altro'], 'DESK')).toEqual(['Dèsk'])
  })
})
