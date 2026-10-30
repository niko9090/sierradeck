import { describe, it, expect } from 'vitest'
import { conTempoLimite, conConteggio, conSegnaleDrive, creaContatoreDrive, TempoScadutoDrive } from '../../src/main/risorse'
import { creaArchivioDrive, sceltaFraDoppioni } from '../../src/main/cassaforte/google-drive'
import { ConflittoArchivio } from '../../src/main/cassaforte/archivio'
import { driveFinto } from './drive-finto-0-86'

/**
 * 0.86.2: le richieste al Drive hanno un tetto di attesa e sentono «Annulla»
 * (I2), un file nuovo nasce in una chiamata sola (M3), e fra due file con lo
 * stesso nome vale sempre lo stesso: il piu' recente non vuoto (M3).
 */
describe('il tetto di attesa delle richieste al Drive (I2)', () => {
  const appesa = (() => new Promise<Response>(() => {})) as unknown as typeof fetch

  it('una richiesta che non risponde si interrompe', async () => {
    const f = conTempoLimite(appesa, 40)
    const inizio = Date.now()
    await expect(f('https://www.googleapis.com/drive/v3/files?q=x')).rejects.toBeInstanceOf(TempoScadutoDrive)
    expect(Date.now() - inizio).toBeLessThan(2000)
  })

  it('un corpo che smette di arrivare si interrompe; uno che arriva no', async () => {
    const fermo = (async () => new Response(new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(new Uint8Array([1, 2, 3])) } // poi piu' niente
    }), { status: 200 })) as unknown as typeof fetch
    const r = await conTempoLimite(fermo, 40)('https://www.googleapis.com/drive/v3/files/x?alt=media')
    await expect(r.arrayBuffer()).rejects.toBeInstanceOf(TempoScadutoDrive)

    const lento = (async () => {
      let n = 0
      return new Response(new ReadableStream<Uint8Array>({
        async pull(c) {
          await new Promise((ok) => setTimeout(ok, 20))
          n += 1
          if (n > 4) c.close(); else c.enqueue(new Uint8Array([n]))
        }
      }), { status: 200 })
    }) as unknown as typeof fetch
    // 5 pezzi a 20 ms = 100 ms in tutto, oltre il tetto di 40: ma ogni pezzo lo riarma.
    const r2 = await conTempoLimite(lento, 40)('https://www.googleapis.com/drive/v3/files/x?alt=media')
    expect(Buffer.from(await r2.arrayBuffer())).toEqual(Buffer.from([1, 2, 3, 4]))
  })

  it('«Annulla» del lavoro ferma anche la richiesta in corso', async () => {
    const ctl = new AbortController()
    const f = conConteggio(appesa, creaContatoreDrive())
    const prova = conSegnaleDrive(ctl.signal, () => f('https://www.googleapis.com/drive/v3/files?q=x'))
    setTimeout(() => { ctl.abort(new Error('annullato')) }, 10)
    await expect(prova).rejects.toThrow('annullato')
  })

  it('l archivio ritenta una richiesta scaduta, e alla fine risponde', async () => {
    const drive = driveFinto()
    let volte = 0
    const capriccioso = (async (u: string | URL, init?: RequestInit) => {
      volte += 1
      if (volte === 1) return new Promise<Response>(() => {}) // la prima resta appesa
      return drive.fetch(u, init)
    }) as typeof fetch
    // Il tetto vero e' 60 s; qui lo si prova con il fetch gia' avvolto a 30 ms.
    const a = creaArchivioDrive({ token: async () => 'tk', fetch: conTempoLimite(capriccioso, 30) })
    drive.metti('f_uno', Buffer.from('ciao'))
    expect((await a.scarica('f_uno'))?.toString()).toBe('ciao')
    expect(volte).toBeGreaterThan(1)
  })
})

describe('creare un file e scegliere fra doppioni (M3)', () => {
  it('un file nuovo nasce in una chiamata sola, gia pieno', async () => {
    const drive = driveFinto()
    const a = creaArchivioDrive({ token: async () => 'tk', fetch: drive.fetch })
    await a.carica('f_nuovo', Buffer.from('contenuto'))
    const scritture = drive.richieste.filter((r) => r.metodo === 'POST' || r.metodo === 'PATCH')
    expect(scritture).toHaveLength(1)
    expect(scritture[0]?.url).toContain('uploadType=multipart')
    expect(drive.files.map((f) => [f.name, f.content.toString()])).toEqual([['f_nuovo', 'contenuto']])
  })

  it('fra doppioni vale il piu recente non vuoto, in qualunque ordine arrivino', () => {
    const files = [
      { id: 'b', size: '10', modifiedTime: '2026-10-30T10:00:02.000Z' },
      { id: 'c', size: '0', modifiedTime: '2026-10-30T10:00:03.000Z' },
      { id: 'a', size: '10', modifiedTime: '2026-10-30T10:00:01.000Z' }
    ]
    expect(sceltaFraDoppioni(files)?.id).toBe('b')
    expect(sceltaFraDoppioni([...files].reverse())?.id).toBe('b')
    // Tutti vuoti: il piu' recente.
    expect(sceltaFraDoppioni([{ id: 'x', size: '0', modifiedTime: '1' }, { id: 'y', size: '0', modifiedTime: '2' }])?.id).toBe('y')
  })

  it('l archivio legge e scrive sempre lo stesso doppione', async () => {
    const drive = driveFinto()
    drive.metti('f_doppio', Buffer.from('vecchio'))
    drive.metti('f_doppio', Buffer.from('nuovo'))
    drive.metti('f_doppio', Buffer.alloc(0)) // una creazione interrotta di un client vecchio
    const a = creaArchivioDrive({ token: async () => 'tk', fetch: drive.fetch })
    expect((await a.scarica('f_doppio'))?.toString()).toBe('nuovo')
    const b = creaArchivioDrive({ token: async () => 'tk', fetch: drive.fetch })
    await b.carica('f_doppio', Buffer.from('nuovissimo'))
    expect(drive.files.filter((f) => f.name === 'f_doppio').map((f) => f.content.toString())).toEqual(['vecchio', 'nuovissimo', ''])
    // E l'elenco intero sceglie lo stesso.
    const c = creaArchivioDrive({ token: async () => 'tk', fetch: drive.fetch })
    await c.elenca()
    expect((await c.scarica('f_doppio'))?.toString()).toBe('nuovissimo')
  })

  it('la scrittura condizionale rifiuta se un altro ha scritto nel frattempo', async () => {
    const drive = driveFinto()
    const a = creaArchivioDrive({ token: async () => 'tk', fetch: drive.fetch })
    const i1 = await a.caricaSe!('sierradeck.manifesto', Buffer.from('uno'), null)
    await expect(a.caricaSe!('sierradeck.manifesto', Buffer.from('due'), null)).rejects.toBeInstanceOf(ConflittoArchivio)
    const i2 = await a.caricaSe!('sierradeck.manifesto', Buffer.from('due'), i1.versione)
    expect(i2.versione).not.toBe(i1.versione)
    await expect(a.caricaSe!('sierradeck.manifesto', Buffer.from('tre'), i1.versione)).rejects.toBeInstanceOf(ConflittoArchivio)
    expect((await a.info!('sierradeck.manifesto'))?.md5).toBeDefined()
  })
})
