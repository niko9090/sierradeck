import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import { apriCode, type ArchivioCode } from '../../src/autopilot-host/coda-store'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import type { VistaCoda } from '@shared/coda-richieste'
import { attendi } from '../setup/attendi'
import { orologioDa } from '../setup/orologio'

/**
 * La coda nel servizio (P1): la migrazione all'avvio, ogni richiesta del
 * dialogo nella coda con le parole intere, l'unione decisa dal supervisore
 * solo se nessun punto si perde, e le rotte `/coda`, `/coda/separa`,
 * `/coda/unisci`.
 */

let server: ServerAutopiloti | undefined
let porta: number
let archivio: Archivio
let code: ArchivioCode
let prompt: string[] = []

const BARRA = 'la barra delle chat in alto non mostra il numero delle chat aperte'

function ap(p: Partial<Autopilota> = {}): Autopilota {
  return {
    ...nuovoAutopilota({ id: 'ap-coda', nome: 'Prova', obiettivo: 'Il programma', cwd: process.cwd(), criteri: [{ descrizione: 'test verdi', comando: 'npm test', soddisfatto: false }], iniziatoIl: '2026-10-29T06:00:00.000Z', workspace: 'Lavoro' }),
    stato: 'lavoro',
    ...p
  }
}

async function avvia(risposta: () => string, prima: Autopilota[] = [], conCoda = true): Promise<void> {
  const orologio = orologioDa('2026-10-30T08:00:00.000Z')
  archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-coda-')))
  for (const a of prima) archivio.scrivi(a)
  code = apriCode(mkdtempSync(join(tmpdir(), 'ap-coda-orch-')))
  prompt = []
  const s = creaServer({
    archivio,
    memoria: apriMemoria(mkdtempSync(join(tmpdir(), 'ap-coda-mem-'))),
    versione: '0.86.3',
    esegui: () => Promise.resolve({ codice: 1, uscita: 'non ancora' }),
    interroga: (p: string) => { prompt.push(p); return Promise.resolve({ testo: risposta() }) },
    avviaLavoro: () => Promise.resolve(),
    fermaLavoro: () => {},
    avvisa: () => Promise.resolve(),
    domande: creaRegistroDomande({ adesso: orologio.ms }),
    ultimoDetto: () => 'sto lavorando',
    scadenzaDomandaMs: 5000,
    scadenzaInterviataMs: 5000,
    adesso: orologio.iso,
    ...(conCoda ? { coda: code } : {})
  })
  server = s
  await new Promise<void>((ris) => s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }))
}

afterEach(() => { server?.close(); server = undefined; vi.restoreAllMocks() })

