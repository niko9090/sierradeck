import { describe, it, expect } from 'vitest'
import { chatDaRiprendere, daRiprendere, intervisteDaRiprendere } from '../../src/autopilot-host/ripresa'
import { riportaChiAspettava } from '../../src/autopilot-host/ripresa'
import { nuovoAutopilota, type Autopilota , limitiPredefiniti } from '@shared/autopilota'

function ap(over: Partial<Autopilota> = {}): Autopilota {
  return {
    ...nuovoAutopilota({
      id: 'ap-1', nome: 'n', obiettivo: 'o', cwd: 'C:\\p',
      criteri: [{ descrizione: 'c', comando: 'npm test', soddisfatto: false }],
      iniziatoIl: '2026-08-09T10:00:00.000Z'
    }),
    ...over
  }
}

describe('daRiprendere', () => {
  it('riprende gli autopiloti che risultavano al lavoro', () => {
    // Nessuno li ha fermati: si sono interrotti perche' il PC si e' spento.
    expect(daRiprendere([ap({ id: 'ap-1', stato: 'lavoro' })]).map((a) => a.id)).toEqual(['ap-1'])
  })

  it('non riprende cio che era sospeso, finito o fallito', () => {
    const fermi = [
      ap({ id: 'a', stato: 'sospeso' }),
      ap({ id: 'b', stato: 'finito' }),
      ap({ id: 'c', stato: 'fallito' })
    ]
    expect(daRiprendere(fermi)).toEqual([])
  })

  it('non riprende chi aspetta una risposta', () => {
    // Riprenderlo significherebbe rimandarlo a lavorare senza la risposta che
    // stava aspettando: rifarebbe la stessa domanda.
    expect(daRiprendere([ap({ stato: 'attesa' })])).toEqual([])
  })

  it('non riprende chi ha gia consumato un tetto di cicli che si era dato', () => {
    // Il tetto e' stato raggiunto prima dello spegnimento: farlo ripartire
    // disferebbe una scelta di chi lo ha messo.
    const conTetto = ap({ stato: 'lavoro', cicli: 50, limiti: { ...limitiPredefiniti(), cicliMax: 50 } })
    expect(daRiprendere([conTetto])).toEqual([])
  })

  it('senza tetto di cicli riprende comunque, per quanti giri abbia fatto', () => {
    // Il tetto predefinito non c'e': fermarsi a un numero che nessuno ha
    // scelto e' proprio il guasto che si voleva togliere.
    expect(daRiprendere([ap({ stato: 'lavoro', cicli: 9999 })])).toHaveLength(1)
  })

  it('riprende piu autopiloti insieme', () => {
    const molti = [
      ap({ id: 'a', stato: 'lavoro' }),
      ap({ id: 'b', stato: 'sospeso' }),
      ap({ id: 'c', stato: 'lavoro' })
    ]
    expect(daRiprendere(molti).map((a) => a.id)).toEqual(['a', 'c'])
  })
})

describe('la scelta per singolo autopilota', () => {
  it('non riprende chi e stato messo da parte', () => {
    // Uno che lavora tutta la notte deve ripartire da solo; un altro che stava
    // provando qualcosa no. E' una scelta per autopilota, non per programma.
    const fermo = ap({ stato: 'lavoro', riprendiAlRiavvio: false })
    expect(daRiprendere([fermo])).toEqual([])
  })

  it('senza indicazione riprende, come ha sempre fatto', () => {
    expect(daRiprendere([ap({ stato: 'lavoro' })])).toHaveLength(1)
    expect(daRiprendere([ap({ stato: 'lavoro', riprendiAlRiavvio: true })])).toHaveLength(1)
  })
})

