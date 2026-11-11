import { describe, it, expect } from 'vitest'
import type { CompitoPiano } from '@shared/piano-orchestratore'
import { promemoriaRosso, ROSSO_POI_MS, ROSSO_PRIMO_MS, ROSSO_SECONDO_MS, type RossoVisto } from '../../src/autopilot-host/criterio-rosso'

/** 06/11: criterio rosso dopo l'unione e nessuna correzione affidata: promemoria all'autopilota, una volta e poi un'altra. */

const compito = (over: Partial<CompitoPiano> = {}): CompitoPiano => ({
  id: 'k1', richiesta: 'r-1', titolo: 'la barra', criterio: '`npx vitest run`', dopo: [], peso: 1, stato: 'unito', criterioVerde: false,
  esito: 'criterio rosso: 2 test falliti', creato: '2026-11-06T09:00:00.000Z', ...over
})
const base = { richiesteAperte: new Set(['r-1']), compitiConSpecialista: new Set<string>(), occupato: false }

describe('promemoria del criterio rosso', () => {
  // 11/11: prima «poi basta»: dopo due promemoria il compito rosso restava lì in silenzio, per sempre.
  it('prima volta dopo la quiete, seconda dopo un tempo, poi ogni mezz’ora finché resta rosso', () => {
    const visti = new Map<string, RossoVisto>()
    const giro = (ora: number): string | undefined => promemoriaRosso(visti, { ...base, compiti: [compito()], ora })
    expect(giro(0)).toBeUndefined()
    expect(giro(ROSSO_PRIMO_MS - 1)).toBeUndefined()
    const primo = giro(ROSSO_PRIMO_MS)
    expect(primo).toMatch(/criterio è rosso/)
    expect(primo).toMatch(/k1/)
    expect(primo).toMatch(/Non scrivere a Nicholas/)
    expect(giro(ROSSO_PRIMO_MS + 60_000)).toBeUndefined()
    const secondo = ROSSO_PRIMO_MS + ROSSO_SECONDO_MS
    expect(giro(secondo)).toMatch(/criterio è rosso/)
    // Dopo il secondo: non prima di mezz'ora, poi ancora, senza un tetto.
    expect(giro(secondo + ROSSO_POI_MS - 1)).toBeUndefined()
    expect(giro(secondo + ROSSO_POI_MS)).toMatch(/criterio è rosso/)
    expect(giro(secondo + ROSSO_POI_MS + 60_000)).toBeUndefined()
    for (let n = 2; n <= 12; n += 1) expect(giro(secondo + n * ROSSO_POI_MS)).toMatch(/criterio è rosso/)
  })

  it('niente promemoria se uno specialista lavora a quel compito, se è verde o se la richiesta è chiusa', () => {
    const v1 = new Map<string, RossoVisto>()
    const con = { ...base, compitiConSpecialista: new Set(['k1']) }
    promemoriaRosso(v1, { ...con, compiti: [compito()], ora: 0 })
    expect(promemoriaRosso(v1, { ...con, compiti: [compito()], ora: ROSSO_PRIMO_MS * 5 })).toBeUndefined()
    const v2 = new Map<string, RossoVisto>()
    promemoriaRosso(v2, { ...base, compiti: [compito({ criterioVerde: true })], ora: 0 })
    expect(promemoriaRosso(v2, { ...base, compiti: [compito({ criterioVerde: true })], ora: ROSSO_PRIMO_MS * 5 })).toBeUndefined()
    const v3 = new Map<string, RossoVisto>()
    const chiusa = { ...base, richiesteAperte: new Set<string>() }
    promemoriaRosso(v3, { ...chiusa, compiti: [compito()], ora: 0 })
    expect(promemoriaRosso(v3, { ...chiusa, compiti: [compito()], ora: ROSSO_PRIMO_MS * 5 })).toBeUndefined()
  })

  it('mentre l’autopilota sta decidendo la quiete riparte da quando ha finito', () => {
    const visti = new Map<string, RossoVisto>()
    promemoriaRosso(visti, { ...base, compiti: [compito()], ora: 0 })
    // turno in corso per 10 minuti: nessun promemoria
    expect(promemoriaRosso(visti, { ...base, occupato: true, compiti: [compito()], ora: 10 * 60_000 })).toBeUndefined()
    // appena finisce, ancora niente: la quiete conta da lì
    expect(promemoriaRosso(visti, { ...base, compiti: [compito()], ora: 10 * 60_000 + 1000 })).toBeUndefined()
    expect(promemoriaRosso(visti, { ...base, compiti: [compito()], ora: 10 * 60_000 + ROSSO_PRIMO_MS })).toMatch(/rosso/)
  })

  it('un esito nuovo (altra unione, altro rosso) riparte da capo', () => {
    const visti = new Map<string, RossoVisto>()
    promemoriaRosso(visti, { ...base, compiti: [compito()], ora: 0 })
    expect(promemoriaRosso(visti, { ...base, compiti: [compito()], ora: ROSSO_PRIMO_MS })).toBeDefined()
    const nuovo = compito({ esito: 'criterio rosso: 1 test fallito' })
    expect(promemoriaRosso(visti, { ...base, compiti: [nuovo], ora: ROSSO_PRIMO_MS + 1000 })).toBeUndefined()
    expect(promemoriaRosso(visti, { ...base, compiti: [nuovo], ora: 2 * ROSSO_PRIMO_MS + 1000 })).toBeDefined()
  })
})
