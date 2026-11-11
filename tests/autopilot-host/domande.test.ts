import { describe, it, expect } from 'vitest'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'

const T0 = Date.parse('2026-08-09T10:00:00.000Z')

function registro(adesso = () => T0) {
  return creaRegistroDomande({ adesso })
}

describe('registro delle domande', () => {
  it('apre una domanda e la elenca fra quelle aperte', () => {
    const r = registro()
    const d = r.apri({ autopilotaId: 'ap-1', testo: 'Quale chiave uso?', scadenzaMs: 300_000 })
    expect(r.aperte().map((x) => x.id)).toEqual([d.id])
    expect(r.aperte()[0]?.testo).toBe('Quale chiave uso?')
  })

  it('una risposta risolve l attesa e restituisce il testo', async () => {
    const r = registro()
    const d = r.apri({ autopilotaId: 'ap-1', testo: 'A o B?', scadenzaMs: 300_000 })
    const attesa = r.attendi(d.id)
    expect(r.rispondi(d.id, 'B', 'modale')).toBe(true)
    expect(await attesa).toEqual({ risposta: 'B', da: 'modale' })
  })

  it('vale la prima risposta: la seconda viene rifiutata', async () => {
    // Due risposte alla stessa domanda produrrebbero due decisioni diverse sullo
    // stesso bivio, e la seconda arriverebbe a lavoro gia' proseguito.
    const r = registro()
    const d = r.apri({ autopilotaId: 'ap-1', testo: 'A o B?', scadenzaMs: 300_000 })
    const attesa = r.attendi(d.id)
    expect(r.rispondi(d.id, 'A', 'modale')).toBe(true)
    expect(r.rispondi(d.id, 'B', 'telegram')).toBe(false)
    expect(await attesa).toEqual({ risposta: 'A', da: 'modale' })
  })

  it('rispondere a una domanda inesistente dice di no invece di sollevare', () => {
    expect(registro().rispondi('mai-esistita', 'x', 'telegram')).toBe(false)
  })

  it('una domanda risposta non e piu aperta', () => {
    const r = registro()
    const d = r.apri({ autopilotaId: 'ap-1', testo: 'A o B?', scadenzaMs: 300_000 })
    r.rispondi(d.id, 'A', 'modale')
    expect(r.aperte()).toEqual([])
  })

  it('l attesa scade da sola e la domanda resta aperta per una risposta tardiva', async () => {
    // La scadenza serve a liberare l'hook, non a cancellare la domanda: se
    // l'utente risponde piu' tardi, quella risposta deve ancora valere.
    const r = registro()
    const d = r.apri({ autopilotaId: 'ap-1', testo: 'A o B?', scadenzaMs: 20 })
    expect(await r.attendi(d.id)).toBeUndefined()
    expect(r.aperte().map((x) => x.id)).toEqual([d.id])
    expect(r.rispondi(d.id, 'tardiva', 'telegram')).toBe(true)
  })

  it('una risposta tardiva viene consegnata a chi la aspetta', async () => {
    const r = registro()
    const consegnate: { id: string; risposta: string }[] = []
    r.suRispostaTardiva((id, risposta) => consegnate.push({ id, risposta }))
    const d = r.apri({ autopilotaId: 'ap-1', testo: 'A o B?', scadenzaMs: 20 })
    await r.attendi(d.id)
    r.rispondi(d.id, 'tardiva', 'telegram')
    expect(consegnate).toEqual([{ id: d.id, risposta: 'tardiva' }])
  })

  it('una risposta in tempo non viene consegnata come tardiva', async () => {
    const r = registro()
    const consegnate: string[] = []
    r.suRispostaTardiva((id) => consegnate.push(id))
    const d = r.apri({ autopilotaId: 'ap-1', testo: 'A o B?', scadenzaMs: 300_000 })
    const attesa = r.attendi(d.id)
    r.rispondi(d.id, 'in tempo', 'modale')
    await attesa
    expect(consegnate).toEqual([])
  })

  it('elenca solo le domande dell autopilota richiesto', () => {
    const r = registro()
    r.apri({ autopilotaId: 'ap-1', testo: 'prima', scadenzaMs: 1000 })
    r.apri({ autopilotaId: 'ap-2', testo: 'seconda', scadenzaMs: 1000 })
    expect(r.aperte('ap-2').map((d) => d.testo)).toEqual(['seconda'])
  })

  it('chiudere le domande di un autopilota le toglie dalle aperte', () => {
    // Serve quando un autopilota viene fermato: le sue domande non hanno piu'
    // nessuno che aspetti la risposta.
    const r = registro()
    const d = r.apri({ autopilotaId: 'ap-1', testo: 'A o B?', scadenzaMs: 1000 })
    r.chiudiDi('ap-1')
    expect(r.aperte()).toEqual([])
    expect(r.rispondi(d.id, 'x', 'modale')).toBe(false)
  })

  // 11/11: la domanda del programma «salvo io i tuoi file non salvati?» non si chiude mai da sola,
  // ma il programma la ritira quando non serve più.
  it('finché qualcuno la aspetta non si chiude da sola; chi l’ha aperta può ritirarla, e chi aspettava è libero senza risposta', async () => {
    const r = registro()
    const chiuse: string[] = []
    const tardive: string[] = []
    r.suChiusa((d) => chiuse.push(d.id))
    r.suRispostaTardiva((id) => tardive.push(id))
    const d = r.apri({ autopilotaId: 'ap-1', testo: 'Li salvo io?', scadenzaMs: 20 * 24 * 60 * 60_000, opzioni: ['Salvali e unisci', 'Aspetta, li sistemo io'] })
    const attesa = r.attendi(d.id)
    expect(r.superata(d.id, 'chiusura automatica')).toBe(false)
    expect(r.aperte().map((x) => x.id)).toEqual([d.id])
    expect(r.ritira?.(d.id, 'l’unione è passata: non serve più')).toBe(true)
    expect(await attesa).toBeUndefined()
    expect(r.aperte()).toEqual([])
    expect(chiuse).toEqual([d.id])
    expect(tardive).toEqual([])
    expect(r.risolte('ap-1')[0]?.risposta).toContain('non serve più')
    // Ritirata o mai esistita: niente da ritirare, e una risposta arrivata dopo non vale.
    expect(r.ritira?.(d.id, 'di nuovo')).toBe(false)
    expect(r.ritira?.('d-che-non-esiste', 'x')).toBe(false)
    expect(r.rispondi(d.id, 'Salvali e unisci', 'modale')).toBe(false)
  })
})
