import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'

/**
 * Le domande in un posto solo (30/10). Prima stavano in tre posti: la colonna
 * Domande, le domande brevi a lato della chat e la linguetta «Domande» della
 * scheda dell'autopilota. Resta la colonna: ci arrivano le domande delle chat e
 * quelle dell'autopilota del workspace (chiedi_utente), e si rispondono lì.
 */
const app = readFileSync('src/renderer/App.tsx', 'utf8')
const chat = readFileSync('src/renderer/components/ChatAutopilota.tsx', 'utf8')
const colonna = readFileSync('src/renderer/components/PannelloDomande.tsx', 'utf8')
const panoramica = readFileSync('src/renderer/components/WorkspacePanoramica.tsx', 'utf8')

describe('le domande in un posto solo', () => {
  it('la linguetta «Domande» e le domande a lato non ci sono più', () => {
    expect(existsSync('src/renderer/components/DomandeAutopilota.tsx')).toBe(false)
    expect(existsSync('src/renderer/components/DomandeALato.tsx')).toBe(false)
    expect(app).not.toContain('DomandeALato')
    expect(panoramica).not.toContain('DomandeALato')
  })
  it('la colonna risponde anche all autopilota, senza rimandare a una linguetta', () => {
    expect(colonna).not.toContain('sierradeck:domande-autopilota')
    expect(colonna).not.toContain('haLinguetta')
    expect(colonna).not.toContain('mostraDomande')
  })
  it('anche una domanda dell autopilota apre la colonna, e il tasto «Domande» apre sempre la colonna', () => {
    expect(app).toContain('decidiColonnaDomande({ conversazioni: c.map(({ autopilota: _ap, ...x }) => x),')
    expect(app).toContain("onDomande={() => commutaColonna('domande')}")
    expect(app).not.toContain('pannello.mostraDomande')
  })
  it('la chat con lui non risponde alle domande: dice che sono nella colonna', () => {
    expect(chat).not.toContain('window.gestore.autopilota.rispondi(')
    expect(chat).toContain('è nella colonna Domande')
  })
})
