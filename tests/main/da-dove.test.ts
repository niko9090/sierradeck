import { describe, it, expect } from 'vitest'
import { rispondiDaDove, type DipendenzeDaDove } from '../../src/main/da-dove'
import type { BattitoPc } from '@shared/posta'
import type { StatoPc } from '@shared/scoperta-pc'

/**
 * k-58: «alcune chat mi dicono che non posso guardarle da un altro PC, ma devo
 * spostare per forza il progetto? questo è un bug». Una chat con la casa su un
 * altro PC si guarda dal vivo da qui se quel PC è acceso e raggiungibile; il
 * cartello c'è solo se non si può davvero, e dice il motivo.
 */
const ORA = Date.parse('2026-11-05T10:00:00Z')
const battito = (minutiFa: number, versione = '0.95.5'): BattitoPc => ({
  pcId: 'pc-b', nome: 'PC-B', versione, battito: new Date(ORA - minutiFa * 60_000).toISOString(), cartelle: [], chat: []
})
const acceso: StatoPc = { stato: 'acceso', titolo: 'PC-B è acceso e risponde', cosaFare: '' }
const spento: StatoPc = { stato: 'non-so', titolo: 'PC-B non risponde', cosaFare: 'Controlla che sia acceso.' }
const irraggiungibile: StatoPc = { stato: 'irraggiungibile', titolo: 'PC-B non è raggiungibile', cosaFare: 'Stessa rete o Tailscale.' }

const richiesta = { cwd: 'Z:/progetti/demo', sessionUuid: 'sess-1' }
const deps = (extra: Partial<DipendenzeDaDove> = {}): DipendenzeDaDove => ({
  io: () => 'pc-a',
  cartellaQui: () => false,
  trascrizioneQui: () => false,
  cartellaDi: () => undefined,
  proprietario: () => ({ id: 'pc-b', nome: 'PC-B', progetto: 'demo' }),
  casaQui: () => false,
  battiti: () => [battito(1)],
  adesso: () => ORA,
  statoDi: async () => acceso,
  ...extra
})

describe('chat:daDove con la casa su un altro PC', () => {
  it('PC raggiungibile (battito fresco): dal vivo, senza cartello', async () => {
    const a = await rispondiDaDove(deps(), richiesta)
    expect(a).toMatchObject({ tipo: 'remoto', pc: { id: 'pc-b' }, sessione: 'sess-1', perCasa: true })
  })

  it('battito vecchio ma il PC risponde al bussare: dal vivo', async () => {
    const a = await rispondiDaDove(deps({ battiti: () => [battito(600)], statoDi: async () => acceso }), richiesta)
    expect(a.tipo).toBe('remoto')
  })

  it('PC spento (battito vecchio, nessuna risposta): attesa col motivo vero', async () => {
    const a = await rispondiDaDove(deps({ battiti: () => [battito(600)], statoDi: async () => spento }), richiesta)
    expect(a).toMatchObject({ tipo: 'attesa', perCasa: true, statoPc: { titolo: 'PC-B non risponde' } })
  })

  it('PC irraggiungibile: attesa col motivo, mai «locale»', async () => {
    const a = await rispondiDaDove(deps({ battiti: () => [battito(600)], statoDi: async () => irraggiungibile }), richiesta)
    expect(a).toMatchObject({ tipo: 'attesa', statoPc: { stato: 'irraggiungibile' } })
  })

  it('il bussare cade con un errore: attesa che riprova, non «locale» (era il cartello «sposta il progetto»)', async () => {
    const a = await rispondiDaDove(deps({ battiti: () => [battito(600)], statoDi: async () => { throw new Error('rete') } }), richiesta)
    expect(a).toMatchObject({ tipo: 'attesa', perCasa: true, pc: { id: 'pc-b' } })
  })

  it('un guasto nel leggere i battiti: attesa per la casa nota, non «locale»', async () => {
    let n = 0
    const a = await rispondiDaDove(deps({ battiti: () => { n += 1; throw new Error('postino') } }), richiesta)
    expect(n).toBe(1)
    expect(a).toMatchObject({ tipo: 'attesa', perCasa: true, pc: { id: 'pc-b', nome: 'PC-B' }, sessione: 'sess-1' })
  })

  it('PC acceso ma con una versione troppo vecchia: attesa con «aggiorna quel PC»', async () => {
    const a = await rispondiDaDove(deps({ battiti: () => [battito(1, '0.40.0')] }), richiesta)
    expect(a.tipo).toBe('attesa')
    if (a.tipo === 'attesa') {
      expect(a.statoPc?.stato).toBe('versione-vecchia')
      expect(a.statoPc?.cosaFare).toMatch(/^Aggiorna PC-B/)
      expect(a.statoPc?.cosaFare).toContain('0.40.0')
    }
  })

  it('versione vecchia anche se il battito è scaduto ma il PC risponde', async () => {
    const a = await rispondiDaDove(deps({ battiti: () => [battito(600, '0.50.2')], statoDi: async () => acceso }), richiesta)
    expect(a).toMatchObject({ tipo: 'attesa', statoPc: { stato: 'versione-vecchia' } })
  })

  it('una versione di oggi non è «vecchia»', async () => {
    const a = await rispondiDaDove(deps({ battiti: () => [battito(1, '0.58.4')] }), richiesta)
    expect(a.tipo).toBe('remoto')
  })
})

describe('chat:daDove senza casa altrove', () => {
  it('chat di questo PC: locale', async () => {
    const a = await rispondiDaDove(deps({ proprietario: () => undefined, cartellaQui: () => true }), richiesta)
    expect(a).toEqual({ tipo: 'locale' })
  })

  it('guasto senza una casa nota: locale, come prima', async () => {
    const a = await rispondiDaDove(deps({ proprietario: () => undefined, io: () => { throw new Error('x') } }), richiesta)
    expect(a).toEqual({ tipo: 'locale' })
  })

  it('richiesta malformata: locale', async () => {
    expect(await rispondiDaDove(deps(), null)).toEqual({ tipo: 'locale' })
    expect(await rispondiDaDove(deps(), { cwd: '' })).toEqual({ tipo: 'locale' })
  })
})
