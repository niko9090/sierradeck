import { describe, it, expect } from 'vitest'
import { raggruppaSessioni, filtra, perProgetto, apertiAllInizio } from '../../src/renderer/raggruppa-sessioni'
import type { SessionSummary } from '@shared/types'

function s(over: Partial<SessionSummary> = {}): SessionSummary {
  return {
    uuid: 'u-1',
    projectSlug: 'C--p',
    projectPath: 'C:\\p',
    aiTitle: 'Rifattorizzazione del parser',
    cwd: 'C:\\p',
    gitBranch: undefined,
    model: undefined,
    permissionMode: undefined,
    claudeVersion: undefined,
    messageCount: 10,
    firstTimestamp: '2026-08-01T10:00:00.000Z',
    lastTimestamp: '2026-08-01T12:00:00.000Z',
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    primoPrompt: 'sistemami il parser dei jsonl',
    mtimeMs: 0,
    jsonlPath: 'x.jsonl',
    sizeBytes: 0,
    skippedLines: 0,
    ...over
  }
}

describe('raggruppaSessioni', () => {
  it('tiene separate due chat che hanno lo stesso titolo ma sono partite da richieste diverse', () => {
    // E' il difetto che si vedeva nell'elenco: due conversazioni distinte
    // finivano sotto la stessa voce solo perche' Claude aveva dato loro lo
    // stesso titolo, e aprendola se ne trovava una che non si stava cercando.
    const g = raggruppaSessioni([
      s({ uuid: 'a', aiTitle: 'Sistemazione dei test', primoPrompt: 'i test del parser falliscono' }),
      s({ uuid: 'b', aiTitle: 'Sistemazione dei test', primoPrompt: 'aggiungi i test al workspace' })
    ])
    expect(g).toHaveLength(2)
  })

  it('raccoglie in una voce le esecuzioni ripetute della stessa cosa', () => {
    // Sui dati veri di questa macchina 693 file su 738 sono ripetizioni di 26
    // lavori automatici, lanciati sempre con lo stesso identico prompt. Sono la
    // stessa attivita' che gira di nuovo, e nell'elenco vale una riga.
    const g = raggruppaSessioni([
      s({ uuid: 'a', primoPrompt: 'Sei l ANALISTA del portafoglio. Giri ogni ora.' }),
      s({ uuid: 'b', primoPrompt: 'Sei l ANALISTA del portafoglio. Giri ogni ora.' }),
      s({ uuid: 'c', primoPrompt: 'Sei l ANALISTA del portafoglio. Giri ogni ora.' })
    ])
    expect(g).toHaveLength(1)
    expect(g[0]?.quante).toBe(3)
    expect(g[0]?.ricorrente).toBe(true)
  })

  it('una conversazione sola non e una ricorrenza', () => {
    expect(raggruppaSessioni([s()])[0]?.ricorrente).toBe(false)
  })

  it('apre la piu recente delle esecuzioni', () => {
    const g = raggruppaSessioni([
      s({ uuid: 'vecchia', lastTimestamp: '2026-08-01T10:00:00.000Z' }),
      s({ uuid: 'nuova', lastTimestamp: '2026-08-09T10:00:00.000Z' })
    ])
    expect(g[0]?.principale.uuid).toBe('nuova')
  })

  it('conserva tutte le esecuzioni, per poterne scegliere una precisa', () => {
    const g = raggruppaSessioni([
      s({ uuid: 'a', lastTimestamp: '2026-08-01T10:00:00.000Z' }),
      s({ uuid: 'b', lastTimestamp: '2026-08-09T10:00:00.000Z' })
    ])
    expect(g[0]?.sessioni.map((x) => x.uuid)).toEqual(['b', 'a'])
  })

  it('somma i messaggi di tutte le esecuzioni', () => {
    const g = raggruppaSessioni([s({ uuid: 'a', messageCount: 4 }), s({ uuid: 'b', messageCount: 9 })])
    expect(g[0]?.messaggi).toBe(13)
  })

  it('tiene separate due chat con titolo diverso nello stesso progetto', () => {
    const g = raggruppaSessioni([
      s({ uuid: 'a', aiTitle: 'Prima', primoPrompt: 'x' }),
      s({ uuid: 'b', aiTitle: 'Seconda', primoPrompt: 'x' })
    ])
    expect(g).toHaveLength(2)
  })

  it('tiene separate due chat con lo stesso titolo in cartelle diverse', () => {
    const g = raggruppaSessioni([
      s({ uuid: 'a', cwd: 'C:\\uno' }),
      s({ uuid: 'b', cwd: 'C:\\due' })
    ])
    expect(g).toHaveLength(2)
  })

  it('senza titolo, il nome della voce e cio che e stato chiesto', () => {
    // Sei sessioni su dieci non hanno titolo: «senza titolo» ripetuto
    // quattrocento volte non dice niente, la richiesta iniziale si'.
    const g = raggruppaSessioni([s({ aiTitle: undefined, primoPrompt: 'controlla i log di stanotte' })])
    expect(g[0]?.titolo).toBe('controlla i log di stanotte')
    expect(g[0]?.dalPrompt).toBe(true)
  })

  it('due sessioni senza titolo con richieste diverse restano due voci', () => {
    // Fonderle tutte insieme, com'era prima, nascondeva conversazioni diverse
    // sotto un'unica riga «senza titolo».
    const g = raggruppaSessioni([
      s({ uuid: 'a', aiTitle: undefined, primoPrompt: 'controlla i log' }),
      s({ uuid: 'b', aiTitle: undefined, primoPrompt: 'aggiorna le dipendenze' })
    ])
    expect(g).toHaveLength(2)
  })

  it('accorcia le richieste chilometriche a una riga leggibile', () => {
    const lungo =
      'Sei l ANALISTA del portafoglio investimenti di Nicholas. Giri automaticamente ogni ora e devi tenere l analisi sempre fresca.'
    const g = raggruppaSessioni([s({ aiTitle: undefined, primoPrompt: lungo })])
    expect(g[0]?.titolo.length).toBeLessThanOrEqual(70)
    expect(g[0]?.titolo.startsWith('Sei l ANALISTA')).toBe(true)
  })

  it('una sessione senza titolo e senza richiesta resta una voce a se', () => {
    // Non si sa niente di lei: metterla insieme a un'altra e' un accostamento
    // inventato, e aprendola si troverebbe qualcosa che non c'entra.
    const g = raggruppaSessioni([
      s({ uuid: 'a', aiTitle: undefined, primoPrompt: undefined }),
      s({ uuid: 'b', aiTitle: undefined, primoPrompt: undefined })
    ])
    expect(g).toHaveLength(2)
    expect(g[0]?.titolo).toBe('senza titolo')
  })

  it('ignora maiuscole e spazi nel confronto delle richieste', () => {
    const g = raggruppaSessioni([
      s({ uuid: 'a', aiTitle: undefined, primoPrompt: 'Controlla   i LOG' }),
      s({ uuid: 'b', aiTitle: undefined, primoPrompt: 'controlla i log' })
    ])
    expect(g).toHaveLength(1)
  })

  it('ordina le voci dalla piu recente', () => {
    const g = raggruppaSessioni([
      s({ uuid: 'vecchia', aiTitle: 'Vecchia', lastTimestamp: '2026-08-01T10:00:00.000Z' }),
      s({ uuid: 'nuova', aiTitle: 'Nuova', lastTimestamp: '2026-08-09T10:00:00.000Z' })
    ])
    expect(g.map((x) => x.principale.uuid)).toEqual(['nuova', 'vecchia'])
  })

  it('regge una sessione senza data invece di perderla', () => {
    expect(raggruppaSessioni([s({ lastTimestamp: undefined })])).toHaveLength(1)
  })

  it('non solleva su un elenco vuoto', () => {
    expect(raggruppaSessioni([])).toEqual([])
  })
})

