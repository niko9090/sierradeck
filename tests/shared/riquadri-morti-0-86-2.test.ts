import { describe, it, expect, vi } from 'vitest'
import { caricaSenzaRiquadriMorti, eCopiaDiLavoro, riquadriDaTogliere, togliDalLayout, type DecisoriRiquadri } from '../../src/shared/riquadri-morti'
import { creaAggancio, type AggancioDeps } from '../../src/renderer/aggancio'
import { messaggioChiusaSenzaCartella } from '../../src/shared/chiusa-senza-cartella'
import type { LayoutSalvato } from '../../src/shared/workspace'

/**
 * 0.86.2: a ogni avvio 15 `pty:spawn: CHAT_CHIUSA_SENZA_CARTELLA` e 27 ENOENT:
 * i riquadri delle chat che l'autopilota aveva gia' chiuso tornavano.
 */

const WT = 'E:\\Progetti\\SierraDeck.sierradeck-wt\\ap1-c2'

function decisori(o: Partial<DecisoriRiquadri> & { esistenti?: string[] } = {}): DecisoriRiquadri {
  const esistenti = new Set(o.esistenti ?? [])
  return {
    cartellaEsiste: o.cartellaEsiste ?? ((c) => esistenti.has(c)),
    motivoChiusa: o.motivoChiusa ?? (() => undefined),
    finitaDiAutopilota: o.finitaDiAutopilota ?? (() => false)
  }
}

describe('quali riquadri non rimontare all avvio', () => {
  it('una copia di lavoro di un autopilota che non c e\' piu\'', () => {
    expect(eCopiaDiLavoro(WT)).toBe(true)
    expect(eCopiaDiLavoro('E:\\Progetti\\SierraDeck')).toBe(false)
    const via = riquadriDaTogliere([{ sessionUuid: 's1', cwd: WT }], decisori())
    expect(via).toEqual([{ sessionUuid: 's1', perche: expect.stringContaining('copia di lavoro') }])
  })

  it('una chat chiusa (o nel recupero, o finita) con la cartella sparita: il motivo della 0.84.1', () => {
    const via = riquadriDaTogliere([{ sessionUuid: 's2', cwd: 'D:\\Sparita' }], decisori({ motivoChiusa: () => 'era chiusa e la sua cartella non c’è più' }))
    expect(via).toEqual([{ sessionUuid: 's2', perche: 'era chiusa e la sua cartella non c’è più' }])
  })

  it('una chat di autopilota che il servizio dice finita, anche se la cartella c e\'', () => {
    const via = riquadriDaTogliere(
      [{ sessionUuid: 's3', cwd: WT, autopilota: { id: 'ap1', chat: 'c2' } }],
      decisori({ esistenti: [WT], finitaDiAutopilota: (s) => s === 's3' })
    )
    expect(via.map((v) => v.sessionUuid)).toEqual(['s3'])
  })

  it('restano: una chat normale con la cartella sparita, un riquadro remoto, una viva', () => {
    const via = riquadriDaTogliere([
      { sessionUuid: 'n', cwd: 'D:\\DiscoStaccato\\Progetto' },
      { sessionUuid: 'r', cwd: WT, remoto: { pcId: 'pc2', pcNome: 'Portatile', cwd: WT } },
      { sessionUuid: 'v', cwd: 'E:\\Progetti\\Vivo', autopilota: { id: 'ap1', chat: 'c1' } }
    ], decisori({ esistenti: ['E:\\Progetti\\Vivo'], finitaDiAutopilota: () => false }))
    expect(via).toEqual([])
  })
})

describe('il layout all avvio, senza i riquadri morti', () => {
  const layout: LayoutSalvato = {
    root: { type: 'split', id: 'r', direction: 'horizontal', sizes: [0.5, 0.5], children: [{ type: 'pane', id: 'p1' }, { type: 'pane', id: 'p2' }] },
    panes: [
      { id: 'p1', sessionUuid: 'viva', cwd: 'E:\\Progetti\\Vivo', title: 'viva' },
      { id: 'p2', sessionUuid: 'morta', cwd: WT, title: 'morta' }
    ]
  }

  it('toglie i riquadri dall elenco e dall albero', () => {
    const l = togliDalLayout(layout, new Set(['morta']))
    expect(l.panes.map((p) => p.id)).toEqual(['p1'])
    expect(l.root).toEqual({ type: 'pane', id: 'p1' })
  })

  it('li congeda, cosi\' il primo salvataggio li fa uscire dall archivio', async () => {
    const congeda = vi.fn()
    const l = await caricaSenzaRiquadriMorti({
      carica: async () => layout,
      daTogliere: async () => [{ sessionUuid: 'morta', perche: 'x' }],
      congeda
    })
    expect(congeda).toHaveBeenCalledWith(['morta'])
    expect(l.panes.map((p) => p.sessionUuid)).toEqual(['viva'])
  })

  it('se il Core non risponde, il layout com era', async () => {
    const congeda = vi.fn()
    const l = await caricaSenzaRiquadriMorti({ carica: async () => layout, daTogliere: async () => { throw new Error('nessun gestore') }, congeda })
    expect(l).toBe(layout)
    expect(congeda).not.toHaveBeenCalled()
  })
})

describe('pty:spawn su una chat chiusa senza cartella: un risultato normale, non un errore', () => {
  it('il riquadro si toglie, nessun pty viene annunciato ne\' ascoltato', async () => {
    const chiuse: string[] = []
    const scritti: string[] = []
    const annunciati: string[] = []
    const esiti: unknown[] = []
    const deps: AggancioDeps = {
      dimensioni: () => ({ cols: 80, rows: 24 }),
      spawn: async () => messaggioChiusaSenzaCartella({ sessionUuid: 's9', cwd: WT, perche: 'aveva finito' }),
      attach: () => undefined, write: () => undefined, resize: () => undefined, kill: () => undefined,
      ascolta: () => () => undefined, scarta: () => undefined,
      scrivi: (t) => scritti.push(t),
      annunciaId: (id) => annunciati.push(id),
      suChiusaSenzaCartella: (c) => chiuse.push(`${c.sessionUuid}: ${c.perche}`),
      suEsito: (e) => esiti.push(e)
    }
    const a = creaAggancio(deps)
    a.avvia()
    await vi.waitFor(() => expect(chiuse).toEqual(['s9: aveva finito']))
    expect(annunciati).toEqual([])
    expect(esiti).toEqual([])
    expect(a.idCorrente()).toBeUndefined()
  })

  it('il gestore del Core restituisce il messaggio invece di lanciarlo', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const sorgente = readFileSync(join(__dirname, '../../src/main/ipc.ts'), 'utf8')
    expect(sorgente).toContain('if (perche !== undefined) return messaggioChiusaSenzaCartella(')
    expect(sorgente).not.toContain('throw new Error(messaggioChiusaSenzaCartella(')
  })
})
