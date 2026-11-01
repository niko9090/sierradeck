import { describe, it, expect } from 'vitest'
import { aggiungi, avanzamentoCoda, chiudi, codaVuota, conRichiesta, leggiCoda, type Coda, type MisuraCompito } from '@shared/coda-richieste'
import { fraseStatoOrchestratore, vistaLavoro, type VistaOrchestratore } from '@shared/piano-orchestratore'
import { chiamaStrumento, STRUMENTI_ORCHESTRATORE, type AmbienteOrchestratore } from '../../src/autopilot-host/mcp-orchestratore'
import { leggiImpostazioni, impostazioniPredefinite } from '../../src/autopilot-host/orchestratore-store'

/**
 * 0.89.2. Nicholas (01/11): «anche la semplice domanda a che punto siamo
 * arrivati manda la percentuale al 19%» e «non vedo chat attive e che il
 * compito vada avanti». Le richieste che non sono lavoro si chiudono, non
 * contano nella percentuale, e la testa dice cosa succede adesso.
 */

const T0 = '2026-11-01T08:00:00.000Z'
const ora = (min: number): string => new Date(Date.parse(T0) + min * 60_000).toISOString()
const misura: MisuraCompito = (k) => (k === 'k-1' ? { stato: 'unito' } : k === 'k-2' ? { stato: 'in-revisione' } : undefined)

/** r-1 con due compiti (uno unito, uno in revisione): il 90%. */
function codaConLavoro(): Coda {
  let c = aggiungi(codaVuota('W'), { testo: 'Correggi la barra delle chat', quando: ora(0) }).coda
  c = conRichiesta(c, 'r-1', (r) => ({ ...r, stato: 'in-corso', compiti: ['k-1', 'k-2'] }))
  return c
}

describe('la percentuale conta solo il lavoro (0.89.2)', () => {
  it('«a che punto siamo?» appena arrivato non la fa scendere', () => {
    const c = codaConLavoro()
    expect(avanzamentoCoda(c, misura)).toBe(90)
    const dopo = aggiungi(c, { testo: 'a che punto siamo arrivati?', quando: ora(10) }).coda
    expect(avanzamentoCoda(dopo, misura)).toBe(90)
  })

  it('chiusa come risposta: esce dalla coda aperta, i punti sono superati con il perché, e resta chiusa dopo la rilettura', () => {
    const c = aggiungi(codaConLavoro(), { testo: 'a che punto siamo?', quando: ora(10) }).coda
    const e = chiudi(c, { ids: ['r-2'], come: 'risposta', perche: 'risposto: siamo al 90%', quando: ora(11) })
    expect(e.ok).toBe(true)
    if (!e.ok) return
    const r2 = e.coda.richieste.find((r) => r.id === 'r-2')!
    expect(r2.stato).toBe('fatta')
    expect(r2.chiusa).toMatchObject({ come: 'risposta', perche: 'risposto: siamo al 90%' })
    expect(r2.punti.every((p) => p.stato === 'superato' && p.perche === 'risposto: siamo al 90%')).toBe(true)
    expect(avanzamentoCoda(e.coda, misura)).toBe(90)
    const riletta = leggiCoda(JSON.parse(JSON.stringify(e.coda)), 'W')
    expect(riletta.richieste.find((r) => r.id === 'r-2')!.chiusa?.come).toBe('risposta')
  })

  it('un doppione nomina la richiesta che lo contiene; senza, o con una che non c’è, si rifiuta', () => {
    const c = aggiungi(codaConLavoro(), { testo: 'Controllo di tutti i PC: 2 criticità', quando: ora(10) }).coda
    expect(chiudi(c, { ids: ['r-2'], come: 'doppione', perche: 'stesso rapporto', quando: ora(11) }).ok).toBe(false)
    expect(chiudi(c, { ids: ['r-2'], come: 'doppione', perche: 'stesso rapporto', quando: ora(11), doppioneDi: 'r-9' }).ok).toBe(false)
    const e = chiudi(c, { ids: ['r-2'], come: 'doppione', perche: 'stesso rapporto', quando: ora(11), doppioneDi: 'r-1' })
    expect(e.ok && e.coda.richieste.find((r) => r.id === 'r-2')!.punti[0]!.superatoDa).toBe('r-1')
  })

  it('si rifiuta: senza perché, una già fatta, una con compiti chiusa come «risposta»', () => {
    const c = codaConLavoro()
    expect(chiudi(c, { ids: ['r-1'], come: 'risposta', perche: 'x', quando: ora(1) }).ok).toBe(false)
    expect(chiudi(c, { ids: ['r-1'], come: 'annullata', perche: '  ', quando: ora(1) }).ok).toBe(false)
    const e = chiudi(c, { ids: ['r-1'], come: 'annullata', perche: 'Nicholas: «fermati»', quando: ora(1) })
    expect(e.ok).toBe(true)
    if (e.ok) expect(chiudi(e.coda, { ids: ['r-1'], come: 'annullata', perche: 'di nuovo', quando: ora(2) }).ok).toBe(false)
  })
})

