import { describe, it, expect } from 'vitest'
import { paginaClient, MANIFESTO } from '../../src/main/client-pagina'

const html = paginaClient()
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))

describe('lo script della pagina', () => {
  it('è JavaScript valido', () => {
    // Un errore di sintassi qui non si vede da nessuna parte: la pagina resta
    // **nera**, senza un messaggio, senza niente da premere. È successo, ed è
    // la ragione per cui questo test esiste: il testo vive dentro un template
    // JavaScript, e una virgoletta scappata male non la nota nessuno.
    expect(() => new Function(script)).not.toThrow()
  })

  it('la regex del codice cerca sei cifre, non la lettera d', () => {
    // `\d` scritto una volta sola dentro un template arriva alla pagina come
    // una «d»: la scansione del QR non accoppiava niente e nessuno capiva
    // perché.
    const riga = script.split(String.fromCharCode(10)).find((r) => r.includes('codice=(')) ?? ''
    const regex = new RegExp(riga.slice(riga.indexOf('/') + 1, riga.lastIndexOf('/')))
    // La prova vera non è che il testo somigli a una regex: è che **trovi** un
    // codice. Con la lettera «d» al posto della classe di cifre, un controllo
    // sul testo sarebbe passato lo stesso e il QR avrebbe continuato a non
    // funzionare.
    expect(regex.test('#codice=123456')).toBe(true)
  })

  it('accoppia leggendo il codice dall indirizzo', () => {
    expect(script).toContain('accoppiaDalQr')
    expect(script).toContain('location.hash')
  })

  it('qualunque errore lascia qualcosa a schermo', () => {
    // Il nero è il peggior esito: non dice se manca la rete, se la chiave non
    // vale più o se c'è un difetto, e non lascia niente da premere.
    expect(script).toContain("addEventListener('error'")
    expect(script).toContain('ingresso(')
  })
})

describe('il manifesto', () => {
  it('dice come si chiama e come si apre', () => {
    expect(MANIFESTO.name).toContain('SierraDeck')
    expect(MANIFESTO.display).toBe('standalone')
  })
})
