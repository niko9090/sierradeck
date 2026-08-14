import { describe, it, expect } from 'vitest'
import {
  parseAutopilota, nuovoAutopilota, limitiPredefiniti, VERSIONE_AUTOPILOTA
} from '@shared/autopilota'

function valido(): unknown {
  return {
    versione: VERSIONE_AUTOPILOTA,
    id: 'ap-1',
    nome: 'Test verdi',
    obiettivo: 'Fai passare la suite',
    cwd: 'C:\\progetto',
    criteri: [{ descrizione: 'i test passano', comando: 'npm test', soddisfatto: false }],
    stato: 'lavoro',
    cicli: 0,
    iniziatoIl: '2026-08-09T10:00:00.000Z',
    ultimoEvento: '2026-08-09T10:00:00.000Z',
    decisioni: [],
    limiti: { cicliMax: 50, minutiMax: 360, stalloMax: 3 }
  }
}

describe('parseAutopilota', () => {
  it('legge un autopilota ben formato', () => {
    const { autopilota, scartati } = parseAutopilota(valido())
    expect(scartati).toEqual([])
    expect(autopilota?.id).toBe('ap-1')
    expect(autopilota?.criteri[0]?.comando).toBe('npm test')
  })

  it('rifiuta cio che non e un oggetto', () => {
    for (const raw of [null, undefined, 42, 'niente', []]) {
      const { autopilota, scartati } = parseAutopilota(raw)
      expect(autopilota).toBeUndefined()
      expect(scartati.length).toBeGreaterThan(0)
    }
  })

  it('rifiuta un autopilota senza id, obiettivo o cwd', () => {
    for (const campo of ['id', 'obiettivo', 'cwd']) {
      const rotto = { ...(valido() as Record<string, unknown>) }
      delete rotto[campo]
      const { autopilota, scartati } = parseAutopilota(rotto)
      expect(autopilota).toBeUndefined()
      expect(scartati.some((s) => s.includes(campo))).toBe(true)
    }
  })

  it('rifiuta un file di versione futura invece di interpretarlo a caso', () => {
    const { autopilota, scartati } = parseAutopilota({
      ...(valido() as Record<string, unknown>), versione: VERSIONE_AUTOPILOTA + 1
    })
    expect(autopilota).toBeUndefined()
    expect(scartati.some((s) => s.includes('versione'))).toBe(true)
  })

  it('scarta un criterio malformato conservando i validi', () => {
    const { autopilota, scartati } = parseAutopilota({
      ...(valido() as Record<string, unknown>),
      criteri: [
        { descrizione: 'buono', soddisfatto: false },
        { comando: 'npm test' },
        'non sono un criterio'
      ]
    })
    expect(autopilota?.criteri.map((c) => c.descrizione)).toEqual(['buono'])
    expect(scartati.length).toBe(2)
  })

  it('ferma un autopilota rimasto senza criteri invece di buttarlo', () => {
    // Senza criteri non esiste un modo di sapere quando fermarsi: l'autopilota
    // lavorerebbe fino al tetto, cioe' per ore, e chiamerebbe finito un lavoro
    // che nessuno ha definito. Ma rifiutare il file lo faceva mettere da parte
    // come illeggibile, e l'autopilota spariva dall'elenco: la stessa
    // protezione si ottiene fermandolo, e cosi' l'utente lo vede e sa perche'.
    const { autopilota, scartati } = parseAutopilota({
      ...(valido() as Record<string, unknown>), criteri: []
    })
    expect(autopilota?.stato).toBe('sospeso')
    expect(autopilota?.motivoSospensione).toContain('criteri')
    expect(scartati.some((s) => s.includes('criteri'))).toBe(true)
  })

  it('riporta uno stato sconosciuto a sospeso invece di inventarlo', () => {
    // 'lavoro' sarebbe la scelta pericolosa: farebbe ripartire da solo un
    // autopilota il cui stato non sappiamo leggere.
    const { autopilota, scartati } = parseAutopilota({
      ...(valido() as Record<string, unknown>), stato: 'danzante'
    })
    expect(autopilota?.stato).toBe('sospeso')
    expect(scartati.some((s) => s.includes('stato'))).toBe(true)
  })

  it('rimpiazza limiti assurdi con quelli predefiniti', () => {
    const { autopilota } = parseAutopilota({
      ...(valido() as Record<string, unknown>),
      limiti: { cicliMax: -5, minutiMax: 'molti', stalloMax: 0 }
    })
    expect(autopilota?.limiti).toEqual(limitiPredefiniti())
  })

  it('normalizza cicli e decisioni mancanti', () => {
    const senza = { ...(valido() as Record<string, unknown>) }
    delete senza.cicli
    delete senza.decisioni
    const { autopilota } = parseAutopilota(senza)
    expect(autopilota?.cicli).toBe(0)
    expect(autopilota?.decisioni).toEqual([])
  })
})

