import { describe, it, expect } from 'vitest'
import { componiPrompt, creaOrchestratore, INATTIVO_MS, type AvviaProcesso, type ProcessoClaude } from '../../src/autopilot-host/orchestratore'
import { impostazioniPredefinite, type ImpostazioniOrchestratore } from '../../src/autopilot-host/orchestratore-store'

/** Token: l'indice del quaderno (fino a 5.000 caratteri) si manda al primo turno di una sessione e quando cambia, non a ogni turno. */

type Finto = ProcessoClaude & { scritte: string[]; emetti: (o: unknown) => void }

function prova(sogliaRotazione?: number): { o: ReturnType<typeof creaOrchestratore>; processi: Finto[]; indice: { v: string } } {
  const processi: Finto[] = []
  const avvia: AvviaProcesso = () => {
    const righe: ((r: string) => void)[] = []
    const uscite: ((c: number | null, e: string) => void)[] = []
    const p: Finto = {
      scritte: [],
      scrivi: (r) => { p.scritte.push(r) },
      uccidi: () => { for (const f of uscite) f(null, '') },
      suRiga: (f) => { righe.push(f) },
      suUscita: (f) => { uscite.push(f) },
      emetti: (o) => { for (const f of righe) f(JSON.stringify(o)) }
    }
    processi.push(p)
    return p
  }
  const imp = new Map<string, ImpostazioniOrchestratore>()
  const indice = { v: '- [test] lezione uno' }
  let n = 0
  const o = creaOrchestratore({
    avvia,
    impostazioni: (ws) => imp.get(ws) ?? impostazioniPredefinite(),
    cambiaImpostazioni: (ws, f) => { imp.set(ws, f(imp.get(ws) ?? impostazioniPredefinite())) },
    contesto: () => ({ cwd: process.cwd(), riassunto: 'STATO', indice: indice.v, agenti: 'a.json', impostazioniCli: 'c.json', mcpConfig: 'm.json', tetto: 3 }),
    ultime: () => [],
    risposta: () => undefined,
    errore: () => undefined,
    nuovaSessione: () => `sess-${++n}`,
    ambiente: () => ({}),
    ...(sogliaRotazione !== undefined ? { sogliaRotazione } : {})
  })
  return { o, processi, indice }
}

const result = (contesto = 1000): unknown => ({ type: 'result', result: 'ok', total_cost_usd: 0.001, session_id: 'x', usage: { input_tokens: contesto, output_tokens: 10 } })
const testo = (r: string): string => (JSON.parse(r) as { message: { content: string } }).message.content
const msg = (t: string): { quando: string; testo: string } => ({ quando: '2026-11-20T09:00:00.000Z', testo: t })

describe('il quaderno nel prompt solo se serve', () => {
  it('componiPrompt: con conIndice falso non c’è il blocco', () => {
    const base = { riassunto: 'S', indice: '- x', messaggi: [], eventi: [] }
    expect(componiPrompt(base)).toContain('<quaderno>')
    expect(componiPrompt({ ...base, conIndice: false })).not.toContain('<quaderno>')
  })

  it('sessione nuova: c’è; secondo turno con lo stesso indice: non c’è; indice cambiato: torna', () => {
    const { o, processi, indice } = prova()
    o.messaggio('ws', msg('uno'))
    expect(testo(processi[0]!.scritte[0]!)).toContain('<quaderno>')
    processi[0]!.emetti(result())
    o.messaggio('ws', msg('due'))
    expect(testo(processi[0]!.scritte[1]!)).not.toContain('<quaderno>')
    processi[0]!.emetti(result())
    indice.v = '- [test] lezione uno\n- [git] lezione due'
    o.messaggio('ws', msg('tre'))
    expect(testo(processi[0]!.scritte[2]!)).toContain('lezione due')
    processi[0]!.emetti(result())
    o.messaggio('ws', msg('quattro'))
    expect(testo(processi[0]!.scritte[3]!)).not.toContain('<quaderno>')
  })

  it('dopo una rotazione (sessione nuova) l’indice si rimanda anche se uguale', () => {
    const { o, processi } = prova(100)
    o.messaggio('ws', msg('uno'))
    processi[0]!.emetti(result(500)) // oltre la soglia: a riposo ruota e spegne il processo
    o.messaggio('ws', msg('due'))
    expect(processi).toHaveLength(2)
    expect(testo(processi[1]!.scritte[0]!)).toContain('<quaderno>')
  })

  it('la quiete prima dello spegnimento resta sotto l’ora di vita della cache', () => {
    expect(INATTIVO_MS).toBeLessThan(60 * 60_000)
    expect(INATTIVO_MS).toBeGreaterThanOrEqual(50 * 60_000)
  })
})
