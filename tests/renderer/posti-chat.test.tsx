import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { PostiChat } from '../../src/renderer/components/PostiChat'
import { VOCI } from '../../src/shared/impostazioni-struttura'
import { normalizzaPreferenze } from '../../src/shared/preferenze'

/**
 * «N di M chat» sul PC (0.82.0): nella fascia in alto, sempre in vista, con il
 * «?»; «più chat / meno chat» nelle Impostazioni.
 */
describe('«N di M chat» sul PC (0.82.0)', () => {
  it('sta nella fascia in alto, accanto alla versione', () => {
    const src = readFileSync('src/renderer/components/Console.tsx', 'utf8')
    expect(src).toContain('<PostiChat />')
    expect(src.indexOf('<PostiChat />')).toBeLessThan(src.indexOf('className="versione"'))
  })

  it('prima della risposta del servizio non inventa numeri', () => {
    expect(renderToStaticMarkup(<PostiChat />)).toBe('')
  })

  it('la riga e il «?» vengono dalle funzioni condivise, le stesse della pagina e dell app', () => {
    const src = readFileSync('src/renderer/components/PostiChat.tsx', 'utf8')
    expect(src).toContain('rigaPosti(p)')
    expect(src).toContain('spiegaPosti(p)')
    expect(src).toContain('<Aiuto di="Chat al lavoro insieme">')
  })
})

describe('«più chat / meno chat» nelle Impostazioni (0.82.0)', () => {
  it('è una voce di «Chat e autopiloti», sul PC', () => {
    expect(VOCI.find((v) => v.id === 'posti-chat')).toMatchObject({ sezione: 'chat', dove: ['pc'] })
  })

  it('tre scelte: meno chat, come dice il PC, più chat', () => {
    const src = readFileSync('src/renderer/components/PannelloImpostazioni.tsx', 'utf8')
    expect(src).toContain("[[-1, 'Meno chat'], [0, 'Come dice il PC'], [1, 'Più chat']]")
    expect(src).toContain('cambia({ postiChat: v })')
  })

  it('la preferenza si salva solo se è una delle tre; «come dice il PC» non si scrive', () => {
    expect(normalizzaPreferenze({ postiChat: 1 }).postiChat).toBe(1)
    expect(normalizzaPreferenze({ postiChat: -1 }).postiChat).toBe(-1)
    expect(normalizzaPreferenze({ postiChat: 0 }).postiChat).toBeUndefined()
    expect(normalizzaPreferenze({ postiChat: 5 }).postiChat).toBeUndefined()
  })
})
