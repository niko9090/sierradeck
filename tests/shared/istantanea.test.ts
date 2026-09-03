import { describe, it, expect } from 'vitest'
import {
  parseIstantanee, nuovaIstantanea, distribuisci, daRiavviare, daSalvare, workspaceDaSalvare,
  workspaceDelleFinestre, finestreDaRiaprire, workspaceDopoRipristino,
  contaChat, contaWorkspace, VERSIONE_ISTANTANEE,
  type Istantanea, type FinestraSalvata, type AutopilotaSalvato
} from '@shared/istantanea'
import type { LayoutSalvato, WorkspaceSalvato } from '@shared/workspace'

function layout(id = 'pane-1'): { root: { type: 'pane'; id: string }; panes: { id: string; sessionUuid: string; cwd: string; title: string }[] } {
  return {
    root: { type: 'pane', id },
    panes: [{ id, sessionUuid: 'u-1', cwd: 'C:\\p', title: 'Una chat' }]
  }
}

function istantanea(over: Partial<Istantanea> = {}): Istantanea {
  return {
    nome: 'Ieri sera',
    salvataIl: '2026-08-09T20:00:00.000Z',
    finestre: [{ monitor: 'm1', layout: layout() }],
    autopiloti: [],
    ...over
  }
}

describe('parseIstantanee', () => {
  it('legge un archivio ben formato', () => {
    const { istantanee, scartati } = parseIstantanee({
      versione: VERSIONE_ISTANTANEE,
      istantanee: [istantanea()]
    })
    expect(scartati).toEqual([])
    expect(istantanee[0]?.nome).toBe('Ieri sera')
    expect(istantanee[0]?.finestre[0]?.layout.panes).toHaveLength(1)
  })

  it('restituisce vuoto da un valore qualunque, senza sollevare', () => {
    for (const raw of [null, undefined, 42, 'niente', []]) {
      expect(parseIstantanee(raw).istantanee).toEqual([])
    }
  })

  it('rifiuta un archivio di versione futura invece di interpretarlo a caso', () => {
    const { istantanee, scartati } = parseIstantanee({
      versione: VERSIONE_ISTANTANEE + 1,
      istantanee: [istantanea()]
    })
    expect(istantanee).toEqual([])
    expect(scartati.some((s) => s.includes('versione'))).toBe(true)
  })

  it('scarta un istantanea senza nome e tiene le buone', () => {
    const { istantanee, scartati } = parseIstantanee({
      versione: VERSIONE_ISTANTANEE,
      istantanee: [{ salvataIl: 'x', finestre: [] }, istantanea({ nome: 'Buona' })]
    })
    expect(istantanee.map((i) => i.nome)).toEqual(['Buona'])
    expect(scartati.length).toBeGreaterThan(0)
  })

  it('normalizza i layout con lo stesso parser dei workspace', () => {
    // Un riquadro senza dati viene potato: se passasse, l'istantanea
    // ricaricherebbe un riquadro che non si puo' disegnare.
    const { istantanee } = parseIstantanee({
      versione: VERSIONE_ISTANTANEE,
      istantanee: [istantanea({
        finestre: [{
          monitor: 'm1',
          layout: {
            root: {
              type: 'split', id: 's1', direction: 'horizontal',
              children: [{ type: 'pane', id: 'a' }, { type: 'pane', id: 'fantasma' }],
              sizes: [0.5, 0.5]
            },
            panes: [{ id: 'a', sessionUuid: 'u', cwd: 'C:\\p', title: 't' }]
          }
        }]
      })]
    })
    expect(istantanee[0]?.finestre[0]?.layout.root).toEqual({ type: 'pane', id: 'a' })
  })

  it('legge gli autopiloti salvati insieme alle chat', () => {
    const { istantanee } = parseIstantanee({
      versione: VERSIONE_ISTANTANEE,
      istantanee: [istantanea({
        autopiloti: [{
          nome: 'Test verdi',
          obiettivo: 'Fai passare la suite',
          cwd: 'C:\\p',
          criteri: [{ descrizione: 'i test passano', comando: 'npm test' }],
          tettoChat: 2
        }]
      })]
    })
    expect(istantanee[0]?.autopiloti[0]?.obiettivo).toBe('Fai passare la suite')
    expect(istantanee[0]?.autopiloti[0]?.tettoChat).toBe(2)
  })

  it('scarta un autopilota senza obiettivo, che non si potrebbe far ripartire', () => {
    const { istantanee, scartati } = parseIstantanee({
      versione: VERSIONE_ISTANTANEE,
      istantanee: [istantanea({
        autopiloti: [
          { nome: 'rotto', cwd: 'C:\\p' },
          { nome: 'buono', obiettivo: 'o', cwd: 'C:\\p', criteri: [{ descrizione: 'd' }] }
        ] as never
      })]
    })
    expect(istantanee[0]?.autopiloti.map((a) => a.nome)).toEqual(['buono'])
    expect(scartati.length).toBeGreaterThan(0)
  })

  it('tiene solo l ultima istantanea con lo stesso nome', () => {
    // Salvare due volte con lo stesso nome e' un aggiornamento, non un
    // duplicato: l'elenco resta corto e la scelta resta chiara.
    const { istantanee } = parseIstantanee({
      versione: VERSIONE_ISTANTANEE,
      istantanee: [
        istantanea({ nome: 'Lavoro', salvataIl: '2026-08-01T10:00:00.000Z' }),
        istantanea({ nome: 'Lavoro', salvataIl: '2026-08-09T10:00:00.000Z' })
      ]
    })
    expect(istantanee).toHaveLength(1)
    expect(istantanee[0]?.salvataIl).toBe('2026-08-09T10:00:00.000Z')
  })

  it('ordina dalla piu recente', () => {
    const { istantanee } = parseIstantanee({
      versione: VERSIONE_ISTANTANEE,
      istantanee: [
        istantanea({ nome: 'Vecchia', salvataIl: '2026-08-01T10:00:00.000Z' }),
        istantanea({ nome: 'Nuova', salvataIl: '2026-08-09T10:00:00.000Z' })
      ]
    })
    expect(istantanee.map((i) => i.nome)).toEqual(['Nuova', 'Vecchia'])
  })
})

