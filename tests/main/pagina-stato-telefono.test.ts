import { describe, it, expect } from 'vitest'
import { paginaClient } from '../../src/main/client-pagina'

/**
 * 11/11: la pagina del telefono con lo stato nuovo del PC. La frase di adesso
 * sulle righe dei workspace, la percentuale vera al posto di «criteri —», la
 * riga sotto le domande. Le funzioni vere si estraggono dallo script.
 */
const html = paginaClient()
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))

const estrai = (nome: string): string => {
  const inizio = script.indexOf(`function ${nome}(`)
  expect(inizio, `${nome} non è nella pagina`).toBeGreaterThan(-1)
  let p = 0
  for (let i = script.indexOf('{', inizio); i < script.length; i++) {
    if (script[i] === '{') p++
    else if (script[i] === '}' && --p === 0) return script.slice(inizio, i + 1)
  }
  throw new Error(`${nome} non si chiude`)
}
const riga = (inizio: string): string => script.split('\n').find((r) => r.startsWith(inizio)) ?? ''
const ambiente = (): string => [riga('const esc ='), riga('const COLORE_VISTA ='), riga('const COLORE_TONO =')].join('\n')

const sottoAp = (a: unknown, coda?: string): string =>
  new Function('a', 'coda', `${ambiente()}\n${estrai('fraseApHtml')}\n${estrai('sottoApHtml')}\nreturn sottoApHtml(a, coda)`)(a, coda) as string
const sottoDomanda = (seNonRispondi: string, decisa: unknown, tag?: string): string =>
  new Function('s', 'd', 't', `${ambiente()}\n${estrai('rigaDecisa')}\n${estrai('sottoDomandaHtml')}\nreturn sottoDomandaHtml(s, d, t)`)(seNonRispondi, decisa, tag) as string

const vista = { stato: { id: 'al-lavoro', parola: 'al lavoro', colore: 'verde' }, criteri: { fatti: 0, totali: 0, testo: '—' }, da: '12 min', ultima: 'scrive i test' }

describe('la riga di un autopilota sulla pagina', () => {
  it('la frase di adesso con il suo colore, la percentuale e quanto manca; niente «criteri»', () => {
    const h = sottoAp({ vista, adesso: { testo: 'Al lavoro: Sviluppo', tono: 'lavora' }, avanzamento: { percento: 40, mancaMin: 25 } })
    expect(h).toContain('Al lavoro: Sviluppo')
    expect(h).toContain('var(--verde')
    expect(h).toContain('40%')
    expect(h).toContain('mancano ~25 min')
    expect(h).toContain('scrive i test')
    expect(h).not.toContain('criteri')
    expect(sottoAp({ vista, adesso: { testo: 'Fermo: aspetta una tua risposta', tono: 'aspetta' }, avanzamento: { mancaMin: 150 } })).toContain('mancano ~3 ore')
    expect(sottoAp({ vista, adesso: { testo: 'x', tono: 'fermo' }, avanzamento: {} })).toContain('var(--rosso')
  })
  it('da un PC di prima: lo stato in una parola e «da …», mai «criteri —»', () => {
    const h = sottoAp({ vista }, ' · gira su PC-prova')
    expect(h).toContain('al lavoro')
    expect(h).toContain('da 12 min')
    expect(h).toContain('gira su PC-prova')
    expect(h).not.toContain('criteri')
  })
  it('nello script non resta «criteri —» sulle righe', () => {
    expect(script).not.toContain("' · criteri ' + esc(a.vista.criteri.testo)")
    expect(script).not.toContain('Math.round(a.fatti / a.criteri * 100) : 0)')
  })
})

describe('la riga sotto una domanda', () => {
  it('le funzioni condivise sono nella pagina così come sono', () => {
    expect(script).toContain('function rigaSeNonRispondi(')
    expect(script).toContain('function rigaDecisa(')
  })
  it('«Ha scelto il programma: X», o la riga di «se non rispondi»', () => {
    expect(sottoDomanda('', { come: 'programma', testo: 'Sì', quando: '' })).toContain('Ha scelto il programma: Sì')
    expect(sottoDomanda('Se non rispondi: fra 40 min scelgo io «Sì»', undefined)).toContain('fra 40 min scelgo io «Sì»')
    expect(sottoDomanda('Aspetta te: non scelgo io al posto tuo', undefined, 'div')).toMatch(/^<div class="sotto sotto-domanda">Aspetta te/u)
    expect(sottoDomanda('', undefined)).toBe('')
  })
  it('la spiegazione della casella non dice più che «quello che scrivi è la risposta»', () => {
    expect(script).not.toContain('quello che scrivi è la risposta')
    expect(script).toContain('un testo libero vale come risposta solo nella prima mezz’ora')
  })
})
