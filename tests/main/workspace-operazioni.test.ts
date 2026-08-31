import { describe, it, expect } from 'vitest'
import {
  creaWorkspace,
  eliminaWorkspace,
  rinominaWorkspace,
  cambiaWorkspace,
  esitoDelSalvataggio,
  salvaLayoutIn,
  seguiAttivoDellaPrincipale
} from '../../src/main/workspace-operazioni'
import { archivioVuoto, NOME_PREDEFINITO, type Archivio, type LayoutSalvato } from '@shared/workspace'

const M = '1'

function layoutCon(id: string): LayoutSalvato {
  return {
    root: { type: 'pane', id },
    panes: [{ id, sessionUuid: `u-${id}`, cwd: 'C:\\p', title: id }]
  }
}

function conSessione(id: string, sessione: string): LayoutSalvato {
  return {
    root: { type: 'pane', id },
    panes: [{ id, sessionUuid: sessione, cwd: 'C:\\p', title: 'Chat' }]
  }
}

function archivioCon(nomi: string[], attivo = nomi[0]!): Archivio {
  return { ...archivioVuoto(), attivo, workspace: nomi.map((nome) => ({ nome, perSlot: {} })) }
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
      workspace: [{ nome: 'Uno', perSlot: { [M]: layoutCon('pane-a') } }]
    }
    const dopo = rinominaWorkspace(prima, 'Uno', 'Lavoro')
    expect(dopo.workspace.map((w) => w.nome)).toEqual(['Lavoro'])
    // Le chat non si toccano: stesso layout, sotto il nome nuovo.
    expect(dopo.workspace[0]?.perSlot[M]?.panes[0]?.id).toBe('pane-a')
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
    expect(uno?.perSlot[M]?.panes[0]?.id).toBe('pane-a')
  })

  it('restituisce il layout del workspace di destinazione per quel monitor', () => {
    const prima: Archivio = {
      ...archivioVuoto(),
      attivo: 'Uno',
      workspace: [
        { nome: 'Uno', perSlot: {} },
        { nome: 'Due', perSlot: { [M]: layoutCon('pane-b') } }
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
    expect(archivio.workspace[0]?.perSlot[M]?.panes[0]?.id).toBe('pane-a')
  })

  it('non tocca i layout degli altri monitor del workspace che si lascia', () => {
    // Ogni finestra cambia workspace per conto proprio ma l'archivio e' uno
    // solo: scrivere l'intera mappa perSlot invece della sola chiave di
    // questa finestra cancellerebbe il layout dell'altro monitor.
    const prima: Archivio = {
      ...archivioVuoto(),
      attivo: 'Uno',
      workspace: [
        { nome: 'Uno', perSlot: { 'monitor-2': layoutCon('pane-altro') } },
        { nome: 'Due', perSlot: {} }
      ]
    }
    const { archivio } = cambiaWorkspace(prima, 'Due', M, layoutCon('pane-a'))
    const uno = archivio.workspace.find((w) => w.nome === 'Uno')
    expect(uno?.perSlot['monitor-2']?.panes[0]?.id).toBe('pane-altro')
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
    expect(archivio.workspace.find((w) => w.nome === 'Uno')?.perSlot[M]?.panes[0]?.id)
      .toBe('pane-a')
    expect(archivio.workspace.find((w) => w.nome === 'Due')?.perSlot[M]).toBeUndefined()
    expect(layout).toEqual({ root: undefined, panes: [] })
  })

  it('ignora un workspace di provenienza inesistente senza perdere la destinazione', () => {
    const prima: Archivio = {
      ...archivioVuoto(),
      attivo: 'Due',
      workspace: [{ nome: 'Due', perSlot: { [M]: layoutCon('pane-b') } }]
    }
    const { archivio, layout } = cambiaWorkspace(prima, 'Due', M, layoutCon('pane-a'), 'Sparito')
    expect(layout.panes[0]?.id).toBe('pane-b')
    expect(archivio.workspace).toHaveLength(1)
  })
})

