import { describe, it, expect } from 'vitest'
import { creaMagazzinoDrive } from '../../src/main/cassaforte/google-drive'
import { ConflittoMagazzino } from '../../src/main/cassaforte/magazzino'

/**
 * Un Google Drive finto: tiene un solo file (come appDataFolder per noi) e
 * risponde alle quattro chiamate dell'adattatore. Registra anche le richieste,
 * per controllare che vadano nel posto giusto con il token giusto.
 */
/** Legge un corpo di richiesta che può essere un flusso (upload con progresso) o un Buffer. */
async function leggiCorpo(body: unknown): Promise<Buffer> {
  if (body !== null && typeof body === 'object' && 'getReader' in body) {
    const lettore = (body as ReadableStream<Uint8Array>).getReader()
    const parti: Buffer[] = []
    for (;;) {
      const { done, value } = await lettore.read()
      if (done) break
      parti.push(Buffer.from(value))
    }
    return Buffer.concat(parti)
  }
  return Buffer.from((body ?? new Uint8Array()) as Uint8Array)
}

function driveFinto() {
  let file: { id: string; version: number; content: Buffer } | undefined
  const richieste: { url: string; metodo: string; auth?: string }[] = []

  const finto = (async (url: string | URL, init?: RequestInit): Promise<Response> => {
    const u = String(url)
    const metodo = init?.method ?? 'GET'
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization
    richieste.push({ url: u, metodo, auth })

    // Elenco in appDataFolder.
    if (metodo === 'GET' && u.startsWith('https://www.googleapis.com/drive/v3/files?')) {
      const files = file !== undefined ? [{ id: file.id, version: file.version }] : []
      return new Response(JSON.stringify({ files }), { status: 200 })
    }
    // Scarico il contenuto.
    if (metodo === 'GET' && /\/drive\/v3\/files\/[^?]+\?alt=media/.test(u)) {
      return new Response(new Uint8Array(file!.content), { status: 200 })
    }
    // Apro una sessione di upload ripristinabile (create = POST, aggiorna = PATCH):
    // rispondo con la Location della sessione, come fa Google.
    if ((metodo === 'POST' || metodo === 'PATCH') && u.includes('uploadType=resumable')) {
      if (metodo === 'POST') file = { id: 'file-1', version: file?.version ?? 0, content: Buffer.alloc(0) }
      return new Response(null, { status: 200, headers: { Location: 'https://upload.local/session/file-1' } })
    }
    // Ricevo i dati della sessione (un pezzo solo, nei test): li leggo e salvo.
    if (metodo === 'PUT' && u.includes('/session/')) {
      file!.content = await leggiCorpo(init?.body)
      file!.version += 1
      return new Response(JSON.stringify({ version: file!.version }), { status: 200 })
    }
    return new Response('boh', { status: 404 })
  }) as typeof globalThis.fetch

  return { fetch: finto, richieste, versione: () => file?.version }
}

describe('il magazzino su Google Drive', () => {
  it('vuoto restituisce undefined, poi carica e riscarica lo stesso blocco', async () => {
    const drive = driveFinto()
    const m = creaMagazzinoDrive({ token: () => Promise.resolve('TK'), fetch: drive.fetch })

    expect(await m.scarica()).toBeUndefined()

    const blocco = Buffer.from('blocco cifrato')
    const { versione } = await m.carica(blocco)
    const giu = await m.scarica()
    expect(giu?.blocco.equals(blocco)).toBe(true)
    expect(giu?.versione).toBe(versione)
  })

  it('usa la cartella privata appDataFolder e il token, in tutte le chiamate', async () => {
    const drive = driveFinto()
    const m = creaMagazzinoDrive({ token: () => Promise.resolve('TK-123'), fetch: drive.fetch })
    await m.carica(Buffer.from('x'))

    // L'elenco cerca in appDataFolder, e la creazione mette il file lì.
    expect(drive.richieste.some((r) => r.url.includes('spaces=appDataFolder'))).toBe(true)
    // Ogni chiamata alle API porta il Bearer token. Il PUT alla sessione di upload
    // no, ed è giusto: l'URL di sessione ripristinabile è già autorizzato da Google.
    expect(
      drive.richieste.filter((r) => !r.url.includes('/session/')).every((r) => r.auth === 'Bearer TK-123')
    ).toBe(true)
  })

  it('rifiuta di sovrascrivere se la versione è cambiata (concorrenza ottimista)', async () => {
    const drive = driveFinto()
    const m = creaMagazzinoDrive({ token: () => Promise.resolve('TK'), fetch: drive.fetch })

    const { versione: v1 } = await m.carica(Buffer.from('uno'))
    // Un altro PC riscrive (versione avanza).
    const { versione: v2 } = await m.carica(Buffer.from('due'), v1)
    expect(v2).not.toBe(v1)
    // Questo PC, fermo a v1, prova: rifiutato.
    await expect(m.carica(Buffer.from('mio'), v1)).rejects.toBeInstanceOf(ConflittoMagazzino)
  })

  it('un primo caricamento su un Drive dove il file c è già è un conflitto', async () => {
    const drive = driveFinto()
    const m = creaMagazzinoDrive({ token: () => Promise.resolve('TK'), fetch: drive.fetch })
    await m.carica(Buffer.from('primo'))
    // «Credo di essere il primo» (seVersione assente) ma il file esiste.
    await expect(m.carica(Buffer.from('secondo'))).rejects.toBeInstanceOf(ConflittoMagazzino)
  })
})

