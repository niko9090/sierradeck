import { describe, it, expect } from 'vitest'
import { autopilotaDelWorkspace, cambiaVistaElenco, chatDavanti, chatDavantiStabile, nomeWorkspacePerAutopilota, vociInOrdine, rinominaInElenco, ruoloDalTitolo, type VoceElenco } from '@shared/vista-elenco'
import { chatDaSistemare } from '@shared/chat-governate'
import { normalizzaPreferenze, PREFERENZE_PREDEFINITE } from '@shared/preferenze'

/**
 * 0.74.0: il workspace è l'ambiente dell'autopilota. Nicholas, 15/10: «A più
 * chat finite tolte da sole, ma impostiamo di lavorare sempre con
 * l'autopilota e il workspace è l'ambiente in cui opera».
 */
describe('la vista a elenco', () => {
  it('si accende per un workspace alla volta e segue rinomina ed eliminazione', () => {
    expect(cambiaVistaElenco([], 'Notte', true)).toEqual(['Notte'])
    expect(cambiaVistaElenco(['Notte', 'Giorno'], 'Notte', false)).toEqual(['Giorno'])
    expect(cambiaVistaElenco(['Notte'], 'Notte', true)).toEqual(['Notte'])
    expect(rinominaInElenco(['Notte'], 'Notte', 'Notte lunga')).toEqual(['Notte lunga'])
    expect(rinominaInElenco(['Notte'], 'Notte', undefined)).toEqual([])
    const l = ['Altro']
    expect(rinominaInElenco(l, 'Notte', 'X')).toBe(l)
  })

  it('il workspace di un autopilota nuovo ha il suo nome, senza doppioni e dentro i 60 caratteri', () => {
    expect(nomeWorkspacePerAutopilota('Notte', ['Notte', 'Notte #2'])).toBe('Notte #3')
    expect(nomeWorkspacePerAutopilota('  ', [])).toBe('Autopilota')
    const lungo = nomeWorkspacePerAutopilota('x'.repeat(80), ['x'.repeat(54)])
    expect(lungo.length).toBeLessThanOrEqual(60)
  })

  it('davanti: la scelta se c’è ancora, se no chi ti chiede qualcosa, poi chi lavora, poi la prima', () => {
    const v = (paneId: string, p: Partial<VoceElenco> = {}): VoceElenco => ({ paneId, titolo: paneId, lavora: false, chiede: false, ...p })
    const voci = [v('a'), v('b', { lavora: true }), v('c', { chiede: true })]
    expect(chatDavanti(voci, 'a')).toBe('a')
    expect(chatDavanti(voci, 'sparita')).toBe('c')
    expect(chatDavanti([v('a'), v('b', { lavora: true })], undefined)).toBe('b')
    expect(chatDavanti([], undefined)).toBeUndefined()
  })

  it('il ruolo dal titolo del riquadro, solo per i ruoli veri', () => {
    expect(ruoloDalTitolo('Sviluppo · Notte')).toBe('Sviluppo')
    expect(ruoloDalTitolo('Revisione · Notte #2')).toBe('Revisione')
    expect(ruoloDalTitolo('Trading · conti')).toBeUndefined()
    expect(ruoloDalTitolo('Notte')).toBeUndefined()
  })

  it('la preferenza si legge pulita: niente doppioni, niente vuoti', () => {
    expect(PREFERENZE_PREDEFINITE.workspaceElenco).toEqual([])
    expect(normalizzaPreferenze({ workspaceElenco: ['Notte', 'Notte', '', 3, 'Giorno'] }).workspaceElenco).toEqual(['Notte', 'Giorno'])
  })
})

