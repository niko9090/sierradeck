import { describe, it, expect } from 'vitest'
import { paginaClient } from '../../src/main/client-pagina'
import { AIUTO_ELIMINA_WORKSPACE, confermaChiudi, confermaDormi, confermaEliminaWorkspace, confermaSposta, PARTENZE, rigaEliminato } from '../../src/shared/azioni-telefono'

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
    const fine = script.indexOf('// Le sezioni e le voci delle impostazioni')
    const inizioFn = script.indexOf('function testoConferma(')
    const corpoFn = script.slice(inizioFn, script.indexOf('\n}\n', inizioFn) + 2)
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

  it('i workspace eliminati (0.81.0): elenco con «Ripristina» e il «?», come sul PC', async () => {
    const pezzo = (inizio: string, fine: string): string => script.slice(script.indexOf(inizio), script.indexOf(fine, script.indexOf(inizio)))
    const chiesti: { percorso: string; corpo?: unknown }[] = []
    let disegni = 0
    const prova = new Function('chiedi', 'aiuto', 'esc', 'pannello', 'aggiorna',
      'var ultimoStato = {}; var notaGlobale = ""; var window = {};\n' +
      pezzo('var AIUTO_ELIMINA_WS', '// Le sezioni e le voci') + '\n' +
      pezzo('var wsEliminati = []', 'window.azioneChat =') +
      ';return { html: eliminatiWsHtml, ripristina: window.ripristinaWs, nota: function () { return notaGlobale }, aiutoTesto: AIUTO_ELIMINA_WS, riga: rigaEliminato }'
    )((percorso: string, corpo?: unknown) => {
      chiesti.push({ percorso, ...(corpo !== undefined ? { corpo } : {}) })
      return Promise.resolve(percorso === '/api/workspace/recupero' ? { voci: [{ nome: 'Prova', eliminatoIl: '2026-10-19T12:00:00.000Z', scadeIl: '2026-11-18T12:00:00.000Z', chat: 2 }] } : { fatto: true })
    }, (id: string, t: string) => `[?${id}:${t.length}]`, (t: string) => t, () => { disegni += 1 }, () => undefined) as {
      html: () => string; ripristina: (i: number) => Promise<void>; nota: () => string; aiutoTesto: string; riga: typeof rigaEliminato
    }
    expect(prova.aiutoTesto).toBe(AIUTO_ELIMINA_WORKSPACE)
    expect(prova.riga({ chat: 2, scadeIl: '2026-11-18T12:00:00.000Z' })).toBe(rigaEliminato({ chat: 2, scadeIl: '2026-11-18T12:00:00.000Z' }))
    expect(prova.html()).toBe('')
    await new Promise((r) => setTimeout(r, 0))
    expect(disegni).toBe(1)
    const html = prova.html()
    expect(html).toContain('Eliminati')
    expect(html).toContain('[?eliminati-ws:')
    expect(html).toContain('Prova <span class="sotto">2 chat · resta fino al 18/11</span>')
    expect(html).toContain('ripristinaWs(0)')
    // Una sola lettura nei 30 s, anche se la scheda si ridisegna.
    expect(chiesti.filter((c) => c.percorso === '/api/workspace/recupero')).toHaveLength(1)
    await prova.ripristina(0)
    expect(chiesti).toContainEqual({ percorso: '/api/workspace/ripristina', corpo: { nome: 'Prova', eliminatoIl: '2026-10-19T12:00:00.000Z' } })
    expect(prova.nota()).toBe('')
    expect(script).toContain("aiuto('elimina-ws', esc(AIUTO_ELIMINA_WS))")
  })

  it('«Affida» manda tutti i campi della finestra del PC', () => {
    for (const id of ['delega-obiettivo', 'delega-cwd', 'delega-nome', 'delega-criteri', 'delega-pubblicazione', 'delega-partenza', 'delega-workspace', 'delega-cloud']) {
      expect(script, id).toContain(id)
    }
    expect(script).toContain(JSON.stringify(PARTENZE))
  })
})