describe('nuovaIstantanea', () => {
  it('e valida secondo il proprio parser', () => {
    const i = nuovaIstantanea({
      nome: 'Adesso',
      salvataIl: '2026-08-09T20:00:00.000Z',
      finestre: [{ monitor: 'm1', layout: layout() }],
      autopiloti: []
    })
    const { istantanee, scartati } = parseIstantanee({ versione: VERSIONE_ISTANTANEE, istantanee: [i] })
    expect(scartati).toEqual([])
    expect(istantanee).toHaveLength(1)
  })
})

describe('piu finestre nella stessa istantanea', () => {
  const layout = (n: number): unknown => ({
    root: { type: 'pane', id: `p${n}` },
    panes: [{ id: `p${n}`, sessionUuid: `u${n}`, cwd: 'C:\\p', title: `chat ${n}` }]
  })

  it('conserva una finestra per ogni disposizione salvata', () => {
    // Sei chat in due finestre: salvarne solo una ne riporta indietro quattro,
    // ed e' esattamente il difetto che si vedeva ricaricando.
    const { istantanee } = parseIstantanee({
      versione: VERSIONE_ISTANTANEE,
      istantanee: [{
        nome: 'sera',
        salvataIl: '2026-08-10T10:00:00.000Z',
        finestre: [{ monitor: 'm1', layout: layout(1) }, { monitor: 'm1', layout: layout(2) }],
        autopiloti: []
      }]
    })
    expect(istantanee[0]?.finestre).toHaveLength(2)
    expect(istantanee[0]?.finestre[1]?.layout.panes[0]?.title).toBe('chat 2')
  })

  it('legge i salvataggi vecchi, dove le finestre erano una per monitor', () => {
    // Chi ha gia' dei salvataggi non deve perderli: la forma precedente teneva
    // un layout per monitor, e ognuno di quelli era una finestra.
    const { istantanee, scartati } = parseIstantanee({
      versione: 1,
      istantanee: [{
        nome: 'ieri',
        salvataIl: '2026-08-09T10:00:00.000Z',
        perSlot: { m1: layout(1), m2: layout(2) },
        autopiloti: []
      }]
    })
    expect(istantanee[0]?.finestre).toHaveLength(2)
    expect(istantanee[0]?.finestre.map((f) => f.monitor).sort()).toEqual(['m1', 'm2'])
    expect(scartati).toEqual([])
  })

  it('scarta una finestra senza layout leggibile senza perdere le altre', () => {
    const { istantanee } = parseIstantanee({
      versione: VERSIONE_ISTANTANEE,
      istantanee: [{
        nome: 'x',
        salvataIl: '2026-08-10T10:00:00.000Z',
        finestre: [{ monitor: 'm1', layout: 'non sono un layout' }, { monitor: 'm1', layout: layout(2) }],
        autopiloti: []
      }]
    })
    expect(istantanee[0]?.finestre).toHaveLength(1)
  })

  it('un istantanea senza finestre resta leggibile', () => {
    const { istantanee } = parseIstantanee({
      versione: VERSIONE_ISTANTANEE,
      istantanee: [{ nome: 'vuota', salvataIl: '2026-08-10T10:00:00.000Z', autopiloti: [] }]
    })
    expect(istantanee[0]?.finestre).toEqual([])
  })
})

