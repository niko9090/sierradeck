import { describe, it, expect } from 'vitest'
import { creaAzioniWorkspace, type AzioniDeps } from '../../src/renderer/workspace-azioni'
import { creaMemoriaWorkspace } from '../../src/renderer/memoria-workspace'
import type { LayoutSalvato } from '@shared/workspace'

function layoutCon(id: string, ptyId?: string): LayoutSalvato {
  return {
    root: { type: 'pane', id },
    panes: [
      {
        id,
        sessionUuid: `u-${id}`,
        cwd: 'C:\\p',
        title: id,
        ...(ptyId !== undefined ? { ptyId } : {})
      }
    ]
  }
}

function ambiente(opts: { nomi?: string[]; attivo?: string; corrente?: LayoutSalvato } = {}) {
  const chiamate: { azione: string; args: unknown[] }[] = []
  const applicati: LayoutSalvato[] = []
  // Il workspace dichiarato dalla finestra **nell'istante** in cui il layout
  // nuovo arriva a schermo. E' quello che la persistenza legge per decidere
  // sotto quale nome salvare, e il salvataggio parte sincrono dentro
  // `cambiaVista`: se qui resta il nome vecchio, il layout nuovo viene scritto
  // sopra le chat del workspace che si sta lasciando.
  const dichiaratoAllaVista: string[] = []
  const uccisi: string[] = []
  const dimenticati: string[] = []
  let nomi = opts.nomi ?? ['Uno']
  // Due cose diverse, ed e' tutto il punto di questo file:
  //  - `attivo` e' l'attivo **dell'archivio**, che il Core cambia rispondendo;
  //  - `dichiarato` e' il workspace che **la finestra dice** di mostrare, cioe'
  //    quello sotto cui la persistenza salva il layout.
  // La risposta del Core non aggiorna il secondo: lo aggiorna solo
  // `annunciaAttivo`. Confonderli nel finto ambiente nasconderebbe il guasto.
  let attivo = opts.attivo ?? 'Uno'
  let dichiarato = attivo
  // Cio' che la destinazione restituisce, per verificare che venga applicato.
  const daRestituire = new Map<string, LayoutSalvato>()
  const memoria = creaMemoriaWorkspace()

  const deps: AzioniDeps = {
    stato: () => Promise.resolve({ nomi, attivo }),
    attivo: () => dichiarato,
    crea: (nome) => {
      chiamate.push({ azione: 'crea', args: [nome] })
      nomi = [...nomi, nome]
      attivo = nome
      return Promise.resolve({ nomi, attivo })
    },
    elimina: (nome) => {
      chiamate.push({ azione: 'elimina', args: [nome] })
      nomi = nomi.filter((n) => n !== nome)
      if (attivo === nome) attivo = nomi[0] ?? attivo
      return Promise.resolve({ nomi, attivo })
    },
    cambia: (nome, layout) => {
      chiamate.push({ azione: 'cambia', args: [nome, layout] })
      attivo = nome
      return Promise.resolve(daRestituire.get(nome) ?? { root: undefined, panes: [] })
    },
    migra: (da, nome, layout) => {
      chiamate.push({ azione: 'migra', args: [da, nome, layout] })
      return Promise.resolve(daRestituire.get(nome) ?? { root: undefined, panes: [] })
    },
    esporta: () => opts.corrente ?? layoutCon('pane-corrente'),
    annunciaAttivo: (nome) => { dichiarato = nome },
    cambiaVista: (l) => {
      dichiaratoAllaVista.push(dichiarato)
      applicati.push(l)
    },
    memoria,
    chiudiTerminali: (id) => { uccisi.push(...id) },
    dimenticaCeduti: (id) => { dimenticati.push(...id) }
  }

  return {
    deps,
    chiamate,
    applicati,
    dichiaratoAllaVista,
    uccisi,
    dimenticati,
    daRestituire,
    memoria,
    stato: () => ({ nomi, attivo })
  }
}

