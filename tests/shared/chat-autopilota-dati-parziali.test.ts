import { describe, it, expect } from 'vitest'
import { conversazione, staPensando, haDomandaAperta } from '@shared/chat-autopilota'
import { diario } from '@shared/diario-autopilota'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'

// Un autopilota arrivato da un altro PC o da un file di una versione più
// vecchia può non avere gli elenchi: si legge come vuoto, senza eccezioni.
function senza(...campi: (keyof Autopilota)[]): Autopilota {
  const a: Record<string, unknown> = {
    ...nuovoAutopilota({ id: 'ap-1', nome: 'Lettore', obiettivo: 'Sistema il lettore', cwd: 'C:\\lavoro', iniziatoIl: '2026-09-18T08:00:00.000Z' }),
    dialogo: [{ quando: '2026-09-18T08:05:00.000Z', da: 'tu', testo: 'Ciao' }],
    decisioni: [{ quando: '2026-09-18T08:10:00.000Z', cosa: 'supervisore → prosegui: manca il test' }]
  }
  for (const c of campi) delete a[c]
  return a as unknown as Autopilota
}

describe('dati parziali', () => {
  it('senza dialogo: la conversazione resta con le decisioni', () => {
    const a = senza('dialogo')
    expect(() => conversazione(a)).not.toThrow()
    expect(conversazione(a).some((b) => b.da === 'nota')).toBe(true)
    expect(staPensando(a)).toBe(false)
  })

  it('senza decisioni: la conversazione resta con il dialogo', () => {
    const a = senza('decisioni')
    expect(() => conversazione(a)).not.toThrow()
    expect(conversazione(a).some((b) => b.da === 'tu' && b.testo === 'Ciao')).toBe(true)
  })

  it('senza dialogo, decisioni e chats: nessuna eccezione, conversazione coerente', () => {
    const a = senza('dialogo', 'decisioni', 'chats')
    expect(() => conversazione(a)).not.toThrow()
    expect(conversazione(a).every((b) => b.da === 'nota')).toBe(true)
    expect(() => diario(a)).not.toThrow()
    expect(() => haDomandaAperta(a)).not.toThrow()
  })

  it('con dati completi non cambia niente', () => {
    const a = senza()
    expect(conversazione(a)).toEqual(conversazione({ ...a }))
    expect(conversazione(a).length).toBeGreaterThanOrEqual(2)
  })
})
