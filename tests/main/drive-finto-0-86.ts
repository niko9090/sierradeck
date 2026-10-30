import { createHash } from 'node:crypto'

/**
 * Un Google Drive finto per l'archivio (0.86.2), un po' piu' vero di quelli
 * che c'erano: piu' file con lo stesso nome (Drive non ha nomi unici),
 * `version` che sale a ogni scrittura, `md5Checksum`, `modifiedTime`, la
 * creazione multipart in una chiamata, e una pausa facoltativa dentro ogni
 * risposta per far incrociare due PC. Niente dati veri.
 */
export type FileFinto = { id: string; name: string; version: number; content: Buffer; modifiedTime: string }

export function driveFinto(opz: { pausaMs?: number } = {}) {
  const files: FileFinto[] = []
  let seq = 0
  let orologio = Date.parse('2026-10-30T10:00:00.000Z')
  const ora = (): string => { orologio += 1000; return new Date(orologio).toISOString() }
  const richieste: { metodo: string; url: string }[] = []
  const pausa = (): Promise<void> => new Promise((r) => setTimeout(r, opz.pausaMs ?? 0))
  const descrivi = (f: FileFinto): Record<string, unknown> => ({
    id: f.id, name: f.name, version: String(f.version), size: String(f.content.length),
    modifiedTime: f.modifiedTime, md5Checksum: createHash('md5').update(f.content).digest('hex')
  })

  const fetch = (async (url: string | URL, init?: RequestInit): Promise<Response> => {
    const u = String(url)
    const metodo = init?.method ?? 'GET'
    richieste.push({ metodo, url: u })
    await pausa()
    if (metodo === 'GET' && u.includes('/drive/v3/files?')) {
      const nome = /name='([^']+)'/.exec(decodeURIComponent(u))?.[1]
      const scelti = nome === undefined ? files : files.filter((f) => f.name === nome)
      return new Response(JSON.stringify({ files: scelti.map(descrivi) }), { status: 200 })
    }
    if (metodo === 'GET' && /\/drive\/v3\/files\/[^?]+\?alt=media/.test(u)) {
      const id = /\/files\/([^?]+)\?/.exec(u)![1]
      const f = files.find((x) => x.id === id)
      return f === undefined ? new Response('{"error":{"message":"not found"}}', { status: 404 }) : new Response(new Uint8Array(f.content), { status: 200 })
    }
    if (metodo === 'POST' && u.includes('uploadType=multipart')) {
      const confine = /boundary=([^;]+)/.exec(String((init!.headers as Record<string, string>)['Content-Type']))![1]!
      const corpo = Buffer.from(init!.body as unknown as Uint8Array).toString('latin1')
      const parti = corpo.split(`--${confine}`)
      const meta = JSON.parse(parti[1]!.split('\r\n\r\n')[1]!.trim()) as { name: string }
      const dati = parti[2]!.slice(parti[2]!.indexOf('\r\n\r\n') + 4, -2)
      seq += 1
      const f: FileFinto = { id: `id-${seq}`, name: meta.name, version: 1, content: Buffer.from(dati, 'latin1'), modifiedTime: ora() }
      files.push(f)
      return new Response(JSON.stringify(descrivi(f)), { status: 200 })
    }
    if (metodo === 'PATCH' && u.includes('uploadType=media')) {
      const id = /\/files\/([^?]+)\?/.exec(u)![1]
      const f = files.find((x) => x.id === id)
      if (f === undefined) return new Response('{"error":{"message":"not found"}}', { status: 404 })
      f.content = Buffer.from(init!.body as unknown as Uint8Array)
      f.version += 1
      f.modifiedTime = ora()
      return new Response(JSON.stringify(descrivi(f)), { status: 200 })
    }
    if (metodo === 'DELETE') {
      const id = /\/files\/([^?]+)$/.exec(u)![1]
      const i = files.findIndex((x) => x.id === id)
      if (i >= 0) files.splice(i, 1)
      return new Response(null, { status: 204 })
    }
    return new Response('boh', { status: 404 })
  }) as typeof globalThis.fetch

  /** Un file messo a mano, come lo lascerebbe un altro client (anche vuoto, o doppione). */
  const metti = (name: string, content: Buffer): FileFinto => {
    seq += 1
    const f: FileFinto = { id: `id-${seq}`, name, version: 1, content, modifiedTime: ora() }
    files.push(f)
    return f
  }
  return { fetch, files, richieste, metti }
}
