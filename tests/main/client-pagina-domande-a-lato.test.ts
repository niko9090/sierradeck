import { describe, it, expect } from 'vitest'
import { paginaClient } from '../../src/main/client-pagina'
import { domandaBreve, type Conversazione } from '@shared/domande-conversazioni'

/**
 * 0.76.0 sulla pagina del telefono: dentro una chat, la sua domanda breve sta
 * in cima con i tasti e «Scrivi tu». La regola è la stessa del PC e dell'app.
 */
const html = paginaClient()
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
function funzione(nome: string): string {
  const inizio = script.indexOf(`function ${nome}`)
  if (inizio < 0) throw new Error(`${nome} non trovata`)
  let profondita = 0
  for (let i = script.indexOf('{', inizio); i < script.length; i += 1) {
    if (script[i] === '{') profondita += 1
    else if (script[i] === '}' && --profondita === 0) return script.slice(inizio, i + 1)
  }
  throw new Error(`${nome} non chiusa`)
}
const breveJs = new Function(`${funzione('domandaBreveJs')}; return domandaBreveJs`)() as (c: unknown) => boolean

const conv = (domanda: string, scelte: number, x: Partial<Conversazione> = {}): Conversazione => ({
  chiave: 'chat:p1', tipo: 'chat', titolo: 't', sotto: '', chiede: true, messaggi: [], risposta: { via: 'scrivi', chat: 'p1' } as never, segnaposto: '',
  scheda: { chi: 'Chat', domanda, scelte: Array.from({ length: scelte }, (_, i) => ({ testo: `s${i}` })), dettagli: [], segnaposto: '' },
  ...x
})

describe('pagina: le domande brevi a lato', () => {
  it('la regola della pagina è quella del PC e dell’app, caso per caso', () => {
    const casi = [conv('Rosso o blu?', 2), conv('Rosso o blu?', 5), conv('x'.repeat(201), 1), conv(`${'x'.repeat(10)}…`, 1), conv('ok?', 2, { chiede: false }), conv('ok?', 0)]
    for (const c of casi) expect(breveJs(c)).toBe(domandaBreve(c))
  })
  it('dentro la chat la domanda breve sta in cima; la pagina legge le domande anche quando la chat aperta chiede', () => {
    expect(script).toContain('${domandaALatoHtml(aperta.id)}')
    expect(script).toContain("if (scheda === 'domande' || ferma) leggiDomande()")
    expect(funzione('domandaALatoHtml')).toContain("'chat:' + idChat")
  })
})
