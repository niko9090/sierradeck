import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { aggiungi, carica, controllaBozza, togli, BOZZA_VUOTA, type ApiCredenziali } from '../../src/renderer/credenziali-rete'
import { ElencoCredenziali } from '../../src/renderer/components/SezioneCredenzialiRete'
import { VOCI } from '../../src/shared/impostazioni-struttura'
import type { CredenzialeRete } from '../../src/shared/aiuto-credenziali'

const SEGRETO = 'valore-segreto-di-prova-123'

/** Una cassaforte finta che tiene anche i valori, come quella vera, ma li lascia dentro. */
function finta(): { api: ApiCredenziali; dentro: CredenzialeRete[]; arrivato: unknown[] } {
  const dentro: CredenzialeRete[] = [{ nome: 'gia-presente', tipo: 'chiave-ssh', valore: SEGRETO, serveA: ['host-di-prova'] }]
  const arrivato: unknown[] = []
  const api: ApiCredenziali = {
    // Anche se la cassaforte sbagliasse e lasciasse il valore, la vista lo deve fermare.
    elenca: async () => ({ aperta: true, voci: dentro.map((c) => ({ ...c })) as never }),
    aggiungi: async (c) => { arrivato.push(c); dentro.push(c as CredenzialeRete); return { ok: true } },
    togli: async (nome) => { const i = dentro.findIndex((c) => c.nome === nome); if (i >= 0) dentro.splice(i, 1); return i >= 0 }
  }
  return { api, dentro, arrivato }
}

describe('Credenziali di rete: schermata', () => {
  it('l’elenco porta nome, tipo e a cosa serve, mai il valore', async () => {
    const { api } = finta()
    const v = await carica(api)
    expect(v.voci).toEqual([{ nome: 'gia-presente', tipo: 'chiave-ssh', serveA: ['host-di-prova'] }])
    expect(JSON.stringify(v)).not.toContain(SEGRETO)
    const html = renderToStaticMarkup(createElement(ElencoCredenziali, { voci: v.voci }))
    expect(html).toContain('gia-presente')
    expect(html).toContain('host-di-prova')
    expect(html).not.toContain(SEGRETO)
  })

  it('aggiunge: il valore va al computer una volta, e non torna nella vista', async () => {
    const { api, arrivato } = finta()
    const r = await aggiungi(api, { ...BOZZA_VUOTA, nome: 'nuova-chiave', tipo: 'token-servizio', valore: 'altro-segreto-456', serveA: 'a, b' })
    expect(r.ok).toBe(true)
    expect(arrivato).toHaveLength(1)
    expect(r.vista?.voci.map((x) => x.nome)).toEqual(['gia-presente', 'nuova-chiave'])
    expect(r.vista?.voci.find((x) => x.nome === 'nuova-chiave')?.serveA).toEqual(['a', 'b'])
    expect(JSON.stringify(r)).not.toContain('altro-segreto-456')
    expect(renderToStaticMarkup(createElement(ElencoCredenziali, { voci: r.vista!.voci }))).not.toContain('altro-segreto-456')
  })

  it('non salva un nome storto o un valore vuoto', async () => {
    const { api, arrivato } = finta()
    expect(controllaBozza({ ...BOZZA_VUOTA, nome: 'con spazio', valore: 'x' })).toBeDefined()
    expect(controllaBozza({ ...BOZZA_VUOTA, nome: 'ok', valore: '' })).toBeDefined()
    expect((await aggiungi(api, { ...BOZZA_VUOTA, nome: 'ok', valore: '' })).ok).toBe(false)
    expect(arrivato).toHaveLength(0)
  })

  it('toglie una voce e l’elenco si aggiorna', async () => {
    const { api } = finta()
    const r = await togli(api, 'gia-presente')
    expect(r.ok).toBe(true)
    expect(r.vista.voci).toEqual([])
    expect(renderToStaticMarkup(createElement(ElencoCredenziali, { voci: r.vista.voci }))).toContain('Nessuna credenziale')
  })

  it('sta nelle impostazioni, sezione Computer, solo sul PC', () => {
    const v = VOCI.find((x) => x.id === 'credenziali-rete')
    expect(v?.sezione).toBe('computer')
    expect(v?.dove).toEqual(['pc'])
  })
})
