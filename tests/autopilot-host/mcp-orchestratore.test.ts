import { describe, it, expect } from 'vitest'
import { aggiungi, codaVuota, type Coda, type Modifica } from '@shared/coda-richieste'
import { pianoVuoto, type Piano } from '@shared/piano-orchestratore'
import type { Specialista } from '@shared/flusso-orchestratore'
import {
  chiamaStrumento, creaGettoniOrchestratore, configMcpOrchestratore, rispondiMcpOrchestratore, DOMANDE_ORA_ORCHESTRATORE, STRUMENTI_ORCHESTRATORE,
  type AmbienteOrchestratore
} from '../../src/autopilot-host/mcp-orchestratore'

/**
 * P3: gli strumenti dell'orchestratore. Il programma valida ogni chiamata: la
 * coda non perde punti, il piano non fa cicli, l'unione passa dal cancello,
 * le domande hanno un tetto, il permesso torna come risposta per la CLI.
 */

const ADESSO = '2026-10-30T09:00:00.000Z'

function ambiente(over: Partial<AmbienteOrchestratore> = {}): AmbienteOrchestratore & { stato: { coda: Coda; piano: Piano; unioni: unknown[]; domande: string[] } } {
  let coda = codaVuota('Lavoro')
  coda = aggiungi(coda, { testo: 'la barra delle chat non mostra il numero', quando: ADESSO }).coda
  coda = aggiungi(coda, { testo: 'nella barra delle chat voglio il numero e il colore', quando: ADESSO }).coda
  const stato = { coda, piano: pianoVuoto(), unioni: [] as unknown[], domande: [] as string[] }
  const specialisti: Specialista[] = [{ id: 'tu-1', task: 't-1', ruolo: 'sviluppatore', descrizione: 'k1: barra', compito: 'k1', stato: 'finito', inizio: ADESSO }]
  const amb: AmbienteOrchestratore = {
    adesso: () => ADESSO,
    coda: () => stato.coda,
    cambiaCoda: (_ws, f) => { const m: Modifica | undefined = f(stato.coda); if (m !== undefined) stato.coda = m.coda; return stato.coda },
    piano: () => stato.piano,
    scriviPiano: (_ws, p) => { stato.piano = p },
    unico: () => undefined,
    specialisti: () => specialisti,
    unisci: (_ws, p) => { stato.unioni.push(p); return { ok: true, testo: 'avviata' } },
    permesso: (_ws, strumento) => Promise.resolve(strumento === 'WebFetch' ? { consenti: true } : { consenti: false, motivo: 'no' }),
    chiedi: (_ws, d) => { stato.domande.push(d); return { ok: true, testo: 'aperta' } },
    domandeUltimaOra: () => stato.domande.length,
    annota: () => ({ ok: true, testo: 'annotata' }),
    ricalcola: () => {},
    riassunto: () => 'STATO',
    ...over
  }
  return Object.assign(amb, { stato })
}

