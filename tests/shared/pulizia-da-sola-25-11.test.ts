import { describe, it, expect } from 'vitest'
import { aiutiDaTenere, AIUTO_APERTO_MAX_MS, serieGuasti, type ContestoPuliziaAiuti } from '../../src/shared/aiuto-esito'
import type { LavoroAffidato } from '../../src/shared/aiuto-rete'
import { vociDiCompitiFiniti, type VoceAttesa } from '../../src/shared/attesa-specialisti'
import { aggiungi, avanzamentoCoda, codaVuota } from '../../src/shared/coda-richieste'
import { conCompito, misuraDalPiano, pianoVuoto, scriviPiano } from '../../src/shared/piano-orchestratore'
import { rigaUnioneEPoi } from '../../src/autopilot-host/dipendenze'

/**
 * 25/11: la pulizia da sola. Sui dati veri restavano in `aiuti-affidati.json`
 * lavori finiti da un altro PC con il compito già unito, e nel piano compiti
 * chiusi (31/10, 1/11) «in revisione» o «da fare» che contavano ancora.
 */

const ADESSO = '2026-11-25T12:00:00.000Z'
const ora = Date.parse(ADESSO)
const oreFa = (h: number): string => new Date(ora - h * 3_600_000).toISOString()

const lavoro = (id: string, o: Partial<LavoroAffidato>): LavoroAffidato => ({
  id, workspace: 'Progetto', cwd: 'C:\\progetto', pcId: 'pc-a', pcNome: 'altro PC', ruolo: 'sviluppatore', descrizione: `${o.compito ?? id}: lavoro`,
  prompt: 'fai', sistema: '', modello: 'sonnet', strumenti: [], stato: 'finito', inizio: oreFa(3), fine: oreFa(2), ...o
})

type K = { stato: string; criterioVerde?: boolean; chiuso?: unknown; richiesta: string }
const contesto = (piano: Record<string, K>, fatte: string[] = [], uniti: string[] = []): ContestoPuliziaAiuti => ({
  adesso: ora,
  compito: (_ws, id) => piano[id],
  richiestaFatta: (_ws, id) => fatte.includes(id),
  unito: (_ws, id) => uniti.includes(id)
})

describe('i lavori affidati che non servono più escono da soli', () => {
  it('finiti con il compito unito (verde), chiuso o con la richiesta fatta: fuori; in revisione o unito rosso: restano', () => {
    const lavori = [
      lavoro('r1', { compito: 'k-280a', ramo: 'worktree-agent-r1' }),
      lavoro('r2', { compito: 'k-280b', ramo: 'worktree-agent-r2' }),
      lavoro('r3', { compito: 'k-280c', ramo: 'worktree-agent-r3' }),
      lavoro('r4', { compito: 'k-ver280', ramo: 'worktree-agent-r4' }),
      lavoro('r5', { compito: 'k-err285', ramo: 'worktree-agent-r5' })
    ]
    const { tenuti, tolti } = aiutiDaTenere(lavori, contesto({
      'k-280a': { stato: 'unito', criterioVerde: true, richiesta: 'r-1' },
      'k-280b': { stato: 'in-revisione', chiuso: { come: 'superato' }, richiesta: 'r-1' },
      'k-280c': { stato: 'in-revisione', richiesta: 'r-2' },
      'k-ver280': { stato: 'in-revisione', richiesta: 'r-3' },
      'k-err285': { stato: 'unito', criterioVerde: false, richiesta: 'r-1' }
    }, ['r-3']))
    expect(tolti.map((t) => t.id)).toEqual(['r1', 'r2', 'r4'])
    expect(tolti[0]!.perche).toContain('unito')
    expect(tenuti.map((l) => l.id)).toEqual(['r3', 'r5'])
  })

  it('il ramo già unito dal cancello, o niente da unire: fuori anche senza compito nel piano', () => {
    const { tolti } = aiutiDaTenere([lavoro('r1', { ramo: 'worktree-agent-r1' }), lavoro('r2', {}), lavoro('r3', { ramo: 'worktree-agent-r3' })], contesto({}, [], ['r1']))
    expect(tolti.map((t) => t.id)).toEqual(['r1', 'r2'])
  })

  it('aperti: restano, salvo dopo tre giorni; chiusi: al più un giorno', () => {
    const lavori = [
      lavoro('r1', { stato: 'spedito', inizio: oreFa(5), fine: undefined }),
      lavoro('r2', { stato: 'spedito', inizio: new Date(ora - AIUTO_APERTO_MAX_MS - 60_000).toISOString(), fine: undefined }),
      lavoro('r3', { stato: 'da-spedire', inizio: oreFa(80), fine: undefined }),
      lavoro('r4', { compito: 'k-1', ramo: 'worktree-agent-r4', fine: oreFa(25) })
    ]
    const { tenuti } = aiutiDaTenere(lavori, contesto({ 'k-1': { stato: 'in-revisione', richiesta: 'r-1' } }))
    expect(tenuti.map((l) => l.id)).toEqual(['r1'])
  })

  it('i falliti restano il loro giorno, e un riuscito dopo un guasto dello stesso PC non esce prima (la serie resta giusta)', () => {
    const lavori = [
      lavoro('f1', { compito: 'k-1', stato: 'fallito', causa: 'accesso', motivo: 'accesso scaduto', fine: oreFa(10) }),
      lavoro('ok', { compito: 'k-2', ramo: 'worktree-agent-ok', fine: oreFa(9) }),
      lavoro('f2', { compito: 'k-3', stato: 'fallito', causa: 'git', motivo: 'git', fine: oreFa(8) })
    ]
    const c = contesto({ 'k-1': { stato: 'unito', criterioVerde: true, richiesta: 'r-1' }, 'k-2': { stato: 'unito', criterioVerde: true, richiesta: 'r-1' }, 'k-3': { stato: 'da-fare', richiesta: 'r-1' } })
    const { tenuti, tolti } = aiutiDaTenere(lavori, c)
    expect(tolti).toEqual([])
    expect(serieGuasti(tenuti, 'pc-a').compiti).toBe(serieGuasti(lavori, 'pc-a').compiti)
    // Senza guasti prima, lo stesso riuscito esce subito.
    expect(aiutiDaTenere(lavori.slice(1), c).tolti.map((t) => t.id)).toEqual(['ok'])
  })
})

