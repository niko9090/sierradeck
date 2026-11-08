import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * k-185: la Panoramica (chat degli specialisti «Al lavoro») rilegge appena
 * arriva `specialistiCambiati`; il giro a intervalli resta come rete.
 */
describe('Panoramica: specialisti riletti a evento', () => {
  const src = readFileSync('src/renderer/components/ChatSpecialisti.tsx', 'utf8')

  it('si iscrive solo se la funzione esiste e toglie l’iscrizione alla chiusura', () => {
    expect(src).toContain('window.gestore.autopilota.suSpecialistiCambiati?.(() => sond.rileggi())')
    // l'effetto torna direttamente la disdetta (undefined se la funzione manca)
    expect(src).toMatch(/useEffect\(\(\) => window\.gestore\.autopilota\.suSpecialistiCambiati\?\.\(.*\), \[sond\]\)/)
  })

  it('il controllo a intervalli resta', () => {
    expect(src).toContain('sondaggioOrchestratore(workspace)')
    expect(src).toContain('setInterval(() => { if (document.visibilityState')
  })
})
