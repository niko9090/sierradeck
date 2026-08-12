import { describe, it, expect, beforeAll, vi } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readSession } from '../../../src/main/indexer/session-reader'

const dir = mkdtempSync(join(tmpdir(), 'sess-'))
const file = join(dir, '11111111-2222-3333-4444-555555555555.jsonl')

beforeAll(() => {
  const righe = [
    { type: 'user', timestamp: '2026-08-01T10:00:00Z', cwd: 'C:\\p', gitBranch: 'main', version: '2.1.224', message: { role: 'user', content: 'ciao' } },
    { type: 'ai-title', aiTitle: 'Titolo generato' },
    { type: 'assistant', timestamp: '2026-08-01T10:00:05Z', message: { model: 'claude-opus-5', usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 30, cache_creation_input_tokens: 40 } } },
    { type: 'attachment' },
    { type: 'assistant', timestamp: '2026-08-01T10:01:00Z', message: { model: 'claude-opus-5', usage: { input_tokens: 1, output_tokens: 2, cache_read_input_tokens: 3, cache_creation_input_tokens: 4 } } }
  ]
  writeFileSync(file, righe.map((r) => JSON.stringify(r)).join('\n') + '\nRIGA-ROTTA\n')
})

describe('readSession', () => {
  it('deriva uuid e percorsi dal nome file', async () => {
    const s = await readSession(file, 'C--p', 'C:\\p')
    expect(s.uuid).toBe('11111111-2222-3333-4444-555555555555')
    expect(s.projectSlug).toBe('C--p')
    expect(s.projectPath).toBe('C:\\p')
    expect(s.jsonlPath).toBe(file)
    expect(s.sizeBytes).toBeGreaterThan(0)
  })

  it('somma i token di tutte le righe', async () => {
    const s = await readSession(file, 'C--p', 'C:\\p')
    expect(s.inputTokens).toBe(11)
    expect(s.outputTokens).toBe(22)
    expect(s.cacheReadTokens).toBe(33)
    expect(s.cacheWriteTokens).toBe(44)
  })

  it('conta solo i messaggi veri', async () => {
    expect((await readSession(file, 'C--p', 'C:\\p')).messageCount).toBe(3)
  })

  it('prende titolo, branch, modello, versione e timestamp estremi', async () => {
    const s = await readSession(file, 'C--p', 'C:\\p')
    expect(s.aiTitle).toBe('Titolo generato')
    expect(s.gitBranch).toBe('main')
    expect(s.model).toBe('claude-opus-5')
    expect(s.claudeVersion).toBe('2.1.224')
    expect(s.firstTimestamp).toBe('2026-08-01T10:00:00Z')
    expect(s.lastTimestamp).toBe('2026-08-01T10:01:00Z')
  })

  it('ignora la riga malformata senza fallire', async () => {
    await expect(readSession(file, 'C--p', 'C:\\p')).resolves.toBeDefined()
  })

  it('registra la riga malformata invece di ingoiarla', async () => {
    const s = await readSession(file, 'C--p', 'C:\\p')
    expect(s.skippedLines).toBe(1)
  })

  it('salta la riga malformata senza perdere le righe valide che la precedono', async () => {
    // Il vincolo e' «saltata **e** registrata»: contare lo scarto senza
    // verificare che il resto sia sopravvissuto lascerebbe scoperta meta' del
    // requisito — un lettore che si fermasse alla prima riga rotta passerebbe.
    const s = await readSession(file, 'C--p', 'C:\\p')
    expect(s.skippedLines).toBe(1)
    expect(s.messageCount).toBe(3)
    expect(s.inputTokens).toBe(11)
    expect(s.aiTitle).toBe('Titolo generato')
    expect(s.lastTimestamp).toBe('2026-08-01T10:01:00Z')
  })

  it('conserva le righe valide che seguono una malformata', async () => {
    const misto = join(dir, 'rotta-in-mezzo.jsonl')
    writeFileSync(misto, [
      JSON.stringify({ type: 'user', timestamp: '2026-08-01T10:00:00Z', message: {} }),
      'NON-JSON',
      JSON.stringify({ type: 'user', timestamp: '2026-08-01T10:02:00Z', message: {} })
    ].join('\n') + '\n')

    const s = await readSession(misto, 'C--p', 'C:\\p')
    expect(s.skippedLines).toBe(1)
    expect(s.messageCount).toBe(2)
    expect(s.lastTimestamp).toBe('2026-08-01T10:02:00Z')
  })

  it('legge un file vuoto senza fallire e senza contare scarti', async () => {
    const vuoto = join(dir, 'del-tutto-vuoto.jsonl')
    writeFileSync(vuoto, '')
    const s = await readSession(vuoto, 'C--p', 'C:\\p')
    expect(s.skippedLines).toBe(0)
    expect(s.messageCount).toBe(0)
    expect(s.sizeBytes).toBe(0)
    expect(s.firstTimestamp).toBeUndefined()
  })

  it('legge un file di sole righe malformate contandole tutte', async () => {
    const tutto = join(dir, 'solo-rotte.jsonl')
    writeFileSync(tutto, 'una\ndue\ntre\n')
    const avvisi = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const s = await readSession(tutto, 'C--p', 'C:\\p')
      expect(s.skippedLines).toBe(3)
      expect(s.messageCount).toBe(0)
    } finally {
      avvisi.mockRestore()
    }
  })

  it('limita gli avvisi per file senza falsare il conteggio', async () => {
    // Un file davvero corrotto produrrebbe un console.warn sincrono per riga
    // sul processo main, prima ancora che compaia la finestra. Il tetto vale
    // per il log; la misura deve restare esatta.
    const corrotto = join(dir, 'tutto-rotto.jsonl')
    writeFileSync(corrotto, Array.from({ length: 25 }, (_, i) => `ROTTA-${i}`).join('\n') + '\n')

    const avvisi = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const s = await readSession(corrotto, 'C--p', 'C:\\p')
      expect(s.skippedLines).toBe(25)
      // Dieci righe piu' il totale finale, non venticinque.
      expect(avvisi).toHaveBeenCalledTimes(11)
      expect(avvisi.mock.calls.at(-1)?.[0]).toContain('25 righe non interpretabili in totale')
    } finally {
      avvisi.mockRestore()
    }
  })

  it('non conta le righe vuote come scarti', async () => {
    const vuoto = join(dir, 'con-righe-vuote.jsonl')
    writeFileSync(vuoto, '\n\n' + JSON.stringify({ type: 'user', message: {} }) + '\n\n')
    const s = await readSession(vuoto, 'C--p', 'C:\\p')
    expect(s.skippedLines).toBe(0)
    expect(s.messageCount).toBe(1)
  })
})

