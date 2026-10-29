import { describe, it, expect, vi, afterEach } from 'vitest'
import { creaSondaggio, ogni } from '../../src/renderer/state/sondaggio'

/** Un `document` finto con solo ciò che serve: nascosto o no, e l'evento del cambio. */
function documentoFinto(): { nascondi: (si: boolean) => void } {
  const ascolta = new Set<() => void>()
  const d = {
    hidden: false,
    addEventListener: (_: string, f: () => void) => { ascolta.add(f) },
    removeEventListener: (_: string, f: () => void) => { ascolta.delete(f) }
  }
  vi.stubGlobal('document', d)
  return { nascondi: (si) => { d.hidden = si; for (const f of ascolta) f() } }
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('le riletture a tempo (0.85.2)', () => {
  it('con la finestra nascosta si rilegge al più ogni `nascostaMs`, e tornata davanti subito', () => {
    vi.useFakeTimers()
    const doc = documentoFinto()
    const fn = vi.fn()
    const smetti = ogni(fn, 1000, 10_000)
    vi.advanceTimersByTime(3000)
    expect(fn).toHaveBeenCalledTimes(3)
    doc.nascondi(true)
    vi.advanceTimersByTime(5000)
    expect(fn).toHaveBeenCalledTimes(3)
    vi.advanceTimersByTime(5000)
    expect(fn).toHaveBeenCalledTimes(4)
    vi.advanceTimersByTime(1500)
    doc.nascondi(false)
    expect(fn).toHaveBeenCalledTimes(5)
    smetti()
    vi.advanceTimersByTime(5000)
    expect(fn).toHaveBeenCalledTimes(5)
  })

  it('un sondaggio fa una lettura per giro per tutti quelli che ascoltano, e smette quando non ascolta più nessuno', async () => {
    vi.useFakeTimers()
    documentoFinto()
    let n = 0
    const s = creaSondaggio(() => Promise.resolve(++n), 2000)
    const a: number[] = []
    const b: number[] = []
    const viaA = s.ascolta((v) => a.push(v))
    const viaB = s.ascolta((v) => b.push(v))
    await vi.advanceTimersByTimeAsync(0)
    expect(n).toBe(1)
    await vi.advanceTimersByTimeAsync(2000)
    expect(n).toBe(2)
    expect(a).toEqual([1, 2])
    expect(b).toEqual([1, 2])
    viaA()
    viaB()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(n).toBe(2)
  })
})
