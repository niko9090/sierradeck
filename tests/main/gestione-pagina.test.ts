import { describe, it, expect } from 'vitest'
import { paginaClient } from '../../src/main/client-pagina'
import { confermaChiudi, confermaDormi, confermaEliminaWorkspace, confermaSposta, PARTENZE } from '../../src/shared/azioni-telefono'

/**
 * La pagina del telefono (0.55.0), in versione semplice: le stesse azioni
 * dell'app su chat e workspace, con le conferme del PC parola per parola, e
 * «Affida» con i campi della finestra del PC (la validazione la fa il PC con
 * la funzione condivisa).
 */
const html = paginaClient()
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))

describe('la pagina: gestire chat e workspace', () => {
  it('lo script resta valido', () => {
    expect(() => new Function(script)).not.toThrow()
  })

  it('le conferme sono quelle del PC, con il nome al suo posto', () => {
    // Si valuta solo il pezzo dei testi, come gira nel telefono.
    const inizio = script.indexOf('var CONFERME =')
    const fine = script.indexOf('function testoConferma(')
    const corpoFn = script.slice(fine, script.indexOf('\n}\n', fine) + 2)
    const testo = new Function(script.slice(inizio, fine) + corpoFn + ';return testoConferma')() as (t: string, n: string, w?: string) => { titolo: string; testo: string; azione: string }
    expect(testo('chiudi', 'Esempio')).toEqual(confermaChiudi('Esempio'))
    expect(testo('dormi', 'Esempio')).toEqual(confermaDormi('Esempio'))
    expect(testo('sposta', 'Esempio', 'Lavoro')).toEqual(confermaSposta('Esempio', 'Lavoro'))
    expect(testo('eliminaWorkspace', 'Lavoro')).toEqual(confermaEliminaWorkspace('Lavoro'))
  })

  it('ci sono i tasti: dormi, sveglia, sposta, chiudi, rinomina ed elimina il workspace', () => {
    for (const pezzo of ["chiediAzione(\\'dormi\\'", "azioneChat(\\'sveglia\\'", "chiediAzione('sposta'", "chiediAzione('chiudi'", 'rinominaWorkspace()', "chiediAzione(\\'eliminaWorkspace\\'"]) {
      expect(script, pezzo).toContain(pezzo)
    }
    for (const rotta of ['/api/chat/dormi', '/api/chat/sposta', '/api/chat/chiudi', '/api/workspace/rinomina', '/api/workspace/elimina']) expect(script, rotta).toContain(rotta)
  })

  it('«Affida» manda tutti i campi della finestra del PC', () => {
    for (const id of ['delega-obiettivo', 'delega-cwd', 'delega-nome', 'delega-criteri', 'delega-pubblicazione', 'delega-partenza', 'delega-workspace', 'delega-cloud']) {
      expect(script, id).toContain(id)
    }
    expect(script).toContain(JSON.stringify(PARTENZE))
  })
})
