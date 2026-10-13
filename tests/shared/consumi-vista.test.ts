import { describe, it, expect } from 'vitest'
import { testoQuota, vistaContesto, vistaFinestra } from '@shared/consumi-vista'

/** I Consumi riprogettati (0.70.0): una parola per finestra e per chat, una riga che si legge. */
describe('le finestre del piano', () => {
  it('le soglie 80 e 95, la lettura vecchia, l’attesa', () => {
    expect(vistaFinestra({ percento: 79.4, stato: 'fresca' })).toMatchObject({ parola: 'libero', colore: 'verde', percento: 79 })
    expect(vistaFinestra({ percento: 80, stato: 'fresca' }).parola).toBe('attento')
    expect(vistaFinestra({ percento: 94, stato: 'fresca' }).parola).toBe('attento')
    expect(vistaFinestra({ percento: 95, stato: 'fresca' })).toMatchObject({ parola: 'pieno', colore: 'rosso' })
    expect(vistaFinestra({ percento: 40, stato: 'vecchia' })).toMatchObject({ parola: 'vecchia', colore: 'ambra', percento: 40 })
    expect(vistaFinestra({ percento: 0, stato: 'azzerata' }).parola).toBe('azzerata')
    expect(vistaFinestra(undefined).parola).toBe('attesa')
  })
})

describe('il contesto di una chat', () => {
  it('libera, piena, riassumi, non letto', () => {
    expect(vistaContesto(69).parola).toBe('libera')
    expect(vistaContesto(70).parola).toBe('piena')
    expect(vistaContesto(90)).toMatchObject({ parola: 'riassumi', colore: 'rosso' })
    expect(vistaContesto(undefined).parola).toBe('—')
  })
})

describe('i token in una riga', () => {
  it('con i separatori: prima era tutto attaccato', () => {
    expect(testoQuota({ ingresso: 1_200_000, uscita: 80_000, cache: 0, chat: 5 })).toBe('↑1,2M in entrata · ↓80k in uscita · cache 0% · 5 chat')
    expect(testoQuota({ ingresso: 0, uscita: 0, cache: 0, chat: 0 })).toBe('↑0 in entrata · ↓0 in uscita · cache 0% · 0 chat')
  })
})

import { conVistaConsumi } from '@shared/consumi-vista'
describe('le parole messe dal PC', () => {
  it('finestre e contesti', () => {
    const c = conVistaConsumi({ limiti: { cinqueOre: { percento: 96, stato: 'fresca' } }, chatAperte: [{ contesto: { percento: 92 } }, {}] })
    expect((c.limiti?.cinqueOre as { vista?: { parola: string } }).vista?.parola).toBe('pieno')
    expect((c.chatAperte?.[0] as { vista?: { parola: string } }).vista?.parola).toBe('riassumi')
    expect((c.chatAperte?.[1] as { vista?: { parola: string } }).vista?.parola).toBe('—')
  })
})
