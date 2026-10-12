import { describe, it, expect } from 'vitest'
import type { VoceSalute } from '@shared/salute'
import { breve, conVistaSalute, contaGruppiSalute, gruppoIniziale, nelGruppoSalute, statoVoce } from '@shared/salute-vista'

/** La Salute riprogettata (0.70.0): una parola per voce, i gruppi, titoli corti. */
const voce = (x: Partial<VoceSalute>): VoceSalute => ({ chiave: 'k', gruppo: 'errori', tono: 'attenzione', titolo: 't', spiegazione: '', azioni: [], ...x })

describe('la parola di una voce', () => {
  it('Drive, PC, aggiornamento, consegne, errori, chat ferma', () => {
    expect(statoVoce(voce({ gruppo: 'drive', tono: 'ok' }))).toMatchObject({ parola: 'collegato', colore: 'verde' })
    expect(statoVoce(voce({ gruppo: 'drive', tono: 'guasto' }))).toMatchObject({ parola: 'scollegato', colore: 'rosso' })
    expect(statoVoce(voce({ gruppo: 'aggiornamento', tono: 'guasto' })).parola).toBe('non installato')
    expect(statoVoce(voce({ gruppo: 'consegne', tono: 'guasto' })).parola).toBe('non partita')
    expect(statoVoce(voce({ gruppo: 'errori', tono: 'attenzione' }))).toMatchObject({ parola: 'errore', colore: 'ambra' })
    expect(statoVoce(voce({ gruppo: 'errori', tono: 'guasto', chiave: 'chat-errore:x' })).parola).toBe('ferma')
    expect(statoVoce(voce({ gruppo: 'pc', tono: 'attenzione' })).parola).toBe('da guardare')
  })
})

describe('i gruppi', () => {
  const voci = [voce({ gruppo: 'drive', tono: 'guasto' }), voce({ gruppo: 'pc', tono: 'ok' }), voce({ gruppo: 'errori' }), voce({ gruppo: 'consegne', tono: 'guasto' })]
  it('i conti, e «Tutto» è il totale', () => {
    expect(contaGruppiSalute(voci)).toEqual({ sistemare: 3, computer: 1, drive: 1, errori: 2, tutto: 4 })
    expect(nelGruppoSalute(voci[1] as VoceSalute, 'sistemare')).toBe(false)
  })
  it('si apre su «Da sistemare» se c’è qualcosa, se no su «Computer»', () => {
    expect(gruppoIniziale({ voci })).toBe('sistemare')
    expect(gruppoIniziale({ voci: [voce({ tono: 'ok' })] })).toBe('computer')
  })
})

describe('i titoli corti', () => {
  it('tagliati su una parola', () => {
    expect(breve('corto')).toBe('corto')
    const t = breve('Il Drive di questo PC non ha l’autorizzazione: le chat non si salvano e gli altri PC non si vedono più da qui', 60)
    expect(t.length).toBeLessThanOrEqual(60)
    expect(t.endsWith('…')).toBe(true)
  })
  it('il PC li mette su ogni voce', () => {
    const s = conVistaSalute({ scritto: '', tono: 'guasto', riassunto: '', voci: [voce({ gruppo: 'drive', tono: 'guasto', titolo: 'Drive scollegato' })] })
    expect(s.voci[0]).toMatchObject({ stato: { parola: 'scollegato' }, breve: 'Drive scollegato' })
  })
})