describe('distribuisci', () => {
  const f = (monitor: string, titolo: string): FinestraSalvata => ({
    monitor,
    layout: {
      root: { type: 'pane', id: 'p' },
      panes: [{ id: 'p', sessionUuid: `u-${titolo}`, cwd: 'C:\\p', title: titolo }]
    }
  })
  const titoli = (l: LayoutSalvato): (string | undefined)[] => l.panes.map((p) => p.title)

  it('riempie le finestre che ci sono invece di aprirne altre', () => {
    // È il difetto grave: si aprivano finestre nuove e quelle di prima
    // restavano con dentro le loro chat, cioè le stesse chat due volte.
    const e = distribuisci([f('m1', 'a'), f('m2', 'b')], [{ id: 7, monitor: 'm1' }, { id: 9, monitor: 'm2' }])
    expect(e.daAprire).toEqual([])
    expect(e.daSvuotare).toEqual([])
    expect(e.aFinestre.map((x) => [x.id, titoli(x.layout)])).toEqual([[7, ['a']], [9, ['b']]])
  })

  it('apre solo quello che non ha una finestra dove stare', () => {
    const e = distribuisci([f('m1', 'a'), f('m2', 'b')], [{ id: 7, monitor: 'm1' }])
    expect(e.aFinestre).toHaveLength(1)
    expect(e.daAprire.map(titoli)).toEqual([['b']])
  })

  it('svuota le finestre che il salvataggio non prevede', () => {
    // Lasciarle com'erano è il doppione: un ripristino dice cosa ci deve
    // essere, e quello che non c'è dentro non ci deve essere.
    const e = distribuisci([f('m1', 'a')], [{ id: 7, monitor: 'm1' }, { id: 9, monitor: 'm2' }])
    expect(e.daSvuotare).toEqual([9])
  })

  it('se il monitor non c e piu usa una finestra qualunque', () => {
    // Un salvataggio fatto su due schermi e ricaricato sul portatile deve
    // comunque tornare: meglio tutto qui che niente da nessuna parte.
    const e = distribuisci([f('m9', 'a')], [{ id: 7, monitor: 'm1' }])
    expect(e.aFinestre).toEqual([{ id: 7, layout: f('m9', 'a').layout }])
    expect(e.daAprire).toEqual([])
  })

  it('due finestre sullo stesso monitor restano due', () => {
    const e = distribuisci(
      [f('m1', 'a'), f('m1', 'b')],
      [{ id: 7, monitor: 'm1' }, { id: 9, monitor: 'm1' }]
    )
    expect(e.aFinestre.map((x) => x.id)).toEqual([7, 9])
    expect(e.daAprire).toEqual([])
  })

  it('senza niente da ripristinare svuota tutto invece di lasciare le chat di prima', () => {
    const e = distribuisci([], [{ id: 7, monitor: 'm1' }])
    expect(e.daSvuotare).toEqual([7])
  })
})

describe('i workspace sopravvivono alla rilettura', () => {
  const conWorkspace = {
    versione: VERSIONE_ISTANTANEE,
    istantanee: [{
      nome: 'desk_1',
      salvataIl: '2026-08-12T10:00:00.000Z',
      finestre: [],
      workspaceAttivo: 'lavoro',
      workspace: [
        { nome: 'lavoro', perSlot: { m1: { root: { type: 'pane', id: 'p1' }, panes: [{ id: 'p1', sessionUuid: 'u1', cwd: 'C:\\a', title: 'una' }] } } },
        { nome: 'casa', perSlot: { m1: { root: { type: 'pane', id: 'p2' }, panes: [{ id: 'p2', sessionUuid: 'u2', cwd: 'C:\\b', title: 'due' }] } } }
      ],
      autopiloti: []
    }]
  }

  it('li rilegge dal file, invece di buttarli via', () => {
    // Il campo veniva scritto sul disco e non lo leggeva nessuno: chi salvava
    // tre workspace ne ritrovava uno appena riaperto il programma, e i
    // conteggi dicevano «1» a ogni riapertura della finestra dei salvataggi.
    const { istantanee } = parseIstantanee(conWorkspace)
    expect(istantanee[0]?.workspace).toHaveLength(2)
    expect(contaWorkspace(istantanee[0] as Istantanea)).toBe(2)
    expect(contaChat(istantanee[0] as Istantanea)).toBe(2)
  })

  it('ricorda quale si aveva davanti', () => {
    // Senza, le chat ripristinate finivano nel workspace attivo di adesso: le
    // stesse chat in due workspace diversi.
    const { istantanee } = parseIstantanee(conWorkspace)
    expect(istantanee[0]?.workspaceAttivo).toBe('lavoro')
  })

  it('un salvataggio vecchio senza workspace si legge lo stesso', () => {
    const { istantanee } = parseIstantanee({
      versione: VERSIONE_ISTANTANEE,
      istantanee: [{ nome: 'vecchia', salvataIl: '2026-01-01T00:00:00.000Z', finestre: [], autopiloti: [] }]
    })
    expect(istantanee[0]?.workspace).toBeUndefined()
    expect(istantanee[0]?.workspaceAttivo).toBeUndefined()
  })

  it('il modello di una chat sopravvive al salvataggio', () => {
    // «Voglio che nelle chat ci sia scritto il modello che stiamo usando»: il
    // modello scelto viaggia col riquadro (finestre e workspace), e al ricarico
    // la chat riprende con lo stesso invece che col predefinito dell'account.
    const conModello = {
      versione: VERSIONE_ISTANTANEE,
      istantanee: [{
        nome: 'con-modello', salvataIl: '2026-08-12T10:00:00.000Z',
        finestre: [{
          monitor: 'm1',
          layout: { root: { type: 'pane', id: 'p1' }, panes: [{ id: 'p1', sessionUuid: 'u1', cwd: 'C:\\a', title: 'una', model: 'opus' }] }
        }],
        workspaceAttivo: 'lavoro',
        workspace: [{ nome: 'lavoro', perSlot: { m1: { root: { type: 'pane', id: 'p1' }, panes: [{ id: 'p1', sessionUuid: 'u1', cwd: 'C:\\a', title: 'una', model: 'opus' }] } } }],
        autopiloti: []
      }]
    }
    const { istantanee } = parseIstantanee(conModello)
    expect(istantanee[0]?.finestre[0]?.layout.panes[0]?.model).toBe('opus')
    // `m1` non è uno slot: alla lettura diventa lo slot 1, come nell'archivio.
    expect(istantanee[0]?.workspace?.[0]?.perSlot['1']?.panes[0]?.model).toBe('opus')
  })
})

