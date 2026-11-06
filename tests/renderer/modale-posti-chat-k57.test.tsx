import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/** k-57: «N di M chat» è un tasto, e la sua finestra sceglie il massimo. */

describe('modale «Quante chat insieme»', () => {
  it('l’indicatore è un tasto che apre la finestra', () => {
    const src = readFileSync('src/renderer/components/PostiChat.tsx', 'utf8')
    expect(src).toContain('<button type="button" className="posti-chat__tasto"')
    expect(src).toContain('<ModalePostiChat')
    expect(src).toContain('<Aiuto di="Chat al lavoro insieme">')
  })

  it('il sorgente ha tutti i pezzi, e salva nelle preferenze', () => {
    const src = readFileSync('src/renderer/components/ModalePostiChat.tsx', 'utf8')
    for (const parte of ['aria-label="Meno chat"', 'aria-label="Più chat"', 'aria-label="Numero massimo di chat"', 'Automatico', '<Aiuto di="Quante chat insieme">', 'origineCorta(posti)', 'avvisoCarico(posti)', 'FRASE_LIMITE_PROCESSO']) {
      expect(src).toContain(parte)
    }
    expect(src).toContain('postiScelti: scelti')
    expect(src).toContain('leggiCampoPosti(testo)')
  })
})
