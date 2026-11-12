import { describe, it, expect } from 'vitest'
import { aggiungi, codaVuota, type Coda } from '@shared/coda-richieste'
import { conCompito, misuraDalPiano, pianoVuoto, scriviPiano, type Piano } from '@shared/piano-orchestratore'
import { menuSpecialisti } from '@shared/menu-specialisti'
import { fraseStatoOrchestratore } from '@shared/piano-orchestratore'
import { fraseAdesso } from '@shared/stato-telefono'
import { lavoroFermo } from '../../src/autopilot-host/lavoro-fermo'
import { riassuntoOrchestratore } from '../../src/autopilot-host/riassunto-orchestratore'
import { attesaUnioneFerma, ROSSI_SPORCHI_MAX, UNIONE_RIPROVA_MS } from '../../src/autopilot-host/servizio-orchestratore'
import { REGOLE_ORCHESTRATORE } from '../../src/autopilot-host/orchestratore'
import { leggiImpostazioni, TETTO_SPECIALISTI } from '../../src/autopilot-host/orchestratore-store'

/**
 * 12/11, Nicholas: «lavora in parallelo più che puoi per abbattere i tempi», e
 * «ci sono ancora autopiloti che si fermano da soli e devo scrivere vai avanti».
 */

const ADESSO = '2026-11-12T22:00:00.000Z'

function codaCon(...testi: string[]): Coda {
  let c = codaVuota('Lavoro')
  for (const t of testi) c = aggiungi(c, { testo: t, quando: ADESSO }).coda
  return c
}

function pianoCon(coda: Coda, compiti: unknown[]): { piano: Piano; coda: Coda } {
  const e = scriviPiano(pianoVuoto(), coda, compiti, ADESSO)
  if (!e.ok) throw new Error(e.errore)
  return { piano: e.piano, coda: e.coda.coda }
}

describe('in parallelo', () => {
  it('le regole chiedono tutti i compiti pronti in un solo messaggio, in sottofondo, fino ai posti liberi', () => {
    expect(REGOLE_ORCHESTRATORE).toContain('in UN SOLO messaggio lancia un Agent per ogni compito pronto e indipendente')
    expect(REGOLE_ORCHESTRATORE).toContain('run_in_background: true')
    expect(REGOLE_ORCHESTRATORE).not.toContain('Non più specialisti di quelli che servono')
    expect(REGOLE_ORCHESTRATORE).not.toContain('passi al compito dopo')
  })

  it('di serie 5 specialisti per workspace', () => {
    expect(TETTO_SPECIALISTI).toBe(5)
    expect(leggiImpostazioni({ tettoSpecialisti: 3 }).tettoSpecialisti).toBe(5)
  })

  it('lo stato dice i compiti pronti senza nessuno e i posti liberi, anche sugli altri PC', () => {
    const { piano, coda } = pianoCon(codaCon('tre cose'), [
      { id: 'k-1', richiesta: 'r-1', titolo: 'uno', criterio: 'c’è' },
      { id: 'k-2', richiesta: 'r-1', titolo: 'due', criterio: 'c’è' }
    ])
    const testo = riassuntoOrchestratore({ ws: 'Lavoro', coda, piano, unico: undefined, misura: misuraDalPiano(piano), eventi: [], tetti: { ws: 5, pc: 6, alLavoroPc: 1 }, domandeAperte: 0, adesso: Date.parse(ADESSO), pronti: ['k-1', 'k-2'], liberiFuori: 4 })
    expect(testo).toContain('PRONTI ORA')
    expect(testo).toContain('k-1, k-2')
    expect(testo).toContain('Posti liberi: 5 qui + 4 sugli altri PC')
  })
})

describe('le unioni ferme non fermano l’autopilota', () => {
  it('riprova sempre più di rado: 30 s, 1, 2, 4, 8 minuti e poi resta lì', () => {
    expect([1, 2, 3, 4, 5, 6, 20].map((g) => attesaUnioneFerma(UNIONE_RIPROVA_MS, g) / 1000)).toEqual([30, 60, 120, 240, 480, 480, 480])
  })

  it('rosso coi file non salvati: dopo poche misure conta rosso davvero', () => {
    expect(ROSSI_SPORCHI_MAX).toBeGreaterThanOrEqual(2)
    expect(ROSSI_SPORCHI_MAX).toBeLessThanOrEqual(5)
  })

  it('un compito con l’unione ferma si dice fermo, con cosa fare; uno in unione vera no', () => {
    const base = pianoCon(codaCon('una cosa'), [
      { id: 'k-1', richiesta: 'r-1', titolo: 'finito', criterio: 'c’è' },
      { id: 'k-2', richiesta: 'r-1', titolo: 'pronto', criterio: 'c’è' }
    ])
    const piano = conCompito(base.piano, 'k-1', (c) => ({ ...c, stato: 'in-revisione' }))
    const vero = lavoroFermo({ coda: base.coda, piano, alLavoro: new Set(), inUnione: new Set(['k-1']) })
    expect(vero?.righe.join('\n') ?? '').not.toContain('k-1')
    const ferma = lavoroFermo({ coda: base.coda, piano, alLavoro: new Set(), inUnione: new Set(), unioniFerme: new Map([['k-1', 'ferma per file non salvati nella cartella principale']]) })
    const righe = ferma?.righe.join('\n') ?? ''
    expect(righe).toContain('k-1 finito, unione ferma per file non salvati')
    expect(righe).toContain('non rilanciarlo')
    expect(righe).toContain('k-2 pronto')
  })
})

describe('i lavori degli altri PC nell’elenco del PC che li ospita', () => {
  it('compaiono con «per <PC>» e senza tasti', () => {
    const m = menuSpecialisti({
      posti: { usati: 1, tetto: 6 },
      alLavoro: [{ posto: 1, id: 'r0123456789ab', workspace: '', descrizione: 'k-4: la pagina', tipo: 'sviluppatore', dal: ADESSO, workspaceNome: 'per Portatile', perPc: 'Portatile' }],
      inFila: []
    } as never, [])
    expect(m.lavorano[0]).toMatchObject({ perPc: 'Portatile' })
  })
})

describe('la frase di stato è coerente con quello che lavora', () => {
  const base = { pensa: false, specialisti: [] as never[], piano: { totale: 3, uniti: 1 }, richieste: { aperte: 1, daPianificare: 0 }, domandeAperte: 0, vivo: true }
  it('mentre il programma unisce e prova non dice «fermo»', () => {
    const f = fraseStatoOrchestratore({ ...base, inCorso: { unione: 'k-2', fase: 'criterio', inFila: 2 } })
    expect(f.tono).toBe('lavora')
    expect(f.testo).toBe('Al lavoro: il programma misura il criterio di k-2, 1 unione in fila')
    expect(fraseAdesso({ ...base, inCorso: { unione: 'k-2', fase: 'prova', inFila: 1 } }).testo).toBe('Al lavoro: il programma prova e unisce k-2')
  })
  it('unioni in fila che ripartono da sole: in attesa, non fermo', () => {
    expect(fraseStatoOrchestratore({ ...base, inCorso: { inFila: 1 } })).toEqual({ testo: 'In attesa: 1 unione in fila, ripartono da sole', tono: 'riposo' })
  })
  it('fermo davvero: non chiede più a Nicholas di scrivere «vai avanti»', () => {
    const f = fraseStatoOrchestratore(base)
    expect(f.tono).toBe('fermo')
    expect(f.testo).not.toContain('vai avanti')
  })
})