describe('creaAzioniWorkspace — cambia', () => {
  it('manda il layout corrente e applica quello che riceve', async () => {
    const a = ambiente()
    a.daRestituire.set('Due', layoutCon('pane-due'))
    const azioni = creaAzioniWorkspace(a.deps)

    await azioni.cambia('Due')

    expect(a.chiamate).toEqual([
      { azione: 'cambia', args: ['Due', layoutCon('pane-corrente')] }
    ])
    expect(a.applicati).toEqual([layoutCon('pane-due')])
  })

  it('applica anche un layout vuoto, invece di lasciare quello vecchio a schermo', async () => {
    // Senza questo, cambiare verso un workspace mai usato su questo monitor
    // lascerebbe i riquadri del workspace precedente: sembrerebbero suoi, e il
    // primo salvataggio li scriverebbe davvero sotto il nome sbagliato.
    const a = ambiente()
    await creaAzioniWorkspace(a.deps).cambia('Due')
    expect(a.applicati).toEqual([{ root: undefined, panes: [] }])
  })

  it('ricorda il layout che lascia prima di chiedere il cambio', async () => {
    // L'ordine e' il punto: la richiesta al Core attraversa due processi, e una
    // finestra che si chiudesse nel frattempo porterebbe via con se' l'unica
    // copia dei riquadri vivi. Ricordare prima costa niente e non lascia
    // finestre scoperte.
    const a = ambiente({ corrente: layoutCon('pane-vivo', 'pty-1') })
    let memoriaAllaChiamata: LayoutSalvato | undefined
    a.deps.cambia = (nome, layout) => {
      a.chiamate.push({ azione: 'cambia', args: [nome, layout] })
      memoriaAllaChiamata = a.memoria.recupera('Uno', { root: undefined, panes: [] })
      return Promise.resolve({ root: undefined, panes: [] })
    }

    await creaAzioniWorkspace(a.deps).cambia('Due')

    expect(memoriaAllaChiamata).toEqual(layoutCon('pane-vivo', 'pty-1'))
  })

  it('tornando in un workspace gia visitato rimette i riquadri vivi, non quelli del file', async () => {
    // E' il cuore del punto 0-quinquies. Il file conserva i riquadri come erano
    // all'ultimo salvataggio, con `ptyId` che nel frattempo possono essere di
    // terminali gia' morti: ricostruire da li' farebbe ripartire claude.exe e
    // il lavoro in corso — un autopilota a meta' strada — andrebbe perduto.
    const a = ambiente({ corrente: layoutCon('pane-vivo', 'pty-1') })
    a.daRestituire.set('Due', { root: undefined, panes: [] })
    a.daRestituire.set('Uno', layoutCon('pane-dal-file'))
    const azioni = creaAzioniWorkspace(a.deps)

    await azioni.cambia('Due')
    await azioni.cambia('Uno')

    expect(a.applicati[1]).toEqual(layoutCon('pane-vivo', 'pty-1'))
  })
})

describe('creaAzioniWorkspace — crea', () => {
  it('crea e poi migra il layout corrente dal workspace che lascia', async () => {
    const a = ambiente({ nomi: ['Uno'], attivo: 'Uno' })
    const stato = await creaAzioniWorkspace(a.deps).crea('Due')

    expect(a.chiamate.map((c) => c.azione)).toEqual(['crea', 'migra'])
    // La migrazione nomina il workspace lasciato: creare rende attivo il nuovo,
    // quindi senza il nome esplicito il layout finirebbe sopra la destinazione.
    expect(a.chiamate[1]?.args).toEqual(['Uno', 'Due', layoutCon('pane-corrente')])
    expect(a.applicati).toEqual([{ root: undefined, panes: [] }])
    expect(stato).toEqual({ nomi: ['Uno', 'Due'], attivo: 'Due' })
  })

  it('non migra se il workspace attivo non e cambiato', async () => {
    const a = ambiente({ nomi: ['Uno'], attivo: 'Uno' })
    // `crea` finto che rifiuta il duplicato lasciando l'attivo dov'era.
    a.deps.crea = (nome) => {
      a.chiamate.push({ azione: 'crea', args: [nome] })
      return Promise.resolve({ nomi: ['Uno'], attivo: 'Uno' })
    }
    await creaAzioniWorkspace(a.deps).crea('Uno')
    expect(a.chiamate.map((c) => c.azione)).toEqual(['crea'])
    expect(a.applicati).toEqual([])
  })
})