describe('salvaLayoutIn', () => {
  // Il workspace non e' piu' una dichiarazione della finestra da soppesare:
  // arriva dalla ricevuta della consegna, cioe' dal Core, che si ricorda quale
  // layout ha dato a chi e per quale workspace. Con l'euristica sono spariti
  // anche i suoi due rami di prudenza — «nome vuoto» e «nome che non esiste
  // piu'» — perche' non sono piu' raggiungibili: una finestra senza consegna
  // valida non salva affatto.

  it('scrive il layout sotto il workspace nominato, non sotto il primo dell elenco', () => {
    const prima = archivioCon(['Uno', 'Due'], 'Due')
    const dopo = salvaLayoutIn(prima, 'Due', M, layoutCon('pane-a'))
    expect(dopo.workspace.find((w) => w.nome === 'Due')?.perSlot[M]?.panes[0]?.id).toBe('pane-a')
    expect(dopo.workspace.find((w) => w.nome === 'Uno')?.perSlot[M]).toBeUndefined()
  })

  it('scrive sotto il workspace della consegna, non sotto l attivo dell archivio', () => {
    // Il difetto vero: la finestra mostra 'Uno' mentre per l'archivio l'attivo
    // e' gia' 'Due' — una gara a ogni cambio, e molto di piu' al riavvio dopo un
    // aggiornamento. Il layout di 'Uno' finiva sotto 'Due', riscrivendone le
    // chat: «ha messo la chat di Wdeck in Predefinito».
    const prima = archivioCon(['Uno', 'Due'], 'Due')
    const dopo = salvaLayoutIn(prima, 'Uno', M, layoutCon('pane-a'))
    expect(dopo.workspace.find((w) => w.nome === 'Uno')?.perSlot[M]?.panes[0]?.id).toBe('pane-a')
    expect(dopo.workspace.find((w) => w.nome === 'Due')?.perSlot[M]).toBeUndefined()
  })

  it('crea il workspace se nell archivio non c e ancora', () => {
    // Al primo avvio l'archivio e' vuoto ma `attivo` vale «Predefinito»: senza
    // questo ramo il primo salvataggio non troverebbe dove scrivere e le chat
    // della prima sessione andrebbero perdute.
    const dopo = salvaLayoutIn(archivioVuoto(), NOME_PREDEFINITO, M, layoutCon('pane-a'))
    expect(dopo.workspace.map((w) => w.nome)).toEqual([NOME_PREDEFINITO])
    expect(dopo.workspace[0]?.perSlot[M]?.panes[0]?.id).toBe('pane-a')
  })

  it('lascia intatta la disposizione degli altri slot dello stesso workspace', () => {
    // Due finestre condividono un archivio e salvano ognuna il proprio slot:
    // riscrivere `perSlot` per intero cancellerebbe le chat dell'altra finestra
    // a ogni salvataggio di questa.
    const prima: Archivio = {
      ...archivioVuoto(),
      attivo: 'Uno',
      workspace: [{ nome: 'Uno', perSlot: { '2': layoutCon('pane-altro') } }]
    }
    const dopo = salvaLayoutIn(prima, 'Uno', M, layoutCon('pane-a'))
    expect(dopo.workspace[0]?.perSlot['2']?.panes[0]?.id).toBe('pane-altro')
  })

  it('non muta l archivio ricevuto', () => {
    const originale = archivioCon(['Uno', 'Due'], 'Uno')
    const copia = structuredClone(originale)
    salvaLayoutIn(originale, 'Uno', M, layoutCon('pane-a'))
    expect(originale).toEqual(copia)
  })

  it('toglie la stessa chat dagli altri workspace: una chat, un workspace', () => {
    // La radice dei «workspace incrociati»: la stessa conversazione (stesso
    // sessionUuid) risulta in due workspace. Salvandola in quello che si ha
    // davanti, deve sparire dall'altro invece di restare a comparire di la'.
    const prima: Archivio = {
      ...archivioVuoto(),
      attivo: 'Uno',
      workspace: [
        { nome: 'Uno', perSlot: {} },
        { nome: 'Due', perSlot: { [M]: conSessione('p1', 'sess-condivisa') } }
      ]
    }
    const dopo = salvaLayoutIn(prima, 'Uno', M, conSessione('p2', 'sess-condivisa'))
    expect(dopo.workspace.find((w) => w.nome === 'Uno')?.perSlot[M]?.panes[0]?.sessionUuid)
      .toBe('sess-condivisa')
    expect(dopo.workspace.find((w) => w.nome === 'Due')?.perSlot[M]?.panes ?? []).toHaveLength(0)
  })

  it('la stessa chat non resta in due slot dello stesso workspace', () => {
    // Due finestre sullo stesso workspace: se la stessa conversazione finisse in
    // tutti e due gli slot, al riavvio comparirebbe due volte — due riquadri,
    // due claude.exe, due --resume sulla stessa conversazione.
    const prima: Archivio = {
      ...archivioVuoto(),
      attivo: 'Uno',
      workspace: [{ nome: 'Uno', perSlot: { '2': conSessione('p1', 'sess-condivisa') } }]
    }
    const dopo = salvaLayoutIn(prima, 'Uno', '1', conSessione('p2', 'sess-condivisa'))
    expect((dopo.workspace[0]?.perSlot['1']?.panes ?? []).map((p) => p.sessionUuid))
      .toEqual(['sess-condivisa'])
    expect(dopo.workspace[0]?.perSlot['2']?.panes ?? []).toHaveLength(0)
  })

  it('a vincere e lo slot che si sta scrivendo, non quello col numero piu basso', () => {
    // Il gemello del test qui sopra, visto dalla seconda finestra. Lasciando
    // decidere all'ordine delle chiavi, JavaScript ordina i numeri in modo
    // crescente e vincerebbe **sempre** lo slot 1: la seconda finestra si
    // vedrebbe strappare via, a ogni salvataggio, la chat che ha davanti.
    const prima: Archivio = {
      ...archivioVuoto(),
      attivo: 'Uno',
      workspace: [{ nome: 'Uno', perSlot: { '1': conSessione('p1', 'sess-condivisa') } }]
    }
    const dopo = salvaLayoutIn(prima, 'Uno', '2', conSessione('p2', 'sess-condivisa'))
    expect((dopo.workspace[0]?.perSlot['2']?.panes ?? []).map((p) => p.sessionUuid))
      .toEqual(['sess-condivisa'])
    expect(dopo.workspace[0]?.perSlot['1']?.panes ?? []).toHaveLength(0)
  })

  it('NON tocca una chat di un altro workspace quando salvo un layout che non la contiene', () => {
    // Uno spostamento mette per un istante la chat in due workspace, e un dedup
    // cieco potrebbe strapparla via. Il dedup guarda il layout che si sta
    // salvando: se la chat non e' in questo layout, non viene toccata da nessuna
    // parte. E' cio' che rende sicuro lo spostamento.
    const prima: Archivio = {
      ...archivioVuoto(),
      attivo: 'Sorgente',
      workspace: [
        { nome: 'Sorgente', perSlot: {} },
        { nome: 'Destinazione', perSlot: { [M]: conSessione('p-x', 'sess-mossa') } }
      ]
    }
    const dopo = salvaLayoutIn(prima, 'Sorgente', M, layoutCon('pane-altra'))
    expect(dopo.workspace.find((w) => w.nome === 'Destinazione')?.perSlot[M]?.panes[0]?.sessionUuid)
      .toBe('sess-mossa')
  })
})