describe('la lista d’attesa non tiene compiti finiti', () => {
  it('fuori le voci di compiti uniti verdi, chiusi o con la richiesta fatta; restano le altre', () => {
    const voce = (id: string, compito?: string): VoceAttesa => ({ id, workspace: 'Progetto', descrizione: 'x', tipo: 'sviluppatore', dal: ADESSO, priorita: 0, ordine: 1, sveglie: 0, ...(compito !== undefined ? { compito } : {}) })
    const piano: Record<string, K> = {
      'k-1': { stato: 'unito', criterioVerde: true, richiesta: 'r-1' },
      'k-2': { stato: 'da-fare', chiuso: { come: 'superato' }, richiesta: 'r-1' },
      'k-3': { stato: 'da-fare', richiesta: 'r-9' },
      'k-4': { stato: 'da-fare', richiesta: 'r-1' },
      'k-5': { stato: 'unito', criterioVerde: false, richiesta: 'r-1' }
    }
    const via = vociDiCompitiFiniti([voce('a', 'k-1'), voce('b', 'k-2'), voce('c', 'k-3'), voce('d', 'k-4'), voce('e', 'k-5'), voce('f')], (_w, id) => piano[id], (_w, id) => id === 'r-9')
    expect(via.map((v) => v.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('i compiti chiusi non contano più', () => {
  const base = (): ReturnType<typeof scriviPiano> & { ok: true } => {
    const coda = aggiungi(codaVuota('Progetto'), { testo: 'tre cose', quando: ADESSO }).coda
    const e = scriviPiano(pianoVuoto(), coda, [
      { id: 'k-1', richiesta: 'r-1', titolo: 'uno', criterio: 'c’è' },
      { id: 'k-2', richiesta: 'r-1', titolo: 'due', criterio: 'c’è' },
      { id: 'k-3', richiesta: 'r-1', titolo: 'tre', criterio: 'c’è' }
    ], ADESSO)
    if (!e.ok) throw new Error(e.errore)
    return e
  }

  it('nella percentuale: un «in revisione» e un «da fare» chiusi escono dal conto', () => {
    const e = base()
    let piano = conCompito(e.piano, 'k-1', (c) => ({ ...c, stato: 'unito', criterioVerde: true }))
    piano = conCompito(piano, 'k-2', (c) => ({ ...c, stato: 'in-revisione', chiuso: { come: 'richiesta-chiusa', perche: 'chiusa', il: ADESSO } }))
    piano = conCompito(piano, 'k-3', (c) => ({ ...c, chiuso: { come: 'superato', perche: 'rifatto altrove', il: ADESSO } }))
    // Prima: (1 + 0.8 + 0) / 3 = 60%. Ora conta solo k-1, ma la richiesta non è fatta: 99.
    expect(avanzamentoCoda(e.coda.coda, misuraDalPiano(piano))).toBe(99)
    expect(misuraDalPiano(piano)('k-2')).toMatchObject({ stato: 'in-revisione', chiuso: true })
    expect(misuraDalPiano(piano)('k-1')?.chiuso).toBeUndefined()
  })

  it('«poi parte» non nomina un compito chiuso', () => {
    const e = base()
    let piano = conCompito(e.piano, 'k-2', (c) => ({ ...c, dopo: ['k-1'] }))
    piano = conCompito(piano, 'k-3', (c) => ({ ...c, dopo: ['k-1'], chiuso: { come: 'superato', perche: 'non serve', il: ADESSO } }))
    const riga = rigaUnioneEPoi(piano, ['k-1']) ?? ''
    expect(riga).toContain('poi parte k-2')
    expect(riga).not.toContain('k-3')
  })
})
