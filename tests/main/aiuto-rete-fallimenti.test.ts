import { describe, it, expect } from 'vitest'
import { causaDalTesto, motivoDelRisultato, motivoSuPc, pauseAiuti, pcInPausa, PAUSA_ACCESSO_MS, PAUSA_IRRAGGIUNGIBILE_MS } from '../../src/shared/aiuto-esito'
import type { LavoroAffidato } from '../../src/shared/aiuto-rete'
import { chiaveErrore, raggruppa, type ArrivoLetto } from '../../src/main/errori-arrivati-lavoro'

/** k-152: un PC con l'accesso Claude scaduto non riceve più lavoro; il motivo vero arriva; i fallimenti uguali sono un gruppo solo. */

const T0 = Date.parse('2026-11-13T10:00:00.000Z')
const iso = (ms: number): string => new Date(ms).toISOString()
let n = 0
const lavoro = (p: Partial<LavoroAffidato> & { fineMs?: number }): LavoroAffidato => {
  const { fineMs, ...resto } = p
  n++
  return {
    id: `r${n.toString(16).padStart(12, '0')}`, workspace: 'progetto-a', cwd: '/progetti/a', pcId: 'pc-finto', pcNome: 'PC-Finto',
    ruolo: 'sviluppatore', descrizione: `k-${n}: cosa`, compito: `k-${n}`, prompt: 'x', sistema: '', modello: 'sonnet', strumenti: [],
    stato: 'fallito', inizio: iso((fineMs ?? T0) - 20_000), fine: iso(fineMs ?? T0), motivo: 'lo specialista ha chiuso con un errore', ...resto
  }
}

describe('accesso scaduto: il PC esce subito', () => {
  const testo = 'Failed to authenticate: OAuth session expired and could not be refreshed'

  it('riconosce il testo vero della CLI come accesso', () => {
    expect(causaDalTesto(testo)).toBe('accesso')
    expect(motivoDelRisultato({ tipo: 'error', testo }).causa).toBe('accesso')
  })

  it('un solo fallimento per accesso mette il PC in pausa per tutti i compiti e i progetti', () => {
    const l = lavoro({ causa: 'accesso' })
    const pause = pauseAiuti([l], T0 + 60_000)
    expect(pcInPausa(pause, 'pc-finto', 'altro-progetto', 'k-999')).toBeDefined()
    expect(pcInPausa(pause, 'altro-pc', 'progetto-a', 'k-999')).toBeUndefined()
    expect(pcInPausa(pauseAiuti([l], T0 + PAUSA_ACCESSO_MS + 1), 'pc-finto', 'progetto-a', 'k-999')).toBeUndefined()
  })

  it('un lavoro riuscito dopo il fallimento rimette il PC in gioco', () => {
    const pause = pauseAiuti([lavoro({ causa: 'accesso' }), lavoro({ stato: 'finito', fineMs: T0 + 30_000, motivo: undefined })], T0 + 60_000)
    expect(pcInPausa(pause, 'pc-finto', 'altro-progetto', 'k-999')).toBeUndefined()
  })

  it('un PC che non risponde sta fuori un quarto d’ora, poi torna', () => {
    const l = lavoro({ causa: 'pc', motivo: 'PC-Finto non risponde da 5 minuti' })
    expect(pcInPausa(pauseAiuti([l], T0 + 60_000), 'pc-finto', 'progetto-a', 'k-1')).toBeDefined()
    expect(pcInPausa(pauseAiuti([l], T0 + PAUSA_IRRAGGIUNGIBILE_MS + 1), 'pc-finto', 'altro-progetto', 'k-1')).toBeUndefined()
  })

  it('un compito fallito per colpa sua (prove rosse) non toglie il PC agli altri', () => {
    const pause = pauseAiuti([lavoro({ causa: 'compito' })], T0 + 60_000)
    expect(pcInPausa(pause, 'pc-finto', 'altro-progetto', 'k-999')).toBeUndefined()
  })

  it('il motivo dice «accesso Claude scaduto su <PC>»', () => {
    const { motivo, causa } = motivoDelRisultato({ tipo: 'error', testo })
    const m = motivoSuPc(motivo, causa, 'PC-Finto')
    expect(m.startsWith('accesso Claude scaduto su PC-Finto')).toBe(true)
    expect(m).toContain('Failed to authenticate')
    expect(motivoSuPc('altro', 'compito', 'PC-Finto')).toBe('altro')
  })
})

describe('errori arrivati: lo stesso fallimento con id diversi è un gruppo solo', () => {
  const msg = (id: string, ruolo: string): string => `[aiuto] lavoro ${id} (${ruolo}) per PC-Finto non riuscito: accesso Claude scaduto su PC-Aiuto`
  const voce = (id: string, ruolo: string) => ({ quando: '2026-11-13T15:00:00.000Z', ultima: '2026-11-13T15:00:00.000Z', dove: 'pc' as const, volte: 1, messaggio: msg(id, ruolo), versione: '1.0.1' })

  it('la chiave non contiene l’id del lavoro', () => {
    expect(chiaveErrore(voce('r9aa071b61902', 'sviluppatore'))).toBe(chiaveErrore(voce('raed21fb22a76', 'interfaccia')))
    expect(chiaveErrore(voce('r9aa071b61902', 'sviluppatore'))).not.toContain('9aa071')
  })

  it('cinque fallimenti diventano un gruppo con volte 5', () => {
    const ids = ['r9aa071b61902', 'raed21fb22a76', 'rd0e7ef75d1fe', 'r1899a417a8f3', 'r247602b441d4']
    const arrivo: ArrivoLetto = { file: 'PC-Aiuto/x.json', da: 'PC-Aiuto', versione: '1.0.1', voci: ids.map((i) => voce(i, 'sviluppatore')) }
    const r = raggruppa({ arrivi: [arrivo], versioneQui: '0.106.1', affidati: {}, adesso: Date.parse('2026-11-13T16:00:00.000Z') })
    expect(r.gruppi).toHaveLength(1)
    expect(r.gruppi[0]?.volte).toBe(5)
  })
})