describe('seguiAttivoDellaPrincipale', () => {
  it('porta attivo sul workspace che la finestra principale dichiara (difetto A)', () => {
    // Eri su «Wdeck» e l'aggiornamento ha riavviato: senza far seguire attivo alla
    // finestra principale, al riavvio riaprivi «SierraDeck» (il vecchio attivo).
    const prima = archivioCon(['SierraDeck', 'Wdeck'], 'SierraDeck')
    const dopo = seguiAttivoDellaPrincipale(prima, 'Wdeck')
    expect(dopo.attivo).toBe('Wdeck')
  })

  it('non tocca attivo se il nome e vuoto (avvio, finestra che non sa ancora il suo workspace)', () => {
    const prima = archivioCon(['SierraDeck', 'Wdeck'], 'SierraDeck')
    expect(seguiAttivoDellaPrincipale(prima, '').attivo).toBe('SierraDeck')
  })

  it('non tocca attivo se il workspace dichiarato non esiste', () => {
    const prima = archivioCon(['SierraDeck', 'Wdeck'], 'SierraDeck')
    expect(seguiAttivoDellaPrincipale(prima, 'Sparito').attivo).toBe('SierraDeck')
  })

  it('e identita quando il nome coincide gia con attivo', () => {
    const prima = archivioCon(['SierraDeck', 'Wdeck'], 'Wdeck')
    expect(seguiAttivoDellaPrincipale(prima, 'Wdeck')).toBe(prima)
  })

  it('non muta l archivio ricevuto', () => {
    const originale = archivioCon(['Uno', 'Due'], 'Uno')
    const copia = structuredClone(originale)
    seguiAttivoDellaPrincipale(originale, 'Due')
    expect(originale).toEqual(copia)
  })
})

