import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, statSync, utimesSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { openDatabase, listSessions, countSessions } from '../../../src/main/db'
import { indexAll } from '../../../src/main/indexer/indexer'

// L'isolamento per file e' la ragione d'essere di indexAll: senza, un solo
// file illeggibile fermerebbe l'indicizzazione di tutti gli altri. Renderlo
// davvero illeggibile su disco non e' portabile, quindi si sostituisce il
// lettore facendolo fallire solo su un nome riconoscibile. Gli altri test del
// file non usano quel nome e restano sul lettore vero.
vi.mock('../../../src/main/indexer/session-reader', async (importOriginal) => {
  const originale =
    await importOriginal<typeof import('../../../src/main/indexer/session-reader')>()
  return {
    ...originale,
    readSession: async (jsonlPath: string, slug: string, projectPath: string) => {
      if (jsonlPath.includes('ILLEGGIBILE')) throw new Error('permesso negato')
      return originale.readSession(jsonlPath, slug, projectPath)
    }
  }
})

function radiceConFileIlleggibile(): string {
  const root = mkdtempSync(join(tmpdir(), 'claude-ko-'))
  const proj = join(root, 'projects', 'C--Users-utente-Documents-Progetto')
  mkdirSync(proj, { recursive: true })
  writeFileSync(
    join(proj, '11111111-2222-3333-4444-555555555555.jsonl'),
    JSON.stringify({ type: 'user', timestamp: '2026-08-01T10:00:00Z', message: {} }) + '\n'
  )
  // Il nome comincia con '0' di proposito: `readdir` restituisce in ordine
  // ASCII, quindi il file che fallisce viene esaminato PRIMA di quello valido.
  // Se il ciclo si interrompesse alla prima eccezione, il file valido
  // resterebbe fuori dall'indice e il test se ne accorgerebbe. Con l'ordine
  // inverso il fallimento sarebbe l'ultimo elemento e quella regressione
  // passerebbe inosservata: non resterebbe nulla da saltare.
  writeFileSync(
    join(proj, '00000000-ILLEGGIBILE-4444-5555-666666666666.jsonl'),
    JSON.stringify({ type: 'user', timestamp: '2026-08-01T10:00:00Z', message: {} }) + '\n'
  )
  return root
}

function radiceFinta(): string {
  const root = mkdtempSync(join(tmpdir(), 'claude-idx-'))
  const proj = join(root, 'projects', 'C--Users-utente-Documents-Progetto')
  mkdirSync(proj, { recursive: true })
  writeFileSync(
    join(proj, '11111111-2222-3333-4444-555555555555.jsonl'),
    JSON.stringify({ type: 'user', timestamp: '2026-08-01T10:00:00Z', cwd: 'C:\\p', message: {} }) + '\n'
  )
  writeFileSync(
    join(proj, '99999999-2222-3333-4444-555555555555.jsonl'),
    JSON.stringify({ type: 'assistant', timestamp: '2026-08-02T10:00:00Z', message: { usage: { output_tokens: 7 } } }) + '\n'
  )
  return root
}

