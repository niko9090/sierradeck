import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apriDispositivi } from '../../src/main/dispositivi'
import { scollegaTelefono } from '../../src/main/scollega-telefono'
import { rotteClient } from '../../src/main/client-rotte'

/** Due telefoni accoppiati a un PC di prova. */
function conDueTelefoni(): { d: ReturnType<typeof apriDispositivi>; uno: string; due: string } {
  const d = apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-scollega-')))
  const a = d.apriAccoppiamento()
  const uno = d.accoppia(a.codice, 'Telefono uno')!.id
  const b = d.apriAccoppiamento()
  const due = d.accoppia(b.codice, 'Telefono due')!.id
  return { d, uno, due }
}

describe('il telefono si toglie da solo dall’elenco del PC', () => {
  it('toglie sé stesso e nessun altro', () => {
    const { d, uno, due } = conDueTelefoni()
    expect(scollegaTelefono(uno, false, d)).toEqual({ stato: 200, corpo: { fatto: true } })
    expect(d.elenca().map((x) => x.id)).toEqual([due])
    // Già tolto: non c'è più.
    expect(scollegaTelefono(uno, false, d).stato).toBe(404)
  })
  it('mai un altro PC, il ponte, lo schermo del PC o chi non si sa', () => {
    const { d } = conDueTelefoni()
    for (const [chi, altro] of [['pc', true], ['pc:tel:x@lap', true], ['locale', false], [undefined, false]] as const) {
      expect(scollegaTelefono(chi, altro, d).stato, String(chi)).toBe(403)
    }
    expect(d.elenca()).toHaveLength(2)
  })
  it('dalla rotta: POST /api/scollega con la chiave del telefono', async () => {
    const { d, uno, due } = conDueTelefoni()
    const rotte = rotteClient({ dispositivi: d } as never)
    expect((await rotte({ metodo: 'POST', percorso: '/api/scollega', corpo: {}, dispositivo: 'pc:lap' })).stato).toBe(403)
    const e = await rotte({ metodo: 'POST', percorso: '/api/scollega', corpo: { id: due }, dispositivo: uno })
    expect(e).toEqual({ stato: 200, corpo: { fatto: true } })
    // Il corpo non sceglie chi togliere: se ne va solo chi chiede.
    expect(d.elenca().map((x) => x.id)).toEqual([due])
  })
})
