import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { paginaClient } from '../../src/main/client-pagina'
import { rotteClient, type DipendenzeRotte } from '../../src/main/client-rotte'
import { apriDispositivi } from '../../src/main/dispositivi'

/** k-57: la stessa impostazione sul telefono, con una rotta POST validata. */
function deps(salvate: Record<string, unknown>[]): DipendenzeRotte {
  const nulla = (): Promise<void> => Promise.resolve()
  return {
    dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-posti-'))),
    chat: () => [],
    autopiloti: () => Promise.resolve([]),
    domande: () => Promise.resolve([]),
    workspace: () => Promise.resolve({ nomi: [], attivo: '' }),
    cartelle: () => Promise.resolve([]),
    impostaPreferenze: (p: Record<string, unknown>) => { salvate.push(p); return nulla() },
    versione: '0.0.0',
    apk: () => Promise.resolve(undefined)
  } as unknown as DipendenzeRotte
}
const post = (salvate: Record<string, unknown>[], corpo: unknown) =>
  rotteClient(deps(salvate))({ metodo: 'POST', percorso: '/api/posti-chat', corpo })

describe('POST /api/posti-chat', () => {
  it('un numero valido si salva nelle preferenze', async () => {
    const s: Record<string, unknown>[] = []
    const r = await post(s, { scelti: 5 })
    expect(r.stato).toBe(200)
    expect(s).toEqual([{ postiScelti: 5 }])
  })
  it('null = Automatico', async () => {
    const s: Record<string, unknown>[] = []
    const r = await post(s, { scelti: null })
    expect(r.stato).toBe(200)
    expect(s).toHaveLength(1)
    expect(s[0]!.postiScelti).toBeUndefined()
  })
  it('fuori limite o di un altro tipo: 400 e niente salvato', async () => {
    for (const corpo of [{ scelti: 0 }, { scelti: 9 }, { scelti: 2.5 }, { scelti: '3' }, {}, undefined]) {
      const s: Record<string, unknown>[] = []
      const r = await post(s, corpo)
      expect(r.stato).toBe(400)
      expect(s).toHaveLength(0)
    }
  })
})

describe('la pagina del telefono', () => {
  const html = paginaClient()
  it('l’indicatore è un tasto che apre la finestra e chiama la rotta', () => {
    expect(html).toContain('postiApri()')
    expect(html).toContain("'/api/posti-chat', { scelti: valore }")
    expect(html).toContain('postiAutomatico()')
  })
})
