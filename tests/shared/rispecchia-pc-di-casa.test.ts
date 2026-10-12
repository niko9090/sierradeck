import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { giudicaRiquadroRemoto, GRAZIA_RIQUADRO_REMOTO_MS, rigaNonApertaACasa } from '@shared/chiuse'

/**
 * Il workspace rispecchia il PC di casa (0.64.2). Il caso vero di Nicholas
 * (12/10): nel workspace MT5 di qui restava il riquadro di una chat chiusa sul
 * portatile senza chiusura registrata; là MT5 ne aveva una sola.
 */

const ADESSO = Date.parse('2026-10-12T12:00:00.000Z')
const VECCHIO = ADESSO - 60 * 60_000
const base = {
  trovata: false,
  sessione: 'aaaaaaaa-0000-0000-0000-000000000001',
  chiusaRegistrata: false,
  salvateLa: ['bbbbbbbb-0000-0000-0000-000000000002'] as string[] | undefined,
  apertoIl: VECCHIO as number | undefined,
  ultimaAzioneIl: undefined as number | undefined,
  inAttesa: false,
  adesso: ADESSO,
  casaCerta: true as boolean | undefined
}

describe('giudicaRiquadroRemoto', () => {
  it('la chat è viva là: il riquadro la mostra', () => {
    expect(giudicaRiquadroRemoto({ ...base, trovata: true })).toBe('mostra')
  })

  it('chiusura registrata là dopo l’apertura: si chiude come nella 0.60.9', () => {
    expect(giudicaRiquadroRemoto({ ...base, chiusaRegistrata: true })).toBe('chiusa')
  })

  it('il caso di Nicholas: nessuna chiusura registrata, là non è aperta da nessuna parte → si toglie', () => {
    expect(giudicaRiquadroRemoto(base)).toBe('togli')
  })

  it('anche un riquadro salvato senza l’ora di apertura (prima della 0.60.9) si toglie', () => {
    expect(giudicaRiquadroRemoto({ ...base, apertoIl: undefined })).toBe('togli')
  })

  it('il PC guardato non è certamente la casa della chat (0.67.0): non si toglie niente', () => {
    expect(giudicaRiquadroRemoto({ ...base, casaCerta: false })).toBe('aspetta')
    expect(giudicaRiquadroRemoto({ ...base, casaCerta: undefined })).toBe('aspetta')
    // Una chiusura registrata là resta una chiusura: quella è certa.
    expect(giudicaRiquadroRemoto({ ...base, casaCerta: false, chiusaRegistrata: true })).toBe('chiusa')
  })

  it('salvata in un workspace di là (non a schermo): è aperta là, il riquadro resta', () => {
    expect(giudicaRiquadroRemoto({ ...base, salvateLa: [base.sessione] })).toBe('aspetta')
  })

  it('aperto da qui da poco: resta, anche se là non c’è ancora', () => {
    expect(giudicaRiquadroRemoto({ ...base, apertoIl: ADESSO - 30_000 })).toBe('aspetta')
    expect(giudicaRiquadroRemoto({ ...base, apertoIl: ADESSO - GRAZIA_RIQUADRO_REMOTO_MS - 1 })).toBe('togli')
  })

  it('scritto o riaperto da qui da poco: resta', () => {
    expect(giudicaRiquadroRemoto({ ...base, ultimaAzioneIl: ADESSO - 60_000 })).toBe('aspetta')
  })

  it('un testo da qui o un avvio in sottofondo non ancora partito: resta finché la chat non parte', () => {
    expect(giudicaRiquadroRemoto({ ...base, inAttesa: true, ultimaAzioneIl: VECCHIO })).toBe('aspetta')
  })

  it('il PC di casa non dice le chat dei suoi workspace (versione vecchia): non si toglie niente', () => {
    expect(giudicaRiquadroRemoto({ ...base, salvateLa: undefined })).toBe('aspetta')
  })

  it('senza la conversazione non si giudica', () => {
    expect(giudicaRiquadroRemoto({ ...base, sessione: undefined })).toBe('aspetta')
  })

  it('la riga del registro dice perché e dove ritrovarla', () => {
    expect(rigaNonApertaACasa('Portatile')).toContain('non aperta sul PC di casa (Portatile')
    expect(rigaNonApertaACasa('Portatile')).toContain('tolgo il riquadro')
  })
})

describe('il riquadro remoto usa la regola', () => {
  const src = readFileSync('src/renderer/components/RiquadroRemoto.tsx', 'utf8')
  const main = readFileSync('src/main/index.ts', 'utf8')

  it('la giudica a ogni giro con le chat salvate di là, e solo dopo una risposta del PC di casa', () => {
    expect(src).toContain('giudicaRiquadroRemoto({')
    expect(src).toContain('salvateLa: s.dati.salvate')
    // Il PC di casa non risponde: si esce prima, con lo stato «non raggiungibile», e non si toglie niente.
    const giro = src.indexOf('if (!s.ok) { taci(')
    expect(giro).toBeGreaterThan(0)
    expect(giro).toBeLessThan(src.indexOf('giudicaRiquadroRemoto({'))
  })

  it('scrivere, riaprire e avviare là da qui segnano l’ultima azione', () => {
    expect(src.match(/ultimaAzioneRef\.current = Date\.now\(\)/g)?.length).toBeGreaterThanOrEqual(3)
  })

  it('il Core legge le chat dei workspace di là e scrive la riga [apertura]', () => {
    expect(main).toContain("ipcMain.handle('remoto:nonApertaACasa'")
    expect(main).toContain('salvate')
  })
})