describe('indexAll', () => {
  it('indicizza tutte le sessioni trovate', async () => {
    const db = openDatabase(':memory:')
    const res = await indexAll(db, radiceFinta())
    expect(res.indexed).toBe(2)
    expect(res.failed).toBe(0)
    expect(countSessions(db)).toBe(2)
  })

  it('segnala l avanzamento', async () => {
    const db = openDatabase(':memory:')
    const eventi: { done: number; total: number }[] = []
    await indexAll(db, radiceFinta(), (a) => eventi.push({ done: a.done, total: a.total }))
    expect(eventi.at(-1)).toEqual({ done: 2, total: 2 })
  })

  it('è idempotente su esecuzioni ripetute', async () => {
    const root = radiceFinta()
    const db = openDatabase(':memory:')
    await indexAll(db, root)
    await indexAll(db, root)
    expect(countSessions(db)).toBe(2)
  })

  it('associa il progetto corretto', async () => {
    const db = openDatabase(':memory:')
    await indexAll(db, radiceFinta())
    expect(listSessions(db)[0]?.projectPath).toBe('C:\\Users\\utente\\Documents\\Progetto')
  })

  it('restituisce zero su una radice inesistente', async () => {
    const db = openDatabase(':memory:')
    await expect(indexAll(db, join(tmpdir(), 'non-esiste-affatto')))
      .resolves.toEqual({ indexed: 0, failed: 0, riusate: 0 })
  })

  it('un file illeggibile non ferma l indicizzazione degli altri', async () => {
    const db = openDatabase(':memory:')
    const res = await indexAll(db, radiceConFileIlleggibile())
    expect(res.indexed).toBe(1)
    expect(res.failed).toBe(1)
    // Il file valido e' comunque finito nell'indice.
    expect(countSessions(db)).toBe(1)
  })

  it('una sessione cancellata da disco sparisce dall indice', async () => {
    const root = radiceFinta()
    const db = openDatabase(':memory:')
    await indexAll(db, root)
    expect(countSessions(db)).toBe(2)

    rmSync(join(root, 'projects', 'C--Users-utente-Documents-Progetto',
      '99999999-2222-3333-4444-555555555555.jsonl'))

    const res = await indexAll(db, root)
    // Con i soli upsert la riga sarebbe rimasta per sempre, e un index.db
    // costruito per aggiornamenti successivi non conterrebbe le stesse righe
    // di uno ricostruito da zero: il contrario di «cache ricostruibile».
    expect(res.indexed).toBe(1)
    expect(countSessions(db)).toBe(1)
    expect(listSessions(db).map((s) => s.uuid))
      .toEqual(['11111111-2222-3333-4444-555555555555'])
  })

  it('una radice diventata vuota lascia un indice vuoto', async () => {
    const root = radiceFinta()
    const db = openDatabase(':memory:')
    await indexAll(db, root)
    rmSync(join(root, 'projects'), { recursive: true })
    await indexAll(db, root)
    expect(countSessions(db)).toBe(0)
  })

  it('porta skippedLines diverso da zero fino dentro il database', async () => {
    // Il vincolo «una riga malformata va saltata e registrata» e' soddisfatto
    // da questo campo, e finora nessun test lo seguiva dall'inizio alla fine
    // con un valore diverso da zero: un upsert che lo perdesse per strada — un
    // parametro dimenticato nella INSERT — sarebbe passato inosservato.
    const root = mkdtempSync(join(tmpdir(), 'claude-skip-'))
    const proj = join(root, 'projects', 'C--Users-utente-Documents-Progetto')
    mkdirSync(proj, { recursive: true })
    writeFileSync(
      join(proj, '22222222-2222-3333-4444-555555555555.jsonl'),
      JSON.stringify({ type: 'user', timestamp: '2026-08-01T10:00:00Z', message: {} }) +
        '\nRIGA-ROTTA\nANCHE-QUESTA\n'
    )

    const avvisi = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const db = openDatabase(':memory:')
      await indexAll(db, root)
      expect(listSessions(db)[0]?.skippedLines).toBe(2)
    } finally {
      avvisi.mockRestore()
    }
  })

  it('l avanzamento procede anche sui file falliti', async () => {
    const db = openDatabase(':memory:')
    const eventi: { done: number; total: number }[] = []
    await indexAll(db, radiceConFileIlleggibile(), (a) => eventi.push({ done: a.done, total: a.total }))
    // Due file esaminati su due: un fallimento non deve bloccare il contatore,
    // altrimenti la barra di avanzamento resterebbe incastrata per sempre.
    expect(eventi.at(-1)).toEqual({ done: 2, total: 2 })
  })
})

