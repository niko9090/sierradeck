import { describe, it, expect } from 'vitest'
import { creaCodaLayout } from '../../src/main/coda-layout'
import type { LayoutSalvato } from '@shared/workspace'

function layout(titolo: string): LayoutSalvato {
  return {
    root: { type: 'pane', id: 'p' },
    panes: [{ id: 'p', sessionUuid: 'u', cwd: 'C:\\p', title: titolo }]
  }
}

describe('creaCodaLayout', () => {
  it('consegna i layout nell ordine in cui sono stati messi', () => {
    // Le finestre si aprono in fila e chiedono il proprio layout appena sono
    // pronte: se l'ordine si perdesse, le chat finirebbero nella finestra
    // sbagliata rispetto a com'erano state salvate.
    const coda = creaCodaLayout()
    coda.accoda(layout('prima'), 1000)
    coda.accoda(layout('seconda'), 1000)
    expect(coda.preleva(1100)?.panes[0]?.title).toBe('prima')
    expect(coda.preleva(1200)?.panes[0]?.title).toBe('seconda')
  })

  it('una volta consegnato non si ripete', () => {
    const coda = creaCodaLayout()
    coda.accoda(layout('unica'), 1000)
    expect(coda.preleva(1100)).toBeDefined()
    expect(coda.preleva(1200)).toBeUndefined()
  })

  it('un layout rimasto in coda troppo a lungo non viene consegnato', () => {
    // Altrimenti la prossima finestra aperta a mano — magari domani — si
    // ritroverebbe dentro le chat di un ripristino andato storto.
    const coda = creaCodaLayout(10_000)
    coda.accoda(layout('vecchio'), 1000)
    expect(coda.preleva(20_000)).toBeUndefined()
  })

  it('uno scaduto non blocca quelli buoni dietro di lui', () => {
    const coda = creaCodaLayout(10_000)
    coda.accoda(layout('vecchio'), 1000)
    coda.accoda(layout('fresco'), 19_000)
    expect(coda.preleva(20_000)?.panes[0]?.title).toBe('fresco')
  })

  it('da vuota non consegna niente', () => {
    expect(creaCodaLayout().preleva(1000)).toBeUndefined()
  })
})

describe('a chi tocca il layout in coda', () => {
  it('non lo consegna a una finestra che esisteva gia', () => {
    // Il rischio concreto: fra l'accodamento e l'apertura della finestra nuova,
    // una finestra gia' aperta che si ricarica (Ctrl+R) chiede il proprio
    // layout — e si ritroverebbe dentro le chat destinate all'altra, in doppio.
    const coda = creaCodaLayout()
    coda.accoda(layout('per la nuova'), 1000, [1, 2])
    expect(coda.preleva(1100, 2)).toBeUndefined()
    expect(coda.preleva(1200, 7)).toBeDefined()
  })

  it('senza l elenco delle finestre di allora, consegna a chiunque', () => {
    // La compatibilita' non e' un caso limite: e' cio' che succede quando il
    // layout viene accodato da un percorso che non sa quali finestre c'erano.
    const coda = creaCodaLayout()
    coda.accoda(layout('a chiunque'), 1000)
    expect(coda.preleva(1100, 2)).toBeDefined()
  })

  it('due finestre nuove prendono i due layout nell ordine', () => {
    const coda = creaCodaLayout()
    coda.accoda(layout('prima'), 1000, [1])
    coda.accoda(layout('seconda'), 1000, [1])
    expect(coda.preleva(1100, 5)?.panes[0]?.title).toBe('prima')
    expect(coda.preleva(1100, 6)?.panes[0]?.title).toBe('seconda')
  })
})
