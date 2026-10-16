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

describe('0.77.0: la Panoramica sul telefono', () => {
  const pan = new Function('esc', 'aiuto', 'apPc', `const RUOLO_NOME = { sviluppo: 'Sviluppo' }; const SIMBOLO_SCHEDA = { chiede: '◆', lavora: '●', ferma: '■', finita: '✓' }; const PAROLA_SCHEDA = { chiede: 'aspetta te', lavora: 'al lavoro', ferma: 'ferma', finita: 'finita' }; ${funzione('panoramicaHtml')}; return panoramicaHtml`)((x: string) => x, (_i: string, t: string) => `[?${t}]`, null) as (p: unknown) => string
  it('riga dell’autopilota, «aspettano te», una scheda per chat con 2 righe dal vivo; il tocco apre la chat', () => {
    const html = pan({
      riassunto: { obiettivo: 'Fai passare la suite', stato: { parola: 'al lavoro', colore: 'verde' }, criteri: { testo: '1/2' } },
      schede: [
        { id: 'p-3', titolo: 'chiede', stato: 'chiede', ultimaAzione: '', righe: [] },
        { id: 'p-2', titolo: 'Sviluppo · Notte', stato: 'lavora', ruolo: 'sviluppo', ultimaAzione: 'scrive il test', righe: ['a', 'b', 'c'] },
        { id: 'fine-c-1', titolo: 'fatto', stato: 'finita', ultimaAzione: 'finito', righe: [] }
      ]
    })
    expect(html).toContain('Fai passare la suite')
    expect(html).toContain('1 chat aspetta te')
    expect(html).toContain('onclick="apriDaPanoramica(this.dataset.chat)"')
    expect(html).toContain('<span>b</span><span>c</span>')
    expect(html).not.toContain('<span>a</span>')
    expect(html.indexOf('p-3')).toBeLessThan(html.indexOf('p-2'))
    expect(html).toContain(' disabled>')
  })
})
