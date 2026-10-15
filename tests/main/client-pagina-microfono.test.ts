import { describe, it, expect } from 'vitest'
import { paginaClient } from '../../src/main/client-pagina'

/**
 * 0.75.0 sulla pagina del telefono: il microfono con il riconoscimento del
 * browser (Web Speech API), in italiano, con i risultati parziali. Il testo
 * va nel campo e non parte niente da solo.
 */
const html = paginaClient()
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
function funzione(nome: string, prefisso = 'function '): string {
  const inizio = script.indexOf(`${prefisso}${nome}`)
  if (inizio < 0) throw new Error(`${nome} non trovata`)
  let profondita = 0
  for (let i = script.indexOf('{', inizio); i < script.length; i += 1) {
    if (script[i] === '{') profondita += 1
    else if (script[i] === '}' && --profondita === 0) return script.slice(inizio, i + 1)
  }
  throw new Error(`${nome} non chiusa`)
}

describe('pagina: il microfono', () => {
  it('il testo dettato si aggiunge a quello che c’era, con il parziale in fondo', () => {
    const f = new Function(`${funzione('testoDettatoJs')}; return testoDettatoJs`)() as (b: string, f: string, p: string) => string
    expect(f('', '', 'ciao')).toBe('ciao')
    expect(f('Già scritto  ', 'fermati dopo i test ', 'e poi')).toBe('Già scritto fermati dopo i test e poi')
    expect(f('solo questo', '', '')).toBe('solo questo')
  })

  it('in italiano con i risultati parziali, e il testo va nel campo senza mandarlo', () => {
    const campo = { value: 'prima', id: 'conv-testo' }
    let istanza: { lang?: string; interimResults?: boolean; onresult?: (e: unknown) => void; start: () => void; stop: () => void } | undefined
    let mandato = false
    class Riconoscimento { lang = ''; interimResults = false; continuous = false; onresult?: (e: unknown) => void; onerror?: unknown; onend?: unknown; start(): void { istanza = this as never } stop(): void {} }
    const finestra: Record<string, unknown> = { webkitSpeechRecognition: Riconoscimento }
    const detta = new Function('window', 'document', 'pannello', 'ultimoStato', 'rispondiConv', `
      var dettaturaAttiva = null; var notaDettatura = ''; var dettaturaUltimoCampo = '';
      ${funzione('dettaturaDelBrowser')}; ${funzione('testoDettatoJs')};
      ${script.slice(script.indexOf('window.detta = function'), script.indexOf('\n}', script.indexOf('window.detta = function')) + 2)}
      return window.detta`)(finestra, { getElementById: () => campo }, () => undefined, {}, () => { mandato = true }) as (id: string) => void
    detta('conv-testo')
    expect(istanza?.lang).toBe('it-IT')
    expect(istanza?.interimResults).toBe(true)
    const risultato = (testo: string, finale: boolean) => Object.assign([{ transcript: testo }], { isFinal: finale })
    istanza!.onresult!({ results: [risultato('scrivi i test', false)] })
    expect(campo.value).toBe('prima scrivi i test')
    istanza!.onresult!({ results: [risultato('scrivi i test', true), risultato('e fermati', false)] })
    expect(campo.value).toBe('prima scrivi i test e fermati')
    expect(mandato).toBe(false)
  })

  it('senza riconoscimento nel browser il tasto lo dice; con, c’è 🎤 e il «?» sull’audio', () => {
    const mic = (finestra: Record<string, unknown>) => new Function('window', 'esc', 'aiuto', `var dettaturaAttiva = null; var notaDettatura = ''; var dettaturaUltimoCampo = ''; ${funzione('dettaturaDelBrowser')}; ${funzione('micHtml')}; return micHtml`)(finestra, (x: string) => x, (_id: string, t: string) => `[?${t}]`) as (id: string) => string
    expect(mic({})('conv-testo')).toContain('il riconoscimento vocale non c’è in questo browser')
    const si = mic({ SpeechRecognition: function () {} })('conv-testo')
    expect(si).toContain('data-campo="conv-testo"')
    expect(si).toContain('🎤')
    expect(si).toContain('non registra e non salva l’audio')
  })

  it('il tasto è accanto a «Scrivi tu», alla chat con l’autopilota e alle sue domande', () => {
    expect(script).toContain("micHtml(campo.id)")
    expect(script).toContain("micHtml('dialogo-' + a.id)")
    expect(script).toContain("micHtml('risposta-scheda-ap')")
    expect(script).toContain("micHtml('conv-testo')")
  })
})

describe('0.75.1: pagina, perché non si collega', () => {
  const motivo = new Function(`${funzione('motivoNonCollegoJs')}; return motivoNonCollegoJs`)() as (rifiutata: boolean, host: string) => { titolo: string; rimedio: string; dettagli: string }
  it('chiave rifiutata (401 o 403): il PC risponde ma non riconosce questo telefono, con come ricollegarlo', () => {
    const m = motivo(true, '192.168.1.20')
    expect(m.titolo).toBe('Il PC risponde ma non riconosce questo telefono')
    expect(m.rimedio).toContain('Riprova')
    expect(m.dettagli).toContain('Impostazioni → Client')
  })
  it('nessuna risposta: «Nessun PC risponde», con cosa ho provato e il rimedio giusto per l’indirizzo', () => {
    const ts = motivo(false, '100.64.0.20')
    expect(ts.titolo).toBe('Nessun PC risponde')
    expect(ts.dettagli).toContain('Ho provato: Tailscale 100.64.0.20')
    expect(ts.rimedio).toContain('Tailscale')
    const casa = motivo(false, '192.168.1.20')
    expect(casa.dettagli).toContain('Ho provato: questo indirizzo 192.168.1.20')
    expect(casa.dettagli).toContain('fuori casa non si raggiunge')
  })
  it('il filo rosso usa il motivo, con il «?» e «Riprova»; la chiave rifiutata si segna da 401 e da 403 sullo stato', () => {
    expect(script).toContain("motivoNonCollegoJs(chiaveRifiutataIl > 0, location.hostname)")
    expect(script).toContain('<button onclick="aggiorna()">Riprova</button>')
    expect(script).toContain("r.status === 401 || (r.status === 403 && percorso === '/api/stato')")
  })
})
