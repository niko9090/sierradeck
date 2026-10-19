import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { memoriaDiFile } from '../../src/main/memoria-di-file'
import { apriRegistroProgetti } from '../../src/main/progetti/registro'

/** 0.80.0: progetti-drive.json e pc.json si rileggevano per ogni chat a ogni /api/stato. */
let dir = ''
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'sd-memfile-')) })

describe('memoriaDiFile (0.80.0)', () => {
  it('cento letture senza cambi interpretano il file una volta sola', () => {
    const f = join(dir, 'x.json')
    writeFileSync(f, '{"a":1}')
    const interpreta = vi.fn((t: string) => JSON.parse(t) as { a: number })
    const m = memoriaDiFile(f, interpreta)
    for (let i = 0; i < 100; i += 1) expect(m.leggi()).toEqual({ a: 1 })
    expect(interpreta).toHaveBeenCalledTimes(1)
  })

  it('un file cambiato da fuori (anche della stessa lunghezza) si rilegge', () => {
    const f = join(dir, 'x.json')
    writeFileSync(f, '{"a":1}')
    const m = memoriaDiFile(f, (t) => JSON.parse(t) as { a: number })
    expect(m.leggi()).toEqual({ a: 1 })
    writeFileSync(f, '{"a":2}')
    const dopo = new Date(Date.now() + 5000)
    utimesSync(f, dopo, dopo)
    expect(m.leggi()).toEqual({ a: 2 })
  })

  it('un file che non c’è dà undefined, e quando compare si legge', () => {
    const f = join(dir, 'manca.json')
    const m = memoriaDiFile(f, (t) => JSON.parse(t) as unknown)
    expect(m.leggi()).toBeUndefined()
    writeFileSync(f, '[1]')
    expect(m.leggi()).toEqual([1])
  })

  it('il registro dei progetti: quello scritto si legge subito', () => {
    const r = apriRegistroProgetti(dir)
    expect(r.leggi().progetti).toEqual([])
    const p = { id: 'p1', nome: 'Sito', percorsi: { pc1: 'C:/sito' }, aggiuntoIl: '2026-10-19T10:00:00.000Z' }
    r.scrivi({ versione: 1, progetti: [p] })
    expect(r.leggi().progetti).toEqual([p])
    r.scrivi({ versione: 1, progetti: [] })
    expect(r.leggi().progetti).toEqual([])
  })
})