describe('filtra', () => {
  const gruppi = raggruppaSessioni([
    s({ uuid: 'a', aiTitle: 'Rifattorizzazione del parser', cwd: 'C:\\gestore' }),
    s({ uuid: 'b', aiTitle: 'Grafici del portafoglio', cwd: 'C:\\portfolio', primoPrompt: 'fammi i grafici' }),
    s({ uuid: 'c', aiTitle: undefined, cwd: 'C:\\gestore', primoPrompt: 'controlla i log di stanotte' })
  ])

  it('senza testo restituisce tutto', () => {
    expect(filtra(gruppi, '')).toHaveLength(3)
  })

  it('cerca nel titolo, senza badare alle maiuscole', () => {
    expect(filtra(gruppi, 'PARSER').map((g) => g.principale.uuid)).toEqual(['a'])
  })

  it('cerca anche nella cartella del progetto', () => {
    expect(filtra(gruppi, 'portfolio').map((g) => g.principale.uuid)).toEqual(['b'])
  })

  it('cerca in cio che e stato chiesto', () => {
    // Di una chat senza titolo si ricorda cio' che si e' chiesto, non altro.
    expect(filtra(gruppi, 'stanotte').map((g) => g.principale.uuid)).toEqual(['c'])
  })

  it('ignora gli spazi ai bordi', () => {
    expect(filtra(gruppi, '  parser  ')).toHaveLength(1)
  })

  it('restituisce vuoto quando non trova niente', () => {
    expect(filtra(gruppi, 'zzz')).toEqual([])
  })
})

