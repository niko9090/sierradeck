import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { TASTI_REMOTI, tastoDaEvento, tastoRemotoValido, BARRA_TASTI } from '@shared/tasti-remoti'

/** 0.102.2: Esc, frecce, Tab, Ctrl+C in una chat di un altro PC, da un elenco chiuso. */
const ev = (key: string, p: Partial<{ ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }> = {}) => ({ key, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...p })

describe('i tasti remoti', () => {
  it('solo i nomi conosciuti passano: mai una sequenza arbitraria', () => {
    expect(tastoRemotoValido('esc')).toBe(true)
    expect(tastoRemotoValido('\x1b')).toBe(false)
    expect(tastoRemotoValido('toString')).toBe(false)
    expect(tastoRemotoValido(undefined)).toBe(false)
  })
  it('le sequenze sono quelle del terminale', () => {
    expect(TASTI_REMOTI.esc).toBe('\x1b')
    expect(TASTI_REMOTI['ctrl-c']).toBe('\x03')
    expect(TASTI_REMOTI['shift-tab']).toBe('\x1b[Z')
    expect(TASTI_REMOTI.su).toBe('\x1b[A')
  })
  it('dalla tastiera', () => {
    expect(tastoDaEvento(ev('Escape'))).toBe('esc')
    expect(tastoDaEvento(ev('Tab', { shiftKey: true }))).toBe('shift-tab')
    expect(tastoDaEvento(ev('c', { ctrlKey: true }))).toBe('ctrl-c')
    expect(tastoDaEvento(ev('v', { ctrlKey: true }))).toBeUndefined()
    expect(tastoDaEvento(ev('a'))).toBeUndefined()
  })
  it('la barretta usa solo tasti dell’elenco', () => {
    for (const b of BARRA_TASTI) expect(tastoRemotoValido(b.tasto)).toBe(true)
  })
  it('la rotta sta dietro al PIN come le altre rotte delle chat', () => {
    const r = readFileSync('src/main/client-rotte.ts', 'utf8')
    expect(r).toMatch(/ROTTE_DENTRO_CHAT = new Set\(\[[^\]]*'\/api\/tasto'/)
    expect(r).toContain('deps.tastiAChat(chat, [TASTI_REMOTI[tasto]])')
  })
})