describe('indice aggiornato invece che rifatto da capo', () => {
  const NOME_1 = '11111111-2222-3333-4444-555555555555.jsonl'
  const PROG = 'C--Users-utente-Documents-Progetto'

  it('non rilegge un file che non e cambiato', async () => {
    // Sulla macchina di riferimento sono 886 file per 776 MB: rileggerli a ogni
    // avvio significa aspettare minuti per riscrivere valori identici.
    const root = mkdtempSync(join(tmpdir(), 'claude-inc-'))
    const proj = join(root, 'projects', PROG)
    mkdirSync(proj, { recursive: true })
    const f = join(proj, NOME_1)
    const riga = (testo: string): string =>
      JSON.stringify({ type: 'user', timestamp: '2026-08-01T10:00:00Z', cwd: 'C:\\p', message: { content: testo } }) + '\n'
    writeFileSync(f, riga('PRIMA'))
    // Una data tonda al millesimo: il filesystem tiene i centesimi di
    // microsecondo, e senza questo il ripristino qui sotto non riprodurrebbe
    // esattamente la data registrata nell'indice.
    const data = new Date(1_700_000_000_000)
    utimesSync(f, data, data)

    const db = openDatabase(':memory:')
    await indexAll(db, root)

    // Stesso peso e stessa data, contenuto diverso: se il file venisse riletto
    // il prompt cambierebbe. Resta com'era, quindi e' stato saltato.
    writeFileSync(f, riga('DOPO!'))
    utimesSync(f, data, data)

    const res = await indexAll(db, root)
    expect(res.riusate).toBe(1)
    expect(listSessions(db)[0]?.primoPrompt).toBe('PRIMA')
  })

  it('rilegge il file che e cambiato davvero', async () => {
    const root = radiceFinta()
    const db = openDatabase(':memory:')
    await indexAll(db, root)

    const f = join(root, 'projects', PROG, NOME_1)
    writeFileSync(f, [
      JSON.stringify({ type: 'user', timestamp: '2026-08-05T10:00:00Z', cwd: 'C:\p', message: { content: 'nuovo prompt' } }),
      JSON.stringify({ type: 'assistant', timestamp: '2026-08-05T10:00:01Z', message: {} })
    ].join('\n') + '\n')
    utimesSync(f, new Date(), new Date(Date.now() + 4000))

    const res = await indexAll(db, root)
    expect(res.riusate).toBe(1)
    const s = listSessions(db).find((x) => x.jsonlPath === f)
    expect(s?.messageCount).toBe(2)
    expect(s?.primoPrompt).toBe('nuovo prompt')
  })

  it('rilegge tutto quando glielo si chiede', async () => {
    // E' il pulsante «Rileggi»: esiste per i casi in cui l'indice va rifatto a
    // prescindere da cio' che le date su disco raccontano.
    const root = radiceFinta()
    const db = openDatabase(':memory:')
    await indexAll(db, root)
    const res = await indexAll(db, root, undefined, { completa: true })
    expect(res.riusate).toBe(0)
    expect(res.indexed).toBe(2)
  })

  it('dice a che punto e e su quale progetto', async () => {
    const db = openDatabase(':memory:')
    const fasi: string[] = []
    let ultimoProgetto: string | undefined
    await indexAll(db, radiceFinta(), (a) => {
      fasi.push(a.fase)
      if (a.progetto !== undefined) ultimoProgetto = a.progetto
    })
    expect(fasi[0]).toBe('scansione')
    expect(fasi).toContain('lettura')
    expect(fasi.at(-1)).toBe('fine')
    expect(ultimoProgetto).toBe('C:\\Users\\utente\\Documents\\Progetto')
  })

  it('l esito conta anche le sessioni riprese dall indice', async () => {
    const root = radiceFinta()
    const db = openDatabase(':memory:')
    await indexAll(db, root)
    const res = await indexAll(db, root)
    // «indicizzate» resta il totale di cio' che l'indice contiene: chi legge
    // l'esito vuole sapere quante chat ci sono, non quante ne sono state
    // rilette per arrivarci.
    expect(res.indexed).toBe(2)
    expect(res.failed).toBe(0)
  })
})
