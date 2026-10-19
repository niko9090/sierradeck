import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** 0.80.0: il salvataggio sul Drive faceva uno `stat` alla volta su ~13.600 file. */
describe('statInParallelo (0.80.0)', () => {
  it('i risultati nell’ordine dei percorsi, undefined per un file che non c’è', async () => {
    const { statInParallelo } = await import('../../src/main/stat-in-parallelo')
    const d = mkdtempSync(join(tmpdir(), 'sd-stat-'))
    const percorsi = Array.from({ length: 40 }, (_, i) => join(d, `f${i}.txt`))
    percorsi.forEach((p, i) => { if (i !== 7) writeFileSync(p, 'x'.repeat(i)) })
    const s = await statInParallelo(percorsi)
    expect(s).toHaveLength(40)
    expect(s[7]).toBeUndefined()
    s.forEach((x, i) => { if (i !== 7) expect(x?.size).toBe(i) })
    expect(await statInParallelo([])).toEqual([])
  })

  it('mai più di sedici insieme', async () => {
    vi.resetModules()
    let inVolo = 0
    let massimo = 0
    vi.doMock('node:fs/promises', async (originale) => ({
      ...(await originale<typeof import('node:fs/promises')>()),
      stat: async () => {
        inVolo += 1
        massimo = Math.max(massimo, inVolo)
        await new Promise((r) => setTimeout(r, 2))
        inVolo -= 1
        return { size: 1 }
      }
    }))
    const { statInParallelo } = await import('../../src/main/stat-in-parallelo')
    await statInParallelo(Array.from({ length: 100 }, (_, i) => `x${i}`))
    expect(massimo).toBe(16)
    vi.doUnmock('node:fs/promises')
  })
})
