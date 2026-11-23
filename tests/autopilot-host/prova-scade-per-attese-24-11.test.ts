import { describe, expect, it } from 'vitest'
import type { GuardiaPc } from '../../src/autopilot-host/guardia-pc'
import { PROVA_MAX_MS, QUOTA_PER_CRITERIO_MS, conScadenza, scadenzaAdattiva } from '../../src/autopilot-host/tempi-unione'
import { attesaDellaProva, conTurni, creaTurni } from '../../src/autopilot-host/turni-criteri'
import type { Esecutore } from '../../src/autopilot-host/verifiche'

const MIN = 60_000

describe('24/11: la prova non scade per attese che non sono la prova', () => {
  it('l’attesa della guardia del PC dentro la misura ferma la scadenza (e senza prova conta come prima)', async () => {
    // Timer veri e attese brevi: scadenza 80 ms, attesa della guardia 150 ms.
    const guardia: GuardiaPc = { valuta: () => undefined, stato: () => undefined, attendi: () => new Promise<void>((ris) => setTimeout(ris, 150)) }
    const finto: Esecutore = async () => ({ codice: 0, uscita: '' })
    const esegui = conTurni(finto, creaTurni(), guardia)
    const scritti: { attesaMs: number; esecuzioneMs: number; scaduta: boolean }[] = []
    const r = await conScadenza(async (_s, iniziata, inFila) => {
      iniziata()
      return attesaDellaProva.run(inFila, () => esegui('npx vitest run', 'C:/prova'))
    }, 80, { scrivi: (x) => scritti.push(x) })
    expect(r.scaduta).toBe(false)
    expect(scritti[0]?.scaduta).toBe(false)
    // Senza il contesto della prova la stessa attesa fa scadere la prova.
    const senza = await conScadenza(async (_s, iniziata) => { iniziata(); return esegui('npx vitest run', 'C:/prova') }, 80)
    expect(senza.scaduta).toBe(true)
  })

  it('un pesante dentro il turno della misura non dice di aspettare dietro a se stesso', async () => {
    const turni = creaTurni()
    const guardia: GuardiaPc = { valuta: () => undefined, stato: () => undefined, attendi: async () => {} }
    const esegui = conTurni(async () => ({ codice: 0, uscita: '' }), turni, guardia)
    const righe: string[] = []
    const info = console.info
    console.info = (...a: unknown[]) => { righe.push(a.join(' ')) }
    try {
      await turni.pesante('C:/prova', () => esegui('npx vitest run', 'C:/prova'))
      expect(righe.filter((r) => r.includes('aspetta il suo turno'))).toEqual([])
      expect(turni.giaDentro?.()).toBe(false)
    } finally { console.info = info }
  })

  it('il minimo della scadenza adattiva cresce con i criteri da misurare, mai oltre il tetto', () => {
    const veloci = [10_000, 16_000, 12_000]
    expect(scadenzaAdattiva(veloci, PROVA_MAX_MS)).toBe(5 * MIN)
    expect(scadenzaAdattiva(veloci, PROVA_MAX_MS, 1, 56)).toBe(5 * MIN + 56 * QUOTA_PER_CRITERIO_MS)
    expect(scadenzaAdattiva(veloci, 8 * MIN, 1, 56)).toBe(8 * MIN)
    // Una mediana alta resta quella che comanda.
    expect(scadenzaAdattiva([4 * MIN, 4 * MIN, 4 * MIN], PROVA_MAX_MS, 1, 2)).toBe(16 * MIN)
  })
})
