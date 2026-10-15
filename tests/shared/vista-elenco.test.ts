import { describe, it, expect } from 'vitest'
import { cambiaVistaElenco, chatDavanti, nomeWorkspacePerAutopilota, rinominaInElenco, ruoloDalTitolo, type VoceElenco } from '@shared/vista-elenco'
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
  const ap = (id: string, stato: string, chats: { id: string; stato: string }[] = [], archiviato?: boolean) =>
    ({ id, stato, chats, ...(archiviato === true ? { archiviato } : {}) }) as unknown as Parameters<typeof chatDaSistemare>[1] extends (infer T)[] | undefined ? T : never
  const r = (paneId: string, id: string, chat: string, remoto?: boolean) => ({ paneId, autopilota: { id, chat }, ...(remoto === true ? { remoto } : {}) })

  it('lo specialista che ha finito chiude la sua chat; quello che lavora resta', () => {
    const a = ap('ap1', 'lavoro', [{ id: 'c-1', stato: 'finita' }, { id: 'c-2', stato: 'lavoro' }])
    expect(chatDaSistemare([r('p1', 'ap1', 'c-1'), r('p2', 'ap1', 'c-2')], [a])).toEqual({ chiudi: ['p1'], libera: [] })
  })

  it('l’autopilota finito chiude tutte le sue chat, anche quella unica', () => {
    expect(chatDaSistemare([r('p1', 'ap1', 'principale'), r('p2', 'ap1', 'c-2')], [ap('ap1', 'finito', [{ id: 'c-2', stato: 'lavoro' }])])).toEqual({ chiudi: ['p1', 'p2'], libera: [] })
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
