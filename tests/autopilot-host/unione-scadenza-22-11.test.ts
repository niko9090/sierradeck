import { describe, expect, it } from 'vitest'
import { conScadenza } from '../../src/autopilot-host/tempi-unione'
import { creaTurni, TurnoScaduto } from '../../src/autopilot-host/turni-criteri'

const pausa = (ms: number): Promise<void> => new Promise((ris) => setTimeout(ris, ms))

/** Un «git» finto che resta vivo finché il segnale non scatta, e poi ci mette un po' a chiudersi. */
function gitFinto(ritardoChiusuraMs = 20) {
  const stato = { avviati: 0, vivi: 0, picco: 0 }
  const fai = (segnale: AbortSignal): Promise<string> => new Promise((ris) => {
    stato.avviati += 1; stato.vivi += 1; stato.picco = Math.max(stato.picco, stato.vivi)
    segnale.addEventListener('abort', () => { setTimeout(() => { stato.vivi -= 1; ris('fermato') }, ritardoChiusuraMs) }, { once: true })
  })
  return { stato, fai }
}

describe('unione scaduta: il posto resta occupato finché il git non si chiude (22/11)', () => {
  it('allo scadere chi chiama riceve TurnoScaduto e il segnale ferma fai()', async () => {
    const turni = creaTurni({ unioneMaxMs: 20 })
    let segnaleVisto: AbortSignal | undefined
    const appesa = turni.unione('C:/principale', (segnale) => { segnaleVisto = segnale; return new Promise<void>(() => {}) })
    await expect(appesa).rejects.toBeInstanceOf(TurnoScaduto)
    expect(segnaleVisto?.aborted).toBe(true)
  })

  it('una seconda unione nella stessa cartella non parte finché la prima non si è chiusa davvero', async () => {
    const turni = creaTurni({ unioneMaxMs: 100 })
    const g = gitFinto(60)
    const prima = turni.unione('C:/principale', g.fai)
    await expect(prima).rejects.toBeInstanceOf(TurnoScaduto)
    const seconda = turni.unione('C:\\principale\\', g.fai)
    seconda.catch(() => {})
    // Prima scaduta, ma il suo git gira ancora: la seconda aspetta.
    expect(g.stato.vivi).toBe(1)
    await pausa(30)
    expect(g.stato.avviati).toBe(1)
    // Il git della prima si chiude: ora tocca alla seconda.
    await pausa(60)
    expect(g.stato.avviati).toBe(2)
    expect(g.stato.picco).toBe(1)
    await expect(seconda).rejects.toBeInstanceOf(TurnoScaduto)
    await pausa(100)
    expect(turni.stato().unioni).toBe(0)
  })

  it('un pesante nella stessa cartella non parte mentre il git dell’unione scaduta gira ancora', async () => {
    const turni = creaTurni({ unioneMaxMs: 20 })
    const g = gitFinto(80)
    await expect(turni.unione('C:/principale', g.fai)).rejects.toBeInstanceOf(TurnoScaduto)
    let partito = false
    const pesante = turni.pesante('C:/principale', () => { partito = true; return Promise.resolve() })
    await pausa(30)
    expect(partito).toBe(false)
    await pesante
    expect(partito).toBe(true)
    expect(g.stato.vivi).toBe(0)
  })

  it('senza scadenza va come prima: valore reso e posto libero subito', async () => {
    const turni = creaTurni()
    await expect(turni.unione('C:/principale', () => 'unita')).resolves.toBe('unita')
    await expect(turni.unione('C:/principale', async () => 'ancora')).resolves.toBe('ancora')
    expect(turni.stato().unioni).toBe(0)
  })
})

describe('conScadenza aspetta il corpo (22/11)', () => {
  it('alla scadenza torna solo quando il corpo, fermato dal segnale, si è chiuso', async () => {
    let chiuso = false
    const r = await conScadenza((segnale) => new Promise<string>((ris) => {
      segnale.addEventListener('abort', () => { setTimeout(() => { chiuso = true; ris('x') }, 40) }, { once: true })
    }), 10)
    expect(r).toEqual({ scaduta: true })
    expect(chiuso).toBe(true)
  })

  it('un corpo che finisce in tempo non cambia', async () => {
    const r = await conScadenza(async () => 'ok', 1000)
    expect(r).toEqual({ scaduta: false, valore: 'ok' })
  })
})
