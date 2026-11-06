import { describe, it, expect } from 'vitest'
import { paginaClient } from '../../src/main/client-pagina'

/**
 * k-54: il menu Specialisti nella chat dell'autopilota, sulla pagina del
 * telefono. Le funzioni vere si estraggono dallo script, come vanno al telefono.
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

type Voce = Record<string, unknown>
type Vista = { posti: { usati: number; tetto: number }; alLavoro: Voce[]; inFila: Voce[]; totale?: { minuti: number; compiti: number } }

function disegna(vista: Vista | 'vecchio' | null, aperto: boolean, conferma = ''): string {
  const f = new Function('vista', 'aperto', 'conferma', `
    var attesaVista = vista, attesaNota = '', menuSpecAperto = aperto, menuSpecConferma = conferma
    var apDettaglio = { cwd: 'C:\\\\Lavori\\\\Mio' }
    var aiutiAperti = {}
    function aiuto(id, t) { return '<AIUTO ' + id + '>' }
    ${riga('const esc =')}
    ${[...['menuSpecialisti'], 'menuSpecRiferimenti', 'menuSpecEtichetta', 'menuSpecHtml'].map(estrai).join('\n')}
    return menuSpecHtml({ cwd: 'C:\\\\Lavori\\\\Mio' })
  `)
  return f(vista, aperto, conferma) as string
}

const lista: Vista = {
  posti: { usati: 2, tetto: 4 },
  alLavoro: [
    { posto: 1, id: 'a1', workspace: 'C:\\Lavori\\Altro', descrizione: 'prova', titolo: 'Prova <b>', cosaFa: 'Legge i file', percentuale: 40, minutiStimati: 12 },
    { posto: 2, id: 'a2', workspace: 'C:\\Lavori\\Mio', descrizione: 'tabella', titolo: 'Tabella', fermaRichiesta: true }
  ],
  inFila: [
    { id: 'f1', posizione: 1, workspace: 'C:\\Lavori\\Altro', descrizione: 'ricerca', titolo: 'Ricerca', minutiStimati: 20 },
    { id: 'f2', posizione: 2, workspace: 'C:\\Lavori\\Mio', descrizione: 'ultima', titolo: 'Ultima' }
  ],
  totale: { minuti: 45, compiti: 4 }
}

describe('la pagina: menu Specialisti nella chat dell’autopilota', () => {
  it('lo script resta JavaScript valido e il menu è nella vista dell’autopilota', () => {
    expect(() => new Function(script)).not.toThrow()
    expect(estrai('vistaAutopilota')).toContain('menuSpecHtml(a)')
  })

  it('chiuso: solo il tasto con i conteggi; servizio vecchio: niente', () => {
    const h = disegna(lista, false)
    expect(h).toContain('Specialisti 2 · 2 in fila')
    expect(h).not.toContain('Precedenza')
    expect(disegna('vecchio', true)).toBe('')
  })

  it('aperto: percentuale, barretta, cosa fa, minuti, totale e tasti; il testo del titolo è protetto', () => {
    const h = disegna(lista, true)
    expect(h).toContain('40%')
    expect(h).toContain('width:40%')
    expect(h).toContain('Legge i file')
    expect(h).toContain('mancano circa 12 min')
    expect(h).toContain('attesa circa 20 min')
    expect(h).toContain('circa 45 min per finire tutto')
    expect(h).toContain('Apri Specialisti')
    expect(h).toContain('Prova &lt;b&gt;')
    expect(h).not.toContain('Prova <b>')
    expect(h).toContain('· Altro')
    expect(h).not.toContain('C:')
  })

  it('«↑ Precedenza» per tutti, «Ferma» solo per chi lavora e non è già in fermata', () => {
    const h = disegna(lista, true)
    expect(h.match(/data-m="cima"/g)).toHaveLength(4)
    expect(h.match(/menuSpecFerma\(/g)).toHaveLength(1)
    expect(h).toContain('fermata chiesta…')
    expect(h).toMatch(/data-m="cima" disabled/)
  })

  it('la conferma dice cosa succede e manda la mossa «ferma»', () => {
    const h = disegna(lista, true, 'a1')
    expect(h).toContain('Lo fermo e lo metto in cima alla fila: il suo lavoro resta salvato.')
    expect(h).toContain('data-id="a1" data-m="ferma"')
  })

  it('il «perché» sta dietro un «?»', () => {
    expect(disegna(lista, true)).toContain('<AIUTO menu-spec>')
  })

  it('le mosse vanno alla rotta delle priorità, con id e mossa', () => {
    expect(script).toContain("mossaAttesa('/api/specialisti/attesa/priorita', { id: el.dataset.id, mossa: el.dataset.m })")
  })
})
