import { describe, it, expect } from 'vitest'
import { paginaClient } from '../../src/main/client-pagina'
import { messaggiCompatti, type StatoMessaggio } from '../../src/shared/stato-dal-vivo'

/**
 * 0.72.1 sulla pagina del telefono: le spunte al posto delle righe «consegnato
 * alle», calcolate come sul PC; e la domanda essenziale disegnata dalla
 * `scheda` del PC, senza la conversazione intorno.
 */
const html = paginaClient()
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))

function funzione(nome: string): string {
  const inizio = script.indexOf(`function ${nome}(`)
  let profondita = 0
  for (let i = script.indexOf('{', inizio); i < script.length; i += 1) {
    if (script[i] === '{') profondita += 1
    else if (script[i] === '}' && --profondita === 0) return script.slice(inizio, i + 1)
  }
  throw new Error(`${nome} non trovata`)
}

describe('pagina: messaggi con la spunta', () => {
  const js = new Function(`${funzione('messaggiCompattiJs')}; return messaggiCompattiJs`)() as (m: StatoMessaggio[]) => unknown

  it('dà lo stesso risultato della funzione del PC', () => {
    const m: StatoMessaggio[] = [
      { id: 'a', testo: 'scrivimi', stato: 'in attesa', dettaglio: 'in attesa da 8 min', mandaAdesso: true },
      { id: 'b', testo: 'e il rapporto', stato: 'in attesa', dettaglio: 'in attesa da 5 min', mandaAdesso: true },
      { id: 'v', testo: 'in volo', stato: 'in consegna', dettaglio: 'in consegna alla chat' },
      { id: 'c1', testo: 'due', stato: 'consegnato', dettaglio: 'consegnato alle 10:01' },
      { id: 'c0', testo: 'uno', stato: 'consegnato', dettaglio: 'consegnato alle 10:00' }
    ]
    const pc = messaggiCompatti(m)
    expect(js(m)).toEqual({ segni: pc.segni, fermo: pc.fermo })
    expect(js(m.slice(3))).toEqual({ segni: messaggiCompatti(m.slice(3)).segni, fermo: null })
  })

  it('non c è più una riga «consegnato alle» per messaggio', () => {
    const corpo = funzione('messaggiApHtml')
    expect(corpo).toContain('messaggiCompattiJs(m)')
    expect(corpo).not.toContain('x.dettaglio')
  })
})

describe('pagina: la domanda essenziale', () => {
  it('le Domande e la linguetta dell autopilota disegnano la scheda del PC', () => {
    expect(script).toContain('schedaDomandaHtml(aperta.scheda')
    expect(script).toContain('schedaDomandaHtml(d.scheda')
    // Il resto sta dietro il «?»: il dettaglio entra nell'aiuto, chiuso di partenza.
    expect(funzione('schedaDomandaHtml')).toContain("aiuto('sd-' + k, dettagli)")
  })
})

describe('0.73.1: pagina, controlli dal giro con i clic', () => {
  it('i menu a tendina hanno lo sfondo scuro come i tasti (il menu «Stato» dei Progetti era bianco)', () => {
    expect(html).toMatch(/button, input, textarea, select \{[^}]*background: var\(--chassis-premuto\)/)
  })
  it('il numero di «Aspettano te» non conta le risposte già date dall’autopilota', () => {
    const f = funzione('vistaConversazioni')
    expect(f).toContain("c.vista.id !== 'risposta'")
  })
})
