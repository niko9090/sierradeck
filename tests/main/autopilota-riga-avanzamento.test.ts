import { describe, it, expect } from 'vitest'
import { paginaClient } from '../../src/main/client-pagina'

/** La riga fissa «Avanzamento N%» sotto il titolo dell'autopilota, sempre visibile. */
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
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const riga = new Function(`${funzione('percentoAvanzamento')}; ${funzione('rigaAvanzamentoAp')}; return rigaAvanzamentoAp`)() as (ap: unknown, av: unknown) => string
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const riassunto = new Function(`${funzione('riassuntoApTesto')}; return riassuntoApTesto`)() as (ap: unknown, d: unknown) => string

describe('la riga fissa dell’avanzamento', () => {
  it('c’è con 80%', () => {
    const h = riga({ avanzamento: { percento: 80 } }, null)
    expect(h).toContain('Avanzamento 80%')
    expect(h).toContain('width:80%')
  })
  it('usa il dato letto dall’avanzamento, se c’è', () => {
    expect(riga({}, { orchestratore: { percento: 40 } })).toContain('Avanzamento 40%')
  })
  it('scrive «—» quando il dato manca', () => {
    expect(riga({}, null)).toContain('Avanzamento —')
    expect(riga({ avanzamento: {} }, { errore: 'x' })).toContain('Avanzamento —')
  })
  it('resta anche con i criteri, e fuori dal riassunto', () => {
    const ap = { stato: 'lavoro', criteri: 3, fatti: 1, avanzamento: { percento: 80 } }
    expect(riga(ap, null)).toContain('Avanzamento 80%')
    expect(riassunto(ap, null)).toBe('al lavoro · criteri 1/3 · 0 giri')
    expect(riassunto({ stato: 'lavoro', criteri: 0, fatti: 0, avanzamento: { percento: 80 } }, null)).not.toContain('%')
  })
  it('è montata sotto il titolo, prima del riassunto chiuso', () => {
    const a = script.indexOf('rigaAvanzamentoAp(apAperto, apAvanzamento)')
    const b = script.indexOf('<button class="riassunto-ap')
    expect(a).toBeGreaterThan(0)
    expect(a).toBeLessThan(b)
  })
})