/** Un Drive finto per l'ARCHIVIO: più file per nome, con list/get/create/patch/delete. */
function driveArchivioFinto() {
  const files = new Map<string, { id: string; name: string; version: number; content: Buffer }>()
  let seq = 0
  const finto = (async (url: string | URL, init?: RequestInit): Promise<Response> => {
    const u = String(url); const metodo = init?.method ?? 'GET'
    // Elenco completo (elenca): fields con nextPageToken.
    if (metodo === 'GET' && u.includes('/drive/v3/files?') && u.includes('nextPageToken')) {
      return new Response(JSON.stringify({ files: [...files.values()].map((f) => ({ id: f.id, name: f.name, version: f.version })) }), { status: 200 })
    }
    // Ricerca per nome.
    if (metodo === 'GET' && u.includes('/drive/v3/files?') && u.includes("name%3D")) {
      const m = decodeURIComponent(u).match(/name='([^']+)'/)
      const nome = m?.[1]
      const f = nome !== undefined ? files.get(nome) : undefined
      return new Response(JSON.stringify({ files: f ? [{ id: f.id }] : [] }), { status: 200 })
    }
    // Scarico media.
    if (metodo === 'GET' && /\/drive\/v3\/files\/[^?]+\?alt=media/.test(u)) {
      const id = u.match(/\/files\/([^?]+)\?/)![1]
      const f = [...files.values()].find((x) => x.id === id)!
      return new Response(new Uint8Array(f.content), { status: 200 })
    }
    // Creo (solo metadati).
    if (metodo === 'POST' && u.includes('/drive/v3/files?')) {
      const body = JSON.parse(String(init!.body)) as { name: string }
      seq += 1; const id = `id-${seq}`
      files.set(body.name, { id, name: body.name, version: 0, content: Buffer.alloc(0) })
      return new Response(JSON.stringify({ id }), { status: 200 })
    }
    // Scrivo media (upload semplice).
    if (metodo === 'PATCH' && u.includes('/upload/drive/v3/files/')) {
      const id = u.match(/\/files\/([^?]+)\?/)![1]
      const f = [...files.values()].find((x) => x.id === id)!
      f.content = Buffer.from(init!.body as unknown as Uint8Array); f.version += 1
      return new Response(JSON.stringify({ version: f.version }), { status: 200 })
    }
    // Cancello.
    if (metodo === 'DELETE') {
      const id = u.match(/\/files\/([^?]+)$/)![1]
      for (const [nome, f] of files) if (f.id === id) files.delete(nome)
      return new Response(null, { status: 204 })
    }
    return new Response('boh', { status: 404 })
  }) as typeof globalThis.fetch
  return { fetch: finto, quanti: () => files.size }
}

describe('l archivio su Google Drive (per la sync incrementale)', () => {
  it('carica, riscarica, elenca e cancella per nome', async () => {
    const { creaArchivioDrive } = await import('../../src/main/cassaforte/google-drive')
    const drive = driveArchivioFinto()
    const a = creaArchivioDrive({ token: () => Promise.resolve('TK'), fetch: drive.fetch })

    expect(await a.scarica('f_uno')).toBeUndefined()
    await a.carica('f_uno', Buffer.from('primo'))
    await a.carica('f_due', Buffer.from('secondo'))
    expect((await a.scarica('f_uno'))?.toString()).toBe('primo')

    // Riscrittura dello stesso nome.
    await a.carica('f_uno', Buffer.from('primo-bis'))
    expect((await a.scarica('f_uno'))?.toString()).toBe('primo-bis')

    const elenco = await a.elenca()
    expect(elenco.has('f_uno')).toBe(true)
    expect(elenco.has('f_due')).toBe(true)

    await a.cancella('f_due')
    expect(await a.scarica('f_due')).toBeUndefined()
    expect(drive.quanti()).toBe(1)
  })
})
