import { describe, it, expect } from 'vitest'
import { creaLetture, creaStatoTelefono, criteriInPercento, FRESCO_MS } from '../../src/main/stato-telefono-rotta'
import type { VistaOrchestratore } from '@shared/piano-orchestratore'

const vista = (o: Partial<VistaOrchestratore> = {}): VistaOrchestratore => ({
  workspace: 'lavoro', autopilota: 'ap-1', modello: 'm', tettoSpecialisti: 3, pensa: false, vivo: true,
  specialisti: [], registro: [], costo: { oggiUsd: 0, turniOggi: 0 }, piano: { totale: 0, uniti: 0 }, domandeAperte: 0, ...o
})
const fermo = { stato: { id: 'fermo', parola: 'fermo', colore: 'rosso' as const } }

describe('la memoria delle letture per /api/stato', () => {
  it('la prima volta aspetta la lettura; poi la tiene per FRESCO_MS', async () => {
    let ora = 1_000_000
    let n = 0
    const l = creaLetture(async (k) => { n += 1; return `${k}-${n}` }, () => ora)
    expect(await l.leggi('a', 500)).toBe('a-1')
    ora += FRESCO_MS - 1
    expect(await l.leggi('a', 500)).toBe('a-1')
    expect(n).toBe(1)
  })
  it('vecchia: la dà subito e ne prende una nuova per il giro dopo', async () => {
    let ora = 1_000_000
    let n = 0
    const l = creaLetture(async () => { n += 1; return n }, () => ora)
    expect(await l.leggi('a', 500)).toBe(1)
    ora += FRESCO_MS + 1
    expect(await l.leggi('a', 500)).toBe(1)
    await new Promise((r) => setTimeout(r, 0))
    expect(await l.leggi('a', 500)).toBe(2)
  })
  it('chi arriva mentre una lettura è in volo non ne fa partire un’altra', async () => {
    let n = 0
    let sblocca: (v: string) => void = () => undefined
    const l = creaLetture(() => { n += 1; return new Promise<string>((r) => { sblocca = r }) }, () => 5)
    const p1 = l.leggi('a', 1_000)
    const p2 = l.leggi('a', 1_000)
    await new Promise((r) => setTimeout(r, 0))
    sblocca('x')
    expect(await p1).toBe('x')
    expect(await p2).toBe('x')
    expect(n).toBe(1)
  })
  it('una prima lettura lenta non ferma la risposta oltre l’attesa', async () => {
    const l = creaLetture(() => new Promise<string>(() => undefined), () => 5)
    const t = Date.now()
    expect(await l.leggi('a', 30)).toBeUndefined()
    expect(Date.now() - t).toBeLessThan(500)
  })
  it('un errore tiene il valore di prima', async () => {
    let ora = 1_000_000
    let rompi = false
    const l = creaLetture(async () => { if (rompi) throw new Error('giù'); return 'buono' }, () => ora)
    expect(await l.leggi('a', 500)).toBe('buono')
    rompi = true
    ora += FRESCO_MS + 1
    await l.leggi('a', 500)
    await new Promise((r) => setTimeout(r, 0))
    expect(await l.leggi('a', 500)).toBe('buono')
  })
})