describe('lo strumento coda_chiudi (0.89.2)', () => {
  it('è fra gli strumenti dell’autopilota e chiude davvero, ricalcolando la percentuale', async () => {
    expect(STRUMENTI_ORCHESTRATORE.some((s) => s.name === 'coda_chiudi')).toBe(true)
    let coda = aggiungi(codaVuota('W'), { testo: 'sì', quando: ora(0) }).coda
    const ricalcoli: string[] = []
    const amb = {
      adesso: () => ora(1),
      cambiaCoda: (_ws: string, f: (c: Coda) => { coda: Coda }) => { coda = f(coda).coda },
      ricalcola: (_ws: string, perche: string) => { ricalcoli.push(perche) }
    } as unknown as AmbienteOrchestratore
    const e = await chiamaStrumento(amb, 'W', 'coda_chiudi', { ids: ['r-1'], come: 'risposta', perche: 'confermato, procedo' })
    expect(e?.errore).toBe(false)
    expect(coda.richieste[0]!.stato).toBe('fatta')
    expect(ricalcoli).toEqual(['chiuse r-1'])
    const no = await chiamaStrumento(amb, 'W', 'coda_chiudi', { ids: ['r-1'], come: 'risposta', perche: 'ancora' })
    expect(no?.errore).toBe(true)
  })
})

describe('la testa dice cosa succede adesso (0.89.2)', () => {
  const base: Pick<VistaOrchestratore, 'pensa' | 'specialisti' | 'piano' | 'richieste' | 'domandeAperte' | 'vivo'> = {
    pensa: false, vivo: true, specialisti: [], piano: { totale: 0, uniti: 0 }, richieste: { aperte: 0, daPianificare: 0 }, domandeAperte: 0
  }
  it('chi lavora, chi pensa, chi aspetta, perché è fermo', () => {
    expect(fraseStatoOrchestratore({ ...base, specialisti: [{ id: 'a', ruolo: 'sviluppatore', compito: 'x', stato: 'lavoro', compitoId: 'k-3' }] })).toMatchObject({ tono: 'lavora', testo: 'Al lavoro: sviluppatore (k-3)' })
    expect(fraseStatoOrchestratore({ ...base, pensa: true }).tono).toBe('lavora')
    expect(fraseStatoOrchestratore({ ...base, domandeAperte: 1, richieste: { aperte: 1, daPianificare: 0 } }).tono).toBe('aspetta')
    expect(fraseStatoOrchestratore({ ...base, piano: { totale: 3, uniti: 1 }, richieste: { aperte: 1, daPianificare: 0 } }).testo).toContain('2 compiti nel piano')
    expect(fraseStatoOrchestratore({ ...base, richieste: { aperte: 0, daPianificare: 2 } }).testo).toContain('2 richieste aperte')
    expect(fraseStatoOrchestratore(base).tono).toBe('riposo')
  })

  it('i numeri sono del lavoro aperto, non di tutti i compiti di sempre', () => {
    let c = codaConLavoro()
    c = aggiungi(c, { testo: 'vecchia', quando: ora(1) }).coda
    c = conRichiesta(c, 'r-2', (r) => ({ ...r, stato: 'fatta', fattaIl: ora(2), compiti: ['k-9'] }))
    c = aggiungi(c, { testo: 'a che punto siamo?', quando: ora(3) }).coda
    const piano = { versione: 1 as const, compiti: ['k-1', 'k-2', 'k-9'].map((id, i) => ({ id, richiesta: id === 'k-9' ? 'r-2' : 'r-1', titolo: id, criterio: 'x', dopo: [], peso: 1 as const, stato: (i === 1 ? 'in-revisione' : 'unito') as 'unito', creato: T0, criterioVerde: true })) }
    expect(vistaLavoro(c, piano, 1)).toEqual({ piano: { totale: 2, uniti: 1 }, richieste: { aperte: 1, daPianificare: 1 }, domandeAperte: 1 })
  })
})

describe('l’autopilota usa Opus (0.89.2)', () => {
  it('di serie, e anche il «sonnet» scritto dalle versioni di prima; Sonnet solo se Nicholas l’ha scelto', () => {
    expect(impostazioniPredefinite().modello).toBe('opus')
    expect(leggiImpostazioni({ modello: 'sonnet', tettoSpecialisti: 3 }).modello).toBe('opus')
    expect(leggiImpostazioni({ modello: 'sonnet', modelloScelto: true, tettoSpecialisti: 3 })).toMatchObject({ modello: 'sonnet', modelloScelto: true })
  })
})
