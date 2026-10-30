import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { paginaClient } from '../../src/main/client-pagina'

/**
 * La schermata dell'autopilota sul telefono (0.83.0, c-509). Nicholas (21/10):
 * «non si vede nulla, troppe info che occupano tutto lo schermo». In alto una
 * riga riassuntiva che si apre con un tocco; chiusa, sotto ci sono solo la
 * conversazione e la casella. Uguale nella pagina servita dal PC e nell'app.
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
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const riassunto = new Function(`${funzione('riassuntoApTesto')}; return riassuntoApTesto`)() as (ap: unknown, d: unknown) => string

describe('la riga riassuntiva dell’autopilota', () => {
  it('dice stato, criteri, chat e giri; prima le domande', () => {
    const ap = { stato: 'lavoro', vista: { stato: { parola: 'al lavoro' } }, criteri: 3, fatti: 1 }
    expect(riassunto(ap, { chats: [{}, {}], cicli: 5 })).toBe('al lavoro · criteri 1/3 · 2 chat · 5 giri')
    expect(riassunto({ stato: 'sospeso', criteri: 0, fatti: 0 }, { domandeScheda: [{}], cicli: 1 })).toBe('1 domanda per te · fermo · 1 giro')
    // Senza dettaglio (non ancora letto) la riga c'è lo stesso.
    expect(riassunto(ap, null)).toBe('al lavoro · criteri 1/3 · 0 giri')
  })
  it('è la stessa riga dell’app', () => {
    const kt = readFileSync('android/app/src/main/java/it/ferrariconsulenze/sierradeck/SchedaAutopilota.kt', 'utf8')
    // 0.86.x: l'app dice la percentuale, le richieste aperte e gli specialisti.
    for (const t of ['"1 domanda per te"', 'RegoleAvanzamento.percento(percento)', '"1 richiesta aperta"', '"1 specialista"', 'joinToString(" · ")']) expect(kt, t).toContain(t)
    // Le parole dello stato: quelle di statoInParole dell'app.
    const lavori = readFileSync('android/app/src/main/java/it/ferrariconsulenze/sierradeck/Lavori.kt', 'utf8')
    for (const [id, parola] of [['lavoro', 'al lavoro'], ['intervista', 'si prepara'], ['sospeso', 'fermo'], ['fallito', 'guasto']]) {
      expect(lavori).toContain(`"${id}" -> "${parola}"`)
      expect(riassunto({ stato: id, criteri: 0, fatti: 0 }, null)).toBe(`${parola} · 0 giri`)
    }
  })
  it('chiusa, sotto restano solo la conversazione e la casella', () => {
    expect(html).toContain('.riassunto-chiuso .solo-riassunto { display: none; }')
    expect(script).toContain('var apRiassunto = false')
    expect(script).toContain("apRiassunto ? 'riassunto-aperto' : 'riassunto-chiuso'")
    const vista = script.slice(script.indexOf('function vistaAutopilota('), script.indexOf('function scorriChatAp('))
    expect(vista).toContain(`'<div class="serigrafia solo-riassunto" style="margin-top:10px">Chat con lui</div>'`)
    expect(vista).toContain(`'<div class="solo-riassunto">' + barraLinguette`)
    // La conversazione e la casella non sono mai nascoste.
    expect(vista).toContain(`'<div class="flusso-ap" id="flusso-ap">'`)
    expect(vista).not.toContain('flusso-ap solo-riassunto')
    // Uscendo dall'autopilota la riga torna chiusa.
    expect(script).toContain('window.chiudiAp = () => { apRiassunto = false;')
  })
})