describe('le chat finite si tolgono da sole', () => {
  const ap = (id: string, stato: string, chats: { id: string; stato: string; ruolo?: string }[] = [], archiviato?: boolean) =>
    ({ id, stato, chats, ...(archiviato === true ? { archiviato } : {}) }) as unknown as Parameters<typeof chatDaSistemare>[1] extends (infer T)[] | undefined ? T : never
  const r = (paneId: string, id: string, chat: string, remoto?: boolean, occupata?: boolean) => ({ paneId, autopilota: { id, chat }, ...(remoto === true ? { remoto } : {}), ...(occupata === true ? { occupata } : {}) })

  it('lo specialista che ha finito chiude la sua chat; quello che lavora resta', () => {
    const a = ap('ap1', 'lavoro', [{ id: 'c-1', stato: 'finita', ruolo: 'sviluppo' }, { id: 'c-2', stato: 'lavoro', ruolo: 'revisione' }])
    expect(chatDaSistemare([r('p1', 'ap1', 'c-1'), r('p2', 'ap1', 'c-2')], [a])).toEqual({ chiudi: ['p1'], libera: [] })
  })

  it('0.74.1: l’autopilota finito chiude le chat degli specialisti; la sua chat principale non si chiude mai, torna tua', () => {
    expect(chatDaSistemare([r('p1', 'ap1', 'ap1'), r('p2', 'ap1', 'c-2')], [ap('ap1', 'finito', [{ id: 'c-2', stato: 'lavoro', ruolo: 'sviluppo' }])])).toEqual({ chiudi: ['p2'], libera: ['p1'] })
  })

  it('0.74.1: uno specialista finito che sta ancora scrivendo o chiede qualcosa non si chiude (si riprova dopo)', () => {
    const a = ap('ap1', 'lavoro', [{ id: 'c-1', stato: 'finita', ruolo: 'sviluppo' }])
    expect(chatDaSistemare([r('p1', 'ap1', 'c-1', false, true)], [a])).toEqual({ chiudi: [], libera: [] })
  })

  it('l’autopilota fermo, fallito, archiviato o sparito: la chat resta aperta ma torna tua', () => {
    const ris = chatDaSistemare(
      [r('p1', 'fermo', 'c-1'), r('p2', 'fallito', 'c-1'), r('p3', 'arch', 'c-1'), r('p4', 'sparito', 'c-1')],
      [ap('fermo', 'sospeso', [{ id: 'c-1', stato: 'lavoro' }]), ap('fallito', 'fallito'), ap('arch', 'lavoro', [], true)]
    )
    expect(ris).toEqual({ chiudi: [], libera: ['p1', 'p2', 'p3', 'p4'] })
  })

  it('niente si tocca senza l’elenco letto, né le chat di un altro PC', () => {
    expect(chatDaSistemare([r('p1', 'ap1', 'c-1')], undefined)).toEqual({ chiudi: [], libera: [] })
    expect(chatDaSistemare([r('p1', 'ap1', 'c-1', true)], [ap('ap1', 'finito')])).toEqual({ chiudi: [], libera: [] })
  })

  it('in lavoro e in attesa la chat resta guidata', () => {
    expect(chatDaSistemare([r('p1', 'ap1', 'c-1'), r('p2', 'ap2', 'c-1')], [ap('ap1', 'lavoro', [{ id: 'c-1', stato: 'lavoro' }]), ap('ap2', 'attesa')])).toEqual({ chiudi: [], libera: [] })
  })
})

describe('0.75.4: l’elenco non si scompone', () => {
  const v = (paneId: string, titolo: string, x: Partial<VoceElenco> = {}): VoceElenco => ({ paneId, titolo, lavora: false, chiede: false, ...x })
  it('l’ordine è quello del layout, qualunque sia l’ordine dello store; niente doppioni', () => {
    const store = [v('p3', 'C'), v('p1', 'A'), v('p2', 'B'), v('p1', 'A')]
    expect(vociInOrdine(store, ['p1', 'p2', 'p3']).map((x) => x.paneId)).toEqual(['p1', 'p2', 'p3'])
    // Un riquadro riaperto entra in fondo allo store: la sua riga resta al suo posto.
    expect(vociInOrdine([v('p1', 'A'), v('p3', 'C'), v('p2', 'B')], ['p1', 'p2', 'p3']).map((x) => x.paneId)).toEqual(['p1', 'p2', 'p3'])
    // Quelli che il layout non ha ancora vanno in fondo, sempre nello stesso ordine.
    expect(vociInOrdine([v('pz', 'Zeta'), v('p1', 'A'), v('pa', 'Alfa')], ['p1']).map((x) => x.paneId)).toEqual(['p1', 'pa', 'pz'])
  })

  it('la chat davanti non salta quando un’altra comincia a lavorare o a chiedere', () => {
    const prima = [v('p1', 'A'), v('p2', 'B')]
    const davanti = chatDavantiStabile(prima, undefined, undefined)
    expect(davanti).toBe('p1')
    // p2 comincia a chiedere: prima si saltava a lei, adesso si resta su p1.
    const dopo = [v('p1', 'A'), v('p2', 'B', { chiede: true })]
    expect(chatDavanti(dopo, undefined)).toBe('p2')
    expect(chatDavantiStabile(dopo, undefined, davanti)).toBe('p1')
    // La scelta di Nicholas vince sempre; se la chat davanti si chiude, se ne sceglie un'altra.
    expect(chatDavantiStabile(dopo, 'p2', 'p1')).toBe('p2')
    expect(chatDavantiStabile([v('p2', 'B', { chiede: true })], undefined, 'p1')).toBe('p2')
  })
})

describe('0.76.0: il pannello dell’autopilota del workspace, fisso a sinistra', () => {
  const a = (id: string, workspace: string, stato: string, x: Record<string, unknown> = {}) => ({ id, workspace, stato, iniziatoIl: '2026-10-16T08:00:00Z', ...x })
  it('quello del workspace; con più autopiloti prima chi aspetta te, poi chi lavora; mai gli archiviati', () => {
    const lista = [a('a1', 'SierraDeck', 'finito'), a('a2', 'SierraDeck', 'lavoro'), a('a3', 'Altro', 'attesa'), a('a4', 'SierraDeck', 'attesa', { archiviato: true })]
    expect(autopilotaDelWorkspace(lista, 'SierraDeck')?.id).toBe('a2')
    expect(autopilotaDelWorkspace([...lista, a('a5', 'SierraDeck', 'attesa')], 'SierraDeck')?.id).toBe('a5')
    expect(autopilotaDelWorkspace(lista, 'Vuoto')).toBeUndefined()
  })
})
