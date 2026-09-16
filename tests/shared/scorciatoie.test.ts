import { describe, expect, it } from 'vitest'
import {
  AZIONI, azionePer, combinazioneDi, combinazioneValida, doppioni,
  normalizzaScorciatoie, SCORCIATOIE_PREDEFINITE, workspaceDaAzione
} from '../../src/shared/scorciatoie'

const tasto = (code: string, mod: Partial<{ ctrl: boolean; alt: boolean; shift: boolean; meta: boolean }> = {}) => ({
  code, ctrlKey: mod.ctrl === true, altKey: mod.alt === true, shiftKey: mod.shift === true, metaKey: mod.meta === true
})

describe('combinazioneDi', () => {
  it('scrive i modificatori nell’ordine Ctrl, Alt, Shift e il tasto fisico', () => {
    expect(combinazioneDi(tasto('Tab', { ctrl: true, shift: true }))).toBe('Ctrl+Shift+Tab')
    expect(combinazioneDi(tasto('Digit3', { alt: true }))).toBe('Alt+3')
    expect(combinazioneDi(tasto('KeyW', { ctrl: true, shift: true }))).toBe('Ctrl+Shift+W')
    expect(combinazioneDi(tasto('Comma', { ctrl: true }))).toBe('Ctrl+,')
    expect(combinazioneDi(tasto('PageDown', { ctrl: true }))).toBe('Ctrl+PageDown')
    expect(combinazioneDi(tasto('ArrowLeft', { ctrl: true, alt: true }))).toBe('Ctrl+Alt+Left')
  })

  it('usa il tasto fisico: Shift+1 sulla tastiera italiana resta «1», non «!»', () => {
    expect(combinazioneDi(tasto('Digit1', { ctrl: true, shift: true }))).toBe('Ctrl+Shift+1')
  })

  it('un modificatore da solo, il tasto Windows o un carattere nudo non sono scorciatoie', () => {
    expect(combinazioneDi(tasto('ControlLeft', { ctrl: true }))).toBeUndefined()
    expect(combinazioneDi(tasto('ShiftLeft', { shift: true }))).toBeUndefined()
    expect(combinazioneDi(tasto('KeyA'))).toBeUndefined()
    expect(combinazioneDi(tasto('KeyA', { shift: true }))).toBeUndefined()
    expect(combinazioneDi(tasto('KeyA', { ctrl: true, meta: true }))).toBeUndefined()
    expect(combinazioneDi(tasto('CapsLock', { ctrl: true }))).toBeUndefined()
  })

  it('i tasti funzione valgono anche nudi', () => {
    expect(combinazioneDi(tasto('F5'))).toBe('F5')
    expect(combinazioneDi(tasto('F12', { shift: true }))).toBe('Shift+F12')
  })
})

describe('combinazioneValida', () => {
  it('accetta le predefinite e la stringa vuota', () => {
    for (const c of Object.values(SCORCIATOIE_PREDEFINITE)) expect(combinazioneValida(c), c).toBe(true)
    expect(combinazioneValida('')).toBe(true)
  })

  it('rifiuta l’ordine sbagliato, i modificatori doppi, i caratteri nudi e le cose che non sono stringhe', () => {
    expect(combinazioneValida('Shift+Ctrl+Tab')).toBe(false)
    expect(combinazioneValida('Ctrl+Ctrl+A')).toBe(false)
    expect(combinazioneValida('A')).toBe(false)
    expect(combinazioneValida('Shift+A')).toBe(false)
    expect(combinazioneValida('Ctrl+')).toBe(false)
    expect(combinazioneValida('Ctrl++')).toBe(false)
    expect(combinazioneValida(3)).toBe(false)
    expect(combinazioneValida(undefined)).toBe(false)
  })
})

describe('normalizzaScorciatoie', () => {
  it('senza niente dà le predefinite, e ogni azione ne ha una', () => {
    const s = normalizzaScorciatoie(undefined)
    expect(s).toEqual(SCORCIATOIE_PREDEFINITE)
    for (const a of AZIONI) expect(typeof s[a]).toBe('string')
  })

  it('tiene quelle scritte bene, anche vuote, e rimette di fabbrica quelle scritte male', () => {
    const s = normalizzaScorciatoie({ nuovaChat: 'Alt+N', drive: '', quaderno: 'boh', extra: 'Ctrl+Z' })
    expect(s.nuovaChat).toBe('Alt+N')
    expect(s.drive).toBe('')
    expect(s.quaderno).toBe(SCORCIATOIE_PREDEFINITE.quaderno)
    expect('extra' in s).toBe(false)
  })
})

describe('azionePer e doppioni', () => {
  it('trova l’azione di una combinazione, e niente per il vuoto', () => {
    expect(azionePer(SCORCIATOIE_PREDEFINITE, 'Ctrl+Tab')).toBe('workspaceSuccessivo')
    expect(azionePer(SCORCIATOIE_PREDEFINITE, 'Alt+9')).toBe('workspace9')
    expect(azionePer(SCORCIATOIE_PREDEFINITE, 'Ctrl+Z')).toBeUndefined()
    expect(azionePer({ ...SCORCIATOIE_PREDEFINITE, drive: '' }, '')).toBeUndefined()
    expect(azionePer(SCORCIATOIE_PREDEFINITE, undefined)).toBeUndefined()
  })

  it('le predefinite non hanno doppioni; un doppione si vede con le due azioni', () => {
    expect(doppioni(SCORCIATOIE_PREDEFINITE).size).toBe(0)
    const d = doppioni({ ...SCORCIATOIE_PREDEFINITE, drive: 'Ctrl+Shift+N' })
    expect([...d.entries()]).toEqual([['Ctrl+Shift+N', ['nuovaChat', 'drive']]])
  })
})

describe('workspaceDaAzione', () => {
  const nomi = ['Uno', 'Due', 'Tre']
  it('gira in tondo avanti e indietro', () => {
    expect(workspaceDaAzione('workspaceSuccessivo', nomi, 'Uno')).toBe('Due')
    expect(workspaceDaAzione('workspaceSuccessivo', nomi, 'Tre')).toBe('Uno')
    expect(workspaceDaAzione('workspacePrecedente', nomi, 'Uno')).toBe('Tre')
  })
  it('il numero va al posto giusto; fuori elenco o già lì non fa niente', () => {
    expect(workspaceDaAzione('workspace2', nomi, 'Uno')).toBe('Due')
    expect(workspaceDaAzione('workspace5', nomi, 'Uno')).toBeUndefined()
    expect(workspaceDaAzione('workspace1', nomi, 'Uno')).toBeUndefined()
  })
  it('con un workspace solo non c’è dove andare', () => {
    expect(workspaceDaAzione('workspaceSuccessivo', ['Uno'], 'Uno')).toBeUndefined()
    expect(workspaceDaAzione('workspaceSuccessivo', [], 'Uno')).toBeUndefined()
  })
})
