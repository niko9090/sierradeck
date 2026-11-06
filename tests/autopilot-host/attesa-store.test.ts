import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { apriAttesa } from '../../src/autopilot-host/attesa-store'
import { giudicaGuardiaOrchestratore, motivoPostiPieni } from '../../src/autopilot-host/guardia-orchestratore'
import { passo } from '@shared/attesa-specialisti'

/** k-48: la lista su disco e il messaggio di rifiuto della guardia. */

const voce = { id: 'v-1', workspace: 'Lavoro', autopilota: 'ap-1', compito: 'k-1', descrizione: 'k-1: prima', tipo: 'sviluppatore', dal: '2026-11-06T09:00:00.000Z', priorita: 2, ordine: 4.5, prenotataFino: '2026-11-06T09:05:00.000Z', sveglie: 1 }

describe('lista d’attesa su disco', () => {
  it('quello che si scrive si rilegge da un’altra apertura, ordine e prenotazione compresi', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'ap-attesa-st-')), 'servizio', 'attesa.json')
    const a = apriAttesa(file)
    expect(a.leggi()).toEqual({ voci: [], prossimo: 1 })
    a.scrivi({ voci: [voce], prossimo: 7 })
    expect(apriAttesa(file).leggi()).toEqual({ voci: [voce], prossimo: 7 })
  })

  it('le precedenze dei workspace e le voci parcheggiate sopravvivono (k-53)', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'ap-attesa-st-')), 'attesa.json')
    const parcheggiata = { ...voce, id: 'v-2', parcheggiata: true as const, ramo: 'ap/x/k-2' }
    apriAttesa(file).scrivi({ voci: [voce, parcheggiata], prossimo: 7, precedenze: { Lavoro: 2 } })
    expect(apriAttesa(file).leggi()).toEqual({ voci: [voce, parcheggiata], prossimo: 7, precedenze: { Lavoro: 2 } })
  })

  it('un file rovinato o con voci storte non ferma il servizio', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const cartella = mkdtempSync(join(tmpdir(), 'ap-attesa-st-'))
    const rotto = join(cartella, 'rotto.json')
    writeFileSync(rotto, '{non è json')
    expect(apriAttesa(rotto).leggi()).toEqual({ voci: [], prossimo: 1 })
    const storto = join(cartella, 'storto.json')
    writeFileSync(storto, JSON.stringify({ voci: [voce, { id: 3 }, null, { id: 'x' }], prossimo: 'boh' }))
    const s = apriAttesa(storto).leggi()
    expect(s.voci).toEqual([voce])
    // Il prossimo numero d'arrivo non torna mai indietro.
    expect(s.prossimo).toBeGreaterThan(voce.ordine)
  })
})

describe('guardia: posti pieni e fila', () => {
  const RADICE = join(tmpdir(), 'principale')
  const agente = { tool_name: 'Agent', cwd: RADICE, tool_input: { subagent_type: 'sviluppatore', description: 'k-48: la lista' } }
  const base = { radice: RADICE, specialistiSulPc: 4, tettoPc: 4 }

  it('senza fila il rifiuto è quello di prima; con la fila dice il posto', () => {
    const secco = giudicaGuardiaOrchestratore(agente, base)
    expect(secco).toEqual({ ok: false, motivo: 'aspetta: troppi specialisti attivi sul PC (4 su 4). Riprova quando uno ha finito; intanto non rilanciare.' })
    const chiamate: Array<{ descrizione: string; tipo: string }> = []
    const g = giudicaGuardiaOrchestratore(agente, { ...base, fila: (r) => { chiamate.push(r); return { passa: false, posizione: 2, davanti: 1 } } })
    expect(g).toEqual({ ok: false, motivo: 'aspetta: troppi specialisti attivi sul PC (4 su 4). Sei 2° in fila: ti avviso io quando tocca a te, non rilanciare prima.' })
    expect(chiamate).toEqual([{ descrizione: 'k-48: la lista', tipo: 'sviluppatore' }])
  })

  it('la fila può far passare anche con i posti contati pieni, o rifiutare con posti liberi', () => {
    expect(giudicaGuardiaOrchestratore(agente, { ...base, fila: () => ({ passa: true }) }).ok).toBe(true)
    const g = giudicaGuardiaOrchestratore(agente, { ...base, specialistiSulPc: 3, fila: () => ({ passa: false, posizione: 1, davanti: 0 }) })
    expect(!g.ok && g.motivo).toContain('già prenotato')
    expect(motivoPostiPieni({ specialistiSulPc: 3, tettoPc: 4 }, { posizione: 3, davanti: 2 })).toContain('Sei 3° in fila')
  })

  it('la fila non è chiamata per gli altri strumenti', () => {
    const fila = vi.fn(() => ({ passa: false as const, posizione: 1, davanti: 0 }))
    expect(giudicaGuardiaOrchestratore({ tool_name: 'Read', cwd: RADICE, tool_input: {} }, { ...base, fila }).ok).toBe(true)
    expect(fila).not.toHaveBeenCalled()
  })

  it('con la richiesta vera della fila: passa dal passo puro', () => {
    const p = passo({ voci: [], prossimo: 1 }, { workspace: 'Lavoro', descrizione: 'k-48: la lista', tipo: 'sviluppatore' }, { liberi: 0, adesso: Date.UTC(2026, 10, 6), id: () => 'v-1' })
    expect(p.passa).toBe(false)
  })
})
