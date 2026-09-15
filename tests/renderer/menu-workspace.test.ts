import { describe, it, expect } from 'vitest'
import { contaChatPerWorkspace, filtraWorkspace, serveIlMenu, LINGUETTE_MAX } from '../../src/renderer/menu-workspace'

/**
 * Nicholas (2026-09-15): «quando sono tanti vedo solo dei puntini
 * praticamente. metti un menu a tendina».
 */
describe('il menu dei workspace', () => {
  it('con pochi workspace restano le linguette, oltre il massimo serve il menu', () => {
    expect(serveIlMenu(['a', 'b'])).toBe(false)
    expect(serveIlMenu(Array.from({ length: LINGUETTE_MAX }, (_, i) => `w${i}`))).toBe(false)
    expect(serveIlMenu(Array.from({ length: LINGUETTE_MAX + 1 }, (_, i) => `w${i}`))).toBe(true)
  })

  it('il filtro ignora maiuscole e accenti e tiene l ordine; vuoto = tutti', () => {
    const nomi = ['Predefinito', 'DDJ-Dj_Deck', 'Wdeck', 'HomeAssistant', 'Sierra', 'server_home', 'Nasèe']
    expect(filtraWorkspace(nomi, '')).toBe(nomi)
    expect(filtraWorkspace(nomi, 'deck')).toEqual(['DDJ-Dj_Deck', 'Wdeck'])
    expect(filtraWorkspace(nomi, 'HOME')).toEqual(['HomeAssistant', 'server_home'])
    expect(filtraWorkspace(nomi, 'nasee')).toEqual(['Nasèe'])
    expect(filtraWorkspace(nomi, 'zzz')).toEqual([])
  })

  it('conta le chat per workspace da «sessione → workspace»', () => {
    const conti = contaChatPerWorkspace({ s1: 'Wdeck', s2: 'Wdeck', s3: 'Sierra' })
    expect(conti.get('Wdeck')).toBe(2)
    expect(conti.get('Sierra')).toBe(1)
    expect(conti.get('altro')).toBeUndefined()
  })
})
