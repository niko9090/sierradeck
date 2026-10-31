import { describe, it, expect } from 'vitest'
import { creaPostino, nomeBattitoPc, DISMETTI_DOPO_MS, type BattitoPc, type Scatola } from '../../src/main/progetti/posta'
import { componiSalute, type IngressiSalute } from '@shared/salute'

/**
 * «Dismetti questo PC» (0.89.1). Nicholas (31/10): «NB-PROBOOK dismesso». Un PC
 * muto da più di una settimana esce dall'elenco di tutti i PC: il suo battito
 * si toglie dal Drive. Se si riaccende, il battito nuovo lo riporta.
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

const ORA = Date.parse('2026-10-31T23:00:00.000Z')
const battito = (pcId: string, nome: string, quando: string): BattitoPc => ({ pcId, nome, versione: '0.79.0', battito: quando, cartelle: [], chat: [] })

function postinoCon(scatola: Scatola, righe: string[] = []): ReturnType<typeof creaPostino> {
  return creaPostino({
    scatola: () => scatola, pcId: () => 'F', pcNome: () => 'Fisso', versione: () => '0.89.1',
    chat: () => [], cartelle: () => [], cartellaEsiste: () => true,
    apriChat: () => undefined, riprendiChat: () => undefined, scrivi: () => undefined,
    adesso: () => ORA, log: (r: string) => { righe.push(r) }
  } as Parameters<typeof creaPostino>[0])
}

describe('dismettere un PC (0.89.1)', () => {
  it('un PC muto da più di una settimana: il battito va via dal Drive e dall’elenco', async () => {
    const s = scatolaInMemoria()
    await s.scrivi(nomeBattitoPc('NB'), battito('NB', 'Portatile vecchio', new Date(ORA - DISMETTI_DOPO_MS - 60_000).toISOString()))
    await s.scrivi(nomeBattitoPc('L'), battito('L', 'Laptop', new Date(ORA - 60_000).toISOString()))
    const righe: string[] = []
    const p = postinoCon(s, righe)
    expect((await p.pc()).map((b) => b.pcId).sort()).toEqual(['L', 'NB'])
    expect(await p.dismetti!('NB')).toEqual({ ok: true })
    expect(s.dati.has(nomeBattitoPc('NB'))).toBe(false)
    expect(p.altrui().map((b) => b.pcId)).toEqual(['L'])
    expect(righe.some((r) => r.includes('Portatile vecchio dismesso'))).toBe(true)
  })

  it('un PC che si è fatto vivo da poco, o questo PC: non si dismette', async () => {
    const s = scatolaInMemoria()
    await s.scrivi(nomeBattitoPc('L'), battito('L', 'Laptop', new Date(ORA - 2 * 24 * 60 * 60_000).toISOString()))
    const p = postinoCon(s)
    const e = await p.dismetti!('L')
    expect(e.ok).toBe(false)
    expect(e.motivo).toContain('meno di una settimana')
    expect(s.dati.has(nomeBattitoPc('L'))).toBe(true)
    expect((await p.dismetti!('F')).ok).toBe(false)
  })

  it('la Salute offre «Dismetti» solo per un PC che non risponde e tace da più di una settimana', () => {
    const base = {
      io: { id: 'F', nome: 'Fisso' }, adesso: ORA, versione: '0.89.1',
      drive: { configurato: true, connesso: true }, errori: [], consegne: [], chatInErrore: [], oreErrori: 6
    } as unknown as IngressiSalute
    const pc = (pcId: string, giorni: number, stato: string) => ({ pcId, nome: pcId, versione: '0.79.0', battito: new Date(ORA - giorni * 24 * 60 * 60_000).toISOString(), stato })
    const s = componiSalute({ ...base, pc: [pc('NB', 11, 'spento'), pc('D', 2, 'spento'), pc('L', 11, 'acceso')] } as unknown as IngressiSalute)
    const azioni = (k: string): string[] => s.voci.find((v) => v.chiave === `pc:${k}`)!.azioni.map((a) => a.id)
    expect(azioni('NB')).toEqual(['riprova-pc', 'dismetti-pc'])
    expect(azioni('D')).toEqual(['riprova-pc'])
    expect(azioni('L')).not.toContain('dismetti-pc')
  })
})