describe('nuovoAutopilota', () => {
  it('e valido secondo il proprio parser', () => {
    const a = nuovoAutopilota({
      id: 'ap-2', nome: 'Nuovo', obiettivo: 'Obiettivo', cwd: 'C:\\p',
      criteri: [{ descrizione: 'fatto', soddisfatto: false }],
      iniziatoIl: '2026-08-09T10:00:00.000Z'
    })
    const { autopilota, scartati } = parseAutopilota({ ...a, versione: VERSIONE_AUTOPILOTA })
    expect(scartati).toEqual([])
    expect(autopilota?.stato).toBe('lavoro')
    expect(autopilota?.cicli).toBe(0)
  })
})

describe('flotta di chat', () => {
  it('un autopilota nuovo governa una chat sola', () => {
    // Il caso normale resta il piu' semplice: chi non chiede parallelismo non
    // deve ritrovarsi sei claude.exe aperti.
    const a = nuovoAutopilota({
      id: 'ap-1', nome: 'n', obiettivo: 'o', cwd: 'C:\\p',
      criteri: [{ descrizione: 'c', soddisfatto: false }],
      iniziatoIl: '2026-08-09T10:00:00.000Z'
    })
    expect(a.tettoChat).toBe(1)
    expect(a.chats).toEqual([])
    expect(a.compitiDaFare).toEqual([])
  })

  it('accetta un tetto di chat superiore a uno', () => {
    const a = nuovoAutopilota({
      id: 'ap-1', nome: 'n', obiettivo: 'o', cwd: 'C:\\p',
      criteri: [{ descrizione: 'c', soddisfatto: false }],
      iniziatoIl: '2026-08-09T10:00:00.000Z',
      tettoChat: 3
    })
    expect(a.tettoChat).toBe(3)
  })

  it('legge chat e compiti salvati', () => {
    const { autopilota, scartati } = parseAutopilota({
      ...(valido() as Record<string, unknown>),
      tettoChat: 2,
      chats: [{ id: 'c-1', compito: 'scrivi i test', stato: 'lavoro', cicli: 2, sessionId: 's-1' }],
      compitiDaFare: ['aggiorna la documentazione']
    })
    expect(scartati).toEqual([])
    expect(autopilota?.tettoChat).toBe(2)
    expect(autopilota?.chats[0]?.compito).toBe('scrivi i test')
    expect(autopilota?.compitiDaFare).toEqual(['aggiorna la documentazione'])
  })

  it('scarta una chat malformata e tiene le buone', () => {
    const { autopilota, scartati } = parseAutopilota({
      ...(valido() as Record<string, unknown>),
      chats: [{ id: 'c-1', compito: 'buona', stato: 'lavoro', cicli: 0 }, { compito: 'senza id' }, 42]
    })
    expect(autopilota?.chats.map((c) => c.id)).toEqual(['c-1'])
    expect(scartati.length).toBe(2)
  })

  it('riporta a uno un tetto di chat assurdo', () => {
    for (const tetto of [0, -3, 'molte', 99]) {
      const { autopilota } = parseAutopilota({ ...(valido() as Record<string, unknown>), tettoChat: tetto })
      expect(autopilota?.tettoChat).toBe(tetto === 99 ? 8 : 1)
    }
  })

  it('riporta a lavoro uno stato di chat sconosciuto', () => {
    // Al contrario dell'autopilota, qui «lavoro» e' la scelta prudente: una chat
    // che risulta finita per sbaglio verrebbe dimenticata con il suo processo
    // ancora vivo.
    const { autopilota } = parseAutopilota({
      ...(valido() as Record<string, unknown>),
      chats: [{ id: 'c-1', compito: 'x', stato: 'danzante', cicli: 0 }]
    })
    expect(autopilota?.chats[0]?.stato).toBe('lavoro')
  })
})

