import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { leggiRichiestaStoria, rispostaStoria, RIGHE_STORIA_MAX } from '@shared/storia-chat'
import { rotteClient, type DipendenzeRotte } from '../../src/main/client-rotte'
import { creaServerClient } from '../../src/main/client-server'
import { apriDispositivi } from '../../src/main/dispositivi'
import { dimenticaSchermo, finestraDiPty, registraSchermo } from '../../src/renderer/schermo-terminale'

/**
 * `/api/storia` a incrementi: `dopo`, `grezze`, `tetto`, ETag. Senza i
 * parametri nuovi risponde come prima (più `tetto`), e fino a 600 righe come
 * chiede l'app 2.99.0 (erano 400: «Risalgo…» per sempre).
 */

const TOTALE = 1000
/** La finestra che darebbe il terminale: righe numerate. */
function righeDi(_id: string, da: number, quante: number): Promise<unknown> {
  const passo = Math.max(1, Math.min(quante, RIGHE_STORIA_MAX))
  const inizio = da < 0 ? Math.max(0, TOTALE - passo) : Math.min(da, TOTALE)
  const fine = Math.min(TOTALE, inizio + passo)
  const n = Array.from({ length: fine - inizio }, (_, i) => inizio + i)
  return Promise.resolve({ totale: TOTALE, da: inizio, pulite: n.map((i) => `riga ${i}`), grezze: n.map((i) => `\u001b[1mriga ${i}\u001b[0m`), continua: n.map((i) => i % 7 === 0), colonne: 100 })
}

function deps(): DipendenzeRotte {
  return {
    dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-storia-'))),
    chat: () => [{ id: 'c1', titolo: 'Prova', cwd: 'C:\\esempio', coda: ['ultima'], codaGrezza: ['ultima'] }],
    righeDi,
    autopiloti: () => Promise.resolve([]),
    domande: () => Promise.resolve([])
  } as unknown as DipendenzeRotte
}

const chiedi = async (corpo: Record<string, unknown>, cerca?: string): Promise<Record<string, unknown>> =>
  ((await rotteClient(deps())({ metodo: 'POST', percorso: '/api/storia', corpo: { chat: 'c1', ...corpo }, dispositivo: 't1', ...(cerca !== undefined ? { cerca: new URLSearchParams(cerca) } : {}) })) as { corpo: Record<string, unknown> }).corpo

describe('/api/storia come prima', () => {
  it('senza i parametri nuovi: righe e grezze, più il tetto', async () => {
    const r = await chiedi({ da: -1, quante: 150 })
    expect(r.totale).toBe(TOTALE)
    expect(r.da).toBe(TOTALE - 150)
    expect(r.righe).toHaveLength(150)
    expect(r.grezze).toHaveLength(150)
    expect(r.colonne).toBe(100)
    expect(r.tetto).toBe(RIGHE_STORIA_MAX)
  })

  it('l’app 2.99.0 che chiede 600 riceve 600: «più sopra» non resta appeso', async () => {
    const quattrocentocinquanta = await chiedi({ da: -1, quante: 450 })
    const seicento = await chiedi({ da: -1, quante: 600 })
    expect(seicento.righe).toHaveLength(600)
    expect(seicento.da).not.toBe(quattrocentocinquanta.da)
  })

  it('oltre il tetto no', async () => {
    expect((await chiedi({ da: -1, quante: 5000 })).righe).toHaveLength(RIGHE_STORIA_MAX)
  })
})

