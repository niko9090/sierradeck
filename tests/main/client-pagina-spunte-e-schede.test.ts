import { describe, it, expect } from 'vitest'
import { paginaClient } from '../../src/main/client-pagina'
import { messaggiCompatti, type StatoMessaggio } from '../../src/shared/stato-dal-vivo'

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

describe('pagina: messaggi con la spunta', () => {
  const js = new Function(`${funzione('messaggiCompattiJs')}; return messaggiCompattiJs`)() as (m: StatoMessaggio[]) => unknown

  it('dà lo stesso risultato della funzione del PC', () => {
    const m: StatoMessaggio[] = [
      { id: 'a', testo: 'scrivimi', stato: 'in attesa', dettaglio: 'in attesa da 8 min', mandaAdesso: true },
      { id: 'b', testo: 'e il rapporto', stato: 'in attesa', dettaglio: 'in attesa da 5 min', mandaAdesso: true },
      { id: 'v', testo: 'in volo', stato: 'in consegna', dettaglio: 'in consegna alla chat' },
      { id: 'c1', testo: 'due', stato: 'consegnato', dettaglio: 'consegnato alle 10:01' },
      { id: 'c0', testo: 'uno', stato: 'consegnato', dettaglio: 'consegnato alle 10:00' }
    ]
    const pc = messaggiCompatti(m)
    expect(js(m)).toEqual({ segni: pc.segni, fermo: pc.fermo })
    expect(js(m.slice(3))).toEqual({ segni: messaggiCompatti(m.slice(3)).segni, fermo: null })
  })

  it('non c è più una riga «consegnato alle» per messaggio', () => {
    const corpo = funzione('messaggiApHtml')
    expect(corpo).toContain('messaggiCompattiJs(m)')
    expect(corpo).not.toContain('x.dettaglio')
  })
})

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

describe('0.74.0: pagina, solo notifiche utili', () => {
  function banco() {
    const mandate: { titolo: string; tag: string }[] = []
    class N { static permission = 'granted'; static requestPermission(): void {} constructor(titolo: string, o: { tag: string }) { mandate.push({ titolo, tag: o.tag }) } }
    let ora = Date.parse('2026-10-15T20:00:00Z')
    const registro: string[] = []
    const fn = new Function('Notification', 'Date', 'registro', `var avvisati = {}; var primoAvviso = false; var ultimoAvvisoIl = undefined; var ATTESA_CHAT_MS = 3 * 60000;
      function chiedi(percorso, corpo) { registro.push(percorso + ' ' + corpo.tipo + ' ' + corpo.titolo); return Promise.resolve() }
      ${funzione('avvisiDaMostrare')}; ${funzione('sceltaDaAnnunciare')}; ${funzione('avvisaSeServe')}; return avvisaSeServe`)(
      N, { now: () => ora }, registro
    ) as (s: unknown) => void
    return { mandate, registro, giro: (s: unknown, piu = 0): void => { ora += piu; fn(s) } }
  }
  it('una chat che finisce un turno e riparte subito non avvisa; dopo tre minuti di attesa sì, una volta', () => {
    const b = banco()
    const ferma = { chat: [{ id: 'c1', titolo: 'Trading', aspetta: true }] }
    const lavora = { chat: [{ id: 'c1', titolo: 'Trading', aspetta: false }] }
    b.giro(ferma); b.giro(ferma, 2 * 60000); b.giro(lavora, 30000)
    expect(b.mandate).toEqual([])
    b.giro(ferma, 60000); b.giro(ferma, 3 * 60000); b.giro(ferma, 60000)
    expect(b.mandate).toEqual([{ titolo: 'Trading ha finito il turno', tag: 'chat-c1' }])
  })
  it('scelta e attesa della stessa chat hanno la stessa etichetta (una notifica per chat); la versione pronta non è una notifica (0.81.0)', () => {
    const b = banco()
    b.giro({ chat: [{ id: 'c1', titolo: 'Trading', chiede: true }] })
    // La versione pronta non aspetta te, non è un lavoro finito né un errore: resta la banda nella pagina.
    b.giro({ chat: [], aggiornamento: { fase: 'pronto', versione: '0.74.0' } }, 30_000)
    b.giro({ chat: [], aggiornamento: { fase: 'pronto', versione: '0.74.0' } }, 30_000)
    expect(b.mandate).toEqual([{ titolo: 'Trading aspetta che tu scelga', tag: 'chat-c1' }])
  })
})

