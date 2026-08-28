import { describe, it, expect, beforeEach } from 'vitest'
import { useLayoutStore } from '../../src/renderer/state/layout'
import { listPaneIds } from '@shared/layout-tree'
import { titoloPericoloso } from '@shared/titolo'
import { validateSpawnRequest } from '../../src/main/validation'
import { NOME_PREDEFINITO } from '@shared/workspace'

describe('store del layout', () => {
  beforeEach(() => useLayoutStore.getState().reset())

  it('parte vuoto', () => {
    expect(useLayoutStore.getState().root).toBeUndefined()
  })

  it('aggiunge il primo riquadro come radice', () => {
    const id = useLayoutStore.getState().addPane('C:\\p', 'Uno')
    const { root, panes } = useLayoutStore.getState()
    expect(root).toEqual({ type: 'pane', id })
    expect(panes[id]?.title).toBe('Uno')
    expect(panes[id]?.sessionUuid).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('ripulisce il titolo che entra, invece di rifiutare il riquadro', () => {
    // Il titolo arriva da aiTitle, cioe' da disco: se un apice rendesse la
    // chat non apribile, l'utente pagherebbe sul percorso principale il prezzo
    // di un difetto di node-pty, su un testo che non ha scritto.
    const id = useLayoutStore.getState().addPane('C:\\p', '" --dangerously-skip-permissions "')
    const titolo = useLayoutStore.getState().panes[id]?.title
    expect(titolo).toBeDefined()
    expect(titoloPericoloso(titolo!)).toBe(false)
    expect(titolo).not.toBe('')
  })

  it('un titolo passato per addPane supera la validazione del Core', () => {
    // La prima delle due prove: la catena completa dal titolo ostile fino alla
    // richiesta accettata. Se la normalizzazione sparisse, questa cadrebbe.
    const cartella = process.cwd()
    const id = useLayoutStore.getState().addPane(cartella, 'Il bug della " mancante')
    const pane = useLayoutStore.getState().panes[id]!

    expect(() =>
      validateSpawnRequest({
        sessionUuid: pane.sessionUuid, cwd: pane.cwd, title: pane.title, cols: 80, rows: 24
      })
    ).not.toThrow()
  })

  it('la validazione del Core rifiuta comunque un titolo ostile che arrivi per altra via', () => {
    // La seconda prova, e deve restare distinta dalla prima: la rete serve per
    // il giorno in cui un titolo arrivera' da un rinomina o da un layout
    // persistito invece che da addPane.
    const id = useLayoutStore.getState().addPane(process.cwd(), 'Innocuo')
    const pane = useLayoutStore.getState().panes[id]!

    expect(() =>
      validateSpawnRequest({
        sessionUuid: pane.sessionUuid, cwd: pane.cwd,
        title: '" --dangerously-skip-permissions "', cols: 80, rows: 24
      })
    ).toThrow(/apici doppi/)
  })

  it('aggiunge il secondo riquadro dividendo il primo', () => {
    const store = useLayoutStore.getState()
    store.addPane('C:\\p', 'Uno')
    store.addPane('C:\\q', 'Due')
    expect(listPaneIds(useLayoutStore.getState().root!)).toHaveLength(2)
  })

  it('chiude un riquadro e ne dimentica i dati', () => {
    const store = useLayoutStore.getState()
    const a = store.addPane('C:\\p', 'Uno')
    store.addPane('C:\\q', 'Due')
    useLayoutStore.getState().closePane(a)
    const { root, panes } = useLayoutStore.getState()
    expect(listPaneIds(root!)).toHaveLength(1)
    expect(panes[a]).toBeUndefined()
  })

  it('svuota la radice chiudendo l ultimo riquadro', () => {
    const id = useLayoutStore.getState().addPane('C:\\p', 'Uno')
    useLayoutStore.getState().closePane(id)
    expect(useLayoutStore.getState().root).toBeUndefined()
  })

  it('applica il preset 2x2 conservando i riquadri esistenti', () => {
    const store = useLayoutStore.getState()
    for (const n of ['a', 'b', 'c', 'd']) store.addPane('C:\\p', n)
    useLayoutStore.getState().applyPreset('duePerDue')
    expect(listPaneIds(useLayoutStore.getState().root!)).toHaveLength(4)
  })

  it('un preset che tronca dimentica anche i dati dei riquadri esclusi', () => {
    const store = useLayoutStore.getState()
    const ids = ['a', 'b', 'c', 'd'].map((n) => store.addPane('C:\\p', n))
    useLayoutStore.getState().applyPreset('due')

    const { root, panes } = useLayoutStore.getState()
    const rimasti = listPaneIds(root!)
    expect(rimasti).toHaveLength(2)
    expect(Object.keys(panes).sort()).toEqual([...rimasti].sort())
    const esclusi = ids.filter((id) => !rimasti.includes(id))
    for (const id of esclusi) expect(panes[id]).toBeUndefined()
  })

  it('memorizza il ptyId di un riquadro', () => {
    const store = useLayoutStore.getState()
    store.reset()
    const id = store.addPane('C:\\p', 'a')
    useLayoutStore.getState().setPtyId(id, 'pty-1')
    expect(useLayoutStore.getState().panes[id]?.ptyId).toBe('pty-1')
  })

  it('ignora il ptyId di un riquadro già chiuso', () => {
    const store = useLayoutStore.getState()
    store.reset()
    const id = store.addPane('C:\\p', 'a')
    useLayoutStore.getState().closePane(id)
    useLayoutStore.getState().setPtyId(id, 'tardivo')
    // Senza la guardia, qui ricomparirebbe un riquadro fantasma con un terminale
    // che nessuno chiudera' mai.
    expect(useLayoutStore.getState().panes[id]).toBeUndefined()
  })

  it('gli id dei riquadri non collidono con un albero ripristinato', () => {
    const store = useLayoutStore.getState()
    store.reset()
    const primi = [store.addPane('C:\\p', 'a'), store.addPane('C:\\p', 'b')]
    // Un contatore in memoria ripartirebbe da zero qui, e il terzo riquadro
    // riceverebbe l'id del primo.
    expect(new Set(primi).size).toBe(2)
    expect(primi.every((id) => /^pane-[0-9a-f-]{36}$/.test(id))).toBe(true)
  })
})

describe('esporta e carica', () => {
  it('un giro completo conserva albero, dati e ptyId', () => {
    const store = useLayoutStore.getState()
    store.reset()
    const a = store.addPane('C:\\uno', 'Primo')
    useLayoutStore.getState().setPtyId(a, 'pty-a')
    const b = useLayoutStore.getState().addPane('C:\\due', 'Secondo')

    const salvato = useLayoutStore.getState().esporta()
    expect(salvato.panes).toHaveLength(2)

    useLayoutStore.getState().reset()
    expect(useLayoutStore.getState().root).toBeUndefined()

    useLayoutStore.getState().carica(salvato)
    const dopo = useLayoutStore.getState()
    expect(listPaneIds(dopo.root!)).toEqual([a, b])
    expect(dopo.panes[a]?.ptyId).toBe('pty-a')
    expect(dopo.panes[a]?.cwd).toBe('C:\\uno')
    expect(dopo.panes[b]?.title).toBe('Secondo')
  })

  it('caricare un layout vuoto azzera lo stato', () => {
    const store = useLayoutStore.getState()
    store.reset()
    store.addPane('C:\\p', 'a')
    useLayoutStore.getState().carica({ root: undefined, panes: [] })
    expect(useLayoutStore.getState().root).toBeUndefined()
    expect(useLayoutStore.getState().panes).toEqual({})
  })

  it('esportare uno stato vuoto non produce riquadri', () => {
    useLayoutStore.getState().reset()
    expect(useLayoutStore.getState().esporta()).toEqual({ root: undefined, panes: [] })
  })

  it('carica scarta i dati dei riquadri che non sono nell albero', () => {
    useLayoutStore.getState().reset()
    useLayoutStore.getState().carica({
      root: { type: 'pane', id: 'x' },
      panes: [
        { id: 'x', sessionUuid: 'u1', cwd: 'C:\\p', title: 'x' },
        { id: 'orfano', sessionUuid: 'u2', cwd: 'C:\\p', title: 'y' }
      ]
    })
    expect(Object.keys(useLayoutStore.getState().panes)).toEqual(['x'])
  })

  it('esporta segue l albero e ignora un riquadro orfano rimasto nei dati', () => {
    // Nell'uso normale `panes` e l'albero restano allineati per costruzione
    // (closePane, applyPreset...), quindi questa incoerenza non nasce da
    // un'azione dello store: va iniettata direttamente per provare che
    // `esporta` non si fida di `panes` anche se un domani un altro bug la
    // producesse.
    useLayoutStore.getState().reset()
    const a = useLayoutStore.getState().addPane('C:\\p', 'a')
    useLayoutStore.setState((s) => ({
      panes: {
        ...s.panes,
        orfano: { id: 'orfano', sessionUuid: 'u', cwd: 'C:\\p', title: 'y' }
      }
    }))
    const salvato = useLayoutStore.getState().esporta()
    expect(salvato.panes.map((p) => p.id)).toEqual([a])
  })
})

describe('move', () => {
  it('sposta un riquadro conservandone i dati', () => {
    const store = useLayoutStore.getState()
    store.reset()
    const a = store.addPane('C:\\uno', 'Primo')
    const b = useLayoutStore.getState().addPane('C:\\due', 'Secondo')
    useLayoutStore.getState().setPtyId(a, 'pty-a')

    useLayoutStore.getState().move(a, b, 'sotto')
    const dopo = useLayoutStore.getState()
    expect(listPaneIds(dopo.root!)).toEqual([b, a])
    // Lo spostamento e' una riorganizzazione dell'albero: il terminale non deve
    // essere toccato, altrimenti trascinare un riquadro ucciderebbe la sessione.
    expect(dopo.panes[a]?.ptyId).toBe('pty-a')
    expect(dopo.panes[a]?.cwd).toBe('C:\\uno')
  })

  it('uno spostamento senza senso lascia lo stato identico', () => {
    const store = useLayoutStore.getState()
    store.reset()
    const a = store.addPane('C:\\p', 'a')
    useLayoutStore.getState().addPane('C:\\p', 'b')
    const prima = useLayoutStore.getState().root

    useLayoutStore.getState().move(a, a, 'destra')
    // Identita', non uguaglianza: se cambiasse riferimento zustand
    // rirenderizzerebbe e il Mosaic ricalcolerebbe la geometria per niente.
    expect(useLayoutStore.getState().root).toBe(prima)
  })

  it('il trascinamento in corso viene registrato e poi azzerato', () => {
    const store = useLayoutStore.getState()
    store.reset()
    const a = store.addPane('C:\\p', 'a')
    useLayoutStore.getState().iniziaTrascinamento(a)
    expect(useLayoutStore.getState().trascinato).toBe(a)
    useLayoutStore.getState().fineTrascinamento()
    expect(useLayoutStore.getState().trascinato).toBeUndefined()
  })

  it('staccare un riquadro lo rimuove e ne restituisce i dati', () => {
    const store = useLayoutStore.getState()
    store.reset()
    const a = store.addPane('C:\\uno', 'Primo')
    useLayoutStore.getState().addPane('C:\\due', 'Secondo')
    useLayoutStore.getState().setPtyId(a, 'pty-a')

    const dati = useLayoutStore.getState().staccaPane(a)
    expect(dati).toEqual({
      id: a, sessionUuid: expect.any(String), cwd: 'C:\\uno', title: 'Primo', ptyId: 'pty-a'
    })
    expect(useLayoutStore.getState().panes[a]).toBeUndefined()
    expect(listPaneIds(useLayoutStore.getState().root!)).not.toContain(a)
  })

  it('staccare marca il riquadro come ceduto, cosi il terminale non viene ucciso', () => {
    // E' l'unico segnale che il Terminal ha per distinguere «questo riquadro se
    // ne va in un'altra finestra» da «questo riquadro e' stato chiuso»: senza,
    // la pulizia dell'effetto ucciderebbe la sessione appena spostata.
    const store = useLayoutStore.getState()
    store.reset()
    const a = store.addPane('C:\\uno', 'Primo')
    useLayoutStore.getState().staccaPane(a)
    expect(useLayoutStore.getState().ceduti.has(a)).toBe(true)
  })

  it('staccare un riquadro inesistente restituisce undefined', () => {
    useLayoutStore.getState().reset()
    expect(useLayoutStore.getState().staccaPane('mai-esistito')).toBeUndefined()
  })

  it('accoglie un riquadro in arrivo da un altra finestra conservandone il pty', () => {
    const store = useLayoutStore.getState()
    store.reset()
    store.addPane('C:\\p', 'Locale')
    useLayoutStore.getState().accogliPane({
      id: 'pane-arrivato', sessionUuid: 'u-1', cwd: 'C:\\altro', title: 'Ospite', ptyId: 'pty-x'
    })
    const stato = useLayoutStore.getState()
    expect(stato.panes['pane-arrivato']?.ptyId).toBe('pty-x')
    expect(listPaneIds(stato.root!)).toContain('pane-arrivato')
  })

  it('accoglie un riquadro anche in una finestra vuota', () => {
    useLayoutStore.getState().reset()
    useLayoutStore.getState().accogliPane({
      id: 'pane-solo', sessionUuid: 'u-1', cwd: 'C:\\altro', title: 'Ospite'
    })
    expect(listPaneIds(useLayoutStore.getState().root!)).toEqual(['pane-solo'])
  })

  it('normalizza il titolo di un riquadro in arrivo', () => {
    useLayoutStore.getState().reset()
    useLayoutStore.getState().accogliPane({
      id: 'pane-ostile', sessionUuid: 'u-1', cwd: 'C:\\p', title: '" --dangerously "'
    })
    expect(useLayoutStore.getState().panes['pane-ostile']?.title).not.toContain('"')
  })

  it('non sovrascrive un riquadro gia presente con lo stesso id', () => {
    // Gli id sono uuid e non dovrebbero collidere: se succedesse, sovrascrivere
    // perderebbe un riquadro vivo insieme alla sua sessione.
    const store = useLayoutStore.getState()
    store.reset()
    const a = store.addPane('C:\\p', 'Locale')
    useLayoutStore.getState().accogliPane({
      id: a, sessionUuid: 'u-2', cwd: 'C:\\altro', title: 'Intruso'
    })
    expect(useLayoutStore.getState().panes[a]?.title).toBe('Locale')
    expect(listPaneIds(useLayoutStore.getState().root!)).toEqual([a])
  })

  it('un riquadro accolto dopo essere stato ceduto non resta marcato come ceduto', () => {
    // E' il ramo di recupero: lo spostamento fallisce e il riquadro torna qui.
    // Restando fra i ceduti, la sua chiusura non ucciderebbe piu' il terminale.
    const store = useLayoutStore.getState()
    store.reset()
    const a = store.addPane('C:\\p', 'Locale')
    const dati = useLayoutStore.getState().staccaPane(a)!
    useLayoutStore.getState().accogliPane(dati)
    expect(useLayoutStore.getState().ceduti.has(a)).toBe(false)
  })

  it('reset dimentica anche i riquadri ceduti', () => {
    const store = useLayoutStore.getState()
    store.reset()
    const a = store.addPane('C:\\p', 'a')
    useLayoutStore.getState().staccaPane(a)
    useLayoutStore.getState().reset()
    expect(useLayoutStore.getState().ceduti.size).toBe(0)
  })
})

describe('cambio di vista fra workspace', () => {
  beforeEach(() => useLayoutStore.getState().reset())

  it('i riquadri che escono di scena restano vivi invece di essere uccisi', () => {
    // E' la regola del punto 0-quinquies: un workspace e' una vista, non un
    // interruttore. `ceduti` e' l'unico segnale che il Terminal legge per
    // staccare invece di chiudere, quindi se `cambiaVista` non ce li mettesse
    // il cambio di workspace tornerebbe a uccidere il claude.exe di ogni chat,
    // autopiloti compresi.
    const a = useLayoutStore.getState().addPane('C:\\uno', 'Primo')
    useLayoutStore.getState().setPtyId(a, 'pty-a')

    useLayoutStore.getState().cambiaVista({ root: undefined, panes: [] })

    expect(useLayoutStore.getState().root).toBeUndefined()
    expect(useLayoutStore.getState().ceduti.has(a)).toBe(true)
  })

  it('i riquadri che rientrano smettono di essere ceduti e ritrovano il loro terminale', () => {
    // Tornando nel workspace la chiusura di una chat deve tornare a uccidere il
    // suo terminale: restando fra i ceduti resterebbe un claude.exe che nessuno
    // guarda e che nessuno chiudera' mai. Il `ptyId` che sopravvive e' l'altra
    // meta': e' cio' a cui il riquadro si riaggancia invece di ripartire.
    const a = useLayoutStore.getState().addPane('C:\\uno', 'Primo')
    useLayoutStore.getState().setPtyId(a, 'pty-a')
    const salvato = useLayoutStore.getState().esporta()

    useLayoutStore.getState().cambiaVista({ root: undefined, panes: [] })
    useLayoutStore.getState().cambiaVista(salvato)

    expect(useLayoutStore.getState().ceduti.has(a)).toBe(false)
    expect(useLayoutStore.getState().panes[a]?.ptyId).toBe('pty-a')
  })

  it('un riquadro che resta a schermo non finisce fra i ceduti', () => {
    // Riapplicare la stessa vista — succede quando un cambio viene rifiutato e
    // il Core restituisce il layout di prima — non deve marcare come ceduto un
    // riquadro che non si e' mosso: da li' in poi chiuderlo non ucciderebbe
    // piu' il suo terminale.
    const a = useLayoutStore.getState().addPane('C:\\uno', 'Primo')
    const stessa = useLayoutStore.getState().esporta()

    useLayoutStore.getState().cambiaVista(stessa)

    expect(useLayoutStore.getState().ceduti.has(a)).toBe(false)
  })

  it('dimenticare i riquadri di un workspace spento li toglie dai ceduti', () => {
    // Dopo lo spegnimento quei terminali sono chiusi davvero: lasciarli fra i
    // ceduti terrebbe in piedi una promessa — «qualcuno tornera' a
    // riagganciarsi» — che nessuno mantiene piu', e l'insieme crescerebbe di
    // una voce per riquadro a ogni cambio di vista, per tutta la sessione.
    const a = useLayoutStore.getState().addPane('C:\\uno', 'Primo')
    useLayoutStore.getState().cambiaVista({ root: undefined, panes: [] })

    useLayoutStore.getState().dimenticaCeduti([a])

    expect(useLayoutStore.getState().ceduti.has(a)).toBe(false)
  })
})

describe('ibernare una chat', () => {
  beforeEach(() => useLayoutStore.getState().reset())

  it('la fa dormire e dice quale terminale chiudere', () => {
    // Ogni chat aperta tiene acceso un claude.exe: con qualche workspace pieno
    // se ne tengono dieci per guardarne due.
    const s = useLayoutStore.getState()
    const id = s.addPane('C:\p', 'Progetto')
    s.setPtyId(id, 'pty-1')
    expect(useLayoutStore.getState().iberna(id)).toBe('pty-1')
    const dopo = useLayoutStore.getState().panes[id]
    expect(dopo?.ibernata).toBe(true)
    // Il ptyId sparisce con il processo: tenerlo vorrebbe dire provare a
    // riagganciare un terminale che non c'è più, e la chat resterebbe vuota
    // senza dire perché.
    expect(dopo?.ptyId).toBeUndefined()
  })

  it('non dice niente da chiudere se non era acceso niente', () => {
    const s = useLayoutStore.getState()
    const id = s.addPane('C:\p', 'Progetto')
    expect(useLayoutStore.getState().iberna(id)).toBeUndefined()
    expect(useLayoutStore.getState().panes[id]?.ibernata).toBe(true)
  })

  it('ibernare due volte non chiude due volte', () => {
    const s = useLayoutStore.getState()
    const id = s.addPane('C:\p', 'Progetto')
    s.setPtyId(id, 'pty-1')
    useLayoutStore.getState().iberna(id)
    expect(useLayoutStore.getState().iberna(id)).toBeUndefined()
  })

  it('la conversazione resta: si sveglia dov era', () => {
    const s = useLayoutStore.getState()
    const id = s.addPane('C:\p', 'Progetto')
    const sessione = useLayoutStore.getState().panes[id]?.sessionUuid
    useLayoutStore.getState().iberna(id)
    useLayoutStore.getState().sveglia(id)
    const dopo = useLayoutStore.getState().panes[id]
    expect(dopo?.ibernata).toBe(false)
    // La stessa sessione: al risveglio si riprende con --resume, non si
    // ricomincia da capo.
    expect(dopo?.sessionUuid).toBe(sessione)
  })

  it('una chat che dorme resta a dormire anche dopo il salvataggio', () => {
    // Riaprire il programma e ritrovarsele tutte accese sarebbe disfare la
    // scelta.
    const s = useLayoutStore.getState()
    const id = s.addPane('C:\p', 'Progetto')
    useLayoutStore.getState().iberna(id)
    const salvato = useLayoutStore.getState().esporta()
    expect(salvato.panes.find((p) => p.id === id)?.ibernata).toBe(true)

    useLayoutStore.getState().reset()
    useLayoutStore.getState().carica(salvato)
    expect(useLayoutStore.getState().panes[id]?.ibernata).toBe(true)
  })

  it('una chat sveglia non porta il campo nel salvataggio', () => {
    const s = useLayoutStore.getState()
    const id = s.addPane('C:\p', 'Progetto')
    const salvato = useLayoutStore.getState().esporta()
    expect(salvato.panes.find((p) => p.id === id)).not.toHaveProperty('ibernata')
  })
})

describe('il padrone di un riquadro sopravvive', () => {
  // Il legame chat-autopilota viveva solo in memoria: al riavvio il riquadro
  // tornava senza padrone, claude.exe ripartiva senza `--settings` e quindi
  // senza hook `Stop`, e l'autopilota restava a zero cicli per sempre.
  const suo = { id: 'ap-1', chat: 'ap-1-3075' }
  beforeEach(() => useLayoutStore.getState().reset())

  it('al salvataggio', () => {
    const id = useLayoutStore.getState().addPane('C:\p', 'Governata', undefined, { autopilota: suo })
    expect(useLayoutStore.getState().esporta().panes[0]?.autopilota).toEqual(suo)
  })

  it('anche quando gli viene consegnata una chat gia aperta', () => {
    const id = useLayoutStore.getState().addPane('C:\p', 'Mia')
    useLayoutStore.getState().assegnaAutopilota(id, suo)
    expect(useLayoutStore.getState().esporta().panes[0]?.autopilota).toEqual(suo)
  })

  it('e al ritorno da disco', () => {
    const id = useLayoutStore.getState().addPane('C:\p', 'Governata', undefined, { autopilota: suo })
    const salvato = useLayoutStore.getState().esporta()
    useLayoutStore.getState().reset()
    useLayoutStore.getState().carica(salvato)
    expect(useLayoutStore.getState().panes[id]?.autopilota).toEqual(suo)
  })

  it('al cambio di workspace', () => {
    const id = useLayoutStore.getState().addPane('C:\p', 'Governata', undefined, { autopilota: suo })
    const salvato = useLayoutStore.getState().esporta()
    useLayoutStore.getState().reset()
    useLayoutStore.getState().cambiaVista(salvato)
    expect(useLayoutStore.getState().panes[id]?.autopilota).toEqual(suo)
  })

  it('e allo spostamento in un altra finestra', () => {
    const id = useLayoutStore.getState().addPane('C:\p', 'Governata', undefined, { autopilota: suo })
    const dati = useLayoutStore.getState().staccaPane(id)!
    expect(dati.autopilota).toEqual(suo)
    useLayoutStore.getState().reset()
    useLayoutStore.getState().accogliPane(dati)
    expect(useLayoutStore.getState().panes[id]?.autopilota).toEqual(suo)
  })

  it('una chat senza padrone non se ne inventa uno', () => {
    useLayoutStore.getState().addPane('C:\p', 'Libera')
    expect(useLayoutStore.getState().esporta().panes[0]?.autopilota).toBeUndefined()
  })
})

describe('setPtyId', () => {
  it('lo stesso id non produce uno stato nuovo', () => {
    // Conta da quando anche il riaggancio annuncia il proprio id: senza questa
    // guardia ogni riquadro riagganciato genererebbe un salvataggio del layout
    // che non ha niente da salvare.
    const store = useLayoutStore.getState()
    store.reset()
    useLayoutStore.setState({
      panes: { p1: { id: 'p1', cwd: 'c', title: 't', sessionUuid: 's', ptyId: 'x' } as never }
    })
    const prima = useLayoutStore.getState().panes
    useLayoutStore.getState().setPtyId('p1', 'x')
    expect(useLayoutStore.getState().panes).toBe(prima)
    useLayoutStore.getState().setPtyId('p1', 'y')
    expect(useLayoutStore.getState().panes).not.toBe(prima)
  })
})
