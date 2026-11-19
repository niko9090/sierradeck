import { describe, it, expect } from 'vitest'
import { creaPostino, nomeBattitoPc, nomePosta, nomeUscita, nomeEsiti, type BattitoPc, type Scatola } from '../../src/main/progetti/posta'
import { RIMUOVI_DOPO_MS } from '../../src/shared/stato-pc'

/**
 * Rimozione automatica: un PC che tace da più di 30 giorni esce dalla lista, e
 * si cancella la sua registrazione sul Drive. Mai i progetti.
 */
function scatolaInMemoria(): Scatola & { dati: Map<string, unknown> } {
  const dati = new Map<string, unknown>()
  return {
    dati,
    leggi: <T,>(nome: string) => Promise.resolve(dati.get(nome) as T | undefined),
    scrivi: (nome: string, oggetto: unknown) => { dati.set(nome, JSON.parse(JSON.stringify(oggetto))); return Promise.resolve() },
    cancella: (nome: string) => { dati.delete(nome); return Promise.resolve() },
    elenca: (prefisso: string) => Promise.resolve([...dati.keys()].filter((k) => k.startsWith(prefisso)))
  }
}

const ORA = Date.parse('2026-11-19T12:00:00.000Z')
const GIORNO = 24 * 60 * 60_000
const fa = (ms: number): string => new Date(ORA - ms).toISOString()
const battito = (pcId: string, nome: string, quando: string): BattitoPc => ({ pcId, nome, versione: '0.109.0', battito: quando, cartelle: [], chat: [] })
const voce = (id: string, extra: object = {}): object => ({ id, testo: 't', cwd: '/x', creataIl: fa(1000), daPc: 'F', daNome: 'Fisso', stato: 'attesa', ...extra })

function postinoCon(scatola: Scatola, righe: string[], dimenticati: string[] = []): ReturnType<typeof creaPostino> {
  return creaPostino({
    scatola: () => scatola, pcId: () => 'F', pcNome: () => 'Fisso', versione: () => '0.109.0',
    chat: () => [], cartelle: () => [], cartellaEsiste: () => true,
    apriChat: () => undefined, riprendiChat: () => undefined, scrivi: () => undefined,
    adesso: () => ORA, log: (r: string) => { righe.push(r) },
    dimenticaPc: (id: string) => { dimenticati.push(id) }
  } as Parameters<typeof creaPostino>[0])
}

