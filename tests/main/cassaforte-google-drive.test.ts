import { describe, it, expect } from 'vitest'
import { creaMagazzinoDrive } from '../../src/main/cassaforte/google-drive'
import { ConflittoMagazzino } from '../../src/main/cassaforte/magazzino'

/**
 * Un Google Drive finto: tiene un solo file (come appDataFolder per noi) e
 * risponde alle quattro chiamate dell'adattatore. Registra anche le richieste,
 * per controllare che vadano nel posto giusto con il token giusto.
 */
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
    // Creo il file (solo metadati).
    if (metodo === 'POST' && u.startsWith('https://www.googleapis.com/drive/v3/files?')) {
      file = { id: 'file-1', version: 1, content: Buffer.alloc(0) }
      return new Response(JSON.stringify({ id: file.id }), { status: 200 })
    }
    // Riscrivo il contenuto.
    if (metodo === 'PATCH' && u.includes('/upload/drive/v3/files/')) {
      file!.content = Buffer.from(init!.body as unknown as Uint8Array)
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
    // Ogni chiamata porta il Bearer token.
    expect(drive.richieste.every((r) => r.auth === 'Bearer TK-123')).toBe(true)
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
