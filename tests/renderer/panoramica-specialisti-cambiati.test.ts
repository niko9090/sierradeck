import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * k-185: la Panoramica (chat degli specialisti «Al lavoro») rilegge appena
 * arriva `specialistiCambiati`; il giro a intervalli resta come rete.
 */
describe('Panoramica: specialisti riletti a evento', () => {
  const src = readFileSync('src/renderer/components/ChatSpecialisti.tsx', 'utf8')

  it('si iscrive solo se la funzione esiste e toglie l’iscrizione alla chiusura', () => {
    // 0.102.0: attraverso la sorgente (qui o un altro PC); quella di qui si iscrive solo se la funzione esiste.
    expect(src).toContain('sorgente.suSpecialistiCambiati(() => sond.rileggi())')
    expect(readFileSync('src/renderer/sorgente-autopilota.tsx', 'utf8')).toContain('window.gestore.autopilota.suSpecialistiCambiati?.(f)')
    // l'effetto torna direttamente la disdetta (undefined se la funzione manca)
    expect(src).toMatch(/useEffect\(\(\) => sorgente\.suSpecialistiCambiati\(.*\), \[sond, sorgente\]\)/)
  })

  it('il controllo a intervalli resta', () => {
    expect(src).toContain('sondaggioOrchestratore(workspace, sorgente)')
    expect(src).toContain('setInterval(() => { if (document.visibilityState')
  })
})