describe('/api/storia a incrementi', () => {
  it('dopo: solo le righe successive, senza grezze se non le chiedi', async () => {
    const r = await chiedi({ dopo: 989 })
    expect(r.da).toBe(990)
    expect(r.righe).toEqual(Array.from({ length: 10 }, (_, i) => `riga ${990 + i}`))
    expect(r.grezze).toBeUndefined()
    expect(r.totale).toBe(TOTALE)
    expect(r.tetto).toBe(RIGHE_STORIA_MAX)
    // Le continuazioni restano quelle vere, in fila con le righe.
    expect(r.continua).toEqual(Array.from({ length: 10 }, (_, i) => (990 + i) % 7 === 0))
  })

  it('con grezze=1 anche quelle, nello stesso pezzo', async () => {
    const r = await chiedi({ dopo: 994, grezze: 1 })
    expect(r.grezze).toEqual(Array.from({ length: 5 }, (_, i) => `\u001b[1mriga ${995 + i}\u001b[0m`))
  })

  it('niente di nuovo: righe vuote, e da al totale', async () => {
    const r = await chiedi({ dopo: TOTALE - 1 })
    expect(r.righe).toEqual([])
    expect(r.da).toBe(TOTALE)
  })

  it('un salto più lungo del tetto: arrivano le ultime, e da dice dove partono', async () => {
    const r = await chiedi({ dopo: 10 })
    expect(r.righe).toHaveLength(RIGHE_STORIA_MAX)
    expect(r.da).toBe(TOTALE - RIGHE_STORIA_MAX)
  })

  it('anche dai parametri dell’indirizzo, e dal corpo che passa dal ponte', async () => {
    expect((await chiedi({}, 'dopo=997&grezze=1')).grezze).toHaveLength(2)
    expect(leggiRichiestaStoria({ dopo: '997' }).dopo).toBe(997)
    expect(leggiRichiestaStoria({ grezze: 0 }).nuova).toBe(true)
    expect(leggiRichiestaStoria({ grezze: 0 }).grezze).toBe(false)
    expect(leggiRichiestaStoria({ da: 5, quante: 10 })).toEqual({ da: 5, quante: 10, grezze: true, nuova: false })
  })

  it('senza finestra (chat appena chiusa) usa quello che sa l’elenco', () => {
    const r = rispostaStoria('c1', { totale: 3, da: 0, pulite: ['a', 'b', 'c'], grezze: ['A', 'B', 'C'] }, leggiRichiestaStoria({ dopo: 0, grezze: 1 }))
    expect(r).toEqual({ chat: 'c1', totale: 3, da: 1, righe: ['b', 'c'], grezze: ['B', 'C'], tetto: RIGHE_STORIA_MAX })
  })
})

describe('il terminale dà fino al tetto', () => {
  it('finestraDiPty arriva a 600 righe', () => {
    // Righe vuote: conta quante ne dà, non cosa c'è scritto.
    const riga = { isWrapped: false, length: 0, getCell: () => undefined }
    registraSchermo('pty-prova-storia', () => ({ length: 800, getLine: () => riga }) as never, () => 24)
    try {
      expect(finestraDiPty('pty-prova-storia', -1, 600)?.pulite.length).toBe(600)
      expect(finestraDiPty('pty-prova-storia', -1, 5000)?.pulite.length).toBe(RIGHE_STORIA_MAX)
    } finally { dimenticaSchermo('pty-prova-storia') }
  })
})

let server: Server | undefined
afterEach(() => { server?.close(); server = undefined })

describe('ETag', () => {
  it('la stessa finestra due volte: la seconda è un 304 senza corpo', async () => {
    const d = deps()
    const chiave = d.dispositivi.accoppia(d.dispositivi.apriAccoppiamento().codice, 'telefono di esempio')?.chiave ?? ''
    server = creaServerClient({ dispositivi: d.dispositivi, rotta: rotteClient(d) })
    await new Promise<void>((r) => server?.listen(0, '127.0.0.1', () => r()))
    const porta = (server.address() as AddressInfo).port
    const manda = (etag?: string): Promise<Response> => fetch(`http://127.0.0.1:${porta}/api/storia`, {
      method: 'POST',
      headers: { 'x-sierradeck-chiave': chiave, ...(etag !== undefined ? { 'if-none-match': etag } : {}) },
      body: JSON.stringify({ chat: 'c1', dopo: 990 })
    })
    const prima = await manda()
    expect(prima.status).toBe(200)
    const etag = prima.headers.get('etag') ?? ''
    expect(etag).not.toBe('')
    const seconda = await manda(etag)
    expect(seconda.status).toBe(304)
    expect(await seconda.text()).toBe('')
  })
})
