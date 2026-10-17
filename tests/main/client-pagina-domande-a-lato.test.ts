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

describe('0.78.0: la Panoramica 2 sul telefono', () => {
  const crea = (aperte: Record<string, boolean> = {}) => new Function('esc', 'aiuto', 'apPc', 'pannello', 'ultimoStato', `
    const RUOLO_NOME = { sviluppo: 'Sviluppo', revisione: 'Revisione' }; const SIMBOLO_SCHEDA = { chiede: '◆', lavora: '●', ferma: '■', finita: '✓' }; const PAROLA_SCHEDA = { chiede: 'aspetta te', lavora: 'al lavoro', ferma: 'ferma', finita: 'finita' };
    var panAperte = Object.assign({ criteri: false, finite: false, 'da-fare': false, 'in-corso': true, 'in-revisione': true, fatto: false, eventi: false }, ${JSON.stringify(aperte)});
    ${funzione('rigaApri')}; ${funzione('schedaTelHtml')}; ${funzione('panoramicaVecchiaHtml')}; ${funzione('riassuntoTelHtml')}; ${funzione('panoramicaHtml')}; return panoramicaHtml`)((x: string) => x, (_i: string, t: string) => `[?${t}]`, null, () => undefined, null) as (p: unknown, parte?: string) => string
  const schede = [
    { id: 'p-3', titolo: 'chiede', stato: 'chiede', ultimaAzione: '', righe: [] },
    { id: 'p-2', titolo: 'Sviluppo · Notte', stato: 'lavora', ruolo: 'sviluppo', specialista: true, ultimaAzione: 'scrive il test', righe: ['a', 'b', 'c', 'd'] },
    { id: 'p-9', titolo: 'una chat che c’era già', stato: 'ferma', ruolo: 'sviluppo', ultimaAzione: 'ha finito', righe: ['x'], soloMia: true },
    { id: 'fine-c-1', titolo: 'fatto', stato: 'finita', specialista: true, ultimaAzione: 'finito', righe: [] }
  ]
  const situazione = {
    obiettivo: 'Fai passare la suite',
    stato: { id: 'da-verificare', parola: 'da verificare', colore: 'ambra', simbolo: '◐', ragione: 'dice di aver finito, ma i criteri soddisfatti sono 0 su 2' },
    criteri: { fatti: 0, totali: 2, testo: '0/2', elenco: [{ descrizione: 'test verdi', esito: 'no', prova: 'npm test: 2 falliti' }, { descrizione: 'compila', esito: 'mai' }] }
  }
  const piano = [
    { fase: 'da-fare', nome: 'Da fare', compiti: [{ id: 'd', testo: 'Docs', fase: 'da-fare' }] },
    { fase: 'in-corso', nome: 'In corso', compiti: [{ id: 'c-2', testo: 'Somma', fase: 'in-corso', ruolo: 'sviluppo', chat: 'p-2' }] },
    { fase: 'in-revisione', nome: 'In revisione', compiti: [{ id: 'c-3', testo: 'Media', fase: 'in-revisione', ruolo: 'revisione', autore: 'sviluppo', giri: 1 }] },
    { fase: 'fatto', nome: 'Fatto', compiti: [{ id: 'c-1', testo: 'Prima', fase: 'fatto', ruolo: 'sviluppo' }] }
  ]
  it('situazione coerente, Adesso solo chi lavora o aspetta, Piano a liste, le altre chat, le finite chiuse', () => {
    const html = crea()({ situazione, piano, schede })
    expect(html).toContain('◐ da verificare')
    expect(html).toContain('Criteri 0/2')
    expect(html).not.toContain('test verdi')
    expect(html).toContain('Adesso · 2')
    expect(html.indexOf('p-3')).toBeLessThan(html.indexOf('p-2'))
    expect(html).toContain('<span>b</span><span>c</span><span>d</span>')
    expect(html).toContain('In corso · 1')
    expect(html).toContain('data-chat="p-2" onclick="apriDaPanoramica(this.dataset.chat)">')
    expect(html).toContain('di Sviluppo')
    expect(html).toContain('↺ 1')
    expect(html).not.toContain('>Docs<')
    expect(html).toContain('Chat · 1')
    expect(html).toContain('solo tua')
    expect(html).toContain('Finite: 1')
    expect(html).not.toContain('<span class="sotto">fatto</span>')
    expect(html).toContain('Conversazione')
  })
  it('aperti: i criteri uno per uno con la prova, le finite, «Da fare»', () => {
    const html = crea({ criteri: true, finite: true, 'da-fare': true })({ situazione, piano, schede })
    expect(html).toContain('test verdi')
    expect(html).toContain('npm test: 2 falliti')
    expect(html).toContain('mai controllato')
    expect(html).toContain('<span class="sotto">fatto</span>')
    expect(html).toContain('Docs')
  })
  it('nessuna chat al lavoro: una riga', () => {
    expect(crea()({ situazione, piano: [], schede: [schede[2]] })).toContain('Nessuna chat al lavoro.')
  })
  it('un PC della 0.77.0 senza situazione: la lista di prima', () => {
    const html = crea()({ riassunto: { obiettivo: 'Vecchio', stato: { parola: 'al lavoro', colore: 'verde' }, criteri: { testo: '1/2' } }, schede })
    expect(html).toContain('Vecchio')
    expect(html).toContain('Panoramica')
  })
  it('0.79.0: la dashboard — in testa situazione e «Al lavoro adesso», il resto sotto il campo', () => {
    const lavoro = [
      { id: 'c-1', nomeRuolo: 'Sviluppo', colore: 'blu', compito: 'Somma', cosa: 'fa girare i test', dal: new Date(Date.now() - 12 * 60_000).toISOString(), aspettaTe: false, chat: 'p-2' },
      { id: 'c-2', nomeRuolo: 'Collaudo', colore: 'verde', compito: 'Prove', cosa: 'aspetta il tuo permesso', aspettaTe: true }
    ]
    const testa = crea()({ situazione, piano, schede, lavoro }, 'testa')
    expect(testa).toContain('◐ da verificare')
    expect(testa).toContain('Al lavoro adesso · 2')
    expect(testa).toContain('<b>Sviluppo</b><span>fa girare i test</span>')
    expect(testa).toContain('da 12 min · Somma')
    expect(testa).toContain('data-chat="p-2" onclick="apriDaPanoramica(this.dataset.chat)"')
    expect(testa).toContain('pan-tel-lavoro__riga--te')
    expect(testa).toContain('aspetta te')
    expect(testa).toContain('[?Una riga per ogni chat al lavoro')
    expect(testa).not.toContain('Adesso · 2')
    const resto = crea()({ situazione, piano, schede, lavoro }, 'resto')
    expect(resto).toContain('Adesso · 2')
    expect(resto).toContain('In corso · 1')
    expect(resto).not.toContain('Al lavoro adesso')
    expect(resto).not.toContain('da verificare')
    // Nessuna chat al lavoro, e un PC più vecchio senza `lavoro`: niente riassunto.
    expect(crea()({ situazione, piano, schede, lavoro: [] }, 'testa')).toContain('Nessuna chat al lavoro.')
    expect(crea()({ situazione, piano, schede }, 'testa')).not.toContain('Al lavoro adesso')
  })
  it('0.79.0: il campo dell’autopilota è ancorato sopra la fascia, la conversazione è grande, gli esiti sono righe corte', () => {
    const v = script.slice(script.indexOf('function vistaAutopilota('), script.indexOf('function scorriChatAp('))
    expect(v).toContain('<div class="ancorata casella-ap">')
    expect(v).toContain('flusso-ap--grande')
    expect(v).toContain("b.tono === 'esito'")
    expect(v.indexOf('casella +')).toBeLessThan(v.indexOf('(dopoCasella ||'))
    expect(v.indexOf('(dopoCasella ||')).toBeLessThan(v.indexOf('barraLinguette +'))
    expect(script).toContain("panoramicaHtml(panoramicaAp, 'testa')")
    expect(script).toContain("vistaAutopilota(apDettaglio, panoramicaHtml(panoramicaAp, 'resto'))")
    // L'ancorata sta sopra la fascia del telefono, mai sotto.
    expect(html).toMatch(/\.ancorata \{\s*position: sticky; bottom: calc\(60px/)
  })
})
