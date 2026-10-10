import { describe, it, expect } from 'vitest'
import { paginaClient } from '../../src/main/client-pagina'

/**
 * La pagina servita (0.58.4): una conversazione che vive su un altro PC si
 * scrive da qui, quel PC la avvia in sottofondo; il riquadro dice lo stato e,
 * se fallisce, il perché con Riprova. Mai un campo muto.
 */
describe('la pagina: scrivere a una chat chiusa su un altro PC', () => {
  const html = paginaClient()
  const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
  const estrai = (nome: string): string => {
    const inizio = script.indexOf(`function ${nome}(`)
    if (inizio < 0) throw new Error(nome)
    let p = 0
    for (let i = script.indexOf('{', inizio); i < script.length; i++) {
      if (script[i] === '{') p++
      else if (script[i] === '}' && --p === 0) return script.slice(inizio, i + 1)
    }
    throw new Error(nome)
  }
  const riga = (inizio: string): string => script.split(String.fromCharCode(10)).find((r) => r.trimStart().startsWith(inizio)) ?? ''
  const disegna = (stato: unknown): string => (new Function('sfStato', 'sessioniViste', `
    ${riga('const esc =')}
    var sfScelta = 0
    ${estrai('testoAvvio')} ${estrai('sottofondoHtml')}
    return sottofondoHtml()`) as (s: unknown, v: unknown) => string)(stato, [{ id: 's-1', titolo: 'Prova', cwd: 'C:\\Prove', altrove: 'PORTATILE-ESEMPIO', altrovePc: 'pc-esempio' }])

  it('il riquadro c’è, con il campo e i tasti', () => {
    const h = disegna(null)
    for (const t of ['Scrivi a «Prova» su PORTATILE-ESEMPIO', 'in sottofondo', 'sf-testo', 'Manda', 'Avvia senza scrivere']) expect(h).toContain(t)
  })
  it('mentre parte dice cosa succede, con il messaggio in attesa', () => {
    const h = disegna({ fase: 'avvio', testo: 'ciao', id: 'p-1', messaggio: 'avviata in sottofondo' })
    expect(h).toContain('La sto avviando su PORTATILE-ESEMPIO')
    expect(h).toContain('in attesa: «ciao»')
  })
  it('se fallisce: il perché e Riprova', () => {
    const h = disegna({ fase: 'errore', testo: 'ciao', id: 'p-1', messaggio: 'la casa di questa chat è PC-ESEMPIO' })
    expect(h).toContain('Perché: la casa di questa chat è PC-ESEMPIO')
    expect(h).toContain('Riprova')
  })
  it('le funzioni ci sono e passano dal ponte', () => {
    expect(script).toContain("percorso: '/api/sottofondo/avvia'")
    expect(script).toContain("percorso: '/api/sottofondo/stato'")
    // Lo script della pagina si legge (niente errori di sintassi).
    expect(() => new Function(script)).not.toThrow()
  })
})
