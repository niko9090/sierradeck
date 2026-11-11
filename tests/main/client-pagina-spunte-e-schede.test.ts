import { describe, it, expect } from 'vitest'
import { paginaClient } from '../../src/main/client-pagina'

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

describe('11/11: le notifiche della pagina vengono dal registro degli avvisi del PC', () => {
  type Chiamata = { percorso: string; corpo?: unknown }
  function banco(risposte: unknown[], o: { permesso?: string; visibile?: boolean } = {}) {
    const mandate: { titolo: string; corpo: string; tag: string; muta: boolean; chiusa: boolean }[] = []
    const chiamate: Chiamata[] = []
    const permessi: string[] = []
    class N {
      static permission = o.permesso ?? 'granted'
      static requestPermission(): void { permessi.push('chiesto') }
      voce: { titolo: string; corpo: string; tag: string; muta: boolean; chiusa: boolean }
      onclick: (() => void) | null = null
      onclose: (() => void) | null = null
      constructor(titolo: string, x: { body: string; tag: string; silent: boolean }) { this.voce = { titolo, corpo: x.body, tag: x.tag, muta: x.silent, chiusa: false }; mandate.push(this.voce) }
      close(): void { this.voce.chiusa = true }
    }
    const coda = [...risposte]
    const fn = new Function('Notification', 'document', 'chiamate', 'coda', `
      var avvisiUltimo = -1; var avvisiInCorso = false; var notificheAperte = {}; var avvisiLettiIl = 0; var avvisiVisti = null
      function inVista() { return false }
      function chiedi(percorso, corpo) { chiamate.push({ percorso: percorso, corpo: corpo }); return Promise.resolve(percorso.indexOf('/api/eventi') === 0 ? coda.shift() : {}) }
      ${funzione('mostraNotifica')}; ${funzione('mostraAvvisi')}; ${funzione('avvisaSeServe')}; return avvisaSeServe`)(
      N, { visibilityState: o.visibile === true ? 'visible' : 'hidden' }, chiamate, coda
    ) as (s?: unknown) => void
    const giro = async (): Promise<void> => { fn({}); await new Promise((r) => setTimeout(r, 0)) }
    return { mandate, chiamate, permessi, giro }
  }
  const domanda = (n: number, x: Record<string, unknown> = {}) => ({ n, id: 'domanda:d-' + n, tipo: 'domanda', titolo: 'Negozio chiede', testo: 'Tengo?', sotto: 'Consigliata: sì', quando: '', suona: true, bersaglio: { cosa: 'domanda', id: 'd-' + n }, ...x })

  it('all’apertura legge solo il numero; poi ogni avviso nuovo è una notifica con l’id come etichetta, e dice fin dove ha ricevuto', async () => {
    const b = banco([{ ultimo: 7, avvisi: [domanda(7)] }, { ultimo: 8, avvisi: [domanda(8)] }, { ultimo: 8, avvisi: [] }])
    await b.giro()
    expect(b.mandate).toEqual([])
    await b.giro()
    await b.giro()
    expect(b.mandate).toEqual([{ titolo: 'Negozio chiede', corpo: 'Tengo? · Consigliata: sì', tag: 'domanda:d-8', muta: false, chiusa: false }])
    expect(b.chiamate.map((c) => c.percorso)).toEqual(['/api/eventi?avvisi=0&attesa=0', '/api/eventi?avvisi=7&attesa=0', '/api/avvisi/visto', '/api/eventi?avvisi=8&attesa=0'])
    expect(b.chiamate[2]!.corpo).toEqual({ fino: 8 })
  })

  it('una chiusura toglie la sua notifica; «ho scelto io» arriva muta', async () => {
    const b = banco([{ ultimo: 1, avvisi: [] }, { ultimo: 2, avvisi: [domanda(2)] }, { ultimo: 3, avvisi: [domanda(2, { n: 3, suona: false, chiuso: { quando: '', come: 'programma', testo: 'Sì' } })] }])
    await b.giro(); await b.giro(); await b.giro()
    expect(b.mandate.map((m) => [m.tag, m.chiusa, m.muta, m.corpo])).toEqual([
      ['domanda:d-2', true, false, 'Tengo? · Consigliata: sì'],
      ['domanda:d-2', false, true, 'Tengo? · Ho scelto io: Sì.']
    ])
  })

  it('un avviso silenzioso è muto; con la pagina davanti non si notifica (tranne la prova)', async () => {
    const b = banco([{ ultimo: 1, avvisi: [] }, { ultimo: 3, avvisi: [domanda(2, { suona: false }), { ...domanda(3), id: 'prova:1', tipo: 'sapere' }] }], { visibile: true })
    await b.giro(); await b.giro()
    expect(b.mandate.map((m) => m.tag)).toEqual(['prova:1'])
    const c = banco([{ ultimo: 1, avvisi: [] }, { ultimo: 2, avvisi: [domanda(2, { suona: false })] }])
    await c.giro(); await c.giro()
    expect(c.mandate.map((m) => m.muta)).toEqual([true])
  })

  it('il permesso si chiede alla prima domanda vera, non all’apertura', async () => {
    const b = banco([{ ultimo: 1, avvisi: [domanda(1)] }, { ultimo: 2, avvisi: [{ ...domanda(2), tipo: 'fatto' }] }, { ultimo: 3, avvisi: [domanda(3)] }], { permesso: 'default' })
    await b.giro(); await b.giro()
    expect(b.permessi).toEqual([])
    await b.giro()
    expect(b.permessi).toEqual(['chiesto'])
    expect(b.mandate).toEqual([])
    const c = script.slice(script.indexOf('function chiediDiAvvisare('))
    expect(c.slice(0, 120)).not.toContain('requestPermission')
  })

  it('la schermata Notifiche della pagina: le stesse scelte del PC, dal computer', () => {
    expect(script).toContain("chiedi('/api/avvisi/stato')")
    expect(script).toContain("chiedi('/api/avvisi/impostazioni', x)")
    expect(script).toContain("chiedi('/api/avvisi/prova', {})")
    expect(funzione('avvisiPaginaHtml')).toContain('Prova notifica')
    expect(script).toContain('var NOMI_TIPI_AVVISO = {"domanda":{"titolo":"Domande"')
    expect(script).toContain('avvisiPaginaHtml()')
  })
})