describe('esitoDelSalvataggio — una chat esce solo se qualcuno l’ha congedata', () => {
  const conChat = (nome: string, chiave: string, sessioni: string[]): Archivio['workspace'][number] => ({
    nome,
    perSlot: {
      [chiave]: {
        root: { type: 'pane', id: `p-${sessioni[0] ?? 'x'}` },
        panes: sessioni.map((u) => ({
          id: `p-${u}`, sessionUuid: u, cwd: 'C:\p', title: u
        }))
      }
    }
  })

  const archivio = (ws: Archivio['workspace']): Archivio => ({
    versione: 1, attivo: ws[0]?.nome ?? NOME_PREDEFINITO, workspace: ws
  })

  it('una chiusura dichiarata passa', () => {
    const prima = archivio([conChat('A', M, ['u1', 'u2'])])
    const dopo = archivio([conChat('A', M, ['u1'])])
    const e = esitoDelSalvataggio(prima, dopo, ['u2'])
    expect(e.sparite.map((x) => x.sessione)).toEqual(['u2'])
    expect(e.perse).toEqual([])
  })

  it('una sparizione che nessuno ha chiesto si rifiuta', () => {
    // È il guasto costato tre volte una giornata di lavoro: la finestra manda
    // un layout senza una chat che nessuno ha chiuso — due finestre che al
    // riavvio risolvono alla stessa chiave di monitor e si sovrascrivono — e il
    // Core obbediva.
    const prima = archivio([conChat('A', M, ['u1', 'u2'])])
    const dopo = archivio([conChat('A', M, ['u1'])])
    const e = esitoDelSalvataggio(prima, dopo, [])
    expect(e.perse.map((x) => x.sessione)).toEqual(['u2'])
    expect(e.perse[0]?.dove).toBe('A')
  })

  it('un trasloco fra workspace non è una perdita', () => {
    // Spostare una chat da un workspace all'altro è il gesto più normale che
    // ci sia: il registro che gridava anche per questo non si leggeva più.
    const prima = archivio([conChat('A', M, ['u1']), conChat('B', M, [])])
    const dopo = archivio([conChat('A', M, []), conChat('B', M, ['u1'])])
    const e = esitoDelSalvataggio(prima, dopo, [])
    expect(e.perse).toEqual([])
    expect(e.sparite).toEqual([])
    expect(e.traslochi).toEqual([{ sessione: 'u1', da: 'A', a: 'B' }])
  })

  it('aprire una chat nuova non disturba nessuno', () => {
    const prima = archivio([conChat('A', M, ['u1'])])
    const dopo = archivio([conChat('A', M, ['u1', 'u3'])])
    expect(esitoDelSalvataggio(prima, dopo, []).perse).toEqual([])
  })
})
