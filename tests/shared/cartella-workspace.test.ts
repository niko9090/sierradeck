import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { sceltaCartellaWorkspace } from '../../src/shared/cartella-workspace'
import type { GruppoProgetti } from '../../src/shared/progetti-unificati'

/**
 * Il caso del 19/10 (0.80.0): un workspace il cui progetto vive su un altro PC
 * creava qui una cartella vuota e registrava questo PC come residente.
 */
const io = { id: 'pc-qui' }
const gruppo = (percorsi: { pc: string; percorso: string }[]): GruppoProgetti => ({
  chiave: 'progettodiprova', id: 'p1', nome: 'progetto-di-prova', ids: ['p1'], percorsi: percorsi.map((x) => ({ ...x, id: 'p1' }))
})
const base = {
  nome: 'progetto-di-prova',
  io,
  gruppi: [] as GruppoProgetti[],
  casaDi: () => undefined,
  remoti: [],
  battiti: [{ pcId: 'pc-la', nome: 'PC-ESEMPIO' }],
  esiste: () => true,
  cartellaNuova: 'X:\\Progetti\\progetto-di-prova',
  valida: true
}

describe('dove sta il progetto di un workspace', () => {
  it('la cartella che c’è già qui si usa', () => {
    expect(sceltaCartellaWorkspace({ ...base, gruppi: [gruppo([{ pc: 'pc-qui', percorso: 'X:\\qui' }])] })).toEqual({ tipo: 'qui', cartella: 'X:\\qui' })
  })

  it('un progetto registrato solo su un altro PC: altrove, niente cartella qui', () => {
    const s = sceltaCartellaWorkspace({ ...base, gruppi: [gruppo([{ pc: 'pc-la', percorso: 'Y:\\la' }])] })
    expect(s).toMatchObject({ tipo: 'altrove', pcNome: 'PC-ESEMPIO' })
  })

  it('la residenza dice un altro PC, anche con una cartella vecchia qui sparita: altrove', () => {
    const s = sceltaCartellaWorkspace({
      ...base,
      gruppi: [gruppo([{ pc: 'pc-qui', percorso: 'X:\\sparita' }])],
      esiste: () => false,
      casaDi: (k: string) => (k === 'progetto:p1' ? { pc: 'pc-la', pcNome: 'PC-ESEMPIO' } : undefined)
    })
    expect(s).toMatchObject({ tipo: 'altrove', pcNome: 'PC-ESEMPIO' })
  })

  it('il nome non è nel registro ma i riquadri del workspace guardano un altro PC: altrove', () => {
    const s = sceltaCartellaWorkspace({ ...base, nome: 'nome-diverso', remoti: [{ pcId: 'pc-la', pcNome: 'PC-ESEMPIO' }] })
    expect(s).toMatchObject({ tipo: 'altrove', pcNome: 'PC-ESEMPIO' })
  })

  it('un altro PC ha un workspace con lo stesso nome (aperto da là): altrove', () => {
    const s = sceltaCartellaWorkspace({ ...base, battiti: [{ pcId: 'pc-la', nome: 'PC-ESEMPIO', workspace: ['Progetto-Di-Prova'] }] })
    expect(s).toMatchObject({ tipo: 'altrove', pcNome: 'PC-ESEMPIO' })
  })

  it('un riquadro che guarda questo stesso PC non conta come altrove', () => {
    expect(sceltaCartellaWorkspace({ ...base, remoti: [{ pcId: 'pc-qui', pcNome: 'QUI' }] })).toEqual({ tipo: 'crea', cartella: base.cartellaNuova })
  })

  it('nessuno lo ha: si può creare qui', () => {
    expect(sceltaCartellaWorkspace(base)).toEqual({ tipo: 'crea', cartella: base.cartellaNuova })
  })

  it('il predefinito e una cartella non valida: niente', () => {
    expect(sceltaCartellaWorkspace({ ...base, nome: 'Predefinito' }).tipo).toBe('niente')
    expect(sceltaCartellaWorkspace({ ...base, valida: false }).tipo).toBe('niente')
  })
})

describe('chi chiede soltanto non crea', () => {
  it('la finestra della chat nuova legge il progetto senza crearlo', () => {
    const src = readFileSync('src/main/index.ts', 'utf8')
    // `sistema:cartelleBase` gira a ogni apertura della finestra della chat nuova.
    const i = src.indexOf("ipcMain.handle('sistema:cartelleBase'")
    expect(i).toBeGreaterThan(0)
    expect(src.slice(i, i + 400)).toContain('progettoPerWorkspaceGlobale?.(ws, { crea: false })')
    expect(src).toContain('if (opz?.crea === false) return undefined')
  })
})