describe('0.74.0: pagina, la riga «dal vivo» non allarga la pagina', () => {
  it('ogni riga sotto è un blocco suo, tagliato con i puntini', () => {
    expect(html).toMatch(/\.voce__sotto \{[^}]*white-space: nowrap;[^}]*display: block; max-width: 100%;/)
  })
})

describe('0.74.1: pagina, «Torna come prima» della trasformazione dei workspace', () => {
  it('la sezione si disegna dallo stato del PC e il tasto chiama la rotta giusta', () => {
    const f = new Function('esc', `var aiutiAperti = {}; ${funzione('aiuto')}; var migrazioneVista = null; var notaMigrazione = ''; ${funzione('migrazioneHtml')}; return function (s) { migrazioneVista = s; return migrazioneHtml() }`)((x: string) => x) as (s: unknown) => string
    expect(f(null)).toBe('')
    const fatta = f({ stato: 'fatta', dormienti: [{}, {}, {}] })
    // 0.80.0: il numero dice gli autopiloti nuovi, non i workspace; la spiegazione nel «?».
    expect(fatta).toContain('Fatta: Panoramica nuova in 3 workspace')
    expect(fatta).toContain('data-aiuto="migrazione"')
    expect(f({ stato: 'fatta', dormienti: [] })).toContain('Fatta: ogni workspace aveva già il suo autopilota.')
    expect(fatta).toContain(`onclick="cambiaMigrazione('torna')"`)
    expect(f({ stato: 'fallita', motivo: 'disco pieno' })).toContain(`cambiaMigrazione('rifai')`)
    expect(f({ stato: 'fallita', motivo: 'disco pieno' })).toContain('disco pieno')
  })
})
