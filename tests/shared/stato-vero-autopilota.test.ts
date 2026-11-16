import { describe, it, expect } from 'vitest'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import { vistaAutopilota } from '@shared/autopiloti-vista'
import { fraseStatoOrchestratore } from '@shared/piano-orchestratore'

/** k-s7: le viste non devono dire «finito» o «al lavoro» quando non è vero. */
const ORA = Date.parse('2026-11-16T10:00:00Z')
function ap(over: Record<string, unknown> = {}): Autopilota & { adesso?: { testo: string; tono: string }; vistaErrore?: boolean } {
  return {
    ...nuovoAutopilota({ id: 'ap-1', nome: 'Prova', obiettivo: 'Prova', cwd: 'C:/prova', iniziatoIl: '2026-11-16T09:00:00.000Z' }),
    stato: 'lavoro',
    ultimoEvento: '2026-11-16T09:59:00.000Z',
    ...over
  } as Autopilota
}

describe('lo stato vero dell’autopilota', () => {
  it('«In attesa: unioni in fila» non è finito: resta nel gruppo del lavoro', () => {
    const adesso = { testo: 'In attesa: 1 unione in fila, ripartono da sole', tono: 'riposo' }
    const v = vistaAutopilota(ap({ adesso }), ORA)
    expect(v.stato.id).not.toBe('finito')
    expect(v.gruppi).not.toContain('finiti')
    const col = fraseStatoOrchestratore({ pensa: false, specialisti: [], piano: { totale: 1, uniti: 0 }, inCorso: { inFila: 1 } } as never)
    expect(col.tono).toBe('attesa')
    const v2 = vistaAutopilota(ap({ adesso: col }), ORA)
    expect(v2.stato).toMatchObject({ id: 'in-attesa', colore: 'blu' })
    expect(v2.gruppi).toEqual(['lavoro'])
    expect(v2.azione).toBe('ferma')
  })

  it('un riposo vero (niente da fare) resta «a riposo»', () => {
    expect(vistaAutopilota(ap({ adesso: { testo: 'Niente da fare: tutte le richieste sono chiuse', tono: 'riposo' } }), ORA).stato.id).toBe('finito')
  })

  it('con la lettura fallita non dice «al lavoro»; senza adesso e senza errore (servizio vecchio) sì', () => {
    const rotta = vistaAutopilota(ap({ vistaErrore: true }), ORA)
    expect(rotta.stato.id).not.toBe('al-lavoro')
    expect(rotta.stato).toMatchObject({ id: 'illeggibile', colore: 'ambra' })
    expect(rotta.gruppi).not.toContain('lavoro')
    expect(vistaAutopilota(ap(), ORA).stato.id).toBe('al-lavoro')
  })
})
