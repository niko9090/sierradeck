import { describe, expect, it, vi } from 'vitest'
import { azioneSuPc } from '../../src/autopilot-host/azione-su-pc'
import type { CandidatoPc } from '../../src/autopilot-host/affida-valuta'
import { chiamaStrumento, STRUMENTI_ORCHESTRATORE, type AmbienteOrchestratore } from '../../src/autopilot-host/mcp-orchestratore'
import { rotteAiutante } from '../../src/aiutante/rete'
import { ROTTA_AZIONE } from '../../src/shared/azione-pc'
import type { CapacitaPc } from '../../src/shared/capacita-pc'

const ADESSO = Date.parse('2026-11-20T10:00:00.000Z')
const battito = new Date(ADESSO - 5_000).toISOString()
const cap = (p: Partial<CapacitaPc> = {}): CapacitaPc => ({ programmi: [], telefono: false, aiutante: false, il: new Date(ADESSO).toISOString(), ...p })
const pc = (pcId: string, c: CapacitaPc | undefined, b: string | undefined = battito): CandidatoPc => ({ pcId, nome: `PC ${pcId}`, liberi: 0, battito: b, capacita: c })

describe('azione_su_pc: lo strumento dell’autopilota', () => {
  it('sceglie il PC capace e acceso e restituisce il risultato', async () => {
    const chiedi = vi.fn(async (_pcId: string, _azione: unknown, _opz: unknown) => ({ ok: true as const, valore: { versione: 'git version 2.50.0' } }))
    const d = {
      adesso: () => ADESSO, chiedi,
      candidati: () => [pc('a', cap()), pc('b', cap({ programmi: ['git'] })), pc('c', cap({ programmi: ['git'] }), new Date(ADESSO - 3_600_000).toISOString())]
    }
    const e = await azioneSuPc(d, { tipo: 'versione-programma', programma: 'git' })
    expect(e).toEqual({ ok: true, testo: expect.stringContaining('git version 2.50.0') })
    expect(chiedi).toHaveBeenCalledTimes(1)
    expect(chiedi.mock.calls[0]?.[0]).toBe('b')
  })

  it('passa dallo strumento MCP dell’orchestratore, che lo elenca', async () => {
    expect(STRUMENTI_ORCHESTRATORE.some((s) => s.name === 'azione_su_pc')).toBe(true)
    const amb = { azioneSuPc: (a: unknown) => azioneSuPc({ adesso: () => ADESSO, candidati: () => [pc('b', cap({ programmi: ['node'] }))], chiedi: async () => ({ ok: true, valore: { installato: true } }) }, a) } as unknown as AmbienteOrchestratore
    const r = await chiamaStrumento(amb, 'ws', 'azione_su_pc', { tipo: 'stato-programma', programma: 'node' })
    expect(r).toMatchObject({ errore: false, testo: expect.stringContaining('è installato') })
  })

  it('se nessun PC è capace, il motivo è chiaro e non chiama nessuno', async () => {
    const chiedi = vi.fn(async () => ({ ok: true as const, valore: {} }))
    const d = { adesso: () => ADESSO, chiedi, candidati: () => [pc('a', cap()), pc('b', cap({ programmi: ['git'] }))] }
    const e = await azioneSuPc(d, { tipo: 'manda-file-telefono', percorso: '/tmp/x.zip' })
    expect(e.ok).toBe(false)
    expect(e.ok === false && e.motivo).toMatch(/nessun PC può fare questa azione: nessun altro PC ha telefono/u)
    expect(chiedi).not.toHaveBeenCalled()
    const spenti = await azioneSuPc({ ...d, candidati: () => [pc('a', cap(), 'mai')] }, { tipo: 'raggiungibile', host: 'host-prova', porta: 80 })
    expect(spenti.ok === false && spenti.motivo).toMatch(/spenti o non rispondono/u)
  })

  it('un’azione fuori elenco viene rifiutata, anche dall’orchestratore', async () => {
    const chiedi = vi.fn(async () => ({ ok: true as const, valore: {} }))
    const d = { adesso: () => ADESSO, chiedi, candidati: () => [pc('a', cap({ programmi: ['git'] }))] }
    const e = await azioneSuPc(d, { tipo: 'esegui-comando', comando: 'rm -rf /' })
    expect(e.ok === false && e.motivo).toMatch(/non esiste/u)
    expect(chiedi).not.toHaveBeenCalled()
    const amb = { azioneSuPc: (a: unknown) => azioneSuPc(d, a) } as unknown as AmbienteOrchestratore
    expect(await chiamaStrumento(amb, 'ws', 'azione_su_pc', { tipo: 'shell' })).toMatchObject({ errore: true, testo: expect.stringMatching(/^Rifiutato:/u) })
  })
})

describe('l’Aiutante risponde a /api/azione', () => {
  const rotte = (c: CapacitaPc | undefined) => rotteAiutante({
    aiuto: { modo: () => 'dedicato', servizio: async () => ({}), programma: 'aiutante', nomePc: () => 'Fisso' },
    versione: '1.0.0', identita: () => ({ nome: 'PC Aiutante', host: 'host' }),
    azione: {
      capacita: () => c,
      esecutori: {
        versioneProgramma: async (p) => ({ ok: true, valore: { versione: `${p} 1.0` } }),
        raggiungibile: async () => ({ ok: true, valore: { raggiungibile: true, ms: 3 } })
      }
    }
  })

  it('esegue un’azione con la capacità', async () => {
    const r = await rotte(cap({ programmi: ['git'], aiutante: true }))({ metodo: 'POST', percorso: ROTTA_AZIONE, corpo: { tipo: 'versione-programma', programma: 'git' } })
    expect(r).toEqual({ stato: 200, corpo: { ok: true, valore: { versione: 'git 1.0' } } })
  })

  it('rifiuta senza la capacità, e il file al telefono qui non parte', async () => {
    const r = rotte(cap({ aiutante: true }))
    expect((await r({ metodo: 'POST', percorso: ROTTA_AZIONE, corpo: { tipo: 'versione-programma', programma: 'git' } })).corpo).toMatchObject({ ok: false, motivo: expect.stringContaining('git') })
    expect((await r({ metodo: 'POST', percorso: ROTTA_AZIONE, corpo: { tipo: 'manda-file-telefono', percorso: '/tmp/x.zip' } })).corpo).toMatchObject({ ok: false })
  })

  it('solo POST, e un’azione fuori elenco si rifiuta', async () => {
    const r = rotte(cap())
    expect((await r({ metodo: 'GET', percorso: ROTTA_AZIONE, corpo: undefined })).stato).toBe(405)
    expect((await r({ metodo: 'POST', percorso: ROTTA_AZIONE, corpo: { tipo: 'shell' } })).corpo).toMatchObject({ ok: false })
  })
})