describe('autopiloti salvati senza criteri', () => {
  it('li conserva, perche sara la preparazione a produrli', () => {
    // Da quando l'autopilota si configura da se', i criteri nascono
    // dall'intervista: scartarlo qui significava che un autopilota ancora in
    // preparazione spariva dal salvataggio, e al ricarico non tornava.
    const { istantanee, scartati } = parseIstantanee({
      versione: VERSIONE_ISTANTANEE,
      istantanee: [{
        nome: 'sera',
        salvataIl: '2026-08-10T10:00:00.000Z',
        finestre: [],
        autopiloti: [{ nome: 'Controllo', obiettivo: 'controlla tutto', cwd: 'C:\p', criteri: [] }]
      }]
    })
    expect(istantanee[0]?.autopiloti).toHaveLength(1)
    expect(istantanee[0]?.autopiloti[0]?.criteri).toEqual([])
    expect(scartati).toEqual([])
  })

  it('ma senza obiettivo non c e niente da far ripartire', () => {
    const { istantanee } = parseIstantanee({
      versione: VERSIONE_ISTANTANEE,
      istantanee: [{
        nome: 'x', salvataIl: '2026-08-10T10:00:00.000Z', finestre: [],
        autopiloti: [{ nome: 'Senza', cwd: 'C:\p', criteri: [] }]
      }]
    })
    expect(istantanee[0]?.autopiloti).toEqual([])
  })
})

describe('autopiloti al ripristino', () => {
  const salvato = (nome: string, obiettivo: string, cwd = 'C:\\lavoro\\casa'): AutopilotaSalvato =>
    ({ nome, obiettivo, cwd, criteri: [] })

  it('non ricrea un autopilota che gia esiste', () => {
    // Il difetto osservato: ricaricando un salvataggio, i suoi autopiloti
    // venivano creati di nuovo ogni volta. Da uno solo se ne sono trovati sei,
    // nati a coppie a sei secondi di distanza — e ognuno rifaceva l'intervista,
    // cioe' le stesse domande gia' risposte.
    const da = daRiavviare(
      [salvato('Audit', 'controlla la configurazione')],
      [{ cwd: 'C:\\lavoro\\casa', obiettivo: 'controlla la configurazione' }]
    )
    expect(da).toEqual([])
  })

  it('riavvia quelli che davvero non ci sono piu', () => {
    const da = daRiavviare(
      [salvato('Audit', 'controlla la configurazione'), salvato('Altro', 'sistema i test')],
      [{ cwd: 'C:\\lavoro\\casa', obiettivo: 'controlla la configurazione' }]
    )
    expect(da.map((a) => a.nome)).toEqual(['Altro'])
  })

  it('non bada a maiuscole ne alla barra finale della cartella', () => {
    const da = daRiavviare(
      [salvato('Audit', 'Controlla La Configurazione', 'C:/lavoro/Casa/')],
      [{ cwd: 'C:\\lavoro\\casa', obiettivo: 'controlla la configurazione' }]
    )
    expect(da).toEqual([])
  })

  it('lo stesso obiettivo in un altra cartella e un altro lavoro', () => {
    const da = daRiavviare(
      [salvato('Audit', 'controlla', 'C:\\altro')],
      [{ cwd: 'C:\\lavoro\\casa', obiettivo: 'controlla' }]
    )
    expect(da).toHaveLength(1)
  })

  it('due copie dentro lo stesso salvataggio diventano una', () => {
    const da = daRiavviare([salvato('A', 'controlla'), salvato('B', 'controlla')], [])
    expect(da).toHaveLength(1)
  })

  it('senza autopiloti salvati non riavvia niente', () => {
    expect(daRiavviare([], [{ cwd: 'C:\\p', obiettivo: 'x' }])).toEqual([])
  })
})

describe('autopiloti da salvare', () => {
  const vivo = (nome: string, stato: string): { nome: string; stato: string } => ({ nome, stato })

  it('non salva quelli che hanno gia finito', () => {
    // Rimetterli in moto al prossimo ricarico significa rifare un lavoro
    // gia' fatto: chat nuove, token spesi e, se l'obiettivo era gia' raggiunto,
    // un autopilota che gira per scoprire che non c'e' niente da fare.
    const da = daSalvare([vivo('Finito', 'finito'), vivo('Al lavoro', 'lavoro')])
    expect(da.map((a) => a.nome)).toEqual(['Al lavoro'])
  })

  it('salva quelli fermi a meta, che e proprio il caso da riprendere', () => {
    const da = daSalvare([vivo('Sospeso', 'sospeso'), vivo('In preparazione', 'intervista'), vivo('In attesa', 'attesa')])
    expect(da).toHaveLength(3)
  })

  it('non salva quelli falliti', () => {
    expect(daSalvare([vivo('Fallito', 'fallito')])).toEqual([])
  })
})

