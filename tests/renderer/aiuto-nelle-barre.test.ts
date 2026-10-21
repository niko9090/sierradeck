import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { posizioneFissa } from '../../src/renderer/components/Aiuto'

/**
 * 0.82.0, trovato nelle foto della copia di prova (c-39): il «?» di «N di M
 * chat» nella barra in alto si apriva, ma la barra (`.console`, che scorre di
 * lato) lo tagliava a una striscia di pochi pixel. Dentro una barra il fumetto
 * si apre `fixed`, alle coordinate del tasto.
 */
describe('il «?» dentro una barra che taglia', () => {
  const finestra = { larghezza: 1280, altezza: 800 }
  const tasto = { left: 1001, right: 1021, top: 17, bottom: 37 }

  it('si apre sotto il tasto, verso sinistra vicino al bordo destro', () => {
    expect(posizioneFissa(tasto, finestra, true, false)).toEqual({ position: 'fixed', top: 43, bottom: 'auto', left: 'auto', right: 259 })
  })

  it('lontano dal bordo destro parte dal tasto', () => {
    expect(posizioneFissa({ left: 100, right: 120, top: 17, bottom: 37 }, finestra, false, false)).toEqual({ position: 'fixed', top: 43, bottom: 'auto', left: 100, right: 'auto' })
  })

  it('nella metà bassa si apre verso l’alto, sopra il tasto', () => {
    expect(posizioneFissa({ left: 100, right: 120, top: 700, bottom: 720 }, finestra, false, true)).toMatchObject({ top: 'auto', bottom: 106 })
  })

  it('non si attacca mai al bordo: almeno 8 px', () => {
    expect(posizioneFissa({ left: 1260, right: 1280, top: 17, bottom: 37 }, finestra, true, false)).toMatchObject({ right: 8 })
  })

  it('vale solo dentro le barre `.console`, che tagliano davvero quello che esce', () => {
    const aiuto = readFileSync('src/renderer/components/Aiuto.tsx', 'utf8')
    expect(aiuto).toContain("closest('.console')")
    const css = readFileSync('src/renderer/console.css', 'utf8')
    expect(css).toMatch(/\.console \{[^}]*overflow-x: auto;/)
  })
})