describe('strumenti dell’orchestratore', () => {
  it('non ci sono più gli strumenti per aprire, scrivere e chiudere le chat: gli specialisti sono subagenti', () => {
    const nomi = STRUMENTI_ORCHESTRATORE.map((s) => s.name)
    expect(nomi).toEqual(expect.arrayContaining(['stato', 'coda_unisci', 'piano_scrivi', 'unisci', 'chiedi_utente', 'quaderno_annota', 'permesso']))
    expect(nomi.some((n) => n.startsWith('specialista_'))).toBe(false)
  })

  it('coda_unisci rifiuta un’unione che perde un punto, e accetta quella che li nomina tutti', async () => {
    const a = ambiente()
    const persa = await chiamaStrumento(a, 'Lavoro', 'coda_unisci', { ids: ['r-1', 'r-2'], testo: 'la barra con numero e colore', punti: [{ id: 'p-1' }], perche: 'stessa barra' })
    expect(persa?.errore).toBe(true)
    expect(a.stato.coda.richieste.filter((r) => r.stato !== 'fatta')).toHaveLength(2)
    const buona = await chiamaStrumento(a, 'Lavoro', 'coda_unisci', { ids: ['r-1', 'r-2'], testo: 'la barra con numero e colore', punti: [{ id: 'p-1' }, { id: 'p-2' }], perche: 'stessa barra' })
    expect(buona?.errore).toBe(false)
  })

  it('piano_scrivi rifiuta un ciclo e registra un piano buono', async () => {
    const a = ambiente()
    const ciclo = await chiamaStrumento(a, 'Lavoro', 'piano_scrivi', { compiti: [
      { id: 'k1', richiesta: 'r-1', titolo: 'a', criterio: 'x', dopo: ['k2'] },
      { id: 'k2', richiesta: 'r-1', titolo: 'b', criterio: 'x', dopo: ['k1'] }
    ] })
    expect(ciclo?.errore).toBe(true)
    expect(ciclo?.testo).toMatch(/ciclo/)
    expect(a.stato.piano.compiti).toHaveLength(0)
    const ok = await chiamaStrumento(a, 'Lavoro', 'piano_scrivi', { compiti: [{ id: 'k1', richiesta: 'r-1', titolo: 'a', criterio: 'passa `npm test`' }] })
    expect(ok?.errore).toBe(false)
    expect(a.stato.piano.compiti.map((c) => c.id)).toEqual(['k1'])
  })

  it('unisci vuole un compito del piano, uno specialista noto o un ramo valido', async () => {
    const a = ambiente()
    await chiamaStrumento(a, 'Lavoro', 'piano_scrivi', { compiti: [{ id: 'k1', richiesta: 'r-1', titolo: 'a', criterio: 'x' }] })
    expect((await chiamaStrumento(a, 'Lavoro', 'unisci', {}))?.errore).toBe(true)
    expect((await chiamaStrumento(a, 'Lavoro', 'unisci', { compito: 'k9' }))?.errore).toBe(true)
    expect((await chiamaStrumento(a, 'Lavoro', 'unisci', { specialista: 'tu-7' }))?.errore).toBe(true)
    expect((await chiamaStrumento(a, 'Lavoro', 'unisci', { ramo: '--force' }))?.errore).toBe(true)
    expect((await chiamaStrumento(a, 'Lavoro', 'unisci', { ramo: 'a/../b' }))?.errore).toBe(true)
    expect((await chiamaStrumento(a, 'Lavoro', 'unisci', { compito: 'k1' }))?.errore).toBe(false)
    expect((await chiamaStrumento(a, 'Lavoro', 'unisci', { specialista: 't-1' }))?.errore).toBe(false)
    expect(a.stato.unioni).toEqual([{ compito: 'k1' }, { specialista: 't-1' }])
  })

  it('chiedi_utente: da 2 a 4 scelte (o nessuna), e un tetto all’ora', async () => {
    const a = ambiente()
    expect((await chiamaStrumento(a, 'Lavoro', 'chiedi_utente', { domanda: 'quale colore?', scelte: ['blu'] }))?.errore).toBe(true)
    for (let i = 0; i < DOMANDE_ORA_ORCHESTRATORE; i += 1) {
      expect((await chiamaStrumento(a, 'Lavoro', 'chiedi_utente', { domanda: `domanda ${i}?`, scelte: ['sì', 'no'] }))?.errore).toBe(false)
    }
    const troppe = await chiamaStrumento(a, 'Lavoro', 'chiedi_utente', { domanda: 'ancora una?' })
    expect(troppe?.errore).toBe(true)
    expect(troppe?.testo).toMatch(/ultima ora/)
  })

  it('permesso: la risposta è il JSON che la CLI si aspetta', async () => {
    const a = ambiente()
    const si = await chiamaStrumento(a, 'Lavoro', 'permesso', { tool_name: 'WebFetch', input: { url: 'https://example.com' } })
    expect(JSON.parse(si!.testo)).toEqual({ behavior: 'allow', updatedInput: { url: 'https://example.com' } })
    const no = await chiamaStrumento(a, 'Lavoro', 'permesso', { tool_name: 'Bash', input: { command: 'rm -rf x' } })
    expect(JSON.parse(no!.testo)).toEqual({ behavior: 'deny', message: 'no' })
  })

  it('un gettone vale solo per il suo workspace', async () => {
    const g = creaGettoniOrchestratore()
    const a = ambiente()
    const tok = g.di('Lavoro')
    expect(configMcpOrchestratore(47630, 'Lavoro', tok)).toContain('/mcp/orchestratore?ws=Lavoro')
    const corpo = { jsonrpc: '2.0', id: 1, method: 'tools/list' }
    expect((await rispondiMcpOrchestratore(a, g, '0', { metodo: 'POST', ws: 'Lavoro', autorizzazione: `Bearer ${tok}`, corpo })).stato).toBe(200)
    expect((await rispondiMcpOrchestratore(a, g, '0', { metodo: 'POST', ws: 'Altro', autorizzazione: `Bearer ${tok}`, corpo })).stato).toBe(401)
    expect((await rispondiMcpOrchestratore(a, g, '0', { metodo: 'POST', ws: 'Lavoro', autorizzazione: undefined, corpo })).stato).toBe(401)
  })
})