describe('rimozione automatica dopo 30 giorni', () => {
  it('toglie a 30 giorni + 1, non a 29; progetti-drive.json resta', async () => {
    const s = scatolaInMemoria()
    await s.scrivi(nomeBattitoPc('VECCHIO'), battito('VECCHIO', 'Portatile vecchio', fa(RIMUOVI_DOPO_MS + 60_000)))
    await s.scrivi(nomeBattitoPc('QUASI'), battito('QUASI', 'Portatile quasi', fa(29 * GIORNO)))
    await s.scrivi('progetti-drive.json', { progetti: [{ id: 'p1' }] })
    const righe: string[] = []
    const dimenticati: string[] = []
    const p = postinoCon(s, righe, dimenticati)
    await p.giro()
    expect(s.dati.has(nomeBattitoPc('VECCHIO'))).toBe(false)
    expect(s.dati.has(nomeBattitoPc('QUASI'))).toBe(true)
    expect(p.altrui().map((b) => b.pcId)).toEqual(['QUASI'])
    expect(dimenticati).toEqual(['VECCHIO'])
    expect(s.dati.get('progetti-drive.json')).toEqual({ progetti: [{ id: 'p1' }] })
    expect(righe.filter((r) => r.includes('Portatile vecchio tolto dalla lista'))).toHaveLength(1)
  })

  it('non tocca sé stesso, anche se il suo vecchio battito è di mesi fa', async () => {
    const s = scatolaInMemoria()
    await s.scrivi(nomeBattitoPc('F'), battito('F', 'Fisso', fa(90 * GIORNO)))
    const dimenticati: string[] = []
    const p = postinoCon(s, [], dimenticati)
    await p.giro()
    expect(p.altrui()).toEqual([])
    expect(dimenticati).toEqual([])
    expect(s.dati.has(nomeBattitoPc('F'))).toBe(true)
  })

  it('un battito nel futuro non toglie nessuno', async () => {
    const s = scatolaInMemoria()
    await s.scrivi(nomeBattitoPc('FUTURO'), battito('FUTURO', 'Orologio storto', new Date(ORA + 60 * GIORNO).toISOString()))
    const p = postinoCon(s, [])
    await p.giro()
    expect(s.dati.has(nomeBattitoPc('FUTURO'))).toBe(true)
  })

  it('cancella le cassette senza comandi in coda, tiene quelle con comandi in coda', async () => {
    const s = scatolaInMemoria()
    await s.scrivi(nomeBattitoPc('V1'), battito('V1', 'Uno', fa(40 * GIORNO)))
    await s.scrivi(nomeBattitoPc('V2'), battito('V2', 'Due', fa(40 * GIORNO)))
    // V1: solo messaggi normali e gli esiti → via
    await s.scrivi(nomeUscita('V1', 'F'), { voci: [voce('a')] })
    await s.scrivi(nomePosta('V1'), { voci: [voce('b')] })
    await s.scrivi(nomeEsiti('V1'), { esiti: {} })
    // V2: un comando ancora in attesa → la cassetta resta, con i suoi esiti
    await s.scrivi(nomeUscita('V2', 'F'), { voci: [voce('c', { comando: { tipo: 'errori' } })] })
    // un comando già eseguito (lo dicono gli esiti) non conta
    await s.scrivi(nomePosta('V2'), { voci: [voce('d', { comando: { tipo: 'errori' } })] })
    await s.scrivi(nomeEsiti('V2'), { esiti: { d: { stato: 'consegnata', il: fa(1000) } } })
    // la cassetta di un PC vivo: intatta
    await s.scrivi(nomeUscita('VIVO', 'F'), { voci: [voce('e')] })
    const righe: string[] = []
    const p = postinoCon(s, righe)
    await p.giro()
    expect(s.dati.has(nomeUscita('V1', 'F'))).toBe(false)
    expect(s.dati.has(nomePosta('V1'))).toBe(false)
    expect(s.dati.has(nomeEsiti('V1'))).toBe(false)
    expect(s.dati.has(nomeBattitoPc('V1'))).toBe(false)
    expect(s.dati.has(nomeBattitoPc('V2'))).toBe(false)
    expect(s.dati.has(nomeUscita('V2', 'F'))).toBe(true)
    expect(s.dati.has(nomeEsiti('V2'))).toBe(true)
    expect(s.dati.has(nomePosta('V2'))).toBe(false)
    expect(s.dati.has(nomeUscita('VIVO', 'F'))).toBe(true)
    expect(righe.some((r) => r.includes('Due tolto dalla lista') && r.includes('comandi in coda'))).toBe(true)
  })

  it('è idempotente: un secondo giro non cancella né racconta di nuovo', async () => {
    const s = scatolaInMemoria()
    await s.scrivi(nomeBattitoPc('V1'), battito('V1', 'Uno', fa(40 * GIORNO)))
    const righe: string[] = []
    const p = postinoCon(s, righe)
    await p.giro()
    await p.pc()
    await p.giro()
    expect(righe.filter((r) => r.includes('Uno tolto dalla lista'))).toHaveLength(1)
  })

  it('se si riaccende, ricompare da solo', async () => {
    const s = scatolaInMemoria()
    await s.scrivi(nomeBattitoPc('V1'), battito('V1', 'Uno', fa(40 * GIORNO)))
    const p = postinoCon(s, [])
    await p.giro()
    expect(s.dati.has(nomeBattitoPc('V1'))).toBe(false)
    await s.scrivi(nomeBattitoPc('V1'), battito('V1', 'Uno', fa(1000)))
    expect((await p.pc()).map((b) => b.pcId)).toEqual(['V1'])
  })
})
