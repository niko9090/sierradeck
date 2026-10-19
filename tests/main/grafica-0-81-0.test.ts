import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { nomeLinguetta, NOME_LINGUETTA_MAX, LARGHEZZA_LINGUETTA } from '@shared/panoramica'

/**
 * La rifinitura grafica della 0.81.0, ultimo giro di c-12
 * (`grafica-prima-0-80-0.md`, «Voci aperte, fatte per la 0.81.0»).
 */
describe('1. le linguette delle chat nella Panoramica non si tagliano a metà parola', () => {
  it('un nome che ci sta resta intero', () => {
    expect(nomeLinguetta('Sviluppo', 'SierraDeck · Spiega somma.js')).toBe('Sviluppo · Spiega…')
    expect(nomeLinguetta(undefined, 'Spiega somma.js')).toBe('Spiega somma.js')
    expect(nomeLinguetta('Revisione', 'Scrivi')).toBe('Revisione · Scrivi')
  })
  it('un nome lungo si taglia dopo l ultima parola intera, con «…»', () => {
    const n = nomeLinguetta('Sviluppo', 'Aggiungi media.js con i suoi test')
    expect(n).toBe('Sviluppo · Aggiungi…')
    expect(n.length).toBeLessThanOrEqual(NOME_LINGUETTA_MAX + 1)
    for (const titolo of ['una due tre quattro cinque sei sette', 'Correggi il pulsante della barra in basso']) {
      const t = nomeLinguetta('Sviluppo', titolo)
      // Ogni parola prima di «…» è una parola intera del titolo.
      for (const p of t.replace(/…$/, '').replace(/^Sviluppo · /, '').split(' ')) expect(titolo.split(' ')).toContain(p)
    }
  })
  it('una parola sola più lunga della linguetta è l unico caso tagliato in mezzo', () => {
    expect(nomeLinguetta(undefined, 'x'.repeat(40))).toBe(`${'x'.repeat(NOME_LINGUETTA_MAX - 1)}…`)
  })
  it('la linguetta del PC è larga quanto conta la regola delle linguette visibili', () => {
    const css = readFileSync('src/renderer/console.css', 'utf8')
    expect(css).toContain(`.pan-linguetta { display: inline-flex; align-items: center; gap: 6px; max-width: ${LARGHEZZA_LINGUETTA}px;`)
  })
})

describe('2. i due «?» accanto a «Manda» dicono di cosa parlano', () => {
  it('PC: il dialogo con l autopilota e la dettatura hanno ognuno il suo nome', () => {
    expect(readFileSync('src/renderer/components/ChatAutopilota.tsx', 'utf8')).toContain('<Aiuto di="come parlare all’autopilota">')
    expect(readFileSync('src/renderer/components/TastoMicrofono.tsx', 'utf8')).toContain('<Aiuto di="la dettatura con il microfono">')
  })
  it('pagina: aiuto() porta il nome nel aria-label; senza nome resta «Spiegazione»', async () => {
    const { paginaClient } = await import('../../src/main/client-pagina')
    const html = paginaClient()
    const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
    const i = script.indexOf('function aiuto(')
    const corpo = script.slice(i, script.indexOf('\n}', i) + 2)
    const aiuto = new Function('esc', 'aiutiAperti', `${corpo}; return aiuto`)((s: unknown) => String(s), {}) as (id: string, t: string, di?: string) => string
    expect(aiuto('mic-x', 'spiega', 'la dettatura con il microfono')).toContain('aria-label="Spiegazione: la dettatura con il microfono"')
    expect(aiuto('x', 'spiega')).toContain('aria-label="Spiegazione"')
    expect(script).toContain("aiuto('mic-' + id, spiega, 'la dettatura con il microfono')")
    expect(script).toContain('aria-label="Spiegazione: come parlare all’autopilota"')
  })
})
