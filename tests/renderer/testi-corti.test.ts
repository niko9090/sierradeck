import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 0.62.0, decisione di Nicholas del 12/10: «non si riesce a leggere tutta la
 * pappardella, piuttosto metti un punto di domanda e uno apre la spiegazione
 * di quello che non sa». Nei pannelli restano tasti e righe corte; le
 * spiegazioni lunghe stanno dentro <Aiuto>.
 */
const cartella = join(__dirname, '../../src/renderer/components')
const file = readdirSync(cartella).filter((f) => f.endsWith('.tsx'))
const sorgente = (f: string): string => readFileSync(join(cartella, f), 'utf8')

/**
 * Il testo dei paragrafi <p> fuori da <Aiuto>, senza tag ed espressioni.
 * Gli esiti e gli avvisi restano a vista per scelta: quelli con una
 * condizione (`{x ? … : …}`), con il segno ⚠ o con dentro i tasti da
 * premere sono stati e istruzioni, non spiegazioni.
 */
function paragrafiLunghi(t: string, oltre: number): string[] {
  const senzaAiuto = t.replace(/<Aiuto\b[\s\S]*?<\/Aiuto>/g, '')
  const lunghi: string[] = []
  for (const m of senzaAiuto.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)) {
    const dentro = m[1] ?? ''
    if (/\{[^{}]*\?/.test(dentro) || dentro.includes('⚠') || dentro.includes('<button')) continue
    const testo = dentro.replace(/<[^>]*>/g, '').replace(/\{[^{}]*\}/g, '').replace(/\s+/g, ' ').trim()
    if (testo.length > oltre) lunghi.push(testo.slice(0, 80))
  }
  return lunghi
}

describe('testi corti, la spiegazione dietro al «?» (0.62.0)', () => {
  it('nessun pannello ha paragrafi fissi lunghi fuori da <Aiuto>', () => {
    const trovati = file.flatMap((f) => paragrafiLunghi(sorgente(f), 260).map((p) => `${f}: ${p}…`))
    expect(trovati).toEqual([])
  })
  it('le voci del menu principale hanno il loro «?»', () => {
    for (const f of ['PannelloChat.tsx', 'VistaProgetti.tsx', 'PannelloSalute.tsx', 'PannelloImpostazioni.tsx', 'PannelloDomande.tsx', 'PannelloAutopiloti.tsx']) {
      expect(sorgente(f), f).toContain('<Aiuto')
    }
    expect(sorgente('PannelloChat.tsx')).not.toContain('hub__spiega')
  })
  it('il «?» si chiude con Esc prima del pannello sotto, e non tocca le caselle', () => {
    const a = sorgente('Aiuto.tsx')
    expect(a).toContain('stopImmediatePropagation')
    expect(a).toContain("addEventListener('keydown', suTasto, true)")
    expect(a).toContain('e.preventDefault()')
  })
})