describe('intervisteDaRiprendere', () => {
  it('riprende chi si e interrotto mentre si preparava', () => {
    // Sul campo: un autopilota creato alle 10:25 e' rimasto «sta preparando»
    // per un'ora, perche' l'app e' stata riavviata mentre l'intervista era in
    // corso e nessuno la riprendeva. Non aveva nemmeno una domanda aperta a cui
    // rispondere: non c'era alcun modo di sbloccarlo.
    const fermo = ap({ id: 'ap-1', stato: 'intervista', criteri: [] })
    expect(intervisteDaRiprendere([fermo]).map((a) => a.id)).toEqual(['ap-1'])
  })

  it('lascia stare chi non si stava preparando', () => {
    const altri = [
      ap({ id: 'a', stato: 'lavoro' }),
      ap({ id: 'b', stato: 'attesa' }),
      ap({ id: 'c', stato: 'sospeso' }),
      ap({ id: 'd', stato: 'finito' })
    ]
    expect(intervisteDaRiprendere(altri)).toEqual([])
  })

  it('rispetta la scelta di non ripartire al riavvio', () => {
    expect(intervisteDaRiprendere([ap({ stato: 'intervista', riprendiAlRiavvio: false })])).toEqual([])
  })
})

describe('quali chat riprendere di un autopilota', () => {
  it('senza flotta, la sua unica chat', () => {
    // `undefined` vuol dire «la chat dell'autopilota», quella che non ha un id
    // suo perche' non ce n'e' un'altra da cui distinguerla.
    expect(chatDaRiprendere(ap({ stato: 'lavoro' }))).toEqual([undefined])
  })

  it('con una flotta, ognuna delle sue chat vive', () => {
    // Riprenderlo come se avesse una chat sola lasciava orfane quelle della
    // flotta e ne apriva una terza con l'obiettivo intero: tre conversazioni
    // per un lavoro diviso in due.
    const flotta = ap({
      stato: 'lavoro',
      tettoChat: 3,
      chats: [
        { id: 'c-1', compito: 'i bug', stato: 'lavoro', cicli: 2, sessionId: 's-1' },
        { id: 'c-2', compito: 'le proposte', stato: 'lavoro', cicli: 1, sessionId: 's-2' }
      ]
    })
    expect(chatDaRiprendere(flotta).map((c) => c?.id)).toEqual(['c-1', 'c-2'])
  })

  it('non riprende una chat che aveva gia finito', () => {
    const mista = ap({
      stato: 'lavoro',
      tettoChat: 2,
      chats: [
        { id: 'c-1', compito: 'a', stato: 'finita', cicli: 5 },
        { id: 'c-2', compito: 'b', stato: 'lavoro', cicli: 1 }
      ]
    })
    expect(chatDaRiprendere(mista).map((c) => c?.id)).toEqual(['c-2'])
  })

  it('una flotta le cui chat hanno finito tutte non riparte a mani vuote', () => {
    // Nessuna chat da riprendere e nessun compito in coda: aprirne una con
    // l'obiettivo intero rifarebbe da capo un lavoro gia' fatto.
    const finita = ap({
      stato: 'lavoro',
      tettoChat: 2,
      chats: [{ id: 'c-1', compito: 'a', stato: 'finita', cicli: 5 }]
    })
    expect(chatDaRiprendere(finita)).toEqual([])
  })
})

describe('riportaChiAspettava — le domande aperte muoiono col servizio', () => {
  it('chi era in attesa torna al lavoro, con una riga nel diario', () => {
    // La domanda vive in memoria: un processo appena nato non ce l'ha piu'.
    // Lasciarlo in `attesa` vuol dire fermo per sempre, saltato dalla ripresa
    // e dal guardiano, senza niente da rispondere.
    const attesa = { ...nuovoAutopilota({ id: 'a', nome: 'a', obiettivo: 'o', cwd: 'C:\\p', criteri: [], iniziatoIl: 't0' }), stato: 'attesa' as const }
    const lavoro = { ...nuovoAutopilota({ id: 'b', nome: 'b', obiettivo: 'o', cwd: 'C:\\p', criteri: [], iniziatoIl: 't0' }), stato: 'lavoro' as const }
    const sospeso = { ...nuovoAutopilota({ id: 'c', nome: 'c', obiettivo: 'o', cwd: 'C:\\p', criteri: [], iniziatoIl: 't0' }), stato: 'sospeso' as const }
    const rimessi = riportaChiAspettava([attesa, lavoro, sospeso], '2026-09-03T12:00:00.000Z')
    expect(rimessi.map((a) => a.id)).toEqual(['a'])
    expect(rimessi[0]?.stato).toBe('lavoro')
    expect(rimessi[0]?.ultimoEvento).toBe('2026-09-03T12:00:00.000Z')
    expect(rimessi[0]?.decisioni.at(-1)?.cosa).toContain('domanda')
  })
})
