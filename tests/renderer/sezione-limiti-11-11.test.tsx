import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { SezioneLimiti } from '../../src/renderer/components/SezioneLimiti'
import { LIMITI_DI_SERIE, VOCI_INTERRUTTORI, VOCI_NUMERI, type VistaLimiti } from '../../src/shared/limiti-pc'
import { CLASSI } from '../../src/shared/permessi-nicholas'
import { VOCI } from '../../src/shared/impostazioni-struttura'

/**
 * La sezione «Limiti» delle Impostazioni del PC (11/11). Nicholas: «perché
 * hai lasciato i limiti? devono poter essere sorpassati se decisi da me».
 */
const vista = (x: Partial<VistaLimiti> = {}): VistaLimiti => ({ limiti: LIMITI_DI_SERIE, sempre: [], ...x })

describe('la sezione «Limiti» (11/11)', () => {
  it('prima di leggere il servizio dice che legge, senza campi', () => {
    const html = renderToStaticMarkup(<SezioneLimiti />)
    expect(html).toContain('Leggo i limiti…')
    expect(html).not.toContain('type="number"')
  })

  it('mostra ogni tetto con il suo numero e il suo «?», e i due interruttori', () => {
    const html = renderToStaticMarkup(<SezioneLimiti iniziale={vista({ limiti: { ...LIMITI_DI_SERIE, specialistiPc: 12, sleepMaxS: 600 } })} />)
    for (const v of VOCI_NUMERI) expect(html, v.chiave).toContain(v.nome)
    for (const v of VOCI_INTERRUTTORI) expect(html, v.chiave).toContain(v.nome)
    // Nessun massimo: 12 specialisti e 600 secondi di sleep valgono così come sono.
    expect(html).toContain('value="12"')
    expect(html).toContain('value="600"')
    expect(html).not.toMatch(/max="/)
    expect(html).toContain('2 limiti cambiati da te')
    expect(html).toContain('Torna ai valori di serie')
    expect((html.match(/aiuto/g) ?? []).length).toBeGreaterThanOrEqual(VOCI_NUMERI.length + VOCI_INTERRUTTORI.length)
  })

  it('di serie: «specialisti» vuoto (lo decide il PC) e niente «Torna ai valori di serie»', () => {
    const html = renderToStaticMarkup(<SezioneLimiti iniziale={vista()} />)
    expect(html).toContain('placeholder="il PC"')
    expect(html).not.toContain('Torna ai valori di serie')
    expect(html).toContain('Nessuno: ogni azione protetta ti chiede prima.')
  })

  it('i permessi «sempre» di un progetto, ognuno con «Torna a chiedere»', () => {
    const html = renderToStaticMarkup(<SezioneLimiti iniziale={vista({ sempre: [{ ws: 'ws-1', nome: 'Progetto di prova', permessi: { 'push-forzato': 'sempre', sottofondo: 'sempre' } }] })} />)
    expect(html).toContain('Progetto di prova')
    expect(html).toContain(CLASSI['push-forzato'].nome)
    expect(html).toContain(CLASSI.sottofondo.nome)
    expect(html).not.toContain(CLASSI.cancellazioni.nome)
    expect((html.match(/Torna a chiedere/g) ?? []).length).toBe(2)
  })

  it('un servizio senza il file dei limiti: i campi spenti e la riga che lo dice', () => {
    const html = renderToStaticMarkup(<SezioneLimiti iniziale={vista({ fissi: true })} />)
    expect(html).toContain('Questo servizio non ha il file dei limiti')
    expect(html).toMatch(/<input[^>]*disabled=""[^>]*type="number"|<input[^>]*type="number"[^>]*disabled=""/)
  })

  it('la ricerca: si mostra solo la voce trovata', () => {
    const html = renderToStaticMarkup(<SezioneLimiti iniziale={vista()} vede={(...id) => id.includes('permessi-nicholas')} />)
    expect(html).not.toContain(VOCI_NUMERI[0]!.nome)
    expect(html).toContain('Permessi tolti con «Sì, sempre»')
  })

  it('sta nel pannello delle Impostazioni del PC, sotto la sua testata, e solo sul PC', () => {
    for (const id of ['limiti-pc', 'permessi-nicholas']) expect(VOCI.find((v) => v.id === id), id).toMatchObject({ sezione: 'limiti', dove: ['pc'] })
    const src = readFileSync('src/renderer/components/PannelloImpostazioni.tsx', 'utf8')
    expect(src).toContain("{vede('limiti-pc', 'permessi-nicholas') ? (")
    expect(src).toContain('<Testa id="limiti" />')
    expect(src).toContain('<SezioneLimiti vede={vede} />')
  })

  it('un permesso «sempre» da qui si toglie soltanto: nessun tasto lo mette', () => {
    const src = readFileSync('src/renderer/components/SezioneLimiti.tsx', 'utf8')
    expect(src).toContain("conPermesso(permessi, classe, 'chiedi')")
    expect(src).not.toMatch(/conPermesso\([^)]*'sempre'\)/)
  })

  it('lo specialisti del workspace non ha più il menu da 1 a 4', () => {
    const src = readFileSync('src/renderer/components/TestaOrchestratore.tsx', 'utf8')
    expect(src).not.toContain('[1, 2, 3, 4].map')
    expect(src).toContain('aria-label="Specialisti insieme in questo workspace"')
  })
})