describe('identita della conversazione', () => {
  const dir2 = mkdtempSync(join(tmpdir(), 'sess2-'))

  function scrivi(nome: string, righe: unknown[]): string {
    const f = join(dir2, `${nome}.jsonl`)
    writeFileSync(f, righe.map((r) => JSON.stringify(r)).join('\n') + '\n')
    return f
  }

  it('prende come primo prompt il primo messaggio scritto dall utente', async () => {
    const f = scrivi('aaaa', [
      { type: 'user', isMeta: true, message: { content: 'contesto iniettato dal sistema' } },
      { type: 'user', message: { content: 'sistemami il parser dei jsonl' } },
      { type: 'user', message: { content: 'e poi anche i test' } }
    ])
    const s = await readSession(f, 'C--p', 'C:\p')
    expect(s.primoPrompt).toBe('sistemami il parser dei jsonl')
  })

  it('comprime gli spazi e taglia i prompt lunghissimi', async () => {
    // I prompt automatici sono pagine intere: tenerli per intero gonfierebbe
    // l'indice senza aggiungere niente a cio' che serve, cioe' riconoscerli.
    const lungo = 'parola '.repeat(200)
    const f = scrivi('bbbb', [{ type: 'user', message: { content: `  primo\n\n   secondo ${lungo}` } }])
    const s = await readSession(f, 'C--p', 'C:\p')
    expect(s.primoPrompt?.startsWith('primo secondo parola')).toBe(true)
    expect(s.primoPrompt?.length).toBeLessThanOrEqual(200)
  })

  it('ignora i messaggi dei sottoagenti', async () => {
    const f = scrivi('cccc', [
      { type: 'user', isSidechain: true, message: { content: 'compito del sottoagente' } },
      { type: 'user', message: { content: 'quello che ho chiesto io' } }
    ])
    expect((await readSession(f, 'C--p', 'C:\p')).primoPrompt).toBe('quello che ho chiesto io')
  })

  it('resta senza primo prompt se la sessione non ne ha uno', async () => {
    const f = scrivi('dddd', [{ type: 'assistant', message: { content: 'solo risposte' } }])
    expect((await readSession(f, 'C--p', 'C:\p')).primoPrompt).toBeUndefined()
  })

  it('registra la cartella in cui si e lavorato di piu, non l ultima toccata', async () => {
    // Una sessione puo' cambiare cartella a meta' strada: e' la cartella dove
    // il lavoro e' stato fatto a dire di che progetto si tratta, non quella in
    // cui e' passata un attimo prima di chiudere.
    const f = scrivi('eeee', [
      { type: 'user', cwd: 'C:\progetto', message: { content: 'uno' } },
      { type: 'assistant', cwd: 'C:\progetto', message: { content: 'due' } },
      { type: 'user', cwd: 'C:\progetto', message: { content: 'tre' } },
      { type: 'user', cwd: 'C:\altrove', message: { content: 'quattro' } }
    ])
    expect((await readSession(f, 'C--p', 'C:\p')).cwd).toBe('C:\progetto')
  })

  it('registra quando il file e stato scritto l ultima volta', async () => {
    // E' cio' che permette al prossimo avvio di saltare i file immutati invece
    // di rileggere ottocento megabyte.
    const f = scrivi('ffff', [{ type: 'user', message: { content: 'x' } }])
    const s = await readSession(f, 'C--p', 'C:\p')
    expect(s.mtimeMs).toBeGreaterThan(0)
  })
})