describe('creaAzioniWorkspace — elimina', () => {
  it('elimina e carica il layout del workspace che diventa attivo', async () => {
    const a = ambiente({ nomi: ['Uno', 'Due'], attivo: 'Uno' })
    a.daRestituire.set('Due', layoutCon('pane-due'))

    const stato = await creaAzioniWorkspace(a.deps).elimina('Uno')

    expect(a.chiamate.map((c) => c.azione)).toEqual(['elimina', 'migra'])
    expect(a.applicati).toEqual([layoutCon('pane-due')])
    expect(stato.attivo).toBe('Due')
  })

  it('eliminare un workspace che non e l attivo non tocca il layout a schermo', () => {
    const a = ambiente({ nomi: ['Uno', 'Due'], attivo: 'Uno' })
    return creaAzioniWorkspace(a.deps).elimina('Due').then(() => {
      expect(a.chiamate.map((c) => c.azione)).toEqual(['elimina'])
      expect(a.applicati).toEqual([])
    })
  })

  it('eliminare un workspace acceso ne chiude i terminali', async () => {
    // Un workspace eliminato non esiste piu': se i suoi claude.exe restassero
    // vivi non ci sarebbe piu' nessuna vista da cui raggiungerli, ne' un tasto
    // «spegni» da premere. Sarebbero processi immortali.
    const a = ambiente({ nomi: ['Uno', 'Due'], attivo: 'Uno' })
    a.memoria.ricorda('Due', layoutCon('pane-due', 'pty-2'))

    await creaAzioniWorkspace(a.deps).elimina('Due')

    expect(a.uccisi).toEqual(['pty-2'])
    expect(a.memoria.acceso('Due')).toBe(false)
  })
})

describe('creaAzioniWorkspace — segui', () => {
  it('salva sotto il workspace lasciato e applica quello nuovo', async () => {
    const a = ambiente({ nomi: ['Uno', 'Due'], attivo: 'Due' })
    a.daRestituire.set('Due', layoutCon('pane-due'))

    await creaAzioniWorkspace(a.deps).segui('Uno', 'Due')

    expect(a.chiamate).toEqual([
      { azione: 'migra', args: ['Uno', 'Due', layoutCon('pane-corrente')] }
    ])
    expect(a.applicati).toEqual([layoutCon('pane-due')])
  })

  it('non fa niente se il workspace lasciato e gia quello nuovo', async () => {
    // Succede quando l'annuncio arriva per un'operazione che non ha spostato
    // l'attivo: rifarlo riscriverebbe il layout su se stesso senza motivo.
    const a = ambiente()
    await creaAzioniWorkspace(a.deps).segui('Uno', 'Uno')
    expect(a.chiamate).toEqual([])
    expect(a.applicati).toEqual([])
  })

  it('con la preferenza accesa, traslocare manda a dormire le chat che lascia', async () => {
    // `segui`/`crea`/`elimina` passano tutti da `trasloca`: prima l'interruttore
    // «manda a dormire le chat che lasci» non aveva effetto su nessuna di queste
    // strade, solo su `cambia`. Ora vale anche qui.
    const a = ambiente({ nomi: ['Uno', 'Due'], attivo: 'Uno' })
    const deps = { ...a.deps, ibernaLasciando: () => true, ibernaTutte: () => ['pty-x', 'pty-y'] }
    await creaAzioniWorkspace(deps).segui('Uno', 'Due')
    expect(a.uccisi).toEqual(['pty-x', 'pty-y'])
  })
})

describe('creaAzioniWorkspace — spegni', () => {
  it('chiude i terminali del workspace in secondo piano e lo dimentica', async () => {
    // E' l'unico modo di liberare le risorse ora che cambiare vista non uccide
    // piu' niente: senza questo comando, i claude.exe di un workspace che non
    // si guarda piu' resterebbero vivi fino alla chiusura del programma.
    const a = ambiente({ nomi: ['Uno', 'Due'], attivo: 'Uno', corrente: layoutCon('pane-vivo', 'pty-1') })
    const azioni = creaAzioniWorkspace(a.deps)
    await azioni.cambia('Due')

    expect(azioni.acceso('Uno')).toBe(true)
    expect(azioni.spegni('Uno')).toBe(1)

    expect(a.uccisi).toEqual(['pty-1'])
    expect(azioni.acceso('Uno')).toBe(false)
  })

  it('toglie dai ceduti i riquadri spenti', () => {
    // Quei terminali sono chiusi davvero: lasciarli fra i ceduti li terrebbe
    // marcati come «in viaggio verso un'altra vista», e l'insieme crescerebbe
    // per tutta la sessione senza che nessuno lo svuoti.
    const a = ambiente({ nomi: ['Uno', 'Due'], attivo: 'Due' })
    a.memoria.ricorda('Uno', layoutCon('pane-a', 'pty-1'))

    creaAzioniWorkspace(a.deps).spegni('Uno')

    expect(a.dimenticati).toEqual(['pane-a'])
  })

  it('spegnere un workspace mai acceso non chiude niente', () => {
    // Un workspace solo salvato su disco non occupa risorse in questa finestra:
    // fingere di spegnerlo manderebbe al Core degli id di terminali inventati.
    const a = ambiente({ nomi: ['Uno', 'Due'], attivo: 'Due' })
    expect(creaAzioniWorkspace(a.deps).spegni('Uno')).toBe(0)
    expect(a.uccisi).toEqual([])
  })

  it('rifiuta di spegnere il workspace in primo piano, dicendo perche', () => {
    // I suoi riquadri sono a schermo: toglierli dalla vista e insieme chiuderne
    // i processi sono due gesti diversi, e confonderli qui vorrebbe dire
    // svuotare il layout salvato senza che nessuno l'abbia chiesto.
    const a = ambiente({ nomi: ['Uno', 'Due'], attivo: 'Uno' })
    expect(() => creaAzioniWorkspace(a.deps).spegni('Uno')).toThrow(/primo piano/)
  })
})

