import { describe, it, expect } from 'vitest'
import {
  cartellaAutopilotaLocale, chatRemotaScrivibile, gruppiAltriPc, registroSuPcValido, remotiDaMigrare, remotiDiQui,
  rinominaInRegistro, separaWorkspace, statoAutopilotaRemoto, togliDaRegistro
} from '../../src/shared/workspace-remoti'

/**
 * Sezione «Altri PC» (13/11): i workspace degli altri PC stanno a parte, si
 * aprono sempre con l'autopilota di là, e le loro chat non si scrivono da qui.
 */
const PC_B = { pcId: 'pc-b', pcNome: 'Portatile' }
const PC_C = { pcId: 'pc-c', pcNome: 'Ufficio' }

describe('nessun campo per le chat di altri PC con un autopilota', () => {
  it('in un workspace di un altro PC non si scrive mai, con o senza autopilota', () => {
    expect(chatRemotaScrivibile({ workspaceRemoto: true, conAutopilota: true })).toBe(false)
    expect(chatRemotaScrivibile({ workspaceRemoto: true, conAutopilota: false })).toBe(false)
  })
  it('in un workspace di qui con autopilota le chat di altri PC si guardano e basta', () => {
    expect(chatRemotaScrivibile({ workspaceRemoto: false, conAutopilota: true })).toBe(false)
  })
  it('solo un workspace di qui senza autopilota lascia scrivere (come prima)', () => {
    expect(chatRemotaScrivibile({ workspaceRemoto: false, conAutopilota: false })).toBe(true)
  })
})

describe('mai un autopilota di qui per un workspace di un altro PC', () => {
  const riquadri = [
    { cwd: 'C:\\progetti\\di-la', remoto: { pcId: 'pc-b' } },
    { cwd: 'C:\\progetti\\di-qui' }
  ]
  it('un workspace remoto non ha una cartella per l’autopilota di qui, nemmeno da un dormiente', () => {
    expect(cartellaAutopilotaLocale({ workspaceRemoto: true, riquadri })).toBeUndefined()
    expect(cartellaAutopilotaLocale({ workspaceRemoto: true, riquadri, dormiente: 'C:\\progetti\\dormiente' })).toBeUndefined()
  })
  it('in un workspace di qui la cartella è di una chat di qui, mai di una che guarda un altro PC', () => {
    expect(cartellaAutopilotaLocale({ workspaceRemoto: false, riquadri })).toBe('C:\\progetti\\di-qui')
    expect(cartellaAutopilotaLocale({ workspaceRemoto: false, riquadri: [riquadri[0]!] })).toBeUndefined()
  })
  it('mentre l’autopilota di là si carica o quel PC non risponde, lo si dice e basta', () => {
    expect(statoAutopilotaRemoto({ giu: false }, 'Portatile')).toEqual({ tipo: 'cerco', testo: 'Mi collego a Portatile…' })
    expect(statoAutopilotaRemoto({ giu: true }, 'Portatile').tipo).toBe('giu')
    expect(statoAutopilotaRemoto({ giu: false, nessuno: true }, 'Portatile').tipo).toBe('nessuno')
    expect(statoAutopilotaRemoto({ giu: true, autopilota: { id: 'ap-1' } }, 'Portatile').tipo).toBe('pronto')
  })
})

