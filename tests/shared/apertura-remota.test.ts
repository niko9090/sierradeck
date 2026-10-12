import { describe, it, expect } from 'vitest'
import { decidiAperturaRemota } from '../../src/shared/apertura-remota'
import type { CasaChat } from '../../src/shared/una-casa'

// Il caso «MT5» con dati d'esempio. La regola aveva messo la casa sul PC fisso
// per una cartella con lo stesso nome; la chat stava sul portatile.
const regola: CasaChat = { pc: 'pc-fisso-2', pcNome: 'PC-ESEMPIO-2', motivo: 'la sua cartella c’è solo su PC-ESEMPIO-2', decisaIl: '2026-10-02T14:45:32.012Z', da: 'regola' }
const portatile = { pc: 'pc-port', nome: 'PORTATILE-ESEMPIO', mtime: 1_790_625_600_000 }

describe('dove aprire una chat di un altro PC', () => {
  it('casa dalla regola su un PC presente che non ha la chat: il riquadro guarda la copia, la casa non cambia', () => {
    const d = decidiAperturaRemota({ sessione: 's', casa: regola, copie: [portatile], casaLaHa: false, casaPresente: true })
    expect(d).toMatchObject({ tipo: 'guarda-altrove', pc: 'pc-port', casa: 'pc-fisso-2' })
    expect(d.perche).toContain('la casa resta PC-ESEMPIO-2')
  })
  it('il caso del 10/10: il PC di casa è scollegato dal Drive e il suo battito vecchio non elenca la chat — la casa resta, «non raggiungibile»', () => {
    const d = decidiAperturaRemota({ sessione: 's', casa: regola, copie: [portatile], casaLaHa: false, casaPresente: false })
    expect(d.tipo).toBe('assente')
    expect(d.pc).toBe('pc-fisso-2')
    expect(d.perche).toContain('non raggiungibile')
  })
  it('il PC di casa ha la chat: resta', () => {
    expect(decidiAperturaRemota({ sessione: 's', casa: regola, copie: [portatile, { pc: 'pc-fisso-2', nome: 'PC-ESEMPIO-2' }], casaLaHa: undefined }).tipo).toBe('resta')
  })
  it('non si sa se il PC di casa ce l’ha (versione vecchia, non risponde): resta, e si dice', () => {
    const d = decidiAperturaRemota({ sessione: 's', casa: regola, copie: [portatile], casaLaHa: undefined, casaPresente: true })
    expect(d.tipo).toBe('resta')
    expect(d.perche).toContain('non lo dice')
  })
  it('una scelta di Nicholas non si tocca mai, anche se lì la chat non c’è: si dice', () => {
    const d = decidiAperturaRemota({ sessione: 's', casa: { ...regola, da: 'nicholas' }, copie: [portatile], casaLaHa: false, casaPresente: true })
    expect(d.tipo).toBe('scelta-senza-copia')
    expect(d.perche).toContain('PORTATILE-ESEMPIO')
  })
  it('fra più copie si guarda la più recente', () => {
    const d = decidiAperturaRemota({ sessione: 's', casa: regola, copie: [{ pc: 'pc-a', nome: 'A', mtime: 1 }, { pc: 'pc-b', nome: 'B', mtime: 9 }], casaLaHa: false, casaPresente: true })
    expect(d).toMatchObject({ tipo: 'guarda-altrove', pc: 'pc-b' })
  })
  it('una chat senza casa si guarda dove c’è, ma la casa non la sceglie l’apertura', () => {
    const d = decidiAperturaRemota({ sessione: 's', casa: undefined, copie: [portatile], casaLaHa: undefined })
    expect(d).toMatchObject({ tipo: 'guarda-altrove', pc: 'pc-port', casa: '' })
  })
  it('nessuna decisione dell’apertura porta una casa da scrivere', () => {
    for (const casaPresente of [true, false]) {
      for (const casaLaHa of [true, false, undefined]) {
        const d = decidiAperturaRemota({ sessione: 's', casa: regola, copie: [portatile], casaLaHa, casaPresente })
        expect(['resta', 'assente', 'guarda-altrove', 'scelta-senza-copia']).toContain(d.tipo)
      }
    }
  })
})