describe('perProgetto', () => {
  it('raccoglie le chat sotto la cartella in cui si e lavorato', () => {
    const progetti = perProgetto(raggruppaSessioni([
      s({ uuid: 'a', aiTitle: 'Prima', cwd: 'C:\\lavoro\\gestore' }),
      s({ uuid: 'b', aiTitle: 'Seconda', cwd: 'C:\\lavoro\\gestore' }),
      s({ uuid: 'c', aiTitle: 'Terza', cwd: 'C:\\lavoro\\portfolio' })
    ]))
    expect(progetti.map((p) => p.nome)).toEqual(['gestore', 'portfolio'])
    expect(progetti[0]?.chat).toHaveLength(2)
  })

  it('riporta una sottocartella al progetto di cui fa parte', () => {
    // Sui dati veri: «progetto\_analysis» e' lavoro dentro «Home
    // assistant», e come sezione a se' spezzava in due un progetto solo.
    const progetti = perProgetto(raggruppaSessioni([
      s({ uuid: 'a', aiTitle: 'Analisi', cwd: 'C:\\Documents\\progetto\\_analysis' }),
      s({ uuid: 'b', aiTitle: 'Setup', cwd: 'C:\\Documents\\progetto' })
    ]))
    expect(progetti).toHaveLength(1)
    expect(progetti[0]?.nome).toBe('progetto')
    expect(progetti[0]?.chat).toHaveLength(2)
  })

  it('la sottocartella resta scritta accanto alla chat', () => {
    // Il progetto e' lo stesso, ma sapere che quella chat girava in
    // «_analysis» e' cio' che la distingue dalle altre della sezione.
    const progetti = perProgetto(raggruppaSessioni([
      s({ uuid: 'a', aiTitle: 'Analisi', cwd: 'C:\\Documents\\progetto\\_analysis' }),
      s({ uuid: 'b', aiTitle: 'Setup', cwd: 'C:\\Documents\\progetto' })
    ]))
    const chat = progetti[0]?.chat ?? []
    expect(chat.find((c) => c.titolo === 'Analisi')?.sottocartella).toBe('_analysis')
    expect(chat.find((c) => c.titolo === 'Setup')?.sottocartella).toBeUndefined()
  })

  it('non accorpa una cartella che somiglia soltanto al nome di un progetto', () => {
    // «progetto-vecchio» non sta dentro «progetto»: un confronto
    // fatto sul prefisso del testo le fonderebbe, e sono due lavori diversi.
    const progetti = perProgetto(raggruppaSessioni([
      s({ uuid: 'a', aiTitle: 'A', cwd: 'C:\\Documents\\progetto' }),
      s({ uuid: 'b', aiTitle: 'B', cwd: 'C:\\Documents\\progetto-vecchio' })
    ]))
    expect(progetti).toHaveLength(2)
  })

  it('non accorpa a una cartella che raccoglie tanti progetti diversi', () => {
    // «Documents» e' il posto dove stanno i progetti, non un progetto: sui dati
    // veri era lei a impedire che «_analysis» tornasse dentro «progetto»,
    // perche' bastava che «Documents» comparisse una volta come cartella di
    // lavoro per far sparire tutti i suoi figli dalle radici.
    const progetti = perProgetto(raggruppaSessioni([
      s({ uuid: 'd', aiTitle: 'Frugavo', cwd: 'C:/Documents' }),
      s({ uuid: 'a', aiTitle: 'Uno', cwd: 'C:/Documents/Uno' }),
      s({ uuid: 'b', aiTitle: 'Due', cwd: 'C:/Documents/Due' }),
      s({ uuid: 'c', aiTitle: 'Tre', cwd: 'C:/Documents/Tre' }),
      s({ uuid: 'e', aiTitle: 'Dentro Uno', cwd: 'C:/Documents/Uno/dettaglio' })
    ]))
    const nomi = progetti.map((p) => p.nome).sort()
    expect(nomi).toEqual(['Documents', 'Due', 'Tre', 'Uno'])
    // La sottocartella di «Uno» invece torna dentro «Uno», che di progetti
    // figli ne ha uno solo ed e' quindi un progetto, non un contenitore.
    expect(progetti.find((p) => p.nome === 'Uno')?.chat).toHaveLength(2)
  })

  it('mette per primo il progetto toccato piu di recente', () => {
    const progetti = perProgetto(raggruppaSessioni([
      s({ uuid: 'a', aiTitle: 'Vecchia', cwd: 'C:\\vecchio', lastTimestamp: '2026-08-01T10:00:00.000Z' }),
      s({ uuid: 'b', aiTitle: 'Nuova', cwd: 'C:\\recente', lastTimestamp: '2026-08-09T10:00:00.000Z' })
    ]))
    expect(progetti.map((p) => p.nome)).toEqual(['recente', 'vecchio'])
  })

  it('dentro un progetto le chat restano dalla piu recente', () => {
    const progetti = perProgetto(raggruppaSessioni([
      s({ uuid: 'a', aiTitle: 'Vecchia', lastTimestamp: '2026-08-01T10:00:00.000Z' }),
      s({ uuid: 'b', aiTitle: 'Nuova', lastTimestamp: '2026-08-09T10:00:00.000Z' })
    ]))
    expect(progetti[0]?.chat.map((c) => c.titolo)).toEqual(['Nuova', 'Vecchia'])
  })

  it('una sessione senza cartella finisce sotto il progetto dedotto dal nome', () => {
    // Meglio la cartella dedotta dallo slug che una sezione senza nome.
    const progetti = perProgetto(raggruppaSessioni([s({ cwd: undefined, projectPath: 'C:\\dedotto' })]))
    expect(progetti[0]?.nome).toBe('dedotto')
  })

  it('non solleva su un elenco vuoto', () => {
    expect(perProgetto([])).toEqual([])
  })
})

