import { describe, it, expect } from 'vitest'
import { passoDi } from '../../src/renderer/preparazione-vista'

const CLAUDE = 'C:\\Users\\tizio\\.local\\bin\\claude.exe'

describe('passoDi', () => {
  it('senza Claude Code il passo e installarlo', () => {
    expect(passoDi({ avvisi: [] }, { autenticato: false })).toBe('installa')
  })

  it('l accesso non compare finche il programma non c e', () => {
    // Premere «accedi» senza il programma non puo' che fallire, e un tasto che
    // fallisce sempre fa credere rotto cio' che e' soltanto mancante.
    expect(passoDi({ avvisi: [] }, { autenticato: false })).not.toBe('accedi')
  })

  it('installato ma senza accesso, il passo e accedere', () => {
    expect(passoDi({ claude: CLAUDE, avvisi: [] }, { autenticato: false })).toBe('accedi')
  })

  it('con tutto a posto non resta niente da fare', () => {
    expect(passoDi({ claude: CLAUDE, avvisi: [] }, { autenticato: true })).toBe('pronto')
  })

  it('gli avvisi di sistema non fermano nessuno', () => {
    // Node.js e Git non impediscono di aprire una chat: se bloccassero il
    // passo, chi non li ha resterebbe fermo davanti a una finestra che non ha
    // niente da proporgli.
    expect(passoDi({ claude: CLAUDE, avvisi: ['manca Node.js'] }, { autenticato: true })).toBe('pronto')
  })

  it('finche il Core non ha risposto non si dichiara mancante niente', () => {
    // Lo stato arriva con un giro di IPC: nell'istante prima, una finestra che
    // dice «installa Claude Code» comparirebbe a ogni avvio e sparirebbe da
    // sola. Meglio tacere.
    expect(passoDi(undefined, { autenticato: true })).toBe('pronto')
  })
})
