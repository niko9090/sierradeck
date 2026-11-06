import { describe, it, expect } from 'vitest'
import { paginaClient } from '../../src/main/client-pagina'
import { SEZIONI_ALTRO, apriSezioneAltro, pannelliDelPosto, postoIniziale } from '../../src/shared/navigazione-telefono'

/**
 * k-49: la sezione «Specialisti» nella pagina del telefono (Altro →
 * Specialisti), con gli stessi tasti del PC. Le funzioni vere si estraggono
 * dallo script, come vanno al telefono.
 */
const html = paginaClient()
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
const ORA = Date.parse('2026-11-06T12:00:00Z')
const iso = (min: number): string => new Date(ORA + min * 60_000).toISOString()

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

/** Disegna la sezione con quella lista (o con `null`/`'vecchio'`) e quella conferma aperta. */
function disegna(vista: Vista | 'vecchio' | null, conferma = '', nota = ''): string {
  const f = new Function('vista', 'conferma', 'nota', 'adesso', `
    var attesaVista = vista, attesaConferma = conferma, attesaNota = nota
    var aiutiAperti = {}
    function aiuto(id, t) { return '<AIUTO ' + id + '>' }
    function pannello() {}
    var Date = { now: function () { return adesso }, parse: globalThis.Date.parse }
    ${riga('const esc =')}
    ${riga('const escJs =')}
    ${['nomeWorkspace', 'daQuanto', 'quantoManca', 'postiTesto', 'prioritaTesto', 'minutiTesto', 'totaleTesto', 'attesaHtml'].map(estrai).join('\n')}
    return attesaHtml()
  `)
  return f(vista, conferma, nota, ORA) as string
}

const lista: Vista = {
  posti: { usati: 3, tetto: 4 },
  alLavoro: [{ posto: 1, id: 'a1', workspace: 'C:\\Lavoro\\Nexora', compito: 'k-40', descrizione: 'rifai la tabella', tipo: 'specialista-ui', dal: iso(-12) }],
  inFila: [
    { id: 'f1', posizione: 1, workspace: 'Nexora', compito: 'k-50', descrizione: 'nuova scheda', tipo: 'specialista-ui', dal: iso(-5), priorita: 0, prenotata: true, prenotataFino: iso(3) },
    { id: "f'2", posizione: 2, workspace: 'Altro', descrizione: 'ricerca <b>', tipo: 'ricerca', dal: iso(-2), priorita: 2, prenotata: false }
  ]
}

