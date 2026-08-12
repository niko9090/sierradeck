import { describe, it, expect } from 'vitest'
import { giaSalvatoCome, improntaLayout, stessoContenuto } from '../../src/shared/doppioni'
import type { LayoutSalvato } from '../../src/shared/workspace'

function layout(over: Partial<LayoutSalvato> = {}): LayoutSalvato {
  return {
    root: { type: 'split', id: 'sp-1', direction: 'horizontal', sizes: [50, 50], children: [
      { type: 'pane', id: 'p-1' },
      { type: 'pane', id: 'p-2' }
    ] },
    panes: [
      { id: 'p-1', sessionUuid: 's-1', cwd: 'C:\\a', title: 'A' },
      { id: 'p-2', sessionUuid: 's-2', cwd: 'C:\\b', title: 'B' }
    ],
    ...over
  }
}

describe('stessoContenuto', () => {
  it('due salvataggi con le stesse chat sono lo stesso salvataggio', () => {
    expect(stessoContenuto(layout(), layout())).toBe(true)
  })

  it('gli identificatori dei riquadri non contano', () => {
    // Cambiano a ogni apertura: se contassero, un layout sarebbe diverso da se'
    // stesso un minuto dopo, e il controllo dei doppioni non servirebbe a nulla.
    const altro = layout({
      root: { type: 'split', id: 'sp-1', direction: 'horizontal', sizes: [50, 50], children: [
        { type: 'pane', id: 'zzz-9' },
        { type: 'pane', id: 'zzz-8' }
      ] },
      panes: [
        { id: 'zzz-9', sessionUuid: 's-1', cwd: 'C:\\a', title: 'A' },
        { id: 'zzz-8', sessionUuid: 's-2', cwd: 'C:\\b', title: 'B' }
      ]
    })
    expect(stessoContenuto(layout(), altro)).toBe(true)
  })

  it('l ordine dei riquadri nella lista non cambia la sostanza', () => {
    const invertito = layout({ panes: [...layout().panes].reverse() })
    expect(stessoContenuto(layout(), invertito)).toBe(true)
  })

  it('le stesse chat disposte diversamente sono un altro salvataggio', () => {
    // Una sopra l'altra invece che affiancate e' proprio la cosa che si voleva
    // conservare: sono due layout, e vanno salvati entrambi.
    const inColonna = layout({
      root: { type: 'split', id: 'sp-1', direction: 'vertical', sizes: [50, 50], children: [
        { type: 'pane', id: 'p-1' },
        { type: 'pane', id: 'p-2' }
      ] }
    })
    expect(stessoContenuto(layout(), inColonna)).toBe(false)
  })

  it('una chat in piu e un altro salvataggio', () => {
    const conTre = layout({
      panes: [...layout().panes, { id: 'p-3', sessionUuid: 's-3', cwd: 'C:\\c', title: 'C' }]
    })
    expect(stessoContenuto(layout(), conTre)).toBe(false)
  })

  it('la stessa chat in un altra cartella e un altra cosa', () => {
    const altrove = layout({
      panes: [
        { id: 'p-1', sessionUuid: 's-1', cwd: 'C:\\altrove', title: 'A' },
        { id: 'p-2', sessionUuid: 's-2', cwd: 'C:\\b', title: 'B' }
      ]
    })
    expect(stessoContenuto(layout(), altrove)).toBe(false)
  })
})

describe('giaSalvatoCome', () => {
  it('dice sotto quale nome, non solo che esiste', () => {
    // All'utente non serve sapere che «esiste gia'», gli serve sapere dove.
    const nome = giaSalvatoCome(layout(), [
      { nome: 'altro', finestre: [{ layout: layout({ panes: [] }) }] },
      { nome: 'lavoro di ieri', finestre: [{ layout: layout() }] }
    ])
    expect(nome).toBe('lavoro di ieri')
  })

  it('senza corrispondenze non inventa un nome', () => {
    expect(giaSalvatoCome(layout(), [])).toBeUndefined()
  })

  it('basta che una delle finestre salvate sia questa', () => {
    // Un salvataggio con due monitor contiene due layout: se il mio e' uno dei
    // due, quella disposizione e' gia' al sicuro.
    const altro = layout({ panes: [{ id: 'x', sessionUuid: 's-9', cwd: 'C:\z', title: 'Z' }], root: { type: 'pane', id: 'x' } })
    const nome = giaSalvatoCome(layout(), [
      { nome: 'due monitor', finestre: [{ layout: altro }, { layout: layout() }] }
    ])
    expect(nome).toBe('due monitor')
  })

  it('un layout vuoto non risulta mai gia salvato', () => {
    // Non c'e' niente da ritrovare: dirlo «gia' presente» nasconderebbe l'unico
    // caso in cui salvare non serve davvero a niente.
    const vuoto = layout({ root: undefined, panes: [] })
    expect(giaSalvatoCome(vuoto, [{ nome: 'x', finestre: [{ layout: vuoto }] }])).toBeUndefined()
  })
})

describe('improntaLayout', () => {
  it('e stabile fra due chiamate', () => {
    expect(improntaLayout(layout())).toBe(improntaLayout(layout()))
  })
})
