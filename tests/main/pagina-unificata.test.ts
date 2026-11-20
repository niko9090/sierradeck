import { describe, it, expect } from 'vitest'
import { paginaClient } from '../../src/main/client-pagina'
import { MENU_PRINCIPALE, MENU_TELEFONO } from '../../src/shared/menu-principale'
import { SEZIONI_ALTRO, apriSezioneAltro, pannelliDelPosto, postoIniziale, toccaVoce } from '../../src/shared/navigazione-telefono'

/**
 * k-u6: la pagina servita al telefono ha la struttura unica del menu k-u0:
 * voci da MENU_TELEFONO, Computer con le parole di statoPc, Specialisti dentro
 * Autopiloti, niente liste PC doppie in Salute.
 */
const html = paginaClient()
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))

describe('pagina unificata (k-u6)', () => {
  it('le voci della fascia vengono da MENU_TELEFONO e MENU_PRINCIPALE', () => {
    const voci = script.split('\n').find((r) => r.startsWith('var VOCI = ')) ?? ''
    for (const v of MENU_TELEFONO) expect(voci).toContain(JSON.stringify(v.nome))
    const menu = script.split('\n').find((r) => r.startsWith('var MENU = ')) ?? ''
    for (const v of MENU_PRINCIPALE.filter((x) => x.soloPc !== true)) expect(menu).toContain(JSON.stringify(v.id))
    expect(MENU_TELEFONO.find((v) => v.id === 'altro')?.contiene).toContain('computer')
  })

  it('Specialisti non è una sezione a parte: sta dentro Autopiloti (voce Workspace)', () => {
    expect(SEZIONI_ALTRO.some((s) => s.id === 'specialisti')).toBe(false)
    expect(pannelliDelPosto(postoIniziale())).toContain('specialisti')
    expect(pannelliDelPosto(toccaVoce(postoIniziale(), 'chat'))).not.toContain('specialisti')
    expect(pannelliDelPosto(apriSezioneAltro(postoIniziale(), 'pc'))).toEqual(['pc'])
    expect(script).toContain('vistaSpecialisti +')
    expect(script).not.toContain("posto.sezione === 'specialisti'")
  })

  it('Computer è l’unico posto dell’elenco dei PC: con la mappa, e la Salute non li duplica', () => {
    expect(SEZIONI_ALTRO.find((s) => s.id === 'pc')?.titolo).toBe('Computer')
    expect(script).toContain('<div class="titolo">Computer\' + aiuto(\'altri-pc\'')
    expect(script).not.toContain('<div class="titolo">Altri computer')
    expect(script).toContain("filter((v) => v.gruppo !== 'pc')")
    expect(script).not.toContain("['computer', 'Computer']")
    expect(script).not.toContain("pc: 'Gli altri PC'")
    // La mappa sta nell'elenco Computer, una volta sola.
    expect(script.split('onclick="mappaSalute()"').length - 1).toBe(1)
    // Lo stato di ogni PC è la frase di statoPc, che arriva da /api/pc.
    expect(script).toContain("esc(b.frase || (b.vivo ? 'acceso' : 'spento'))")
  })

  it('il rimando alle chat di altri PC dice dove si va ora', () => {
    expect(script).not.toContain('Altri computer.')
    expect(script).toContain('Altro → Computer')
  })

  it('k-u6b: specialisti e percentuale dell’autopilota compaiono una volta sola', () => {
    // Gli specialisti: niente seconda lista nella linguetta Avanzamento.
    expect(script).not.toContain('avanzamento-specialista')
    expect(script).not.toContain("'Specialisti · ' + sp.length")
    // La percentuale: la mostra la linguetta Avanzamento, non anche il riassunto sopra.
    expect(script.split("'%</div><div class=\"barra\"><i style=\"width:' + Math.max(0, Math.min(100, Math.round(percentoAvanzamento(").length - 1).toBe(0)
    expect(script.split('Math.round(pc) + \'%</b>').length - 1).toBe(1)
  })

  it('il testo della pagina non ha backtick sciolti: lo script è JavaScript valido', () => {
    expect(() => new Function(script)).not.toThrow()
  })
})
