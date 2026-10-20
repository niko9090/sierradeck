import { describe, it, expect } from 'vitest'
import { paginaClient } from '../../src/main/client-pagina'
import { domandaBreve, type Conversazione } from '@shared/domande-conversazioni'
import { ATTIVITA, ATTIVITA_ORDINE, COLORI, TITOLO_LEGENDA } from '@shared/colori-attivita'

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
  const creaParti = (aperte: Record<string, boolean> = {}, apPc: string | null = null) => new Function('esc', 'aiuto', 'apPc', 'pannello', 'ultimoStato', `
    const RUOLO_NOME = { sviluppo: 'Sviluppo', revisione: 'Revisione' }; const SIMBOLO_SCHEDA = { chiede: '◆', lavora: '●', ferma: '■', finita: '✓' }; const PAROLA_SCHEDA = { chiede: 'aspetta te', lavora: 'al lavoro', ferma: 'ferma', finita: 'finita' };
    var panAperte = Object.assign({ criteri: false, finite: false, 'da-fare': false, 'in-corso': true, 'in-revisione': true, fatto: false, eventi: false }, ${JSON.stringify(aperte)});
    var ATT = ${JSON.stringify({ attivita: ATTIVITA, ordine: ATTIVITA_ORDINE, colori: COLORI, titolo: TITOLO_LEGENDA })};
    ${['coloreNome', 'segnoAttivita', 'parolaStatoAtt', 'legendaAttivita', 'rigaApri', 'schedaTelHtml', 'panoramicaVecchiaHtml', 'alLavoroHtml', 'panoramicaHtml', 'panoramicaTestaHtml', 'panoramicaRestoHtml'].map(funzione).join('; ')}; return panoramicaHtml`)((x: string) => x, (_i: string, t: string) => `[?${t}]`, apPc, () => undefined, null) as (p: unknown, parte: 'testa' | 'resto') => string
  // Le due parti di seguito: sopra la conversazione la testa, sotto il resto (0.79.0).
  const crea = (aperte: Record<string, boolean> = {}) => (p: unknown): string => { const f = creaParti(aperte); return f(p, 'testa') + f(p, 'resto') }
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
    expect(html).toContain('Come si legge')
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
  it('0.79.0: la testa (situazione e «Al lavoro») sta sopra la conversazione, il resto sotto', () => {
    const alLavoro = [
      { id: 'p-3', chi: 'Collaudo', ruolo: 'collaudo', cosa: 'prova: «la copia»', quanto: 'adesso', aspettaTe: true },
      { id: 'p-2', chi: 'Sviluppo', ruolo: 'sviluppo', cosa: 'lavora a: «Somma»', quanto: 'da 12 min', aspettaTe: false }
    ]
    const f = creaParti()
    const testa = f({ situazione, piano, schede, alLavoro }, 'testa')
    const resto = f({ situazione, piano, schede, alLavoro }, 'resto')
    expect(testa).toContain('◐ da verificare')
    expect(testa).toContain('Al lavoro · 2 <span class="pan-tel-aspettano">· ◆ 1 aspetta te</span>')
    expect(testa).toContain('<b>Collaudo</b> prova: «la copia»<span class="sotto"><b class="pan-tel-stato--ambra">aspetta te</b> · adesso</span>')
    expect(testa).toContain('data-chat="p-2" onclick="apriDaPanoramica(this.dataset.chat)"')
    expect(testa.indexOf('p-3')).toBeLessThan(testa.indexOf('p-2'))
    expect(testa).not.toContain('Adesso ·')
    expect(resto).toContain('Adesso · 2')
    expect(resto).not.toContain('da verificare')
    // Il testo visibile è quello del PC (titoloAlLavoro, sottoAlLavoro).
    const visibile = (h: string): string => h.replace(/<[^>]+>/g, '')
    expect(visibile(testa)).toContain('Al lavoro · 2 · ◆ 1 aspetta te')
    expect(visibile(testa)).toContain('aspetta te · adesso')
  })
  it('0.79.0: nessuno al lavoro; un PC della 0.78 senza riassunto; da un altro PC le righe non si aprono', () => {
    expect(creaParti()({ situazione, piano, schede, alLavoro: [] }, 'testa')).toContain('Nessuna chat al lavoro.')
    // 0.79.0: cosa fa adesso, dai segnali; il permesso è già «aspetta te», in ambra.
    const adesso = creaParti()({ situazione, piano, schede, alLavoro: [
      { id: 'p-2', chi: 'Sviluppo', cosa: 'lavora a: «Somma»', quanto: 'da 3 min', aspettaTe: false, adesso: 'fa girare i test' },
      { id: 'p-3', chi: 'Collaudo', cosa: 'prova: «Prove»', quanto: 'adesso', aspettaTe: true, adesso: 'aspetta il tuo permesso: salva il lavoro' },
      { id: 'p-4', chi: 'Chat', cosa: 'x', quanto: '', aspettaTe: true }
    ] }, 'testa')
    expect(adesso).toContain('<span class="sotto">fa girare i test · da 3 min</span>')
    expect(adesso).toContain('<b class="pan-tel-stato--ambra">aspetta il tuo permesso: salva il lavoro</b> · adesso')
    expect(adesso).toContain('<b class="pan-tel-stato--ambra">aspetta te</b></span>')
    expect(adesso).toContain('id="al-lavoro-ap"')
    expect(script).toContain("document.getElementById('al-lavoro-ap')")
    expect(creaParti()({ situazione, piano, schede }, 'testa')).not.toContain('Al lavoro')
    const daLontano = creaParti({}, 'pc-2')({ situazione, piano, schede, alLavoro: [{ id: 'p-2', chi: 'Sviluppo', cosa: 'x', quanto: '', aspettaTe: false }] }, 'testa')
    expect(daLontano).not.toContain('apriDaPanoramica')
    // La lista della 0.77.0 sta tutta nella testa.
    expect(creaParti()({ riassunto: { obiettivo: 'Vecchio', stato: { parola: 'al lavoro', colore: 'verde' }, criteri: { testo: '1/2' } }, schede }, 'resto')).toBe('')
  })
  it('0.79.0: le righe corte dei traguardi restano nella conversazione; il campo resta in fondo allo schermo', () => {
    const vista = script.slice(script.indexOf('function vistaAutopilota('), script.indexOf('function scorriChatAp('))
    expect(vista).toContain("const inConversazione = (b) => b.da !== 'nota' || b.tono === 'traguardo'")
    expect(vista).toContain("(a.chat || []).filter((b) => !inConversazione(b)).reverse()")
    // Il campo ancorato sopra la fascia del telefono, come la risposta nelle chat.
    expect(vista).toContain("const casella = '<div class=\"casella-ap ancorata\">")
    expect(html).toMatch(/\.ancorata \{\s*position: sticky; bottom: calc\(60px/)
    expect(script).toContain("panoramicaHtml(panoramicaAp, 'testa')")
    expect(script).toContain("panoramicaHtml(panoramicaAp, 'resto')")
  })
  it('0.79.0: «Al lavoro» al più 3 righe, le altre dietro «e altre N»; senza Panoramica niente righe corte doppie', () => {
    const r = (id: string) => ({ id, chi: 'Sviluppo', cosa: 'lavora a: «x»', quanto: '', aspettaTe: false })
    const quattro = [r('a1'), r('a2'), r('a3'), r('a4')]
    const chiuso = creaParti()({ situazione, piano, schede, alLavoro: quattro }, 'testa')
    expect(chiuso).toContain('data-chat="a3"')
    expect(chiuso).not.toContain('data-chat="a4"')
    expect(chiuso).toContain('e altre 1')
    expect(creaParti({ 'al-lavoro': true })({ situazione, piano, schede, alLavoro: quattro }, 'testa')).toContain('data-chat="a4"')
    const vista = script.slice(script.indexOf('function vistaAutopilota('), script.indexOf('function scorriChatAp('))
    expect(vista).toContain("filter((b) => conPan ? inConversazione(b) : b.tono !== 'traguardo')")
  })
  it('0.79.0: le ore della conversazione nell’ora del telefono, come sul PC (non l’UTC tagliato)', () => {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const oraDi = new Function('esc', `${funzione('oraDi')}; return oraDi`)((x: string) => x) as (iso: string) => string
    const iso = '2026-10-18T09:10:00.000Z'
    expect(oraDi(iso)).toBe(new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }))
    expect(oraDi('')).toBe('')
    const vista = script.slice(script.indexOf('function vistaAutopilota('), script.indexOf('function scorriChatAp('))
    expect(vista).toContain('const ora = (iso) => oraDi(iso)')
  })
})