describe('creaAzioniWorkspace — dove si trova la finestra, quando il layout cambia', () => {
  // La radice del guasto «creo o cambio workspace e le chat spariscono».
  //
  // `cambiaVista` fa un `set` sullo store, zustand avvisa i sottoscritti nello
  // stesso istante e la persistenza manda subito `layout:salva(layout, nome)`.
  // Finché quel nome veniva dallo stato di React — aggiornato solo *dopo* che
  // la promessa rientrava — il Core riceveva «il layout di B, salvalo sotto A»
  // e obbediva: A si ritrovava le chat di B (o si svuotava, creando), e
  // l'invariante «una chat, un workspace» le toglieva a B. Dopo un riavvio non
  // c'erano più.

  it('cambiando, la finestra dichiara il workspace nuovo prima di mostrarlo', async () => {
    const a = ambiente()
    a.daRestituire.set('Due', layoutCon('pane-due'))
    await creaAzioniWorkspace(a.deps).cambia('Due')
    expect(a.dichiaratoAllaVista).toEqual(['Due'])
  })

  it('creando, la finestra dichiara il workspace nuovo prima di svuotare lo schermo', async () => {
    // Il caso peggiore: il layout della destinazione è vuoto, quindi il
    // salvataggio col nome vecchio **azzerava** il workspace che si lasciava.
    const a = ambiente()
    await creaAzioniWorkspace(a.deps).crea('Due')
    expect(a.applicati).toEqual([{ root: undefined, panes: [] }])
    expect(a.dichiaratoAllaVista).toEqual(['Due'])
  })

  it('seguendo il cambio di un altra finestra, dichiara la destinazione prima di mostrarla', async () => {
    const a = ambiente({ nomi: ['Uno', 'Due'] })
    a.daRestituire.set('Due', layoutCon('pane-due'))
    await creaAzioniWorkspace(a.deps).segui('Uno', 'Due')
    expect(a.dichiaratoAllaVista).toEqual(['Due'])
  })

  it('eliminando quello davanti, dichiara quello che resta prima di mostrarlo', async () => {
    const a = ambiente({ nomi: ['Uno', 'Due'], attivo: 'Due' })
    a.daRestituire.set('Uno', layoutCon('pane-uno'))
    await creaAzioniWorkspace(a.deps).elimina('Due')
    expect(a.dichiaratoAllaVista).toEqual(['Uno'])
  })
})

describe('creaAzioniWorkspace — da dove si parte', () => {
  it('crea: parte dal workspace di questa finestra, non dall attivo dell archivio', async () => {
    // Con due finestre su workspace diversi, l'attivo dell'archivio e' quello
    // dell'**altra**: partendo da li' il layout di questa finestra verrebbe
    // salvato sopra le chat di un workspace che non sta guardando.
    const a = ambiente({ nomi: ['Uno', 'Due'], attivo: 'Due' })
    a.deps.attivo = () => 'Uno'
    await creaAzioniWorkspace(a.deps).crea('Tre')
    const migra = a.chiamate.find((c) => c.azione === 'migra')
    expect(migra?.args[0]).toBe('Uno')
  })

  it('crea: se la finestra non sa ancora dove si trova, ripiega sull archivio', async () => {
    const a = ambiente({ nomi: ['Uno'], attivo: 'Uno' })
    a.deps.attivo = () => ''
    await creaAzioniWorkspace(a.deps).crea('Due')
    const migra = a.chiamate.find((c) => c.azione === 'migra')
    expect(migra?.args[0]).toBe('Uno')
  })
})