describe('apertiAllInizio', () => {
  function progetto(nome: string, quante: number) {
    return {
      nome,
      percorso: `C:/${nome}`,
      chat: Array.from({ length: quante }, () => ({}))
    } as unknown as ReturnType<typeof perProgetto>[number]
  }

  it('apre i progetti finche le righe restano leggibili', () => {
    const aperti = apertiAllInizio([progetto('a', 5), progetto('b', 5), progetto('c', 5)], 20)
    expect(aperti.size).toBe(3)
  })

  it('smette di aprire quando le righe diventano troppe', () => {
    // Sui dati veri una cartella di servizio ha 313 chat: aperta di default
    // seppellisce tutto il resto e la finestra diventa inutilizzabile.
    const aperti = apertiAllInizio([progetto('grande', 313), progetto('portfolio', 51)], 40)
    expect(aperti.has('C:/portfolio')).toBe(false)
  })

  it('il primo progetto resta sempre aperto, anche se e enorme', () => {
    // E' quello su cui si stava lavorando: una finestra che si apre tutta
    // chiusa costringe a un clic prima ancora di poter guardare.
    const aperti = apertiAllInizio([progetto('grande', 313)], 40)
    expect(aperti.has('C:/grande')).toBe(true)
  })

  it('non solleva su un elenco vuoto', () => {
    expect(apertiAllInizio([], 40).size).toBe(0)
  })
})

describe('accorpamento delle sottocartelle', () => {
  it('non lascia che una cartella qualsiasi diventi il progetto di tutto', () => {
    // Visto sui dati veri: una sola sessione girata in «C:\Users\utente» faceva
    // diventare quella la radice di 203 chat su 205, sotto una sezione
    // chiamata «utente». Un progetto e' una cartella di lavoro, non l'antenato
    // comune di mezzo disco.
    const progetti = perProgetto(raggruppaSessioni([
      s({ uuid: 'a', aiTitle: 'Casa', cwd: 'C:\\Users\\utente' }),
      s({ uuid: 'b', aiTitle: 'Gestore', cwd: 'C:\\Users\\utente\\Documents\\Gestore' }),
      s({ uuid: 'c', aiTitle: 'Progetto', cwd: 'C:\\Users\\utente\\Documents\\Progetto' })
    ]))
    expect(progetti).toHaveLength(3)
    expect(progetti.map((p) => p.nome).sort()).toEqual(['Gestore', 'Progetto', 'utente'])
  })

  it('accorpa solo la cartella che sta subito sotto al progetto', () => {
    // Una sottocartella diretta e' lavoro dentro quel progetto; qualcosa di piu'
    // profondo e' quasi sempre un altro progetto che sta li' sotto per caso.
    const progetti = perProgetto(raggruppaSessioni([
      s({ uuid: 'a', aiTitle: 'Setup', cwd: 'C:\\lavoro\\assistente' }),
      s({ uuid: 'b', aiTitle: 'Analisi', cwd: 'C:\\lavoro\\assistente\\_analisi' }),
      s({ uuid: 'c', aiTitle: 'Lontana', cwd: 'C:\\lavoro\\assistente\\uno\\due' })
    ]))
    expect(progetti.map((p) => p.nome).sort()).toEqual(['assistente', 'due'])
    expect(progetti.find((p) => p.nome === 'assistente')?.chat).toHaveLength(2)
  })
})
