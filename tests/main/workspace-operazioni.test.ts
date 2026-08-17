import { describe, it, expect } from 'vitest'
import {
  creaWorkspace,
  eliminaWorkspace,
  rinominaWorkspace,
  cambiaWorkspace,
  salvaLayoutAttivo
} from '../../src/main/workspace-operazioni'
import { archivioVuoto, NOME_PREDEFINITO, type Archivio, type LayoutSalvato } from '@shared/workspace'

const M = 'monitor-1'

function layoutCon(id: string): LayoutSalvato {
  return {
    root: { type: 'pane', id },
    panes: [{ id, sessionUuid: `u-${id}`, cwd: 'C:\\p', title: id }]
  }
}

function archivioCon(nomi: string[], attivo = nomi[0]!): Archivio {
  return { ...archivioVuoto(), attivo, workspace: nomi.map((nome) => ({ nome, perMonitor: {} })) }
}

describe('creaWorkspace', () => {
  it('aggiunge un workspace vuoto e lo rende attivo', () => {
    const a = creaWorkspace(archivioVuoto(), 'Lavoro')
    expect(a.workspace.map((w) => w.nome)).toEqual(['Lavoro'])
    expect(a.attivo).toBe('Lavoro')
  })

  it('non duplica un nome gia esistente', () => {
    const a = creaWorkspace(archivioCon(['Lavoro']), 'Lavoro')
    expect(a.workspace).toHaveLength(1)
  })

  it('non muta l archivio ricevuto', () => {
    const originale = archivioCon(['Uno'])
    const copia = structuredClone(originale)
    creaWorkspace(originale, 'Due')
    expect(originale).toEqual(copia)
  })
})

describe('eliminaWorkspace', () => {
  it('rimuove il workspace e sposta attivo su un altro', () => {
    const a = eliminaWorkspace(archivioCon(['Uno', 'Due'], 'Uno'), 'Uno')
    expect(a.workspace.map((w) => w.nome)).toEqual(['Due'])
    expect(a.attivo).toBe('Due')
  })

  it('rifiuta di eliminare l ultimo workspace', () => {
    // Restare senza workspace significherebbe non avere dove salvare il layout,
    // e il salvataggio successivo ne creerebbe uno con un nome inventato.
    const prima = archivioCon(['Solo'])
    expect(eliminaWorkspace(prima, 'Solo')).toEqual(prima)
  })

  it('ignora un nome inesistente', () => {
    const prima = archivioCon(['Uno', 'Due'])
    expect(eliminaWorkspace(prima, 'Tre')).toEqual(prima)
  })
})

describe('rinominaWorkspace', () => {
  it('cambia il nome conservando il layout', () => {
    const prima: Archivio = {
      ...archivioVuoto(),
      attivo: 'Uno',
      workspace: [{ nome: 'Uno', perMonitor: { [M]: layoutCon('pane-a') } }]
    }
    const dopo = rinominaWorkspace(prima, 'Uno', 'Lavoro')
    expect(dopo.workspace.map((w) => w.nome)).toEqual(['Lavoro'])
    // Le chat non si toccano: stesso layout, sotto il nome nuovo.
    expect(dopo.workspace[0]?.perMonitor[M]?.panes[0]?.id).toBe('pane-a')
  })

  it('sposta anche l attivo se era quello rinominato', () => {
    const dopo = rinominaWorkspace(archivioCon(['Uno', 'Due'], 'Uno'), 'Uno', 'Lavoro')
    expect(dopo.attivo).toBe('Lavoro')
    expect(dopo.workspace.map((w) => w.nome)).toEqual(['Lavoro', 'Due'])
  })

  it('non tocca l attivo se a rinominare e un altro', () => {
    const dopo = rinominaWorkspace(archivioCon(['Uno', 'Due'], 'Uno'), 'Due', 'Casa')
    expect(dopo.attivo).toBe('Uno')
  })

  it('rifiuta un nome gia in uso: due omonimi sarebbero indistinguibili', () => {
    const prima = archivioCon(['Uno', 'Due'], 'Uno')
    expect(rinominaWorkspace(prima, 'Uno', 'Due')).toBe(prima)
  })

  it('ignora una sorgente inesistente', () => {
    const prima = archivioCon(['Uno'])
    expect(rinominaWorkspace(prima, 'Fantasma', 'Nuovo')).toBe(prima)
  })

  it('un nome uguale o vuoto non cambia niente', () => {
    const prima = archivioCon(['Uno'])
    expect(rinominaWorkspace(prima, 'Uno', 'Uno')).toBe(prima)
    expect(rinominaWorkspace(prima, 'Uno', '   ')).toBe(prima)
  })

  it('non muta l archivio ricevuto', () => {
    const originale = archivioCon(['Uno', 'Due'], 'Uno')
    const copia = structuredClone(originale)
    rinominaWorkspace(originale, 'Uno', 'Lavoro')
    expect(originale).toEqual(copia)
  })
})

