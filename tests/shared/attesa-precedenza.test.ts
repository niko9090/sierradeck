import { describe, it, expect } from 'vitest'
import {
  PRIORITA_MAX, assegna, attesaVuota, cambiaPrecedenzaWorkspace, inFila, parcheggia, passo, rivedi, type RichiestaSpecialista, type StatoAttesa
} from '@shared/attesa-specialisti'

/**
 * k-53: la precedenza di un workspace (cambia solo l'ordine di chi aspetta) e
 * «Ferma e metti in cima» (il parcheggio, davanti a tutti). Funzioni pure.
 */

const T0 = Date.UTC(2026, 10, 6, 9, 0)
let n = 0
const id = (): string => { n += 1; return `v-${n}` }
const rich = (workspace: string, descrizione: string): RichiestaSpecialista => ({ workspace, tipo: 'sviluppatore', descrizione })

function coda(...r: Array<[string, string]>): StatoAttesa {
  let s = attesaVuota()
  for (const [w, d] of r) s = passo(s, rich(w, d), { liberi: 0, adesso: T0, id }).mossa.stato
  return s
}
const ordine = (s: StatoAttesa): Array<string | undefined> => inFila(s, T0).map((v) => v.compito)

describe('precedenza di un workspace', () => {
  it('«in cima» porta le sue voci davanti agli altri, e quelle nuove ci partono', () => {
    let s = coda(['A', 'k-1: a'], ['B', 'k-2: b'], ['C', 'k-3: c'])
    s = cambiaPrecedenzaWorkspace(s, 'C', 'cima')
    expect(ordine(s)).toEqual(['k-3', 'k-1', 'k-2'])
    // Una voce nuova di C parte con la sua precedenza: passa davanti ad A e B arrivati prima.
    s = passo(s, rich('C', 'k-4: altra di c'), { liberi: 0, adesso: T0, id }).mossa.stato
    expect(ordine(s)).toEqual(['k-3', 'k-4', 'k-1', 'k-2'])
  })

  it('anche un workspace senza voci in fila prende la precedenza per quando arriverà', () => {
    let s = coda(['A', 'k-1: a'])
    s = cambiaPrecedenzaWorkspace(s, 'B', 'su')
    expect(s.precedenze).toEqual({ B: 1 })
    s = passo(s, rich('B', 'k-2: b'), { liberi: 0, adesso: T0, id }).mossa.stato
    expect(ordine(s)).toEqual(['k-2', 'k-1'])
  })

  it('«giù» la abbassa fino a toglierla; un secondo «in cima» non sale oltre chi è già primo', () => {
    let s = cambiaPrecedenzaWorkspace(coda(['A', 'k-1: a'], ['B', 'k-2: b']), 'B', 'cima')
    expect(s.precedenze).toEqual({ B: 1 })
    s = cambiaPrecedenzaWorkspace(s, 'B', 'cima')
    expect(s.precedenze).toEqual({ B: 1 })
    s = cambiaPrecedenzaWorkspace(s, 'B', 'giu')
    expect(s.precedenze).toEqual({})
    expect(ordine(s)).toEqual(['k-1', 'k-2'])
  })

  it('resta nei limiti', () => {
    let s = attesaVuota()
    for (let i = 0; i < PRIORITA_MAX + 5; i += 1) s = cambiaPrecedenzaWorkspace(s, 'A', 'su')
    expect(s.precedenze).toEqual({ A: PRIORITA_MAX })
  })

  it('cambia solo l’ordine di chi aspetta: non tocca altro della lista né dei posti', () => {
    const prima = coda(['A', 'k-1: a'], ['B', 'k-2: b'])
    const dopo = cambiaPrecedenzaWorkspace(prima, 'B', 'cima')
    expect(dopo.voci.map((v) => v.id).sort()).toEqual(prima.voci.map((v) => v.id).sort())
    expect(dopo.voci.every((v) => v.prenotataFino === undefined)).toBe(true)
    // Al primo posto libero passa il suo workspace, non gli altri.
    const m = assegna(dopo, 1, T0)
    expect(m.svegli.map((v) => v.compito)).toEqual(['k-2'])
  })
})

describe('«Ferma e metti in cima» (parcheggio)', () => {
  it('lo specialista fermato entra in fila davanti a tutti, col suo ramo', () => {
    let s = cambiaPrecedenzaWorkspace(coda(['A', 'k-1: a'], ['B', 'k-2: b']), 'B', 'cima')
    s = parcheggia(s, { ...rich('C', 'k-9: fermato'), compito: 'k-9', ramo: 'ap/x/k-9' }, { adesso: T0, id })
    const f = inFila(s, T0)
    expect(f.map((v) => v.compito)).toEqual(['k-9', 'k-2', 'k-1'])
    expect(f[0]).toMatchObject({ parcheggiata: true, ramo: 'ap/x/k-9', posizione: 1 })
  })

  it('un secondo parcheggiato va davanti anche al primo; la stessa richiesta non si duplica', () => {
    let s = parcheggia(coda(['A', 'k-1: a']), { ...rich('B', 'k-5: uno'), compito: 'k-5' }, { adesso: T0, id })
    s = parcheggia(s, { ...rich('B', 'k-6: due'), compito: 'k-6' }, { adesso: T0, id })
    expect(ordine(s)).toEqual(['k-6', 'k-5', 'k-1'])
    s = parcheggia(s, { ...rich('B', 'k-5: uno'), compito: 'k-5', ramo: 'r' }, { adesso: T0, id })
    expect(ordine(s)).toEqual(['k-5', 'k-6', 'k-1'])
    expect(s.voci).toHaveLength(3)
  })

  it('quando si libera un posto riparte per primo, e se rilancia passa dalla guardia come ogni voce prenotata', () => {
    let s = parcheggia(coda(['A', 'k-1: a']), { ...rich('B', 'k-5: fermato'), compito: 'k-5' }, { adesso: T0, id })
    const m = rivedi(s, 1, T0)
    expect(m.svegli.map((v) => v.compito)).toEqual(['k-5'])
    s = m.stato
    const p = passo(s, rich('B', 'k-5: fermato'), { liberi: 1, adesso: T0 + 1000, id })
    expect(p.passa).toBe(true)
  })
})