describe('il registro dei PC', () => {
  it('scarta voci senza pcId e completa il nome che manca', () => {
    expect(registroSuPcValido({ A: PC_B, B: { pcNome: 'x' }, C: 'no', '': PC_B, D: { pcId: 'abcdefghij' } }))
      .toEqual({ A: PC_B, D: { pcId: 'abcdefghij', pcNome: 'abcdefgh' } })
    expect(registroSuPcValido([PC_B])).toEqual({})
    expect(registroSuPcValido(null)).toEqual({})
  })
  it('rinomina ed eliminazione seguono il workspace; senza cambi resta lo stesso oggetto', () => {
    const r = { Fionda: PC_B, Altro: PC_C }
    expect(rinominaInRegistro(r, 'Fionda', 'Fionda 2')).toEqual({ 'Fionda 2': PC_B, Altro: PC_C })
    expect(rinominaInRegistro(r, 'Nessuno', 'X')).toBe(r)
    expect(togliDaRegistro(r, 'Fionda')).toEqual({ Altro: PC_C })
    expect(togliDaRegistro(r, 'Nessuno')).toBe(r)
  })
  it('vale il registro, non il battito: un battito senza quel nome lo segna «sparito», non di qui', () => {
    const r = remotiDiQui(['Fionda', 'Locale', 'Vecchio'], { Fionda: PC_B, Vecchio: PC_C }, [
      { pcId: 'pc-b', nome: 'Portatile nuovo', workspace: ['Fionda'] },
      { pcId: 'pc-c', nome: 'Ufficio', workspace: ['Altro'] }
    ])
    expect(r).toEqual({ Fionda: { pcId: 'pc-b', pcNome: 'Portatile nuovo' }, Vecchio: { pcId: 'pc-c', pcNome: 'Ufficio', sparito: true } })
  })
  it('un PC senza battito resta col nome del registro; un nome non più in archivio non conta', () => {
    expect(remotiDiQui(['Fionda'], { Fionda: PC_B, Tolto: PC_C }, [])).toEqual({ Fionda: PC_B })
  })
})

describe('la migrazione delle linguette remote di prima', () => {
  const remoto = (pc: { pcId: string; pcNome: string }): { remoto: { pcId: string; pcNome: string } } => ({ remoto: pc })
  it('passa in «Altri PC» un workspace con tutte le chat sullo stesso altro PC', () => {
    expect(remotiDaMigrare([
      { nome: 'Fionda', panes: [remoto(PC_B), remoto(PC_B)] },
      { nome: 'Misto', panes: [remoto(PC_B), {}] },
      { nome: 'Due PC', panes: [remoto(PC_B), remoto(PC_C)] },
      { nome: 'Vuoto', panes: [] },
      { nome: 'Di qui', panes: [{}] },
      { nome: 'Me stesso', panes: [remoto({ pcId: 'io', pcNome: 'Questo' })] }
    ], {}, 'io')).toEqual({ Fionda: PC_B })
  })
  it('non tocca chi è già nel registro (anche se con un altro PC)', () => {
    expect(remotiDaMigrare([{ nome: 'Fionda', panes: [remoto(PC_B)] }], { Fionda: PC_C }, 'io')).toEqual({})
  })
})

describe('la sezione «Altri PC»', () => {
  it('fascia di qui e sezione si dividono i nomi senza perderne nessuno', () => {
    expect(separaWorkspace(['A', 'Fionda', 'B'], { Fionda: PC_B })).toEqual({ locali: ['A', 'B'], remoti: ['Fionda'] })
  })
  it('un gruppo per PC, accesi prima: dentro gli aperti qui e quelli solo di là, in ordine di nome', () => {
    const g = gruppiAltriPc({
      nomiQui: ['Locale', 'sierradeck'],
      remoti: { Fionda: PC_B, Vecchio: { ...PC_C, sparito: true } },
      pc: [
        { pcId: 'pc-c', nome: 'Ufficio', vivo: false, workspace: ['Zeta'] },
        { pcId: 'pc-b', nome: 'Portatile', vivo: true, workspace: ['Fionda', 'Bozza', 'SierraDeck', 'Bozza'] },
        { pcId: 'pc-d', nome: 'Muletto', vivo: true }
      ],
      attivo: 'Fionda'
    })
    expect(g.map((x) => [x.nome, x.vivo])).toEqual([['Muletto', true], ['Portatile', true], ['Ufficio', false]])
    expect(g[1]!.voci).toEqual([
      { nome: 'Bozza', aperto: false, davanti: false },
      { nome: 'Fionda', aperto: true, davanti: true }
    ])
    expect(g[2]!.voci).toEqual([
      { nome: 'Vecchio', aperto: true, davanti: false, sparito: true },
      { nome: 'Zeta', aperto: false, davanti: false }
    ])
    expect(g[0]!.voci).toEqual([])
  })
  it('un workspace aperto da un PC che non manda più battiti ha comunque il suo gruppo, spento', () => {
    expect(gruppiAltriPc({ nomiQui: [], remoti: { Fionda: PC_B }, pc: [], attivo: '' }))
      .toEqual([{ pcId: 'pc-b', nome: 'Portatile', vivo: false, voci: [{ nome: 'Fionda', aperto: true, davanti: false }] }])
  })
})
