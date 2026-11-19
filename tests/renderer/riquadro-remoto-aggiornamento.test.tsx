import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AvvisoAggiornamentoRemoto } from '../../src/renderer/components/RiquadroRemoto'
import { invioSospeso, passoAggiornamento, rileggiPcOgniMs } from '../../src/renderer/aggiornamento-riquadro'
import { TESTO_IN_AGGIORNAMENTO, aggiornamentoInCorsoDi, testoAggiornamentoRemoto } from '@shared/aggiornamento-remoto'
import { paginaClient } from '../../src/main/client-pagina'

/**
 * k-agg2: quando un PC si aggiorna, chi guarda una sua chat (riquadro sul PC e pagina del telefono)
 * legge «Computer in aggiornamento, attendere» al posto di errori e «non risponde»; l'invio sta fermo
 * senza errori; quando il PC torna, la chat riprende da sola. Testi e regola dei 15 minuti sono di k-agg1.
 */
const sorgente = (p: string): string => readFileSync(join(__dirname, '..', '..', p), 'utf8')

describe('riquadro remoto: avviso', () => {
  it('mostra il testo condiviso con il nome del PC e la versione', () => {
    const html = renderToStaticMarkup(<AvvisoAggiornamentoRemoto nomePc="Portatile" versione="9.9.9" />)
    expect(html).toContain(TESTO_IN_AGGIORNAMENTO)
    expect(html).toContain(testoAggiornamentoRemoto('Portatile', '9.9.9'))
    expect(html).toContain('role="status"')
    expect(html).not.toContain('non risponde')
  })
  it('il segno vale solo se il battito lo dice e non è scaduto (stessa regola di k-agg1)', () => {
    const adesso = 1_000_000_000
    expect(aggiornamentoInCorsoDi({ versione: '1.0.0', aggiornando: { versione: '2.0.0', da: adesso - 60_000 } }, adesso)).toEqual({ versione: '2.0.0' })
    expect(aggiornamentoInCorsoDi({ versione: '2.0.0', aggiornando: { versione: '2.0.0', da: adesso - 60_000 } }, adesso)).toBeNull()
  })
})

describe('riquadro remoto: invio sospeso e ripresa da sola', () => {
  it('l’invio sta fermo solo mentre il PC si aggiorna', () => {
    expect(invioSospeso(true)).toBe(true)
    expect(invioSospeso(false)).toBe(false)
  })
  it('da «non si aggiorna» a «si aggiorna» compare l’avviso; al ritorno si riprende', () => {
    expect(passoAggiornamento(false, true)).toBe('avviso')
    expect(passoAggiornamento(true, true)).toBe('resta')
    expect(passoAggiornamento(true, false)).toBe('riprendi')
    expect(passoAggiornamento(false, false)).toBe('resta')
  })
  it('mentre si aspetta il segno si rilegge più spesso', () => {
    expect(rileggiPcOgniMs(true, 15_000)).toBeLessThan(15_000)
    expect(rileggiPcOgniMs(false, 15_000)).toBe(15_000)
  })
  it('il riquadro usa queste regole: avviso, niente errori, invio fermo, ricarica al ritorno', () => {
    const t = sorgente('src/renderer/components/RiquadroRemoto.tsx')
    expect(t).toContain('<AvvisoAggiornamentoRemoto')
    expect(t).toContain("fase.tipo === 'errore' && !inAgg")
    expect(t).toContain('!inAgg ? <FasciaLinea')
    // manda(), il giro della coda e il tasto Manda
    expect(t.match(/invioSospeso\(inAgg\)/g)?.length).toBeGreaterThanOrEqual(3)
    // al ritorno: si ricollega e si ricarica, senza tasti
    expect(t).toContain("passoAggiornamento(eraInAgg.current, inAgg)")
    expect(t).toContain("setFase({ tipo: 'cerco' })")
    expect(t).toContain("tipo: 'riprova-adesso'")
  })
})

describe('pagina del telefono: stesso avviso', () => {
  const html = paginaClient()
  const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))

  it('il testo è quello condiviso, passato alla pagina', () => {
    expect(script).toContain(`var TESTO_AGG = ${JSON.stringify(TESTO_IN_AGGIORNAMENTO)}`)
  })
  it('lo script resta valido', () => {
    expect(() => new Function(script)).not.toThrow()
  })
  it('l’avviso compare solo mentre quel PC si aggiorna e poi sparisce', () => {
    const inizio = script.indexOf('function aggiornandoHtml')
    const fine = script.indexOf('\n}\n', inizio) + 2
    const corpo = script.slice(inizio, fine)
    const fa = (agg: unknown): string =>
      new Function('aggRemoto', 'esc', 'TESTO_AGG', `${corpo}; return aggiornandoHtml()`)(agg, (x: string) => x, TESTO_IN_AGGIORNAMENTO) as string
    expect(fa(null)).toBe('')
    const visto = fa({ pc: 'x', nome: 'Portatile' })
    expect(visto).toContain(TESTO_IN_AGGIORNAMENTO)
    expect(visto).toContain('Portatile')
  })
  it('un errore «in aggiornamento» non diventa nota d’errore, e l’invio riparte da solo', () => {
    expect(script).toContain('corpoErr.aggiornando')
    expect(script).toContain('if (e && e.aggiornando) return; notaGlobale')
    expect(script).toContain("fase: 'aggiorna'")
    expect(script).toContain('sfRitenta = setTimeout')
  })
})
