import { describe, it, expect } from 'vitest'
import { creaOrchestratore, type AvviaProcesso, type ProcessoClaude } from '../../src/autopilot-host/orchestratore'
import { impostazioniPredefinite, type ImpostazioniOrchestratore } from '../../src/autopilot-host/orchestratore-store'
import { leggiStatoProgramma } from '../../src/autopilot-host/stato-programma'
import { leggiCampoPosti, leggiPostiScelti, passoPosti, postiDalPc, prossimiPosti, avvisoCarico, origineCorta, type PostiChat } from '../../src/shared/posti-chat'
import { normalizzaPreferenze } from '../../src/shared/preferenze'

/** k-57: il numero massimo di chat scelto da Nicholas, fino al processo dell'autopilota. */
const PC = { processori: 8, memoriaLiberaMb: 20000, memoriaTotaleMb: 32000, caricoPercento: 10 }

describe('numero scelto: calcolo dei posti', () => {
  it('vince sul carico: 3 restano 3 anche con il PC sotto sforzo', () => {
    expect(postiDalPc({ ...PC, caricoPercento: 95 }, 0, 0, 3)).toEqual({ posti: 3, perche: 'scelto' })
    expect(postiDalPc({ ...PC, caricoPercento: 95 }, 0, 0).perche).toBe('carico')
  })
  it('sale subito, senza la salita lenta', () => {
    const prima = prossimiPosti(undefined, postiDalPc(PC, 0, 0), 0)
    const dopo = prossimiPosti(undefined, postiDalPc(PC, 0, 0, 6), 1)
    expect(prima.posti).toBe(4)
    expect(dopo.posti).toBe(6)
  })
  it('valori fuori limite = automatico', () => {
    for (const v of [0, 9, 2.5, -1, '3', null, undefined, NaN]) expect(leggiPostiScelti(v)).toBeUndefined()
    expect(leggiPostiScelti(1)).toBe(1)
    expect(leggiPostiScelti(8)).toBe(8)
    expect(postiDalPc(PC, 0, 0, 99).perche).not.toBe('scelto')
  })
  it('campo e tasti', () => {
    expect(leggiCampoPosti(' 5 ')).toBe(5)
    for (const t of ['', 'a', '0', '9', '3.5', '-2', '123']) expect(leggiCampoPosti(t)).toBeUndefined()
    expect(passoPosti(8, 1)).toBe(8)
    expect(passoPosti(1, -1)).toBe(1)
    expect(passoPosti(3, 1)).toBe(4)
  })
  it('origine e avviso: solo se scelto e il PC è carico', () => {
    const base: PostiChat = { attive: 1, posti: 6, inFila: 0, regolazione: 0, perche: 'scelto', risale: false, misura: { ...PC, caricoPercento: 90 } }
    expect(avvisoCarico(base)).toBeUndefined()
    expect(avvisoCarico({ ...base, scelti: 6 })).toContain('carico')
    expect(avvisoCarico({ ...base, scelti: 6, misura: PC })).toBeUndefined()
    expect(origineCorta({ ...base, scelti: 6 })).toBe('Scelto da te')
    expect(origineCorta(base)).toContain('Automatico')
  })
})

describe('numero scelto: preferenze e stato del programma', () => {
  it('si salva solo se valido', () => {
    expect(normalizzaPreferenze({ postiScelti: 5 }).postiScelti).toBe(5)
    expect(normalizzaPreferenze({ postiScelti: 0 }).postiScelti).toBeUndefined()
    expect(normalizzaPreferenze({ postiScelti: 40 }).postiScelti).toBeUndefined()
    expect(normalizzaPreferenze({}).postiScelti).toBeUndefined()
  })
  it('il servizio lo legge dallo stato spinto dal programma', () => {
    expect(leggiStatoProgramma({ postiScelti: 3 }, 0)?.postiScelti).toBe(3)
    expect(leggiStatoProgramma({ postiScelti: 'tre' }, 0)?.postiScelti).toBeUndefined()
  })
})

describe('numero scelto: la variabile passata allo spawn', () => {
  type P = ProcessoClaude & { env: Record<string, string>; ucciso: boolean; emetti: (o: unknown) => void }
  function motore(): { o: ReturnType<typeof creaOrchestratore>; processi: P[]; cambia: (v: number | undefined) => void } {
    const processi: P[] = []
    let scelti: number | undefined = 6
    const avvia: AvviaProcesso = ({ env }) => {
      const righe: ((r: string) => void)[] = []
      const uscite: ((c: number | null, e: string) => void)[] = []
      const p: P = {
        env, ucciso: false,
        scrivi: () => undefined,
        uccidi: () => { p.ucciso = true; for (const f of uscite) f(null, '') },
        suRiga: (f) => { righe.push(f) },
        suUscita: (f) => { uscite.push(f) },
        emetti: (o) => { for (const f of righe) f(JSON.stringify(o)) }
      }
      processi.push(p)
      return p
    }
    const imp = new Map<string, ImpostazioniOrchestratore>()
    const o = creaOrchestratore({
      avvia,
      impostazioni: (ws) => imp.get(ws) ?? impostazioniPredefinite(),
      cambiaImpostazioni: (ws, f) => { imp.set(ws, f(imp.get(ws) ?? impostazioniPredefinite())) },
      contesto: () => ({ cwd: process.cwd(), riassunto: 'S', indice: '', agenti: 'a', impostazioniCli: 'c', mcpConfig: 'm', tetto: 3, ...(scelti !== undefined ? { scelti } : {}) }),
      ultime: () => [],
      risposta: () => undefined,
      errore: () => undefined,
      nuovaSessione: () => 'sess-1',
      ambiente: (t) => ({ CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: String(t) }),
      raccoltaMs: 30_000,
      inattivoMs: 10 * 60_000
    })
    return { o, processi, cambia: (v) => { scelti = v } }
  }
  const finito = { type: 'result', result: 'ok', total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 1000, output_tokens: 10 } }

  it('il limite dei subagenti è il numero scelto', () => {
    const { o, processi } = motore()
    o.messaggio('ws', { quando: '2026-10-30T09:00:00.000Z', testo: 'ciao' })
    expect(processi[0]!.env.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS).toBe('6')
  })

  it('se cambia, il processo riparte solo a turno finito, col valore nuovo', () => {
    const { o, processi, cambia } = motore()
    o.messaggio('ws', { quando: '2026-10-30T09:00:00.000Z', testo: 'uno' })
    cambia(3)
    // A metà turno non si tocca.
    o.messaggio('ws', { quando: '2026-10-30T09:00:10.000Z', testo: 'due' })
    expect(processi).toHaveLength(1)
    expect(processi[0]!.ucciso).toBe(false)
    processi[0]!.emetti(finito)
    // Il turno è finito e c'era un messaggio in attesa: riparte col limite nuovo.
    expect(processi[0]!.ucciso).toBe(true)
    expect(processi).toHaveLength(2)
    expect(processi[1]!.env.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS).toBe('3')
  })
})
