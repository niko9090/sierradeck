import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaPostino } from '../../src/main/progetti/posta'
import type { Scatola } from '../../src/main/progetti/presenza'
import { ESITO_PROTETTA, nomePosta, type ChatDiPc, type Posta, type VocePosta } from '@shared/posta'
import { rotteClient, type DipendenzeRotte } from '../../src/main/client-rotte'
import { apriDispositivi } from '../../src/main/dispositivi'

/**
 * 0.49.1: l'input di una persona verso una chat protetta passa sempre dal
 * PIN — anche quando arriva dalla cassetta sul Drive o dalle Domande. Le
 * istruzioni degli autopiloti restano libere.
 */
function scatola(): Scatola & { dati: Map<string, unknown> } {
  const dati = new Map<string, unknown>()
  return {
    dati,
    leggi: <T,>(n: string) => Promise.resolve(dati.get(n) as T | undefined),
    scrivi: (n, o) => { dati.set(n, JSON.parse(JSON.stringify(o))); return Promise.resolve() },
    cancella: (n) => { dati.delete(n); return Promise.resolve() },
    elenca: (p) => Promise.resolve([...dati.keys()].filter((k) => k.startsWith(p)))
  }
}
const CWD = 'C:\\clienti'
const CHAT: ChatDiPc[] = [{ id: 'p-1', sessione: 's-clienti', titolo: 'Clienti', cwd: CWD, viva: true, aspetta: true }]

/** Il PC di casa della chat («lap»), con la chat protetta e chiusa per tutti tranne chi è in `aperti`. */
function portatile(s: Scatola, aperti: string[] = []): { giro: () => Promise<void>; scritti: string[]; chiesti: { visore: string; origine?: string }[] } {
  const scritti: string[] = []
  const chiesti: { visore: string; origine?: string }[] = []
  const p = creaPostino({
    scatola: () => s, pcId: () => 'lap', pcNome: () => 'LAPTOP', versione: () => '0.49.1',
    chat: () => CHAT, cartelle: () => [CWD], cartellaEsiste: () => true,
    apriChat: () => {}, riprendiChat: () => {},
    scrivi: (_id, t) => { scritti.push(t) },
    chiusaPer: (_c, v: VocePosta) => {
      const visore = `pc:${v.daVisore ?? v.daPc}`
      chiesti.push({ visore, ...(v.origine !== undefined ? { origine: v.origine } : {}) })
      return !aperti.includes(visore)
    }
  })
  return { giro: () => p.giro(), scritti, chiesti }
}
/** Il fisso («fisso») che scrive nella cassetta del portatile. */
function fisso(s: Scatola): ReturnType<typeof creaPostino> {
  return creaPostino({
    scatola: () => s, pcId: () => 'fisso', pcNome: () => 'FISSO', versione: () => '0.49.1',
    chat: () => [], cartelle: () => [], cartellaEsiste: () => false, apriChat: () => {}, riprendiChat: () => {}, scrivi: () => {}
  })
}
const posta = (s: Scatola & { dati: Map<string, unknown> }): VocePosta[] => (s.dati.get(nomePosta('lap')) as Posta).voci

describe('la cassetta sul Drive e il PIN', () => {
  it('una persona che scrive a una chat protetta e chiusa per lei: non consegnato, con il motivo', async () => {
    const s = scatola()
    await fisso(s).aggiungi('lap', { cwd: CWD, testo: 'manda la fattura a Rossi', sessione: 's-clienti' })
    const lap = portatile(s)
    await lap.giro()
    expect(lap.scritti).toEqual([])
    expect(posta(s)[0]).toMatchObject({ stato: 'fallita', esito: ESITO_PROTETTA, origine: 'umano', daVisore: 'fisso' })
    expect(ESITO_PROTETTA.startsWith('Chat protetta: inserisci il PIN')).toBe(true)
    expect(lap.chiesti[0]?.visore).toBe('pc:fisso')
  })
  it('dal telefono che passa dal fisso: chi guarda è il telefono; se lui l’ha aperta col PIN, arriva', async () => {
    const s = scatola()
    await fisso(s).aggiungi('lap', { cwd: CWD, testo: 'continua', sessione: 's-clienti', daVisore: 'tel:t1@fisso' })
    const lap = portatile(s, ['pc:tel:t1@fisso'])
    await lap.giro()
    expect(lap.scritti).toEqual(['continua'])
    expect(posta(s)[0]?.stato).toBe('consegnata')
  })
  it('un autopilota: libero, come le sue consegne', async () => {
    const s = scatola()
    await fisso(s).aggiungi('lap', { cwd: CWD, testo: 'esegui i test', sessione: 's-clienti', origine: 'autopilota' })
    const lap = portatile(s)
    await lap.giro()
    expect(lap.scritti).toEqual(['esegui i test'])
  })
  it('una voce di prima, senza etichetta, vale come scritta da una persona', async () => {
    const s = scatola()
    s.dati.set(nomePosta('lap'), { voci: [{ id: 'v1', testo: 'vecchia', cwd: CWD, sessione: 's-clienti', creataIl: new Date().toISOString(), daPc: 'fisso', daNome: 'FISSO', stato: 'attesa' }] })
    const lap = portatile(s)
    await lap.giro()
    expect(lap.scritti).toEqual([])
    expect(posta(s)[0]?.stato).toBe('fallita')
  })
})

describe('le Domande e la posta dal telefono', () => {
  const base = (over: Partial<DipendenzeRotte>): ReturnType<typeof rotteClient> => rotteClient({
    dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-pin-um-'))),
    chat: () => [], pcIo: () => 'fisso', ...over
  } as unknown as DipendenzeRotte)
  it('scrivere dalle Domande a una chat protetta di un altro PC: 423 «Chat protetta: inserisci il PIN»', async () => {
    const r = base({ scriviAltroPc: async () => ({ ok: false, messaggio: 'Chat protetta: inserisci il PIN. «Clienti» è protetta dal PIN', pin: true }) as never })
    const e = await r({ metodo: 'POST', percorso: '/api/scrivi', corpo: { chat: 'pc:lap:s-clienti', testo: 'ciao' }, dispositivo: 'locale' })
    expect(e.stato).toBe(423)
    expect(JSON.stringify(e.corpo)).toContain('Chat protetta: inserisci il PIN')
  })
  it('e il PIN lo controlla quel PC, chiesto da lì', async () => {
    const chiesti: string[] = []
    const r = base({ pinAltroPc: async (pc: string, sess: string, pin: string) => { chiesti.push(`${pc}/${sess}/${pin}`); return { ok: true } } })
    const e = await r({ metodo: 'POST', percorso: '/api/pin/sblocca', corpo: { chat: 'pc:lap:s-clienti', pin: '4821' }, dispositivo: 'locale' })
    expect(e.stato).toBe(200)
    expect(chiesti).toEqual(['lap/s-clienti/4821'])
  })
  it('la posta scritta dal telefono porta chi la scrive (il telefono) e l’etichetta «umano»', async () => {
    const voci: unknown[] = []
    const r = base({ postaAggiungi: async (_pc: string, v: unknown) => { voci.push(v); return { voci: [] } } })
    await r({ metodo: 'POST', percorso: '/api/posta/aggiungi', corpo: { pc: 'lap', cwd: CWD, testo: 'ciao' }, dispositivo: 't1' })
    expect(voci[0]).toMatchObject({ origine: 'umano', daVisore: 'tel:t1@fisso' })
  })
})
