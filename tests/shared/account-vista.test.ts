import { describe, it, expect } from 'vitest'
import { rischioSetteGiorni, statoSalvataggio, vistaAccount } from '../../src/shared/account-vista'

const ORA = Date.parse('2026-10-13T10:00:00Z')
const fa = (giorni: number, ore = 0): string => new Date(ORA - giorni * 86_400_000 - ore * 3_600_000).toISOString()
const parole = (v: ReturnType<typeof vistaAccount>): string => v.tessere.map((t) => `${t.titolo}:${t.vista.parola}`).join(' ')

describe('Account e Drive (0.70.0)', () => {
  it('i sette giorni di Google: si avvisa dal sesto', () => {
    expect(rischioSetteGiorni(undefined, ORA)).toBeUndefined()
    expect(rischioSetteGiorni('non è una data', ORA)).toBeUndefined()
    expect(rischioSetteGiorni(fa(5, 23), ORA)).toEqual({ giorni: 5, scade: false })
    expect(rischioSetteGiorni(fa(6), ORA)).toEqual({ giorni: 6, scade: true })
  })

  it('il salvataggio: al sicuro, vecchio, mai', () => {
    expect(statoSalvataggio(undefined, ORA).parola).toBe('mai')
    expect(statoSalvataggio(fa(0, 3), ORA).parola).toBe('al sicuro')
    expect(statoSalvataggio(fa(1), ORA).ragione).toBe('ultimo salvataggio ieri')
    expect(statoSalvataggio(fa(4), ORA)).toMatchObject({ parola: 'vecchio', colore: 'ambra', ragione: 'ultimo salvataggio 4 giorni fa' })
  })

  it('la catena dice dove ci si ferma, e il prossimo passo è uno solo', () => {
    expect(vistaAccount({ ora: ORA }).prossimo?.id).toBe('entra')
    const u = { email: 'prova@esempio.it' }
    const fuori = vistaAccount({ utente: u, drive: { configurato: true, connesso: false }, sync: { haCassaforte: false, sbloccato: false }, ora: ORA })
    expect(parole(fuori)).toBe('Account:entrato Drive:scollegato Cassaforte:da creare Salvataggio:—')
    expect(fuori.prossimo).toEqual({ id: 'connetti', testo: 'Collega il Drive' })
    const daCreare = vistaAccount({ utente: u, drive: { configurato: true, connesso: true }, sync: { haCassaforte: false, sbloccato: false }, ora: ORA })
    expect(parole(daCreare)).toBe('Account:entrato Drive:collegato Cassaforte:da creare Salvataggio:—')
    expect(daCreare.prossimo?.id).toBe('crea')
    expect(vistaAccount({ utente: u, drive: { configurato: true, connesso: true }, sync: { haCassaforte: true, sbloccato: false }, ora: ORA }).prossimo?.id).toBe('sblocca')
    expect(vistaAccount({ utente: u, drive: { configurato: true, connesso: true }, sync: { haCassaforte: true, sbloccato: false, cassaforteDiversa: true }, ora: ORA }).prossimo?.id).toBe('prova')
    const pronto = vistaAccount({ utente: u, drive: { configurato: true, connesso: true, email: 'drive@esempio.it' }, sync: { haCassaforte: true, sbloccato: true, ultimoSalvataggio: fa(0, 1) }, ora: ORA })
    expect(parole(pronto)).toBe('Account:entrato Drive:collegato Cassaforte:aperta Salvataggio:al sicuro')
    expect(pronto.tessere[1]?.sotto).toBe('drive@esempio.it')
    expect(pronto.prossimo?.id).toBe('progetti')
  })

  it('il Drive collegato da sei giorni dice «scade» in ambra, con il perché', () => {
    const v = vistaAccount({ utente: { email: 'p@esempio.it' }, drive: { configurato: true, connesso: true, collegatoIl: fa(6, 2) }, sync: { haCassaforte: true, sbloccato: true }, ora: ORA })
    expect(v.tessere[1]?.vista).toMatchObject({ parola: 'scade', colore: 'ambra' })
    expect(v.tessere[1]?.vista.ragione).toContain('6 giorni fa')
    expect(v.tessere[1]?.sotto).toBe('collegato 6 giorni fa')
    expect(v.prossimo?.id).toBe('salva')
  })
})
