import { describe, it, expect } from 'vitest'
import { paginaClient } from '../../src/main/client-pagina'

/**
 * 0.49.0: la pagina del telefono e il PIN delle chat. Il computer risponde
 * 423 a una chat protetta: la pagina resta sulla chat, mostra il lucchetto e
 * niente schermo; con il PIN giusto la rilegge.
 */
const html = paginaClient()
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
const estrai = (inizio: string): string => {
  const i = script.indexOf(inizio)
  if (i < 0) throw new Error(`manca ${inizio}`)
  let profondita = 0
  for (let j = script.indexOf('{', i); j < script.length; j++) {
    if (script[j] === '{') profondita++
    else if (script[j] === '}' && --profondita === 0) return script.slice(i, j + 1)
  }
  throw new Error('non si chiude')
}

type Mondo = { leggiDentro: () => Promise<void>; sblocca: () => Promise<void>; stato: () => Record<string, unknown> }
function mondo(risposte: Record<string, { status: number; corpo: unknown }>, pinScritto = ''): Mondo {
  const corpo = `
    var chiave = 'k', rifiuti401 = 0, RIFIUTI_PER_ARRENDERSI = 5, dentro = 'p-1', righeDentro = ['vecchia'], righeGrezze = ['vecchia'],
      scelteDentro = null, sceltaRisposta = null, SCELTA_RISPOSTA_MS = 0, notaScelta = null, ultimoStato = {}
    function firmaScelte() { return '' }
    function pannello() {}
    var localStorage = { removeItem() {} }
    function ingresso() {}
    var document = { getElementById: () => ({ value: ${JSON.stringify(pinScritto)} }) }
    var window = {}
    ${estrai('async function chiedi(')}
    var pinDentro = false
    var pinNota = ''
    ${estrai('window.sbloccaPin = async () =>')}
    ${estrai('async function leggiDentro(')}
    return { leggiDentro, sblocca: () => window.sbloccaPin(), stato: () => ({ dentro, righeDentro, righeGrezze, pinDentro, pinNota }) }
  `
  const fetch = async (percorso: string): Promise<{ status: number; ok: boolean; json: () => Promise<unknown> }> => {
    const r = risposte[percorso] ?? { status: 404, corpo: { errore: 'non trovato' } }
    return { status: r.status, ok: r.status >= 200 && r.status < 300, json: async () => r.corpo }
  }
  return new Function('fetch', corpo)(fetch) as Mondo
}

describe('il PIN nella pagina del telefono', () => {
  it('423: resta sulla chat con il lucchetto, e lo schermo vecchio sparisce', async () => {
    const m = mondo({ '/api/dentro': { status: 423, corpo: { errore: 'protetta dal PIN', pin: 'chiusa' } } })
    await m.leggiDentro()
    expect(m.stato()).toMatchObject({ dentro: 'p-1', pinDentro: true, righeDentro: [], righeGrezze: [] })
  })
  it('il PIN sbagliato lo dice; un altro errore riporta all’elenco come prima', async () => {
    const m = mondo({ '/api/pin/sblocca': { status: 403, corpo: { errore: 'PIN sbagliato.' } } }, '0000')
    await m.sblocca()
    expect(m.stato().pinNota).toBe('PIN sbagliato.')
    const altro = mondo({ '/api/dentro': { status: 500, corpo: { errore: 'guasto' } } })
    await altro.leggiDentro()
    expect(altro.stato().dentro).toBe(null)
  })
  it('il PIN giusto: rilegge e mostra la chat', async () => {
    const m = mondo({ '/api/pin/sblocca': { status: 200, corpo: { fatto: true } }, '/api/dentro': { status: 200, corpo: { righe: ['ciao'], grezze: ['ciao'] } } }, '4821')
    await m.sblocca()
    expect(m.stato()).toMatchObject({ pinDentro: false, righeDentro: ['ciao'], pinNota: '' })
  })
  it('la vista della chat ha il lucchetto e il campo del PIN', () => {
    expect(script).toContain('id="pin-dentro"')
    expect(script).toContain('onclick="sbloccaPin()"')
    expect(() => new Function(script)).not.toThrow()
  })
})