describe('0.80.0: pagina, notifiche raggruppate e nel registro', () => {
  function banco() {
    const mandate: { titolo: string; tag: string }[] = []
    class N { static permission = 'granted'; static requestPermission(): void {} constructor(titolo: string, o: { tag: string }) { mandate.push({ titolo, tag: o.tag }) } }
    let ora = Date.parse('2026-10-19T12:00:00Z')
    const registro: string[] = []
    const fn = new Function('Notification', 'Date', 'registro', `var avvisati = {}; var primoAvviso = false; var ultimoAvvisoIl = undefined; var ATTESA_CHAT_MS = 3 * 60000;
      function chiedi(percorso, corpo) { registro.push(percorso + ' ' + corpo.da + ' ' + corpo.tipo + ' ' + corpo.titolo + ' | ' + corpo.causa + (corpo.gruppo ? ' | ' + corpo.gruppo : '')); return Promise.resolve() }
      ${funzione('avvisiDaMostrare')}; ${funzione('sceltaDaAnnunciare')}; ${funzione('avvisaSeServe')}; return avvisaSeServe`)(
      N, { now: () => ora }, registro
    ) as (s: unknown) => void
    return { mandate, registro, giro: (s: unknown, piu = 0): void => { ora += piu; fn(s) } }
  }

  it('tre domande insieme: una notifica sola, e nel registro del computer ognuna con la sua causa (0.81.0)', () => {
    const b = banco()
    b.giro({ domande: [{ id: 'd1', autopilotaId: 'ap-1', testo: 'a' }, { id: 'd2', testo: 'b' }, { id: 'd3', testo: 'c' }] })
    expect(b.mandate).toEqual([{ titolo: '3 cose aspettano te', tag: 'sierradeck-gruppo' }])
    expect(b.registro).toEqual([
      '/api/avviso-mostrato pagina domanda SierraDeck ti sta chiedendo una cosa | domanda ap-1: a | 3',
      '/api/avviso-mostrato pagina domanda SierraDeck ti sta chiedendo una cosa | domanda d2: b | 3',
      '/api/avviso-mostrato pagina domanda SierraDeck ti sta chiedendo una cosa | domanda d3: c | 3'
    ])
  })

  it('fermo e finito hanno la causa nel registro; un fermo che riparte da solo non avvisa (0.81.0)', () => {
    const b = banco()
    b.giro({ autopiloti: [{ id: 'ap-1', nome: 'Sito', stato: 'lavoro' }, { id: 'ap-2', nome: 'App', stato: 'lavoro' }] })
    b.giro({ autopiloti: [{ id: 'ap-1', nome: 'Sito', stato: 'sospeso', motivo: 'la chat non parte', fermo: 'k1' }, { id: 'ap-2', nome: 'App', stato: 'sospeso', motivo: 'limiti', fermo: 'k2', riparteDaSolo: true }] }, 30_000)
    b.giro({ autopiloti: [{ id: 'ap-1', nome: 'Sito', stato: 'finito' }] }, 60_000)
    expect(b.mandate.map((m) => m.titolo)).toEqual(['Sito si è fermato', 'Sito ha finito'])
    expect(b.registro).toEqual([
      '/api/avviso-mostrato pagina fermo Sito si è fermato | autopilota ap-1 sospeso: la chat non parte',
      '/api/avviso-mostrato pagina finito Sito ha finito | autopilota ap-1 finito'
    ])
  })

  it('il riepilogo di «Errori arrivati» ha la sua causa nel registro, come gli altri (c-241)', () => {
    const b = banco()
    b.giro({ autopiloti: [{ id: 'ap-e', nome: 'Errori arrivati', stato: 'lavoro', annuncio: { id: 'n-1', titolo: 'Errori arrivati: il riepilogo' } }] })
    expect(b.mandate.map((m) => m.titolo)).toEqual(['Errori arrivati: il riepilogo'])
    expect(b.registro).toEqual([
      '/api/avviso-mostrato pagina annuncio Errori arrivati: il riepilogo | annuncio n-1 di «Errori arrivati»: un riepilogo che aspetta te'
    ])
  })

  it('una scelta che va e viene ogni 3 s si annuncia una volta, anche per una chat governata (il permesso lo dai tu)', () => {
    const b = banco()
    for (let i = 0; i < 10; i++) {
      b.giro({ chat: [{ id: 'g', titolo: 'Governata', chiede: i % 2 === 0, governata: true }] }, 3000)
    }
    expect(b.mandate.map((m) => m.titolo)).toEqual(['Governata aspetta che tu scelga'])
  })

  it('aperta la pagina, le domande già lì non si annunciano (si vedono nella pagina)', () => {
    const mandate: string[] = []
    class N { static permission = 'granted'; static requestPermission(): void {} constructor(titolo: string) { mandate.push(titolo) } }
    const fn = new Function('Notification', `var avvisati = {}; var primoAvviso = true; var ultimoAvvisoIl = undefined; var ATTESA_CHAT_MS = 3 * 60000;
      function chiedi() { return Promise.resolve() }
      ${funzione('avvisiDaMostrare')}; ${funzione('sceltaDaAnnunciare')}; ${funzione('avvisaSeServe')}; return avvisaSeServe`)(N) as (s: unknown) => void
    fn({ domande: [{ id: 'd1', testo: 'già aperta' }] })
    fn({ domande: [{ id: 'd1', testo: 'già aperta' }, { id: 'd2', testo: 'nuova' }] })
    expect(mandate).toEqual(['SierraDeck ti sta chiedendo una cosa'])
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
    expect(fatta).toContain('Fatta: 3 autopiloti nuovi')
    expect(fatta).toContain('data-aiuto="migrazione"')
    expect(f({ stato: 'fatta', dormienti: [] })).toContain('Fatta: ogni workspace aveva già il suo autopilota.')
    expect(fatta).toContain(`onclick="cambiaMigrazione('torna')"`)
    expect(f({ stato: 'fallita', motivo: 'disco pieno' })).toContain(`cambiaMigrazione('rifai')`)
    expect(f({ stato: 'fallita', motivo: 'disco pieno' })).toContain('disco pieno')
  })
})