describe('autopilota in intervista', () => {
  it('e valido anche senza criteri, perche sara l intervista a produrli', () => {
    const { autopilota, scartati } = parseAutopilota({
      ...(valido() as Record<string, unknown>),
      stato: 'intervista',
      criteri: []
    })
    expect(autopilota?.stato).toBe('intervista')
    expect(scartati).toEqual([])
  })

  it('conserva le domande gia fatte, cosi un riavvio non le ripete', () => {
    const { autopilota } = parseAutopilota({
      ...(valido() as Record<string, unknown>),
      stato: 'intervista',
      criteri: [],
      intervista: [{ domanda: 'Quale formato?', risposta: 'YAML' }, { domanda: 'senza risposta' }]
    })
    expect(autopilota?.intervista).toEqual([{ domanda: 'Quale formato?', risposta: 'YAML' }])
  })

  it('senza criteri e senza intervista non lavora', () => {
    // In ogni altro stato l'assenza di criteri e' il difetto che era: nessun
    // modo di sapere quando fermarsi. Si ferma, e resta li' da guardare.
    const { autopilota } = parseAutopilota({
      ...(valido() as Record<string, unknown>), stato: 'lavoro', criteri: []
    })
    expect(autopilota?.stato).toBe('sospeso')
  })
})

describe('criteri e stati che non lavorano', () => {
  it('un intervista fallita resta leggibile invece di sparire', () => {
    // Rifiutare il file lo farebbe mettere da parte come illeggibile: l'utente
    // resterebbe senza autopilota e senza sapere perche'.
    const { autopilota } = parseAutopilota({
      ...(valido() as Record<string, unknown>),
      stato: 'sospeso',
      criteri: [],
      motivoSospensione: 'la preparazione non ha prodotto una configurazione leggibile'
    })
    expect(autopilota?.stato).toBe('sospeso')
    expect(autopilota?.motivoSospensione).toContain('preparazione')
  })

  it('ma uno al lavoro senza criteri viene fermato', () => {
    // Li' l'assenza e' il difetto che era: nessun modo di sapere quando finire.
    // Osservato sul campo: il tasto «Riprendi» premuto su un autopilota in
    // intervista lo portava a «lavoro» senza criteri, e al giro dopo il file
    // veniva messo da parte come illeggibile — l'autopilota spariva.
    expect(parseAutopilota({
      ...(valido() as Record<string, unknown>), stato: 'lavoro', criteri: []
    }).autopilota?.stato).toBe('sospeso')
    expect(parseAutopilota({
      ...(valido() as Record<string, unknown>), stato: 'attesa', criteri: []
    }).autopilota?.stato).toBe('sospeso')
  })
})

describe('pronto: il cancello prima di partire', () => {
  it('e uno stato leggibile come gli altri', () => {
    // Finita la preparazione l'autopilota non parte piu' da solo: si mette qui
    // e aspetta un clic. Sono ore di lavoro che cominciano su criteri che
    // l'utente non ha mai letto — dieci secondi di lettura le valgono.
    const { autopilota, scartati } = parseAutopilota({ ...(valido() as object), stato: 'pronto' })
    expect(scartati).toEqual([])
    expect(autopilota?.stato).toBe('pronto')
  })

  it('senza criteri non puo essere pronto: non ha una fine da raggiungere', () => {
    const { autopilota } = parseAutopilota({ ...(valido() as object), stato: 'pronto', criteri: [] })
    expect(autopilota?.stato).toBe('sospeso')
  })
})

describe('la prova di ogni criterio', () => {
  it('ricorda com e andata l ultima volta', () => {
    // E' la riga che spiega cosa sia un criterio senza definirlo: accanto a «i
    // test passano» si legge `npm test` e come e' finita ieri sera.
    const { autopilota, scartati } = parseAutopilota({
      ...(valido() as object),
      criteri: [{
        descrizione: 'i test passano',
        comando: 'npm test',
        soddisfatto: false,
        ultimaVerifica: { quando: '2026-08-13T23:14:00.000Z', codice: 1, uscita: '3 test rossi' }
      }]
    })
    expect(scartati).toEqual([])
    expect(autopilota?.criteri[0]?.ultimaVerifica?.uscita).toBe('3 test rossi')
    expect(autopilota?.criteri[0]?.ultimaVerifica?.codice).toBe(1)
  })

  it('una verifica malformata sparisce senza portarsi via il criterio', () => {
    const { autopilota } = parseAutopilota({
      ...(valido() as object),
      criteri: [{ descrizione: 'i test passano', soddisfatto: false, ultimaVerifica: 'ieri' }]
    })
    expect(autopilota?.criteri).toHaveLength(1)
    expect(autopilota?.criteri[0]?.ultimaVerifica).toBeUndefined()
  })
})

