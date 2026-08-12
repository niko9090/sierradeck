import { describe, it, expect } from 'vitest'
import {
  creaMemoriaWorkspace,
  terminaliDi
} from '../../src/renderer/memoria-workspace'
import type { LayoutSalvato } from '@shared/workspace'

const VUOTO: LayoutSalvato = { root: undefined, panes: [] }

function layoutCon(id: string, ptyId?: string): LayoutSalvato {
  return {
    root: { type: 'pane', id },
    panes: [
      { id, sessionUuid: `u-${id}`, cwd: 'C:\\p', title: id, ...(ptyId !== undefined ? { ptyId } : {}) }
    ]
  }
}

describe('memoria dei workspace', () => {
  it('un workspace mai visitato prende il layout dal disco', () => {
    // Il primo passaggio in un workspace non ha niente in memoria: l'unica
    // sorgente e' il file. Senza questo, i layout salvati ieri sera non si
    // riaprirebbero piu'.
    const m = creaMemoriaWorkspace()
    expect(m.recupera('Casa', layoutCon('pane-a'))).toEqual(layoutCon('pane-a'))
  })

  it('un workspace gia visitato torna dalla memoria, non dal disco', () => {
    // È il cuore del punto: la copia in memoria conserva i `ptyId` dei terminali
    // rimasti vivi. Ricostruendo dal file si riaggancerebbero a id morti — o si
    // rilancerebbe claude.exe — e cambiare vista tornerebbe a costare una
    // sessione di lavoro.
    const m = creaMemoriaWorkspace()
    m.ricorda('Casa', layoutCon('pane-a', 'pty-1'))
    expect(m.recupera('Casa', layoutCon('pane-vecchio'))).toEqual(layoutCon('pane-a', 'pty-1'))
  })

  it('anche un workspace ricordato vuoto vince sul disco', () => {
    // Chi ha appena chiuso l'ultima chat di un workspace non deve ritrovarsela
    // al ritorno: la memoria e' la verita' della sessione in corso, il file e'
    // solo quel che c'era all'avvio.
    const m = creaMemoriaWorkspace()
    m.ricorda('Casa', VUOTO)
    expect(m.recupera('Casa', layoutCon('pane-vecchio'))).toEqual(VUOTO)
  })

  it('ricordare due volte tiene l ultima disposizione', () => {
    const m = creaMemoriaWorkspace()
    m.ricorda('Casa', layoutCon('pane-a', 'pty-1'))
    m.ricorda('Casa', layoutCon('pane-b', 'pty-2'))
    expect(m.recupera('Casa', VUOTO)).toEqual(layoutCon('pane-b', 'pty-2'))
  })

  it('acceso distingue un workspace tenuto vivo da uno solo salvato', () => {
    // Il tasto «spegni» esiste solo per i workspace che occupano davvero
    // risorse: mostrarlo su uno mai aperto prometterebbe un effetto che non c'e'.
    const m = creaMemoriaWorkspace()
    expect(m.acceso('Casa')).toBe(false)
    m.ricorda('Casa', layoutCon('pane-a', 'pty-1'))
    expect(m.acceso('Casa')).toBe(true)
  })

  it('spegnere restituisce il layout che teneva vivo e lo dimentica', () => {
    // Restituirlo e' l'unico modo che il chiamante ha di sapere quali terminali
    // chiudere; dimenticarlo e' cio' che rende lo spegnimento definitivo — al
    // ritorno si riparte dal file, con claude.exe da rilanciare.
    const m = creaMemoriaWorkspace()
    m.ricorda('Casa', layoutCon('pane-a', 'pty-1'))
    expect(m.spegni('Casa')).toEqual(layoutCon('pane-a', 'pty-1'))
    expect(m.acceso('Casa')).toBe(false)
    expect(m.recupera('Casa', layoutCon('pane-dal-disco'))).toEqual(layoutCon('pane-dal-disco'))
  })

  it('spegnere un workspace mai acceso non restituisce niente', () => {
    // Senza questo, chi spegne due volte chiuderebbe la seconda volta dei
    // terminali che nel frattempo appartengono a qualcun altro.
    const m = creaMemoriaWorkspace()
    expect(m.spegni('Casa')).toBeUndefined()
  })

  it('due workspace non si confondono', () => {
    const m = creaMemoriaWorkspace()
    m.ricorda('Casa', layoutCon('pane-a', 'pty-1'))
    m.ricorda('Lavoro', layoutCon('pane-b', 'pty-2'))
    m.spegni('Casa')
    expect(m.recupera('Lavoro', VUOTO)).toEqual(layoutCon('pane-b', 'pty-2'))
  })
})

describe('terminaliDi', () => {
  it('elenca i terminali avviati di un layout', () => {
    expect(terminaliDi(layoutCon('pane-a', 'pty-1'))).toEqual(['pty-1'])
  })

  it('salta i riquadri senza terminale avviato', () => {
    // Un riquadro senza `ptyId` non ha ancora un processo: chiederne la
    // chiusura manderebbe al Core un id inventato, e l'errore comparirebbe
    // all'utente al posto dello spegnimento riuscito.
    expect(terminaliDi(layoutCon('pane-a'))).toEqual([])
  })
})