describe('la pagina: Specialisti', () => {
  it('lo script resta JavaScript valido', () => {
    expect(() => new Function(script)).not.toThrow()
  })

  it('sta in Altro, dopo le prime quattro sezioni (quelle dell’app), e il suo posto è «aperto»', () => {
    const i = SEZIONI_ALTRO.findIndex((s) => s.id === 'specialisti')
    expect(i).toBeGreaterThanOrEqual(4)
    expect(SEZIONI_ALTRO[i]).toMatchObject({ titolo: 'Specialisti', impostazioni: false })
    expect(pannelliDelPosto(apriSezioneAltro(postoIniziale(), 'specialisti'))).toEqual(['specialisti'])
  })

  it('mostra i posti, chi lavora e chi è in fila, con i tasti', () => {
    const h = disegna(lista)
    expect(h).toContain('3 di 4 posti occupati')
    expect(h).toContain('Al lavoro adesso')
    expect(h).toContain('Posto 1')
    expect(h).toContain('Nexora')
    expect(h).not.toContain('C:\\Lavoro')
    expect(h).toContain('lavora da 12 min')
    expect(h).toContain('In fila')
    expect(h).toContain('aspetta da 5 min')
    expect(h).toContain('priorità alta 2')
    expect(h).toContain('tocca a lui')
    expect(h).toContain('ancora 3 min')
    expect(h.match(/tocca a lui/g)).toHaveLength(1)
    for (const t of ['>\u2191</button>', '>\u2193</button>', '>In cima</button>', '>Togli</button>']) expect(h, t).toContain(t)
    for (const m of ['su', 'giu', 'cima']) expect(h, m).toContain("attesaMossa('f1', '" + m + "')")
  })

  it('il testo della lista non esce dal suo posto e l’id con l’apice non diventa codice', () => {
    const h = disegna(lista)
    expect(h).toContain('ricerca &lt;b&gt;')
    expect(h).not.toContain('ricerca <b>')
    expect(h).not.toContain("attesaTogli('f'2')")
    expect(h).toContain("attesaTogli('f\\'2')")
  })

  it('il primo non va su né in cima, l’ultimo non va giù', () => {
    const h = disegna(lista)
    expect(h).toContain("aria-label=\"Sposta più in alto\" disabled onclick=\"attesaMossa('f1', 'su')\"")
    expect(h).toContain("aria-label=\"Sposta più in basso\" onclick=\"attesaMossa('f1', 'giu')\"")
    expect(h).toContain("aria-label=\"Sposta più in basso\" disabled onclick=\"attesaMossa('f\\'2', 'giu')\"")
  })

  it('«Togli» chiede conferma: la domanda e «Sì, togli» / «No» al posto delle mosse di quella voce', () => {
    const h = disegna(lista, 'f1')
    expect(h).toContain('Toglierla dalla fila?')
    expect(h).toContain('attesaSi(')
    expect(h).toContain('attesaAnnulla()')
    expect(disegna(lista)).not.toContain('Toglierla dalla fila?')
  })

  it('fila vuota, servizio vecchio, lettura in corso, errore dopo una mossa', () => {
    const vuota: Vista = { posti: { usati: 0, tetto: 4 }, alLavoro: [], inFila: [] }
    const v = disegna(vuota)
    expect(v).toContain('Nessuno in fila')
    expect(v).toContain('Nessuno al lavoro')
    expect(disegna('vecchio')).toContain('Serve la versione nuova del servizio')
    expect(disegna(null)).toContain('Leggo la lista')
    expect(disegna(lista, '', 'Non è andata')).toContain('Non è andata')
  })

  it('stime: totale, workspace, titolo, cosa fa, percentuale, minuti, in ritardo, parcheggiato', () => {
    const ricca: Vista = {
      posti: { usati: 1, tetto: 4 },
      alLavoro: [{ posto: 1, id: 'a1', workspace: 'Nexora', workspaceNome: 'Nexora', compito: 'k-40', descrizione: 'lungo testo', titolo: 'Rifai la tabella', cosaFa: 'Modifica Tabella.tsx', percentuale: 40, minutiStimati: 12, inRitardo: true, tipo: 'specialista-ui', dal: iso(-12) }],
      inFila: [{ id: 'f1', posizione: 1, workspace: 'Altro', workspaceNome: 'Altro', descrizione: 'ricerca', minutiStimati: 75, tipo: 'ricerca', dal: iso(-2), priorita: 0, prenotata: false, parcheggiata: true }],
      totale: { minuti: 90, compiti: 4 }
    }
    const h = disegna(ricca)
    expect(h).toContain('Circa 1 h 30 min per finire tutto · 4 compiti')
    expect(h).toContain('<b>Nexora</b>')
    expect(h).toContain('Rifai la tabella')
    expect(h).not.toContain('lungo testo')
    expect(h).toContain('Modifica Tabella.tsx')
    expect(h).toContain('value="40"')
    expect(h).toContain('mancano circa 12 min')
    expect(h).toContain('in ritardo')
    expect(h).toContain('circa 1 h 15 min per finire')
    expect(h).toContain('parcheggiato')
    expect(disegna(lista)).not.toContain('per finire tutto')
  })

  it('chi lavora ha «↑ Precedenza» (cima) e «Ferma» con conferma; fermata chiesta senza tasti', () => {
    const l: Vista = { ...lista, alLavoro: [{ posto: 1, id: 'a1', workspace: 'Nexora', descrizione: 'x', tipo: 't', dal: iso(-1) }, { posto: 2, id: 'a2', workspace: 'Nexora', descrizione: 'y', tipo: 't', dal: iso(-1), fermaRichiesta: true }] }
    const h = disegna(l)
    expect(h).toContain("attesaMossa('a1', 'cima')\">↑ Precedenza</button>")
    expect(h).toContain("attesaFerma('a1')\">Ferma</button>")
    expect(h).toContain('fermata chiesta…')
    expect(h).not.toContain("attesaFerma('a2')")
    const c = disegna(l, 'f:a1')
    expect(c).toContain('Lo fermo e lo metto in cima alla fila: il suo lavoro resta salvato')
    expect(c).toContain("attesaMossa('a1', 'ferma')")
  })

  it('la pagina ha la funzione del tasto Ferma e il testo del «?» senza apostrofi dritti né backtick', () => {
    expect(script).toContain('window.attesaFerma = ')
    const i = html.indexOf('I minuti si stimano')
    expect(i).toBeGreaterThan(-1)
    const aiuto = html.slice(i, html.indexOf("')", i))
    expect(aiuto).toContain('non ferma mai chi lavora')
    expect(aiuto).not.toContain('`')
  })

  it('le tre richieste vanno alle rotte del computer, e le funzioni dei tasti ci sono', () => {
    expect(script).toContain("'/api/specialisti/attesa'")
    expect(script).toContain("'/api/specialisti/attesa/priorita'")
    expect(script).toContain("'/api/specialisti/attesa/togli'")
    for (const f of ['attesaMossa', 'attesaTogli', 'attesaAnnulla', 'attesaSi', 'attesaRileggi']) expect(script, f).toContain(`window.${f} = `)
    // Si rilegge da sola ogni 4 secondi finché la sezione è aperta.
    expect(script).toMatch(/if \(!aperto\('specialisti'\)[^\n]*\n[^\n]*leggiAttesa\(\)[\s\S]{0,80}\}, 4000\)/)
  })
})
