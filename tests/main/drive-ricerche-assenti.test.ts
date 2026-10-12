import { describe, it, expect } from 'vitest'
import { creaArchivioDrive } from '../../src/main/cassaforte/google-drive'

/**
 * Il 12/10 Google ha risposto per ore «403 Quota exceeded … Total Query Cost
 * per minute per user» (fino a 751 errori in un'ora): ogni giro rileggeva file
 * che non esistono, e un «non c'è» non si ricordava. Ora si ricorda per tre
 * minuti chi legge; chi crea ricerca sempre, per non fare doppioni (0.68.0).
 */
function driveFinto() {
  const file = new Map<string, { id: string; dati: Buffer }>()
  let ricerche = 0
  let n = 0
  const fetch = (async (url: string | URL, init?: RequestInit): Promise<Response> => {
    const u = String(url)
    const metodo = init?.method ?? 'GET'
    if (metodo === 'GET' && u.includes('/files?') && u.includes('&q=')) {
      ricerche += 1
      const nome = /name%3D'([^']*)'|name='([^']*)'/.exec(decodeURIComponent(u))
      const chi = nome?.[1] ?? nome?.[2] ?? ''
      const f = file.get(chi)
      return new Response(JSON.stringify({ files: f === undefined ? [] : [{ id: f.id }] }), { status: 200 })
    }
    if (metodo === 'GET' && /\/files\/[^?]+\?alt=media/.test(u)) {
      const id = /\/files\/([^?]+)\?/.exec(u)?.[1]
      const f = [...file.values()].find((x) => x.id === id)
      return f === undefined ? new Response('no', { status: 404 }) : new Response(new Uint8Array(f.dati), { status: 200 })
    }
    if (metodo === 'POST' && u.includes('/files?fields=id')) {
      const { name } = JSON.parse(String(init?.body)) as { name: string }
      n += 1
      file.set(name, { id: `id-${n}`, dati: Buffer.alloc(0) })
      return new Response(JSON.stringify({ id: `id-${n}` }), { status: 200 })
    }
    if (metodo === 'PATCH' && u.includes('uploadType=media')) {
      const id = /\/files\/([^?]+)\?/.exec(u)?.[1]
      const f = [...file.values()].find((x) => x.id === id)
      if (f !== undefined) f.dati = Buffer.from(init?.body as Uint8Array)
      return new Response('{}', { status: 200 })
    }
    return new Response('boh', { status: 404 })
  }) as typeof globalThis.fetch
  return { fetch, file, ricerche: () => ricerche }
}

describe('le ricerche sul Drive di file che non ci sono', () => {
  it('un «non c’è» si ricorda: dieci letture, una ricerca', async () => {
    const d = driveFinto()
    const a = creaArchivioDrive({ token: async () => 't', fetch: d.fetch })
    for (let i = 0; i < 10; i += 1) expect(await a.scarica('presenza-x')).toBeUndefined()
    expect(d.ricerche()).toBe(1)
  })
  it('chi crea ricerca sempre davvero: niente doppioni se un altro PC l’ha appena creato', async () => {
    const d = driveFinto()
    const a = creaArchivioDrive({ token: async () => 't', fetch: d.fetch })
    expect(await a.scarica('posta-x')).toBeUndefined()
    // Un altro PC lo crea.
    d.file.set('posta-x', { id: 'altro', dati: Buffer.from('di là') })
    await a.carica('posta-x', Buffer.from('di qua'))
    expect([...d.file.keys()].filter((k) => k === 'posta-x')).toHaveLength(1)
    expect(d.file.get('posta-x')?.id).toBe('altro')
    // E dopo averlo scritto si legge subito, senza aspettare i tre minuti.
    expect((await a.scarica('posta-x'))?.toString()).toBe('di qua')
  })
})
