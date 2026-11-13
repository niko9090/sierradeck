import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { fasciaQuestoPc, remotiDaMigrare, separaWorkspace } from '../../src/shared/workspace-remoti'
import { MenuWorkspace } from '../../src/renderer/components/MenuWorkspace'

/**
 * Nicholas, 13/11 (0.106.x): «la nuova gestione delle parti dei PC dei
 * workspace non si capisce molto e non si vedono le chat del PC che si sta
 * usando ma solo quelle degli altri PC».
 *
 * I dati erano giusti (solo i workspace con tutte le chat su un altro PC
 * passano in «Altri PC»): era la fascia. La sezione dei workspace di qui era
 * l'unica a cedere (`flex: 0 1 auto; min-width: 0`) e «Altri PC», messa dopo,
 * non cedeva mai (`flex: 0 0 auto`, un tasto per ogni PC nella 0.106.x): con
 * la fascia piena i workspace di questo PC finivano a larghezza zero e
 * restavano in vista solo gli altri PC.
 */

const css = readFileSync('src/renderer/console.css', 'utf8')
/** Il corpo dell'ultima regola con esattamente questo selettore. */
function regola(selettore: string): string {
  const esc = selettore.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const tutte = [...css.matchAll(new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`, 'g'))]
  expect(tutte.length, `manca la regola ${selettore}`).toBeGreaterThan(0)
  return tutte[tutte.length - 1]![1]!
}
function flexShrink(corpo: string): number {
  const m = /flex:\s*(\d+)\s+(\d+)/.exec(corpo)
  expect(m, `niente «flex: g s base» in ${corpo}`).not.toBeNull()
  return Number(m![2])
}

describe('la fascia: i workspace di questo PC non spariscono mai', () => {
  it('«Altri PC» cede prima dei workspace di qui', () => {
    const qui = regola('.console .sezione--questo-pc')
    const altri = regola('.console .altri-pc')
    expect(flexShrink(altri)).toBeGreaterThan(flexShrink(qui) * 100)
    // Di qui resta sempre almeno il tasto; di «Altri PC» il solo tasto.
    expect(qui).toMatch(/min-width:\s*min\(\d+px/)
    expect(qui).not.toMatch(/min-width:\s*0[;\s]/)
    expect(altri).toMatch(/min-width:\s*\d+px/)
  })

  it('la sezione di qui si chiama «Questo PC», ha il «?», e viene prima di «Altri PC»', () => {
    const src = readFileSync('src/renderer/components/Console.tsx', 'utf8')
    const qui = src.indexOf('sezione--questo-pc')
    expect(qui).toBeGreaterThan(0)
    expect(src).toContain('>Questo PC</span>')
    expect(src).toContain('<Aiuto di="«Questo PC»">')
    expect(src.indexOf('<SezioneAltriPc')).toBeGreaterThan(qui)
    expect(src).toContain('fasciaQuestoPc({ nomi: workspaceNomi, remoti: workspaceRemoti, attivo: workspaceAttivo })')
    expect(src).toContain('attivo={questoPc.attivo}')
    expect(src).not.toContain('<span className="serigrafia">Workspace</span>')
  })

  it('la tendina «Altri PC» rimanda a «Questo PC», non a una fascia che non c’è più', () => {
    const src = readFileSync('src/renderer/components/SezioneAltriPc.tsx', 'utf8')
    expect(src).toContain('in «Questo PC»')
    expect(src).not.toContain('fascia «Workspace»')
  })
})

describe('fasciaQuestoPc: chi sta in «Questo PC»', () => {
  // Come un archivio vero: tanti workspace di qui, due aperti da altri PC.
  const nomi = ['Alfa', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Remoto-1', 'Remoto-2']
  const remoti = { 'Remoto-1': { pcId: 'pc-b' }, 'Remoto-2': { pcId: 'pc-c' } }

  it('tutti quelli di qui, nell’ordine di sempre; nessuno di un altro PC', () => {
    const f = fasciaQuestoPc({ nomi, remoti, attivo: 'Gamma' })
    expect(f.nomi).toEqual(['Alfa', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta'])
    expect(f.nomi).toEqual(separaWorkspace(nomi, remoti).locali)
    expect(f).toMatchObject({ attivo: 'Gamma', davantiAltrove: false })
  })

  it('davanti un workspace di un altro PC: quelli di qui restano tutti, nessuno attivo', () => {
    const f = fasciaQuestoPc({ nomi, remoti, attivo: 'Remoto-1' })
    expect(f.nomi).toHaveLength(8)
    expect(f.attivo).toBe('')
    expect(f.davantiAltrove).toBe(true)
  })

  it('archivio non ancora letto: il workspace davanti, se è di qui', () => {
    expect(fasciaQuestoPc({ nomi: [], remoti: {}, attivo: 'Alfa' })).toEqual({ nomi: ['Alfa'], attivo: 'Alfa', davantiAltrove: false })
    expect(fasciaQuestoPc({ nomi: [], remoti, attivo: 'Remoto-1' })).toEqual({ nomi: [], attivo: '', davantiAltrove: true })
  })

  it('niente nomi vuoti né doppi', () => {
    expect(fasciaQuestoPc({ nomi: ['Alfa', '', 'Alfa', 'Beta'], remoti: {}, attivo: 'Beta' }).nomi).toEqual(['Alfa', 'Beta'])
  })
})

describe('la migrazione non porta via i workspace di qui', () => {
  it('un workspace con anche una sola chat di qui resta di qui', () => {
    const r = remotiDaMigrare([
      { nome: 'Misto', panes: [{}, { remoto: { pcId: 'pc-b', pcNome: 'Portatile' } }, {}] },
      { nome: 'Vuoto', panes: [] },
      { nome: 'Due PC', panes: [{ remoto: { pcId: 'pc-b', pcNome: 'Portatile' } }, { remoto: { pcId: 'pc-c', pcNome: 'Ufficio' } }] },
      { nome: 'Di qui', panes: [{ remoto: { pcId: 'io', pcNome: 'Questo' } }] },
      { nome: 'Di là', panes: [{ remoto: { pcId: 'pc-b', pcNome: 'Portatile' } }] }
    ], {}, 'io')
    expect(Object.keys(r)).toEqual(['Di là'])
  })
})

describe('il menu dei workspace di qui', () => {
  const props = { nomi: ['Alfa', 'Beta'], aperto: false, onAperto: () => undefined, onCambia: () => undefined, onGestisci: () => undefined }
  it('mostra il workspace davanti, se è di qui', () => {
    const h = renderToStaticMarkup(<MenuWorkspace {...props} attivo="Alfa" />)
    expect(h).toContain('>Alfa</span>')
  })
  it('davanti uno di un altro PC: «Scegli», mai il nome di là come se fosse di qui', () => {
    const h = renderToStaticMarkup(<MenuWorkspace {...props} attivo="" />)
    expect(h).toContain('>Scegli</span>')
    expect(h).toContain('un workspace di un altro PC')
  })
})
