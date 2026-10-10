import { describe, it, expect } from 'vitest'
import { casaCorretta, decidiAperturaRemota } from '../../src/shared/apertura-remota'
import { unisciCase, type CasaChat } from '../../src/shared/una-casa'

// 0.58.2: il caso «MT5» con dati d'esempio. La regola aveva messo la casa sul
// PC fisso per una cartella con lo stesso nome; la chat stava sul portatile.
const regola: CasaChat = { pc: 'pc-fisso-2', pcNome: 'PC-ESEMPIO-2', motivo: 'la sua cartella c’è solo su PC-ESEMPIO-2', decisaIl: '2026-10-02T14:45:32.012Z', da: 'regola' }
const portatile = { pc: 'pc-port', nome: 'PORTATILE-ESEMPIO', mtime: 1_790_625_600_000 }

describe('dove aprire una chat di un altro PC', () => {
  it('casa dalla regola su un PC che non ha la chat, e la chat sul portatile: si corregge verso il portatile', () => {
    const d = decidiAperturaRemota({ sessione: 's', casa: regola, copie: [portatile], casaLaHa: false })
    expect(d).toMatchObject({ tipo: 'correggi', pc: 'pc-port', da: 'pc-fisso-2' })
    // La correzione vince sulla regola vecchia quando le case si uniscono fra PC.
    const c = casaCorretta(d as Extract<typeof d, { tipo: 'correggi' }>, '2026-10-10T19:40:00Z')
    expect(unisciCase({ versione: 1, case: { s: regola } }, { versione: 1, case: { s: c } }).case.s?.pc).toBe('pc-port')
    expect(c.motivo).toContain('corretta all’apertura')
  })
  it('il PC di casa ha la chat: resta', () => {
    expect(decidiAperturaRemota({ sessione: 's', casa: regola, copie: [portatile, { pc: 'pc-fisso-2', nome: 'PC-ESEMPIO-2' }], casaLaHa: undefined }).tipo).toBe('resta')
  })
  it('non si sa se il PC di casa ce l’ha (versione vecchia, non risponde): resta, e si dice', () => {
    const d = decidiAperturaRemota({ sessione: 's', casa: regola, copie: [portatile], casaLaHa: undefined })
    expect(d.tipo).toBe('resta')
    expect(d.perche).toContain('non lo dice')
  })
  it('una scelta di Nicholas non si tocca mai, anche se lì la chat non c’è: si dice', () => {
    const d = decidiAperturaRemota({ sessione: 's', casa: { ...regola, da: 'nicholas' }, copie: [portatile], casaLaHa: false })
    expect(d.tipo).toBe('scelta-senza-copia')
    expect(d.perche).toContain('PORTATILE-ESEMPIO')
  })
  it('fra più copie vince la più recente', () => {
    const d = decidiAperturaRemota({ sessione: 's', casa: regola, copie: [{ pc: 'pc-a', nome: 'A', mtime: 1 }, { pc: 'pc-b', nome: 'B', mtime: 9 }], casaLaHa: false })
    expect(d).toMatchObject({ tipo: 'correggi', pc: 'pc-b' })
  })
})