describe('cambiaWorkspace', () => {
  it('salva il layout corrente sotto il workspace che si lascia', () => {
    const prima = archivioCon(['Uno', 'Due'], 'Uno')
    const { archivio } = cambiaWorkspace(prima, 'Due', M, layoutCon('pane-a'))
    const uno = archivio.workspace.find((w) => w.nome === 'Uno')
    // La prova che l'ordine e' giusto: senza questo salvataggio, tornare su
    // 'Uno' mostrerebbe un layout vuoto e il lavoro sarebbe perso in silenzio.
    expect(uno?.perMonitor[M]?.panes[0]?.id).toBe('pane-a')
  })

  it('restituisce il layout del workspace di destinazione per quel monitor', () => {
    const prima: Archivio = {
      ...archivioVuoto(),
      attivo: 'Uno',
      workspace: [
        { nome: 'Uno', perMonitor: {} },
        { nome: 'Due', perMonitor: { [M]: layoutCon('pane-b') } }
      ]
    }
    const { archivio, layout } = cambiaWorkspace(prima, 'Due', M, layoutCon('pane-a'))
    expect(archivio.attivo).toBe('Due')
    expect(layout.panes[0]?.id).toBe('pane-b')
  })

  it('restituisce un layout vuoto se la destinazione non conosce quel monitor', () => {
    const { layout } = cambiaWorkspace(archivioCon(['Uno', 'Due'], 'Uno'), 'Due', M, layoutCon('pane-a'))
    expect(layout).toEqual({ root: undefined, panes: [] })
  })

  it('cambiare verso un workspace inesistente non cambia niente', () => {
    const prima = archivioCon(['Uno'])
    const { archivio, layout } = cambiaWorkspace(prima, 'Fantasma', M, layoutCon('pane-a'))
    expect(archivio.attivo).toBe('Uno')
    expect(layout).toEqual({ root: undefined, panes: [] })
  })

  it('cambiare verso il workspace gia attivo salva comunque il layout', () => {
    const { archivio } = cambiaWorkspace(archivioCon(['Uno']), 'Uno', M, layoutCon('pane-a'))
    expect(archivio.workspace[0]?.perMonitor[M]?.panes[0]?.id).toBe('pane-a')
  })

  it('non tocca i layout degli altri monitor del workspace che si lascia', () => {
    // Ogni finestra cambia workspace per conto proprio ma l'archivio e' uno
    // solo: scrivere l'intera mappa perMonitor invece della sola chiave di
    // questa finestra cancellerebbe il layout dell'altro monitor.
    const prima: Archivio = {
      ...archivioVuoto(),
      attivo: 'Uno',
      workspace: [
        { nome: 'Uno', perMonitor: { 'monitor-2': layoutCon('pane-altro') } },
        { nome: 'Due', perMonitor: {} }
      ]
    }
    const { archivio } = cambiaWorkspace(prima, 'Due', M, layoutCon('pane-a'))
    const uno = archivio.workspace.find((w) => w.nome === 'Uno')
    expect(uno?.perMonitor['monitor-2']?.panes[0]?.id).toBe('pane-altro')
  })

  it('non muta l archivio ricevuto', () => {
    const originale = archivioCon(['Uno', 'Due'], 'Uno')
    const copia = structuredClone(originale)
    cambiaWorkspace(originale, 'Due', M, layoutCon('pane-a'))
    expect(originale).toEqual(copia)
  })

  it('salva sotto il workspace nominato quando attivo e gia cambiato', () => {
    // Il caso della seconda finestra, che segue un cambio deciso dalla prima:
    // per lei `attivo` vale gia' 'Due'. Senza `da`, il suo layout di 'Uno'
    // finirebbe sopra quello di 'Due' e sparirebbe senza un errore.
    const gia = archivioCon(['Uno', 'Due'], 'Due')
    const { archivio, layout } = cambiaWorkspace(gia, 'Due', M, layoutCon('pane-a'), 'Uno')
    expect(archivio.workspace.find((w) => w.nome === 'Uno')?.perMonitor[M]?.panes[0]?.id)
      .toBe('pane-a')
    expect(archivio.workspace.find((w) => w.nome === 'Due')?.perMonitor[M]).toBeUndefined()
    expect(layout).toEqual({ root: undefined, panes: [] })
  })

  it('ignora un workspace di provenienza inesistente senza perdere la destinazione', () => {
    const prima: Archivio = {
      ...archivioVuoto(),
      attivo: 'Due',
      workspace: [{ nome: 'Due', perMonitor: { [M]: layoutCon('pane-b') } }]
    }
    const { archivio, layout } = cambiaWorkspace(prima, 'Due', M, layoutCon('pane-a'), 'Sparito')
    expect(layout.panes[0]?.id).toBe('pane-b')
    expect(archivio.workspace).toHaveLength(1)
  })
})

