import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * La linguetta «Domande» sul PC (0.38.0): c'è solo quando ci sono domande,
 * con il numerino; una domanda nuova la porta avanti; finite, si torna dov'eri.
 * Le domande non si rispondono più dalla chat con l'autopilota.
 */
const diario = readFileSync('src/renderer/components/DiarioAutopilota.tsx', 'utf8')
const chat = readFileSync('src/renderer/components/ChatAutopilota.tsx', 'utf8')
const colonna = readFileSync('src/renderer/components/PannelloDomande.tsx', 'utf8')

describe('la linguetta «Domande» della scheda dell autopilota', () => {
  it('compare solo con domande aperte, con il numerino, e si fa avanti quando ne arriva una', () => {
    expect(diario).toContain("LINGUETTE.filter((l) => (l.id !== 'domande' || schede.length > 0) && !staccate.includes(l.id))")
    expect(diario).toContain('diario__scheda-conto--domande')
    expect(diario).toContain("domandaArrivata(viste.current, schede) && !staccate.includes('domande')")
    // Finite: si torna dov'eri.
    expect(diario).toContain("setLinguetta((l) => (l === 'domande' ? primaDelleDomande.current : l))")
  })
  it('la chat con lui non risponde più alle domande: gli si parla e basta', () => {
    expect(chat).not.toContain('window.gestore.autopilota.rispondi(')
    expect(chat).toContain('nella linguetta «Domande»')
  })
  it('nella colonna a fianco un autopilota è una riga che porta alla sua linguetta', () => {
    expect(colonna).toContain('ti aspetta (${c.quante ?? 1}) → apri')
    expect(colonna).toContain("'sierradeck:domande-autopilota'")
    expect(diario).toContain("'sierradeck:domande-autopilota'")
  })
})