describe('i quattro campi per gli autopiloti di /api/stato', () => {
  it('una lettura per workspace, gli archiviati senza letture', async () => {
    const chiesti: string[] = []
    const calcola = creaStatoTelefono({
      orchestratore: async (ws) => { chiesti.push(ws); return vista({ workspace: ws, autopilota: undefined, percento: 30, domandeAperte: 1 }) },
      adesso: () => 1_000
    })
    const m = await calcola([
      { a: { id: 'ap-1', cwd: 'C:\\p', workspace: 'lavoro' }, vista: fermo },
      { a: { id: 'ap-2', cwd: 'C:\\p', workspace: 'lavoro' }, vista: fermo },
      { a: { id: 'ap-3', cwd: 'C:\\q', workspace: 'vecchio', archiviato: true }, vista: fermo }
    ], [{ autopilotaId: 'ap-3' }])
    expect(chiesti).toEqual(['lavoro'])
    expect(m.get('ap-1')).toMatchObject({ avanzamento: { percento: 30 }, domande: 1, adesso: { tono: 'aspetta' } })
    expect(m.get('ap-3')).toEqual({ adesso: { testo: 'Fermo', tono: 'fermo' }, avanzamento: {}, ruoli: [], domande: 1 })
  })
  it('senza servizio: i campi ci sono lo stesso, dalla vista in una parola', async () => {
    const m = await creaStatoTelefono({ adesso: () => 1 })([{ a: { id: 'ap-1', cwd: 'C:\\p' }, vista: fermo }], [])
    expect(m.get('ap-1')).toEqual({ adesso: { testo: 'Fermo', tono: 'fermo' }, avanzamento: {}, ruoli: [], domande: 0 })
  })
  it('la lista d’attesa dà i minuti che mancano', async () => {
    const m = await creaStatoTelefono({
      attesa: async () => ({ posti: { usati: 1, tetto: 2 }, alLavoro: [{ posto: 1, id: 'x', workspace: 'lavoro', descrizione: 'k-1: la pagina', tipo: 'interfaccia', dal: '', minutiStimati: 14 }], inFila: [] }),
      adesso: () => 1
    })([{ a: { id: 'ap-1', cwd: 'C:\\p', workspace: 'lavoro' }, vista: fermo }], [])
    expect(m.get('ap-1')).toMatchObject({ avanzamento: { mancaMin: 14 }, ruoli: [{ ruolo: 'Interfaccia', cosa: 'La pagina' }], adesso: { tono: 'lavora' } })
  })
  it('«criteri —» diventa la percentuale vera; senza, resta com’era', () => {
    const v = { criteri: { fatti: 0, totali: 0, testo: '—' }, altro: 1 }
    expect(criteriInPercento(v, { adesso: { testo: '', tono: 'riposo' }, avanzamento: { percento: 40 }, ruoli: [], domande: 0 })).toEqual({ criteri: { fatti: 0, totali: 0, testo: '40%' }, altro: 1 })
    expect(criteriInPercento(v, undefined)).toBe(v)
  })
})

describe('/api/stato con i campi per il telefono', () => {
  it('ogni autopilota ha adesso, avanzamento, ruoli e domande; «criteri» dice la percentuale', async () => {
    const { rotteClient } = await import('../../src/main/client-rotte')
    const { apriDispositivi } = await import('../../src/main/dispositivi')
    const { nuovoAutopilota } = await import('@shared/autopilota')
    const { mkdtempSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const ap = { ...nuovoAutopilota({ id: 'ap-1', nome: 'Unico', obiettivo: 'x', cwd: 'C:\p', iniziatoIl: '2026-11-11T10:00:00.000Z' }), workspace: 'lavoro', stato: 'lavoro' as const }
    const rotte = rotteClient({
      dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-stato-tel-'))),
      chat: () => [],
      autopiloti: () => Promise.resolve([ap]),
      domande: () => Promise.resolve([]),
      workspace: () => Promise.resolve({ nomi: ['lavoro'], attivo: 'lavoro' }),
      aggiornamento: () => ({ fase: 'fermo' as const }),
      versione: '0.0.0',
      orchestratoreWorkspace: async () => vista({ percento: 40, specialisti: [{ id: 's1', ruolo: 'verificatore', compito: 'k-9: provare la coda', stato: 'lavoro', compitoId: 'k-9' }] })
    } as never)
    const e = await rotte({ metodo: 'GET', percorso: '/api/stato', corpo: undefined, dispositivo: 'telefono' })
    const a = (e.corpo as { autopiloti: Record<string, unknown>[] }).autopiloti[0]!
    expect(a.adesso).toEqual({ testo: 'Al lavoro: Collaudo', tono: 'lavora' })
    expect(a.avanzamento).toEqual({ percento: 40 })
    expect(a.ruoli).toEqual([{ ruolo: 'Collaudo', colore: '#3cc8c0', cosa: 'Provare la coda' }])
    expect(a.domande).toBe(0)
    expect((a.vista as { criteri: { testo: string } }).criteri.testo).toBe('40%')
    // I campi di prima restano, con lo stesso tipo.
    expect(a).toMatchObject({ id: 'ap-1', fatti: 0, criteri: 0, stato: 'lavoro' })
  })
})
