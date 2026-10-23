import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SchedaDomandaVista } from '../../src/renderer/components/SchedaDomandaVista'
import { paginaClient } from '../../src/main/client-pagina'
import { schedaDaParti } from '@shared/scheda-domanda'
import { partiBloccato, SCELTA_DICO_IO, SCELTA_LASCIA_STARE, SCELTA_SOSPENDI } from '@shared/domanda-strutturata'

/**
 * 0.84.3 (punto aperto della Revisione di c-95): la conseguenza sotto ogni
 * scelta di «sono bloccato» era provata nella scheda comune e nell'app, non
 * nel disegno del PC e della pagina. Qui si disegna davvero, su tutti e due.
 */
const scheda = schedaDaParti('autopilota «App Android» · SierraDeck', partiBloccato({
  lavoro: 'App Android: analisi, correzioni e allineamento',
  falliti: [{ descrizione: 'Le domande dagli altri PC si premono al primo colpo' }],
  tentativi: 6,
  strade: ['capire', 'cambiare strada'],
  errori: 'AssertionError: expected 120000 to be less than 9000',
  ultimaStrada: true,
  continua: true
}))

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
// L'esc vero della pagina, non una copia.
const rigaEsc = script.slice(script.indexOf('const esc = '), script.indexOf('\n', script.indexOf('const esc = ')))
const esc = new Function(`${rigaEsc}; return esc`)() as (x: string) => string
const sceltePagina = new Function('esc', `${funzione('etichettaScelta')}; ${funzione('sceltePagina')}; return { sceltePagina, etichettaScelta }`)(esc) as {
  sceltePagina: (s: unknown[], tasto: (c: unknown) => string) => string
  etichettaScelta: (c: unknown) => string
}

describe('«sono bloccato»: sotto ogni tasto si vede cosa succede', () => {
  it('la scheda ha tre scelte, ognuna con la sua conseguenza', () => {
    expect(scheda.scelte.map((c) => c.testo)).toEqual([SCELTA_LASCIA_STARE, SCELTA_DICO_IO, SCELTA_SOSPENDI])
    for (const c of scheda.scelte) expect(c.conseguenza?.length ?? 0).toBeGreaterThan(20)
  })

  it('sul PC: una riga per scelta, il tasto e sotto la conseguenza', () => {
    const out = renderToStaticMarkup(<SchedaDomandaVista scheda={scheda} inCorso={false} onScelta={() => {}} onScrivi={() => {}} />)
    expect(out).toContain('scheda-domanda__scelte--spiegate')
    expect(out.match(/scheda-domanda__scelta"/g)).toHaveLength(3)
    for (const c of scheda.scelte) expect(out).toContain(`→ ${esc(c.conseguenza!)}`)
    // Il tasto viene prima della sua conseguenza, nella stessa riga.
    const prima = out.indexOf(SCELTA_LASCIA_STARE)
    expect(prima).toBeGreaterThan(-1)
    expect(out.indexOf(esc(scheda.scelte[0]!.conseguenza!))).toBeGreaterThan(prima)
  })

  it('sulla pagina del telefono: lo stesso, con la funzione vera della pagina', () => {
    const tasto = (c: unknown): string => '<button>' + sceltePagina.etichettaScelta(c) + '</button>'
    const out = sceltePagina.sceltePagina(scheda.scelte, tasto)
    expect(out).toContain('scelte--spiegate')
    expect(out.match(/class="scelta-spiegata"/g)).toHaveLength(3)
    for (const c of scheda.scelte) expect(out).toContain(`→ ${esc(c.conseguenza!)}`)
  })

  it('le scelte senza conseguenza restano tasti in fila, come prima', () => {
    const vecchie = scheda.scelte.map(({ conseguenza: _c, ...c }) => c)
    const pc = renderToStaticMarkup(<SchedaDomandaVista scheda={{ ...scheda, scelte: vecchie }} inCorso={false} onScelta={() => {}} onScrivi={() => {}} />)
    expect(pc).not.toContain('scheda-domanda__conseguenza')
    const pagina = sceltePagina.sceltePagina(vecchie, () => '<button></button>')
    expect(pagina).toBe('<div class="scelte"><button></button><button></button><button></button></div>')
  })
})