describe('salvare tutti i workspace', () => {
  const conChat = (chat: string): LayoutSalvato => ({
    root: { type: 'pane', id: `p-${chat}` },
    panes: [{ id: `p-${chat}`, sessionUuid: chat, cwd: 'C:\p', title: chat }]
  })

  const archivio = {
    attivo: 'lavoro',
    workspace: [
      { nome: 'lavoro', perSlot: { '1': conChat('vecchia') } },
      { nome: 'casa', perSlot: { '1': conChat('di-casa') } },
      { nome: 'studio', perSlot: { '1': conChat('di-studio') } }
    ]
  }

  it('porta con se anche i workspace che non hai davanti', () => {
    // Le finestre raccontano il solo workspace attivo: era l'unica cosa che
    // finiva nel salvataggio, e chi ne aveva tre ne ritrovava uno.
    const w = workspaceDaSalvare(archivio, [{ monitor: 'm-1', slot: '1', layout: conChat('adesso') }])
    expect(w.map((x) => x.nome).sort()).toEqual(['casa', 'lavoro', 'studio'])
  })

  it('per quello attivo vale cio che hai davanti, non la copia su disco', () => {
    // L'archivio conosce l'attivo com'era all'ultimo cambio: le chat aperte
    // adesso stanno nelle finestre.
    const w = workspaceDaSalvare(archivio, [{ monitor: 'm-1', slot: '1', layout: conChat('adesso') }])
    const attivo = w.find((x) => x.nome === 'lavoro')
    expect(attivo?.perSlot['1']?.panes[0]?.sessionUuid).toBe('adesso')
  })

  it('gli altri workspace restano come erano', () => {
    const w = workspaceDaSalvare(archivio, [{ monitor: 'm-1', slot: '1', layout: conChat('adesso') }])
    expect(w.find((x) => x.nome === 'casa')?.perSlot['1']?.panes[0]?.sessionUuid).toBe('di-casa')
  })

  it('uno slot senza finestra aperta non viene cancellato', () => {
    // Nessuno lo sta guardando adesso: non e' una ragione per buttarlo via.
    const dueMonitor = {
      attivo: 'lavoro',
      workspace: [{ nome: 'lavoro', perSlot: { '1': conChat('uno'), '2': conChat('due') } }]
    }
    const w = workspaceDaSalvare(dueMonitor, [{ monitor: 'm-1', slot: '1', layout: conChat('adesso') }])
    expect(Object.keys(w[0]?.perSlot ?? {}).sort()).toEqual(['1', '2'])
  })

  it('un istantanea vecchia senza workspace resta valida', () => {
    // Si ricaricano come hanno sempre fatto: nessun salvataggio diventa
    // illeggibile perche' e' stato preso prima.
    const i = nuovaIstantanea({ nome: 'x', salvataIl: 'oggi', finestre: [], autopiloti: [] })
    expect(i.workspace).toBeUndefined()
  })

  it('la stessa chat in due workspace finisce in uno solo, quello attivo', () => {
    // La radice del «1 chat, 2 workspace»: un archivio incrociato aveva la
    // stessa conversazione in due workspace. Salvando, deve restare dove la si
    // ha davvero davanti — l'attivo — e sparire dall'altro, altrimenti al
    // ricarico ricompare di qua e di la sotto due nomi diversi.
    const incrociato = {
      attivo: 'lavoro',
      workspace: [
        { nome: 'lavoro', perSlot: { '1': conChat('condivisa') } },
        { nome: 'casa', perSlot: { '1': conChat('condivisa') } }
      ]
    }
    const w = workspaceDaSalvare(incrociato, [{ monitor: 'm-1', slot: '1', layout: conChat('condivisa') }])
    expect(w.find((x) => x.nome === 'lavoro')?.perSlot['1']?.panes[0]?.sessionUuid).toBe('condivisa')
    expect(w.find((x) => x.nome === 'casa')?.perSlot['1']?.panes).toEqual([])
  })
})

describe('contare cosa contiene un salvataggio', () => {
  const conPane = (uuid: string): LayoutSalvato => ({
    root: { type: 'pane', id: `p-${uuid}` },
    panes: [{ id: `p-${uuid}`, sessionUuid: uuid, cwd: 'C:\p', title: uuid }]
  })

  it('conta le chat di tutti i workspace, non solo quelle davanti', () => {
    // Chi ne aveva sei divise in tre workspace leggeva «2 chat» e pensava,
    // giustamente, che le altre fossero andate perse.
    const i = nuovaIstantanea({
      nome: 'desk_1',
      salvataIl: 'oggi',
      finestre: [{ monitor: 'm-1', slot: '1', layout: conPane('a') }],
      workspace: [
        { nome: 'lavoro', perSlot: { '1': conPane('a') } },
        { nome: 'casa', perSlot: { '1': conPane('b') } },
        { nome: 'studio', perSlot: { '1': conPane('c') } }
      ],
      autopiloti: []
    })
    expect(contaChat(i)).toBe(3)
    expect(contaWorkspace(i)).toBe(3)
  })

  it('la stessa chat su due monitor si conta una volta', () => {
    // E' una conversazione, non due: contarla doppia gonfierebbe il numero
    // proprio a chi ha due schermi.
    const i = nuovaIstantanea({
      nome: 'x',
      salvataIl: 'oggi',
      finestre: [
        { monitor: 'm-1', layout: conPane('a') },
        { monitor: 'm-2', layout: conPane('a') }
      ],
      autopiloti: []
    })
    expect(contaChat(i)).toBe(1)
  })

  it('un salvataggio vecchio, senza workspace, conta quello che ha', () => {
    const i = nuovaIstantanea({
      nome: 'vecchio',
      salvataIl: 'ieri',
      finestre: [{ monitor: 'm-1', slot: '1', layout: conPane('a') }],
      autopiloti: []
    })
    expect(contaChat(i)).toBe(1)
    expect(contaWorkspace(i)).toBe(0)
  })
})

