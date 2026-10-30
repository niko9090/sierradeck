import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apriArchivio } from '../../src/autopilot-host/archivio'
import { nuovoAutopilota } from '@shared/autopilota'

/**
 * 30/10 — dopo una scrittura la cache dell'archivio resta calda: la lettura
 * successiva non rilegge il file dal disco. Si contano le letture vere.
 */

const letture = vi.hoisted(() => ({ file: [] as string[] }))

vi.mock('node:fs', async (originale) => {
  const vero = await originale<typeof import('node:fs')>()
  return {
    ...vero,
    readFileSync: (...a: Parameters<typeof vero.readFileSync>) => {
      letture.file.push(String(a[0]))
      return vero.readFileSync(...a)
    }
  }
})

const ap = (obiettivo: string) => ({
  ...nuovoAutopilota({ id: 'ap-30', nome: 'Cache', obiettivo, cwd: 'C:/p', criteri: [], iniziatoIl: '2026-10-30T08:00:00.000Z' }),
  stato: 'lavoro' as const
})

describe('archivio: la cache dopo una scrittura', () => {
  it('leggi ed elenca dopo scrivi non rileggono il file; danno un oggetto nuovo, non quello di chi ha salvato', () => {
    const cartella = mkdtempSync(join(tmpdir(), 'ap-archivio-calda-'))
    const archivio = apriArchivio(cartella)
    const a = ap('primo')
    archivio.scrivi(a)
    letture.file = []
    const letto = archivio.leggi('ap-30')!
    expect(letto.obiettivo).toBe('primo')
    expect(letto).not.toBe(a)
    expect(archivio.elenca().map((x) => x.obiettivo)).toEqual(['primo'])
    expect(letture.file.filter((f) => f.endsWith('ap-30.json'))).toEqual([])
    // Chi cambia sul posto l'oggetto salvato non cambia la cache.
    a.obiettivo = 'cambiato senza salvare'
    expect(archivio.leggi('ap-30')!.obiettivo).toBe('primo')
  })

  it('un cambio da fuori (un altro processo) si vede: la cache vale finché il file è quello scritto', async () => {
    const { writeFileSync, readFileSync } = await import('node:fs')
    const cartella = mkdtempSync(join(tmpdir(), 'ap-archivio-fuori-'))
    const archivio = apriArchivio(cartella)
    archivio.scrivi(ap('mio'))
    const file = join(cartella, 'ap-30.json')
    await new Promise((r) => setTimeout(r, 20))
    writeFileSync(file, readFileSync(file, 'utf8').replace('"mio"', '"suo, più lungo"'))
    expect(archivio.leggi('ap-30')!.obiettivo).toBe('suo, più lungo')
    // E lo stesso contenuto di prima, scritto di nuovo, si riscrive: il disco non è più quello.
    archivio.scrivi(ap('mio'))
    expect(JSON.parse(readFileSync(file, 'utf8')).obiettivo).toBe('mio')
  })
})
