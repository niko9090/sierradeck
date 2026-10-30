import { describe, it, expect } from 'vitest'
import {
  parseAutopilota, nuovoAutopilota, VERSIONE_AUTOPILOTA,
  portaAutopilotiDa, AMBIENTE_PORTA_AUTOPILOTI, PORTA_AUTOPILOTA
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
    expect(autopilota?.obiettivo).toBe('Fai passare la suite')
  })

  it('un file di prima della 0.27.0 parte con il dialogo vuoto, senza avvisi', () => {
    const { autopilota, scartati } = parseAutopilota(valido())
    expect(scartati).toEqual([])
    expect(autopilota?.dialogo).toEqual([])
    expect(autopilota?.daConsegnare).toEqual([])
  })

  it('legge il dialogo e i messaggi in attesa, scartando le battute rotte', () => {
    const { autopilota } = parseAutopilota({
      ...(valido() as Record<string, unknown>),
      dialogo: [
        { quando: '2026-09-14T10:00:00.000Z', da: 'tu', testo: 'dove sei?' },
        { quando: '2026-09-14T10:01:00.000Z', da: 'lui', testo: 'al secondo', esito: 'nessun cambio' },
        { quando: '2026-09-14T10:02:00.000Z', da: 'noi', testo: 'chi?' },
        { da: 'tu', testo: 'senza data' },
        'non una battuta'
      ],
      daConsegnare: [
        { id: 'm-1', quando: '2026-09-14T10:00:00.000Z', testo: 'usa pnpm', chats: ['ap-1'] },
        { id: 'm-2', quando: '2026-09-14T10:00:00.000Z', testo: 'gia consegnato', chats: [] },
        { id: 'm-3', quando: '2026-09-14T10:00:00.000Z', chats: ['ap-1'] }
      ]
    })
    expect(autopilota?.dialogo).toEqual([
      { quando: '2026-09-14T10:00:00.000Z', da: 'tu', testo: 'dove sei?' },
      { quando: '2026-09-14T10:01:00.000Z', da: 'lui', testo: 'al secondo', esito: 'nessun cambio' }
    ])
    expect(autopilota?.daConsegnare).toEqual([
      { id: 'm-1', quando: '2026-09-14T10:00:00.000Z', testo: 'usa pnpm', chats: ['ap-1'] }
    ])
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

  it('riporta uno stato sconosciuto a sospeso invece di inventarlo', () => {
    // 'lavoro' sarebbe la scelta pericolosa: farebbe ripartire da solo un
    // autopilota il cui stato non sappiamo leggere.
    const { autopilota, scartati } = parseAutopilota({
      ...(valido() as Record<string, unknown>), stato: 'danzante'
    })
    expect(autopilota?.stato).toBe('sospeso')
    expect(scartati.some((s) => s.includes('stato'))).toBe(true)
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
      iniziatoIl: '2026-08-09T10:00:00.000Z'
    })
    expect(a.tettoChat).toBe(1)
    expect(a.chats).toEqual([])
  })

  it('accetta un tetto di chat superiore a uno', () => {
    const a = nuovoAutopilota({
      id: 'ap-1', nome: 'n', obiettivo: 'o', cwd: 'C:\\p',
      iniziatoIl: '2026-08-09T10:00:00.000Z',
      tettoChat: 3
    })
    expect(a.tettoChat).toBe(3)
  })

  it('legge le chat salvate', () => {
    const { autopilota, scartati } = parseAutopilota({
      ...(valido() as Record<string, unknown>),
      tettoChat: 2,
      chats: [{ id: 'c-1', compito: 'scrivi i test', stato: 'lavoro', cicli: 2, sessionId: 's-1' }]
    })
    expect(scartati).toEqual([])
    expect(autopilota?.tettoChat).toBe(2)
    expect(autopilota?.chats[0]?.compito).toBe('scrivi i test')
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

describe('i campi degli autopiloti di prima (P4)', () => {
  // Un file scritto prima dell'autopilota unico ha criteri, intervista,
  // compiti, strategia, richieste…: si legge lo stesso, ignorandoli, e un
  // autopilota senza criteri non si ferma più (i criteri stanno nel piano).
  it('si legge ignorandoli, senza avvisi', () => {
    const { autopilota, scartati } = parseAutopilota({
      ...(valido() as Record<string, unknown>),
      intervista: [{ domanda: 'Quale formato?', risposta: 'YAML' }],
      compitiDaFare: ['aggiorna la documentazione'],
      strategia: { nome: 'x' },
      richieste: [{ id: 'r-1', testo: 'fai' }],
      promesse: [], unico: true, sessioneSupervisore: 's-9', obiettivoTuo: 'le mie parole'
    })
    expect(scartati).toEqual([])
    expect(autopilota?.id).toBe('ap-1')
    for (const campo of ['criteri', 'limiti', 'intervista', 'compitiDaFare', 'strategia', 'richieste', 'promesse', 'unico', 'sessioneSupervisore', 'obiettivoTuo']) {
      expect(autopilota).not.toHaveProperty(campo)
    }
  })

  it('senza criteri resta al lavoro', () => {
    expect(parseAutopilota({ ...(valido() as Record<string, unknown>), stato: 'lavoro', criteri: [] }).autopilota?.stato).toBe('lavoro')
  })
})

describe('portaAutopilotiDa', () => {
  // Il servizio autopiloti e un processo a parte: non vede le preferenze, e la
  // porta gli arriva nell'ambiente. Finche' importava la costante e basta, il
  // campo «Porta degli autopiloti» si poteva cambiare senza che cambiasse nulla.
  it('legge la porta che il Gestore le ha passato', () => {
    expect(portaAutopilotiDa({ [AMBIENTE_PORTA_AUTOPILOTI]: '51000' })).toBe(51000)
  })

  it('senza indicazioni usa il predefinito', () => {
    expect(portaAutopilotiDa({})).toBe(PORTA_AUTOPILOTA)
  })

  it('un valore assurdo non impedisce al servizio di partire', () => {
    // Un autopilota che non parte perche' qualcuno ha scritto «ottomila» in un
    // campo sarebbe un prezzo sproporzionato — e il Gestore cerca comunque sul
    // predefinito, quindi i due si ritrovano.
    for (const brutta of ['ottomila', '', '0', '80', '70000', '5000.5', '-1']) {
      expect(portaAutopilotiDa({ [AMBIENTE_PORTA_AUTOPILOTI]: brutta })).toBe(PORTA_AUTOPILOTA)
    }
  })
})