describe('in quale workspace vivono le chat che tornano a schermo', () => {
  const chat = (u: string): LayoutSalvato => ({
    root: { type: 'pane', id: 'p' },
    panes: [{ id: 'p', sessionUuid: u, cwd: 'C:\p', title: 'x' }]
  })

  it('lo deduce da dove stanno, per i salvataggi che non lo dicono', () => {
    // Sono quelli che la gente ha gia sul disco. Senza saperlo, il ripristino
    // rimette a schermo le chat di allora lasciando nell archivio il nome del
    // workspace di adesso: il primo salvataggio automatico le scrive la
    // dentro, sopra le sue.
    const dove = workspaceDelleFinestre(
      [{ monitor: 'm1', layout: chat('u-2') }],
      [
        { nome: 'lavoro', perSlot: { m1: chat('u-1') } },
        { nome: 'casa', perSlot: { m1: chat('u-2') } }
      ]
    )
    expect(dove).toBe('casa')
  })

  it('non indovina quando non lo sa', () => {
    // Un nome sbagliato qui vorrebbe dire scrivere le chat nel workspace di
    // qualcun altro: meglio non dire niente e lasciare le cose come stanno.
    expect(workspaceDelleFinestre([{ monitor: 'm1', layout: chat('u-9') }], [
      { nome: 'lavoro', perSlot: { m1: chat('u-1') } }
    ])).toBeUndefined()
    expect(workspaceDelleFinestre([], [{ nome: 'lavoro', perSlot: { m1: chat('u-1') } }]))
      .toBeUndefined()
  })
})

describe('finestreDaRiaprire', () => {
  const pieno = (id: string): LayoutSalvato => ({
    root: { type: 'pane', id },
    panes: [{ id, sessionUuid: '11111111-2222-3333-4444-555555555555', cwd: 'C:\p', title: 'La chat' }]
  })
  const vuoto: LayoutSalvato = { root: undefined, panes: [] }

  it('normalmente riapre le finestre come sono state salvate', () => {
    const i = nuovaIstantanea({
      nome: 'x', salvataIl: 'ieri', autopiloti: [],
      finestre: [{ monitor: 'm1', layout: pieno('p-1') }]
    })
    expect(finestreDaRiaprire(i)).toHaveLength(1)
    expect(finestreDaRiaprire(i)[0]?.layout.panes[0]?.id).toBe('p-1')
  })

  it('salta le finestre vuote invece di riaprirle come schermate bianche', () => {
    const i = nuovaIstantanea({
      nome: 'x', salvataIl: 'ieri', autopiloti: [],
      finestre: [{ monitor: 'm1', layout: vuoto }, { monitor: 'm2', layout: pieno('p-1') }]
    })
    expect(finestreDaRiaprire(i).map((f) => f.monitor)).toEqual(['m2'])
  })

  it('se le finestre sono tutte vuote pesca dal workspace che si aveva davanti', () => {
    // Il caso trovato su disco: «Ultima chiusura» salvata con una finestra
    // senza riquadri. Al ricarico non tornava **niente** — mentre le chat
    // erano li' dentro, nell'archivio dei workspace dello stesso salvataggio.
    const i = nuovaIstantanea({
      nome: 'Ultima chiusura', salvataIl: 'ieri', autopiloti: [],
      finestre: [{ monitor: 'm1', layout: vuoto }],
      workspaceAttivo: 'lavoro',
      workspace: [
        { nome: 'casa', perSlot: { m1: pieno('p-casa') } },
        { nome: 'lavoro', perSlot: { m1: pieno('p-lavoro'), m2: vuoto } }
      ]
    })
    const f = finestreDaRiaprire(i)
    expect(f).toHaveLength(1)
    expect(f[0]?.monitor).toBe('m1')
    expect(f[0]?.layout.panes[0]?.id).toBe('p-lavoro')
  })

  it('e se non c e proprio niente, non inventa niente', () => {
    const i = nuovaIstantanea({
      nome: 'x', salvataIl: 'ieri', autopiloti: [],
      finestre: [{ monitor: 'm1', layout: vuoto }],
      workspaceAttivo: 'lavoro',
      workspace: [{ nome: 'lavoro', perSlot: { m1: vuoto } }]
    })
    expect(finestreDaRiaprire(i)).toEqual([])
  })
})