const zitto = (): void => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
}
const url = (p: string): string => `http://127.0.0.1:${porta}${p}`
const scrivi = (testo: string): Promise<Response> => fetch(url('/autopiloti/ap-coda/dialogo'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ testo }) })
const posta = (p: string, corpo: unknown): Promise<Response> => fetch(url(p), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
const vista = async (): Promise<VistaCoda> => (await (await fetch(url('/coda?ws=Lavoro'))).json()) as VistaCoda
const risposto = (): boolean => (archivio.leggi('ap-coda')?.dialogo ?? []).some((s) => s.da === 'lui')

const conRichiestaDiPrima = (): Autopilota => ap({
  richieste: [{ id: 'r-1', quando: '2026-10-29T08:00:00.000Z', testo: BARRA, titolo: 'La barra delle chat', criterio: 'la barra mostra il numero', compiti: ['Correggi la barra delle chat'], da: 'programma' }],
  compitiDaFare: ['Correggi la barra delle chat', 'Il pannello lento'],
  chats: [{ id: 'c-1', compito: 'Il pannello lento', stato: 'lavoro', cicli: 1, ultimaAzione: 'passo 1 di 2' }]
})

describe('la coda nel servizio', () => {
  it('all’avvio le richieste e i compiti di prima entrano nella coda; GET /coda con le percentuali', async () => {
    zitto()
    await avvia(() => '{}', [conRichiestaDiPrima()])
    const v = await vista()
    expect(v.workspace).toBe('Lavoro')
    expect(v.richieste.map((r) => [r.id, r.titolo, r.stato, r.percento])).toEqual([
      ['r-1', 'La barra delle chat', 'pianificata', 0],
      ['r-2', 'Il pannello lento', 'in-corso', 40]
    ])
    expect(v.totale).toBe(20)
    expect(code.leggi('Lavoro').migrata).toBeDefined()
    expect((await fetch(url('/coda'))).status).toBe(400)
  })

  it('senza la coda il servizio risponde 503, come un servizio di prima', async () => {
    zitto()
    await avvia(() => '{}', [], false)
    expect((await fetch(url('/coda?ws=Lavoro'))).status).toBe(503)
  })

  it('una richiesta lunga entra nella coda intera (l’autopilota la tiene tagliata a 2000)', async () => {
    zitto()
    const lunga = `correggi il pannello degli autopiloti: ${'deve aprirsi subito e non perdere nessuna riga. '.repeat(80)}`
    expect(lunga.length).toBeGreaterThan(3000)
    await avvia(() => JSON.stringify({ risposta: 'Lo faccio.', richieste: [{ titolo: 'Pannello veloce', criterio: { descrizione: 'il pannello si apre subito' }, compiti: ['Rendi veloce il pannello'] }] }), [ap()])
    await scrivi(lunga)
    await attendi(risposto)
    const a = archivio.leggi('ap-coda')!
    expect(a.richieste![0]!.testo.length).toBe(2000)
    const r = (await vista()).richieste[0]!
    // Intera: solo gli spazi ai bordi, che la rotta del dialogo toglie da sempre.
    expect(r.originali[0]!.testo).toBe(lunga.trim())
    expect(r.titolo).toBe('Pannello veloce')
    expect(r.collegate).toEqual([{ autopilota: 'ap-coda', richiesta: a.richieste![0]!.id }])
    expect(a.dialogo.at(-1)!.esito).toContain('in coda come r-1')
  })

  it('il supervisore unisce alla candidata nominando ogni punto: una richiesta sola, i due originali', async () => {
    zitto()
    const unione = {
      risposta: 'È la stessa barra: le unisco.',
      richieste: [{ titolo: 'Numero giusto nella barra', criterio: { descrizione: 'il numero è giusto' }, compiti: ['Correggi il numero nella barra'] }],
      unisci: { con: ['r-1'], titolo: 'La barra delle chat, col numero giusto', testo: 'La barra delle chat deve mostrare il numero giusto delle chat aperte.', punti: [{ id: 'p-1' }, { id: 'nuovo' }], perche: 'stessa barra' }
    }
    await avvia(() => JSON.stringify(unione), [conRichiestaDiPrima()])
    await scrivi('correggi la barra delle chat: non mostra il numero giusto delle chat aperte')
    await attendi(risposto)
    // Il prompt del dialogo ha mostrato la candidata e chiesto `unisci`.
    const p = prompt.find((x) => x.includes('## Ti scrive adesso'))!
    expect(p).toContain('"unisci"')
    expect(p).toContain('r-1 «La barra delle chat»')
    const v = await vista()
    const r1 = v.richieste.find((r) => r.id === 'r-1')!
    expect(v.richieste.map((r) => r.id)).toEqual(['r-1', 'r-2'])
    expect(r1.titolo).toBe('La barra delle chat, col numero giusto')
    expect(r1.originali.map((o) => o.testo)).toEqual([BARRA, 'correggi la barra delle chat: non mostra il numero giusto delle chat aperte'])
    expect(r1.punti.map((x) => x.id)).toEqual(['p-1', 'p-3'])
    expect(r1.unioni[0]).toMatchObject({ fonti: ['r-1', 'r-3'], perche: 'stessa barra' })
    expect(r1.compiti).toEqual(['Correggi la barra delle chat', 'Correggi il numero nella barra'])
    expect(archivio.leggi('ap-coda')!.dialogo.at(-1)!.esito).toContain('unita alla richiesta r-1')

    // «Separa»: tornano due.
    const s = await posta('/coda/separa', { ws: 'Lavoro', id: 'r-1' })
    expect(s.status).toBe(200)
    const dopo = (await s.json()) as VistaCoda
    expect(dopo.richieste.map((r) => r.id)).toEqual(['r-1', 'r-2', 'r-3'])
    expect(dopo.richieste.find((r) => r.id === 'r-3')!.originali[0]!.testo).toBe('correggi la barra delle chat: non mostra il numero giusto delle chat aperte')
    expect((await posta('/coda/separa', { ws: 'Lavoro', id: 'r-1' })).status).toBe(400)
  })

  it('un’unione che perde un punto si rifiuta: restano separate, con la candidata in vista', async () => {
    zitto()
    const conPerdita = {
      risposta: 'Le unisco.',
      richieste: [{ titolo: 'Numero giusto', criterio: { descrizione: 'il numero è giusto' }, compiti: ['Correggi il numero'] }],
      // Non nomina p-1: si perderebbe.
      unisci: { con: ['r-1'], testo: 'solo il numero', punti: [{ id: 'nuovo' }], perche: 'stessa barra' }
    }
    await avvia(() => JSON.stringify(conPerdita), [conRichiestaDiPrima()])
    await scrivi('correggi la barra delle chat: non mostra il numero giusto delle chat aperte')
    await attendi(risposto)
    const v = await vista()
    expect(v.richieste.map((r) => r.id)).toEqual(['r-1', 'r-2', 'r-3'])
    expect(v.richieste.find((r) => r.id === 'r-3')!.candidati).toEqual(['r-1'])
    expect(v.richieste.find((r) => r.id === 'r-1')!.punti).toHaveLength(1)
    expect(archivio.leggi('ap-coda')!.dialogo.at(-1)!.esito).toContain('unione rifiutata: si perderebbero i punti p-1')
  })

  it('senza risposta del supervisore la richiesta entra lo stesso, separata, con le candidate', async () => {
    zitto()
    await avvia(() => 'niente JSON qui', [conRichiestaDiPrima()])
    await scrivi('correggi la barra delle chat: non mostra il numero giusto delle chat aperte')
    await attendi(risposto)
    const r3 = (await vista()).richieste.find((r) => r.id === 'r-3')!
    expect(r3.candidati).toEqual(['r-1'])
    expect(r3.originali[0]!.testo).toBe('correggi la barra delle chat: non mostra il numero giusto delle chat aperte')
  })

  it('POST /coda/unisci a mano: rifiutata se manca un punto, fatta se li nomina tutti', async () => {
    zitto()
    await avvia(() => '{}', [conRichiestaDiPrima()])
    const male = await posta('/coda/unisci', { ws: 'Lavoro', ids: ['r-1', 'r-2'], testo: 'insieme', punti: [{ id: 'p-1' }], perche: 'prova' })
    expect(male.status).toBe(400)
    expect(((await male.json()) as { errore: string }).errore).toBe('unione rifiutata: si perderebbero i punti p-2')
    expect((await vista()).richieste).toHaveLength(2)
    const bene = await posta('/coda/unisci', { ws: 'Lavoro', ids: ['r-1', 'r-2'], testo: 'insieme', punti: [{ id: 'p-1' }, { id: 'p-2', superato: 'non serve più' }], perche: 'prova' })
    expect(bene.status).toBe(200)
    const v = (await bene.json()) as VistaCoda
    expect(v.richieste.map((r) => r.id)).toEqual(['r-1'])
    expect(v.richieste[0]!.punti[1]).toMatchObject({ id: 'p-2', stato: 'superato', perche: 'non serve più' })
    expect((await posta('/coda/unisci', { ws: 'Lavoro', ids: ['r-1'] })).status).toBe(400)
    expect((await posta('/coda/separa', { id: 'r-1' })).status).toBe(400)
  })
})
