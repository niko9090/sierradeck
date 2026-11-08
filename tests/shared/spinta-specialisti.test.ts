import { describe, expect, it } from 'vitest'
import { creaCambi, creaRaggruppatore, type Timer } from '../../src/shared/spinta-specialisti'

/** Un orologio a mano: i timer scattano solo quando lo si fa avanzare. */
function orologio(): Timer<number> & { avanza: (ms: number) => void } {
  let ora = 0
  let prossimo = 1
  const voci = new Map<number, { a: number; f: () => void }>()
  return {
    imposta: (f, ms) => { const id = prossimo++; voci.set(id, { a: ora + ms, f }); return id },
    annulla: (id) => { voci.delete(id) },
    avanza: (ms) => {
      ora += ms
      for (const [id, v] of [...voci]) if (v.a <= ora) { voci.delete(id); v.f() }
    }
  }
}

describe('creaRaggruppatore', () => {
  it('molti segnali vicini fanno una spinta sola', () => {
    const o = orologio()
    let spinte = 0
    const r = creaRaggruppatore(() => { spinte++ }, { attesaMs: 300, timer: o })
    r.segna(); r.segna(); o.avanza(100); r.segna()
    expect(spinte).toBe(0)
    o.avanza(200)
    expect(spinte).toBe(1)
    expect(r.partite()).toBe(1)
  })

  it('dopo la spinta un nuovo segnale ne fa partire un\'altra', () => {
    const o = orologio()
    let spinte = 0
    const r = creaRaggruppatore(() => { spinte++ }, { attesaMs: 300, timer: o })
    r.segna(); o.avanza(300)
    r.segna(); o.avanza(300)
    expect(spinte).toBe(2)
  })

  it('ferma toglie la spinta in attesa', () => {
    const o = orologio()
    let spinte = 0
    const r = creaRaggruppatore(() => { spinte++ }, { attesaMs: 300, timer: o })
    r.segna(); r.ferma(); o.avanza(1000)
    expect(spinte).toBe(0)
  })

  it('un errore nella spinta non rompe i segnali seguenti', () => {
    const o = orologio()
    let n = 0
    const r = creaRaggruppatore(() => { n++; if (n === 1) throw new Error('prova') }, { attesaMs: 10, timer: o })
    r.segna(); o.avanza(10)
    r.segna(); o.avanza(10)
    expect(n).toBe(2)
  })
})

describe('creaCambi', () => {
  it('risponde subito se la versione è già cambiata', async () => {
    const c = creaCambi(orologio())
    const v0 = c.versione()
    c.segna()
    expect(await c.aspetta(v0)).toBe(v0 + 1)
  })

  it('aspetta un cambio e si sveglia appena arriva', async () => {
    const c = creaCambi(orologio())
    const v0 = c.versione()
    const p = c.aspetta(v0)
    c.segna()
    expect(await p).toBe(v0 + 1)
  })

  it('scaduta l\'attesa risponde con la stessa versione', async () => {
    const o = orologio()
    const c = creaCambi(o)
    const v0 = c.versione()
    const p = c.aspetta(v0, 5000)
    o.avanza(5000)
    expect(await p).toBe(v0)
  })

  it('sveglia tutti quelli che aspettano', async () => {
    const c = creaCambi(orologio())
    const v0 = c.versione()
    const a = c.aspetta(v0)
    const b = c.aspetta(v0)
    c.segna()
    expect(await Promise.all([a, b])).toEqual([v0 + 1, v0 + 1])
  })
})