describe('workspaceDopoRipristino', () => {
  // La chat con id di riquadro `id` e conversazione `sess`. Serve la stessa
  // `sess` in due workspace per riprodurre i «workspace incrociati».
  const chat = (id: string, sess: string): WorkspaceSalvato['perSlot'] => ({
    m1: { root: { type: 'pane', id }, panes: [{ id, sessionUuid: sess, cwd: 'C:\p', title: id }] }
  })
  const vuoto: WorkspaceSalvato['perSlot'] = { m1: { root: undefined, panes: [] } }

  it('non resuscita un «Predefinito» cancellato che conteneva solo un doppione', () => {
    // Il bug esatto trovato sul disco: cancellato «Predefinito», ma un
    // salvataggio vecchio (Deck_1) lo conteneva ancora, col doppione della chat
    // di Wdeck. Ripristinarlo lo rimetteva nell'archivio.
    const archivio = {
      attivo: 'SierraDeck',
      workspace: [
        { nome: 'SierraDeck', perSlot: chat('p-sd', 'sess-sd') },
        { nome: 'Wdeck', perSlot: chat('p-wd', 'sess-wd') }
      ]
    }
    const i = nuovaIstantanea({
      nome: 'Deck_1', salvataIl: 'ieri', autopiloti: [],
      finestre: [{ monitor: 'm1', layout: chat('p-wd', 'sess-wd').m1! }],
      workspaceAttivo: 'Wdeck',
      workspace: [
        { nome: 'Predefinito', perSlot: chat('p-wd', 'sess-wd') },
        { nome: 'Wdeck', perSlot: chat('p-wd', 'sess-wd') }
      ]
    })
    const { workspace, attivo } = workspaceDopoRipristino(archivio, i)
    // Predefinito potato: vuoto dopo il dedup e introdotto dal salvataggio.
    expect(workspace.map((w) => w.nome).sort()).toEqual(['SierraDeck', 'Wdeck'])
    // La chat di Wdeck vive in un solo posto.
    const dove = workspace.filter((w) =>
      Object.values(w.perSlot).some((l) => l.panes.some((p) => p.sessionUuid === 'sess-wd')))
    expect(dove.map((w) => w.nome)).toEqual(['Wdeck'])
    expect(attivo).toBe('Wdeck')
  })

  it('tiene i workspace del salvataggio che dopo il dedup restano pieni', () => {
    const archivio = { attivo: 'Main', workspace: [{ nome: 'Main', perSlot: chat('p-m', 'sess-m') }] }
    const i = nuovaIstantanea({
      nome: 'x', salvataIl: 'ieri', autopiloti: [],
      finestre: [{ monitor: 'm1', layout: chat('p-e', 'sess-e').m1! }],
      workspaceAttivo: 'Extra',
      workspace: [{ nome: 'Extra', perSlot: chat('p-e', 'sess-e') }]
    })
    const { workspace, attivo } = workspaceDopoRipristino(archivio, i)
    expect(workspace.map((w) => w.nome).sort()).toEqual(['Extra', 'Main'])
    expect(attivo).toBe('Extra')
  })

  it('non tocca un workspace vuoto che c era già: non è stato introdotto ora', () => {
    // Se «Bozza» esisteva vuoto anche prima, non è un fantasma del salvataggio:
    // potarlo cancellerebbe una scelta dell'utente.
    const archivio = {
      attivo: 'Main',
      workspace: [
        { nome: 'Main', perSlot: chat('p-m', 'sess-m') },
        { nome: 'Bozza', perSlot: vuoto }
      ]
    }
    const i = nuovaIstantanea({
      nome: 'x', salvataIl: 'ieri', autopiloti: [],
      finestre: [{ monitor: 'm1', layout: chat('p-m', 'sess-m').m1! }],
      workspaceAttivo: 'Main',
      workspace: [{ nome: 'Bozza', perSlot: vuoto }]
    })
    const { workspace } = workspaceDopoRipristino(archivio, i)
    expect(workspace.map((w) => w.nome).sort()).toEqual(['Bozza', 'Main'])
  })

  it('i workspace di adesso che il salvataggio non nomina restano', () => {
    const archivio = {
      attivo: 'Main',
      workspace: [
        { nome: 'Main', perSlot: chat('p-m', 'sess-m') },
        { nome: 'Nuovo', perSlot: chat('p-n', 'sess-n') }
      ]
    }
    const i = nuovaIstantanea({
      nome: 'x', salvataIl: 'ieri', autopiloti: [],
      finestre: [{ monitor: 'm1', layout: chat('p-m', 'sess-m').m1! }],
      workspaceAttivo: 'Main',
      workspace: [{ nome: 'Main', perSlot: chat('p-m', 'sess-m') }]
    })
    const { workspace } = workspaceDopoRipristino(archivio, i)
    // «Nuovo», creato dopo il salvataggio, non sparisce.
    expect(workspace.map((w) => w.nome).sort()).toEqual(['Main', 'Nuovo'])
  })
})

