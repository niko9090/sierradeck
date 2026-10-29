import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync, appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readSession, dimenticaLetture } from '../../../src/main/indexer/session-reader'

/**
 * La lettura incrementale delle trascrizioni: una chat viva cresce a ogni
 * messaggio, e rileggerla da capo a ogni giro dell'indice costava centinaia di
 * megabyte. Si legge la coda, con i conti di prima — e il risultato deve
 * essere identico a quello di una lettura da capo.
 */

function riga(i: number, extra: Record<string, unknown> = {}): string {
  const tipo = i % 2 === 0 ? 'user' : 'assistant'
  return JSON.stringify({
    type: tipo,
    timestamp: `2026-10-01T10:${String(i % 60).padStart(2, '0')}:00Z`,
    cwd: i % 7 === 0 ? 'C:\\altrove' : 'C:\\progetto',
    gitBranch: `ramo-${i}`,
    version: `2.0.${i}`,
    message: tipo === 'user'
      ? { content: `domanda numero ${i}` }
      : { model: 'claude-x', usage: { input_tokens: i, output_tokens: 2 * i, cache_read_input_tokens: 3, cache_creation_input_tokens: 1 } },
    ...extra
  })
}

function righe(da: number, a: number): string {
  let s = ''
  for (let i = da; i < a; i += 1) s += riga(i) + '\n'
  return s
}

function nuovoFile(contenuto: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'sd-lettura-'))
  const f = join(dir, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl')
  writeFileSync(f, contenuto)
  return f
}

const leggi = (f: string): ReturnType<typeof readSession> => readSession(f, 'slug', 'C:\\progetto')
const daCapo = (f: string): ReturnType<typeof readSession> => readSession(f, 'slug', 'C:\\progetto', { daCapo: true })

describe('la lettura incrementale delle trascrizioni', () => {
  beforeEach(() => { dimenticaLetture() })

  it('leggere a rate da lo stesso risultato di una lettura da capo', async () => {
    const f = nuovoFile(JSON.stringify({ type: 'ai-title', aiTitle: 'Titolo' }) + '\n' + righe(0, 50))
    expect(await leggi(f)).toEqual(await daCapo(f))

    appendFileSync(f, righe(50, 120) + 'riga rotta\n')
    const aRate = await leggi(f)
    expect(aRate).toEqual(await daCapo(f))
    expect(aRate.messageCount).toBe(120)
    expect(aRate.skippedLines).toBe(1)

    // Una riga a meta' (Claude Code la sta scrivendo): conta come in una
    // lettura da capo, e quando si chiude non si conta due volte.
    const ultima = riga(120)
    appendFileSync(f, ultima.slice(0, 40))
    expect(await leggi(f)).toEqual(await daCapo(f))
    appendFileSync(f, ultima.slice(40) + '\n' + righe(121, 130))
    const fine = await leggi(f)
    expect(fine).toEqual(await daCapo(f))
    expect(fine.messageCount).toBe(130)
    expect(fine.aiTitle).toBe('Titolo')
    expect(fine.cwd).toBe('C:\\progetto')
    expect(fine.primoPrompt).toBe('domanda numero 0')
  })

  it('dopo la prima volta legge davvero solo la coda', async () => {
    // Si cambia un byte gia' letto, oltre la «carta d'identita'» dei primi
    // 4 KB: una lettura incrementale non lo rivede, una da capo si'.
    const f = nuovoFile(righe(0, 200))
    const prima = await leggi(f)
    const testo = readFileSync(f, 'utf8')
    const dove = testo.indexOf('"input_tokens":151,')
    expect(dove).toBeGreaterThan(4096)
    writeFileSync(f, testo.slice(0, dove) + '"input_tokens":951,' + testo.slice(dove + '"input_tokens":151,'.length))
    appendFileSync(f, righe(200, 202))
    const incrementale = await leggi(f)
    expect(incrementale.inputTokens).toBe(prima.inputTokens + 201)
    expect((await daCapo(f)).inputTokens).toBe(prima.inputTokens + 201 + 800)
  })

  it('un file accorciato si rilegge da capo', async () => {
    const f = nuovoFile(righe(0, 80))
    await leggi(f)
    writeFileSync(f, righe(0, 30))
    const dopo = await leggi(f)
    expect(dopo).toEqual(await daCapo(f))
    expect(dopo.messageCount).toBe(30)
  })

  it('un file sostituito (inizio diverso, anche piu\' lungo) si rilegge da capo', async () => {
    const f = nuovoFile(righe(0, 40))
    await leggi(f)
    writeFileSync(f, JSON.stringify({ type: 'ai-title', aiTitle: 'Un altro' }) + '\n' + righe(100, 160))
    const dopo = await leggi(f)
    expect(dopo).toEqual(await daCapo(f))
    expect(dopo.aiTitle).toBe('Un altro')
    expect(dopo.messageCount).toBe(60)
    expect(dopo.primoPrompt).toBe('domanda numero 100')
  })

  it('stesso inizio ma il punto di ripresa non e\' piu\' una fine riga: da capo', async () => {
    const testa = righe(0, 100)
    const f = nuovoFile(testa)
    await leggi(f)
    // Stessi primi 4 KB, poi tutt'altro: al punto di ripresa non c'e' un `\n`.
    writeFileSync(f, testa.slice(0, 5000) + 'x'.repeat(10) + testa.slice(5000) + righe(100, 110))
    expect(await leggi(f)).toEqual(await daCapo(f))
  })

  it('le righe CRLF e un file vuoto come una lettura da capo', async () => {
    const f = nuovoFile(righe(0, 10).replace(/\n/g, '\r\n'))
    await leggi(f)
    appendFileSync(f, righe(10, 20).replace(/\n/g, '\r\n'))
    expect(await leggi(f)).toEqual(await daCapo(f))
    const vuoto = nuovoFile('')
    expect(await leggi(vuoto)).toEqual(await daCapo(vuoto))
  })
})