describe('le modifiche dette a parole', () => {
  it('conserva cosa hai chiesto, cosa ha capito, e com era prima', () => {
    // La fotografia di prima e' cio' che rende «disfa» un tasto vero: senza,
    // «applica subito» sarebbe una porta a senso unico.
    const { autopilota, scartati } = parseAutopilota({
      ...(valido() as object),
      modifiche: [{
        quando: '2026-08-14T00:41:00.000Z',
        testo: 'lascia stare i test, pensa all installer',
        capito: 'tolto «i test passano», aggiunto «l installer risponde 200»',
        prima: {
          obiettivo: 'Fai passare la suite',
          criteri: [{ descrizione: 'i test passano', comando: 'npm test', soddisfatto: false }],
          compitiDaFare: ['correggere i test']
        }
      }]
    })
    expect(scartati).toEqual([])
    expect(autopilota?.modifiche).toHaveLength(1)
    expect(autopilota?.modifiche[0]?.prima.criteri[0]?.descrizione).toBe('i test passano')
    expect(autopilota?.modifiche[0]?.prima.compitiDaFare).toEqual(['correggere i test'])
  })

  it('una modifica senza la fotografia di prima si scarta: non si potrebbe disfare', () => {
    const { autopilota } = parseAutopilota({
      ...(valido() as object),
      modifiche: [{ quando: '2026-08-14T00:41:00.000Z', testo: 'x', capito: 'y' }]
    })
    expect(autopilota?.modifiche).toEqual([])
  })

  it('un autopilota nuovo non ne ha nessuna', () => {
    const a = nuovoAutopilota({
      id: 'ap-1', nome: 'x', obiettivo: 'y', cwd: 'C:\p',
      criteri: [{ descrizione: 'c', soddisfatto: false }], iniziatoIl: '2026-08-14T00:00:00.000Z'
    })
    expect(a.modifiche).toEqual([])
    expect(parseAutopilota({ ...a, versione: VERSIONE_AUTOPILOTA }).scartati).toEqual([])
  })
})

describe('cosa gli hai chiesto, e cosa ne ha capito', () => {
  it('conserva le tue parole accanto a quelle sue', () => {
    // La preparazione riscrive l'obiettivo con parole sue — piu' precise, ma
    // **sue**. Quello che avevi scritto tu spariva, e con lui l'unico modo di
    // giudicare se aveva capito bene.
    const { autopilota, scartati } = parseAutopilota({
      ...(valido() as object),
      obiettivo: 'Fare passare la suite di test senza saltarne nessuno',
      obiettivoTuo: 'fai passare i test'
    })
    expect(scartati).toEqual([])
    expect(autopilota?.obiettivoTuo).toBe('fai passare i test')
    expect(autopilota?.obiettivo).toBe('Fare passare la suite di test senza saltarne nessuno')
  })

  it('un autopilota nuovo nasce con le tue parole gia dentro', () => {
    const a = nuovoAutopilota({
      id: 'ap-1', nome: 'x', obiettivo: 'fai passare i test', cwd: 'C:\p',
      criteri: [{ descrizione: 'c', soddisfatto: false }], iniziatoIl: '2026-08-14T00:00:00.000Z'
    })
    expect(a.obiettivoTuo).toBe('fai passare i test')
  })
})

describe('quando un criterio e stato raggiunto', () => {
  it('si ricorda il momento, non solo la spunta', () => {
    // «Puntarli» vuol dire vedere quali ha raggiunto e **quando**: una spunta
    // senza data non dice se e' successo adesso o tre ore fa.
    const { autopilota, scartati } = parseAutopilota({
      ...(valido() as object),
      criteri: [{
        descrizione: 'i test passano', comando: 'npm test',
        soddisfatto: true, raggiuntoIl: '2026-08-14T14:32:00.000Z'
      }]
    })
    expect(scartati).toEqual([])
    expect(autopilota?.criteri[0]?.raggiuntoIl).toBe('2026-08-14T14:32:00.000Z')
  })

  it('una data illeggibile sparisce senza portarsi via il criterio', () => {
    const { autopilota } = parseAutopilota({
      ...(valido() as object),
      criteri: [{ descrizione: 'x', soddisfatto: true, raggiuntoIl: 42 }]
    })
    expect(autopilota?.criteri).toHaveLength(1)
    expect(autopilota?.criteri[0]?.raggiuntoIl).toBeUndefined()
  })
})
