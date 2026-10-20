import { describe, it, expect } from 'vitest'
import { paginaClient } from '../../src/main/client-pagina'

/**
 * Il menu dei workspace sulla pagina (0.82.0), come sul PC: la ricerca in
 * cima, i gruppi «Recenti» e uno per PC, le azioni dietro «⋯». Si prova il
 * pezzo di script che gira nel telefono, con 30 workspace finti.
 */
const html = paginaClient()
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
const pezzo = (inizio: string, fine: string): string => script.slice(script.indexOf(inizio), script.indexOf(fine, script.indexOf(inizio)))

const trenta = Array.from({ length: 30 }, (_, i) => `Prova ${String(i + 1).padStart(2, '0')}`)
const stato = {
  workspace: {
    nomi: trenta, attivo: 'Prova 07', recenti: ['Prova 03', 'Prova 20'],
    chat: [{ sessione: 's1', workspace: 'Prova 07', titolo: 'una' }, { sessione: 's2', workspace: 'Prova 07', titolo: 'due' }],
    altrove: [{ pc: 'p2', nome: 'Portatile', workspace: ['Solo di là'] }]
  }
}

type Menu = {
  lista: () => string
  cerca: (t: string) => void
  apri: (k: string) => void
  tocca: (k: string) => void
  fai: (el: { dataset: Record<string, string> }) => void
  chiamate: string[]
  elemento: { innerHTML: string }
}

function menu(): Menu {
  const chiamate: string[] = []
  const elemento = { innerHTML: '' }
  const m = new Function('esc', 'aiuto', 'confermaHtml', 'pannello', 'vaiA', 'apriCartella', 'chiediAzione', 'drivePortaWs', 'document', 'registra',
    'var ultimoStato = ' + JSON.stringify(stato) + '; var window = {}; var AIUTO_ELIMINA_WS = "x";\n' +
    pezzo('function gruppiMenuWorkspace(', 'var REGOLE =') + '\n' +
    pezzo('var wsFiltro = ', 'window.rinominaWorkspace =') +
    ';return { lista: function () { return wsListaHtml(ultimoStato) }, cerca: window.wsCerca, apri: window.wsApriAzioni, tocca: window.wsTocca, fai: window.wsFai }'
  )(
    (t: string) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
    (id: string) => `[?${id}]`,
    (k: string) => `[conferma ${k}]`,
    () => { chiamate.push('pannello') },
    (n: string) => { chiamate.push(`vaiA ${n}`) },
    (q: { workspace: string }) => { chiamate.push(`cartella ${q.workspace}`) },
    (t: string, n: string) => { chiamate.push(`${t} ${n}`) },
    (n: string) => { chiamate.push(`porta ${n}`) },
    { getElementById: (id: string) => (id === 'ws-lista' ? elemento : null) },
    undefined
  ) as Omit<Menu, 'chiamate' | 'elemento'>
  return { ...m, chiamate, elemento }
}

describe('il menu dei workspace sulla pagina (0.82.0)', () => {
  it('lo script resta valido', () => {
    expect(() => new Function(script)).not.toThrow()
  })

  it('c’è la ricerca in cima e l’elenco in un riquadro che scorre', () => {
    expect(script).toContain('id="ws-cerca"')
    expect(script).toContain('oninput="wsCerca(this.value)"')
    expect(html).toMatch(/\.ws-elenco \{ max-height: 60vh; overflow-y: auto;/)
  })

  it('gruppi: Recenti (dove sei in cima), Questo PC con gli altri, un gruppo per l’altro PC', () => {
    const h = menu().lista()
    const titoli = [...h.matchAll(/<div class="ws-titolo">([^<]*)<\/div>/g)].map((x) => x[1])
    expect(titoli).toEqual(['Recenti', 'Questo PC', 'Portatile'])
    const nomi = [...h.matchAll(/<span class="ws-nome">([^<]*)<\/span>/g)].map((x) => x[1])
    expect(nomi.slice(0, 3)).toEqual(['Prova 07', 'Prova 03', 'Prova 20'])
    expect(nomi).toHaveLength(31)
    expect(new Set(nomi).size).toBe(31)
    expect(h).toContain('2 chat')
    expect(h).toContain('aria-current="true"')
    // Le azioni stanno dietro «⋯»: chiuse, nessun tasto Rinomina o Elimina in vista.
    expect(h).not.toContain('Rinomina')
    expect(h).not.toContain('Elimina')
  })

  it('la ricerca ridisegna solo l’elenco (la casella non perde il fuoco), senza accenti né maiuscole', () => {
    const m = menu()
    m.cerca('PROVA 1')
    expect(m.chiamate).toEqual([])
    const nomi = [...m.elemento.innerHTML.matchAll(/<span class="ws-nome">([^<]*)<\/span>/g)].map((x) => x[1])
    expect(nomi).toEqual(['Prova 10', 'Prova 11', 'Prova 12', 'Prova 13', 'Prova 14', 'Prova 15', 'Prova 16', 'Prova 17', 'Prova 18', 'Prova 19'])
    m.cerca('zzz')
    expect(m.elemento.innerHTML).toContain('Nessun workspace con «zzz»')
  })

  it('«⋯» di un workspace di qui: apri, rinomina, Apri cartella, Elimina; ognuna fa la sua cosa', () => {
    const m = menu()
    m.apri('q:Prova 12')
    const h = m.lista()
    for (const a of ['data-a="apri"', 'data-a="rinomina"', 'data-a="cartella"', 'data-a="elimina"']) expect(h, a).toContain(a)
    expect(h).not.toContain('data-a="sposta"')
    const el = (a: string): { dataset: Record<string, string> } => ({ dataset: { n: 'Prova 12', a } })
    m.fai(el('apri'))
    m.fai(el('cartella'))
    m.fai(el('elimina'))
    expect(m.chiamate.filter((c) => c !== 'pannello')).toEqual(['vaiA Prova 12', 'cartella Prova 12', 'eliminaWorkspace Prova 12'])
  })

  it('toccare una riga di qui ci va; una dell’altro PC apre «⋯» con «Porta qui»', () => {
    const m = menu()
    m.tocca('q:Prova 02')
    expect(m.chiamate).toEqual(['vaiA Prova 02'])
    m.tocca('a:p2:Solo di là')
    const h = m.lista()
    expect(h).toContain('data-a="portaQui"')
    expect(h).not.toContain('data-a="apri"')
    m.fai({ dataset: { n: 'Solo di là', a: 'portaQui' } })
    expect(m.chiamate).toContain('porta Solo di là')
  })

  it('dove sei: «Sei qui» spento; rinomina apre la casella sotto la riga', () => {
    const m = menu()
    m.apri('q:Prova 07')
    expect(m.lista()).toMatch(/data-a="apri" disabled/)
    m.fai({ dataset: { n: 'Prova 07', a: 'rinomina' } })
    expect(m.lista()).toContain('id="ws-rinomina" value="Prova 07"')
  })
})