describe('salvaLayoutAttivo', () => {
  it('scrive il layout sotto il workspace attivo, non sotto il primo dell elenco', () => {
    // E' la prova che il punto 0-quater chiedeva per prima: se `layout:salva`
    // non scrivesse davvero sotto `archivio.attivo`, in `workspaces.json` ogni
    // workspace risulterebbe senza riquadri — che e' esattamente il sintomo
    // osservato — e cambiare vista non potrebbe che riportare il vuoto.
    const prima = archivioCon(['Uno', 'Due'], 'Due')
    const dopo = salvaLayoutAttivo(prima, M, layoutCon('pane-a'))
    expect(dopo.workspace.find((w) => w.nome === 'Due')?.perMonitor[M]?.panes[0]?.id).toBe('pane-a')
    expect(dopo.workspace.find((w) => w.nome === 'Uno')?.perMonitor[M]).toBeUndefined()
  })

  it('crea il workspace attivo se nell archivio non c e ancora', () => {
    // Al primo avvio l'archivio e' vuoto ma `attivo` vale «Predefinito»: senza
    // questo ramo il primo salvataggio non troverebbe dove scrivere e le chat
    // della prima sessione andrebbero perdute.
    const dopo = salvaLayoutAttivo(archivioVuoto(), M, layoutCon('pane-a'))
    expect(dopo.workspace.map((w) => w.nome)).toEqual([NOME_PREDEFINITO])
    expect(dopo.workspace[0]?.perMonitor[M]?.panes[0]?.id).toBe('pane-a')
  })

  it('lascia intatti gli altri monitor dello stesso workspace', () => {
    // Le finestre condividono un archivio e salvano ognuna il proprio monitor:
    // riscrivere `perMonitor` per intero cancellerebbe le chat dell'altro
    // schermo a ogni salvataggio di questo.
    const prima: Archivio = {
      ...archivioVuoto(),
      attivo: 'Uno',
      workspace: [{ nome: 'Uno', perMonitor: { 'monitor-2': layoutCon('pane-altro') } }]
    }
    const dopo = salvaLayoutAttivo(prima, M, layoutCon('pane-a'))
    expect(dopo.workspace[0]?.perMonitor['monitor-2']?.panes[0]?.id).toBe('pane-altro')
  })

  it('non muta l archivio ricevuto', () => {
    const originale = archivioCon(['Uno', 'Due'], 'Uno')
    const copia = structuredClone(originale)
    salvaLayoutAttivo(originale, M, layoutCon('pane-a'))
    expect(originale).toEqual(copia)
  })

  it('scrive sotto il workspace della finestra, non sotto l attivo dell archivio', () => {
    // Il difetto vero: la finestra mostra 'Uno' mentre per l'archivio l'attivo
    // e' gia' 'Due' (una race a ogni cambio, e molto di piu' al riavvio dopo un
    // aggiornamento). Senza il nome della finestra, il layout di 'Uno' finiva
    // sotto 'Due', riscrivendone le chat — «ha messo la chat di Wdeck in
    // Predefinito».
    const prima = archivioCon(['Uno', 'Due'], 'Due')
    const dopo = salvaLayoutAttivo(prima, M, layoutCon('pane-a'), 'Uno')
    expect(dopo.workspace.find((w) => w.nome === 'Uno')?.perMonitor[M]?.panes[0]?.id).toBe('pane-a')
    expect(dopo.workspace.find((w) => w.nome === 'Due')?.perMonitor[M]).toBeUndefined()
  })

  it('ripiega sull attivo se il nome della finestra e vuoto', () => {
    const prima = archivioCon(['Uno', 'Due'], 'Due')
    const dopo = salvaLayoutAttivo(prima, M, layoutCon('pane-a'), '   ')
    expect(dopo.workspace.find((w) => w.nome === 'Due')?.perMonitor[M]?.panes[0]?.id).toBe('pane-a')
    expect(dopo.workspace.find((w) => w.nome === 'Uno')?.perMonitor[M]).toBeUndefined()
  })

  it('ripiega sull attivo se il workspace nominato non esiste piu', () => {
    // Un'altra finestra l'ha eliminato o rinominato: scrivere sotto un nome che
    // nell'archivio non c'e' piu' resusciterebbe un workspace cancellato. Meglio
    // l'attivo, che esiste di sicuro.
    const prima = archivioCon(['Uno', 'Due'], 'Due')
    const dopo = salvaLayoutAttivo(prima, M, layoutCon('pane-a'), 'Sparito')
    expect(dopo.workspace.map((w) => w.nome)).toEqual(['Uno', 'Due'])
    expect(dopo.workspace.find((w) => w.nome === 'Due')?.perMonitor[M]?.panes[0]?.id).toBe('pane-a')
  })
})