describe('un salvataggio scritto prima della 0.12.45 (perMonitor) non torna vuoto', () => {
  // Fino alla 0.12.44 i workspace di un salvataggio stavano sotto `perMonitor`,
  // con la geometria dello schermo per chiave. Quando il nome è diventato
  // `perSlot` il lettore ha seguito solo il nuovo: ogni workspace di un
  // salvataggio vecchio — «Ultima chiusura» compresa, cioè proprio quello
  // scritto uscendo per aggiornarsi — tornava a nome pieno e a mani vuote, e il
  // ripristino li svuotava sul disco uno per uno. È successo davvero, su un PC
  // aggiornato dalla 0.12.4x alla 0.12.48: sono rimasti i nomi dei workspace e
  // la sola chat che la finestra aveva davanti.
  const pane = (id: string, u: string): { id: string; sessionUuid: string; cwd: string; title: string } =>
    ({ id, sessionUuid: u, cwd: 'C:\p', title: id })
  const uno = (id: string, u: string): unknown => ({ root: { type: 'pane', id }, panes: [pane(id, u)] })
  const vecchio = {
    versione: VERSIONE_ISTANTANEE,
    istantanee: [{
      nome: 'Ultima chiusura',
      salvataIl: '2026-09-01T20:00:00.000Z',
      finestre: [{ monitor: '1920x1080@0,0@1', layout: uno('p1', 'u1') }],
      workspaceAttivo: 'lavoro',
      workspace: [
        { nome: 'lavoro', perMonitor: { '1920x1080@0,0@1': uno('p1', 'u1') } },
        { nome: 'casa', perMonitor: { '1920x1080@0,0@1': uno('p2', 'u2'), '2560x1440@1920,0@1': uno('p3', 'u3') } },
        { nome: 'nas', perMonitor: { '2560x1440@1920,0@1': uno('p4', 'u4') } }
      ],
      autopiloti: []
    }]
  }

  it('legge le chat dei workspace anche sotto il nome vecchio', () => {
    const { istantanee, scartati } = parseIstantanee(vecchio)
    expect(scartati).toEqual([])
    expect(contaWorkspace(istantanee[0] as Istantanea)).toBe(3)
    expect(contaChat(istantanee[0] as Istantanea)).toBe(4)
  })

  it('e le chiavi-monitor diventano slot, con la stessa regola dell archivio', () => {
    const { istantanee } = parseIstantanee(vecchio)
    const casa = istantanee[0]?.workspace?.find((w) => w.nome === 'casa')
    // Lo schermo più a sinistra è lo slot 1, quello di destra il 2 — e la
    // corrispondenza è la stessa in ogni workspace del salvataggio.
    expect(Object.keys(casa?.perSlot ?? {}).sort()).toEqual(['1', '2'])
    expect(casa?.perSlot['1']?.panes[0]?.sessionUuid).toBe('u2')
    expect(casa?.perSlot['2']?.panes[0]?.sessionUuid).toBe('u3')
    const nas = istantanee[0]?.workspace?.find((w) => w.nome === 'nas')
    expect(Object.keys(nas?.perSlot ?? {})).toEqual(['2'])
  })

  it('ripristinarlo non svuota i workspace che non si hanno davanti', () => {
    // Il caso vero: l'archivio ha le chat, il salvataggio vecchio le ha anche
    // lui. Prima della correzione il salvataggio le «aveva» a zero, e vinceva.
    const { istantanee } = parseIstantanee(vecchio)
    const archivio: { attivo: string; workspace: WorkspaceSalvato[] } = {
      attivo: 'lavoro',
      workspace: [
        { nome: 'lavoro', perSlot: { '1': uno('p1', 'u1') as LayoutSalvato } },
        { nome: 'casa', perSlot: { '1': uno('p2', 'u2') as LayoutSalvato, '2': uno('p3', 'u3') as LayoutSalvato } },
        { nome: 'nas', perSlot: { '2': uno('p4', 'u4') as LayoutSalvato } }
      ]
    }
    const { workspace } = workspaceDopoRipristino(archivio, istantanee[0] as Istantanea)
    const chat = (nome: string): string[] =>
      Object.values(workspace.find((w) => w.nome === nome)?.perSlot ?? {})
        .flatMap((l) => l.panes.map((p) => p.sessionUuid)).sort()
    expect(chat('lavoro')).toEqual(['u1'])
    expect(chat('casa')).toEqual(['u2', 'u3'])
    expect(chat('nas')).toEqual(['u4'])
  })

  it('un workspace senza disposizioni si tiene per nome, ma lo si dice', () => {
    const { istantanee, scartati } = parseIstantanee({
      versione: VERSIONE_ISTANTANEE,
      istantanee: [{
        nome: 'strano', salvataIl: '2026-09-01T20:00:00.000Z', finestre: [],
        workspace: [{ nome: 'lavoro' }], autopiloti: []
      }]
    })
    expect(istantanee[0]?.workspace?.map((w) => w.nome)).toEqual(['lavoro'])
    expect(scartati.some((m) => m.includes('senza disposizioni'))).toBe(true)
  })

  it('la forma ancora precedente, con le finestre sotto perMonitor, si legge lo stesso', () => {
    // Prima di `finestre` c'era un layout per monitor in cima al salvataggio:
    // anche quel ramo aveva seguito il nome nuovo e non leggeva più il vecchio.
    const { istantanee } = parseIstantanee({
      versione: VERSIONE_ISTANTANEE,
      istantanee: [{
        nome: 'antica', salvataIl: '2026-01-01T00:00:00.000Z',
        perMonitor: { '1920x1080@0,0@1': uno('p1', 'u1') },
        autopiloti: []
      }]
    })
    expect(istantanee[0]?.finestre).toHaveLength(1)
    expect(istantanee[0]?.finestre[0]?.layout.panes[0]?.sessionUuid).toBe('u1')
  })
})
