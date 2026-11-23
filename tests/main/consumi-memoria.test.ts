import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apriMemoriaConsumi, FILE_MEMORIA_CONSUMI } from '../../src/main/consumi-memoria'
import { consumiPerChat } from '@shared/consumi-chat'
import type { SessionSummary } from '@shared/types'

const MERC = new Date(2026, 10, 18, 12).getTime()
const GIOVE = new Date(2026, 10, 19, 12).getTime()
const iso = (ms: number): string => new Date(ms).toISOString()

function s(token: number, ultimo = MERC): SessionSummary {
  return {
    uuid: 'u-1', projectSlug: 'C--p', projectPath: 'C:\\lavoro\\alfa',
    aiTitle: 'Chat di prova', cwd: undefined, gitBranch: undefined, model: undefined,
    permissionMode: undefined, claudeVersion: undefined, messageCount: 1,
    firstTimestamp: iso(ultimo), lastTimestamp: iso(ultimo),
    inputTokens: token, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
    primoPrompt: undefined, mtimeMs: 0, jsonlPath: 'x.jsonl', sizeBytes: 0, skippedLines: 0
  }
}

describe('memoria dei consumi su disco', () => {
  let dati: string
  beforeEach(() => { dati = mkdtempSync(join(tmpdir(), 'consumi-mem-')) })
  afterEach(() => { rmSync(dati, { recursive: true, force: true }); vi.restoreAllMocks() })

  it('scrive un file piccolo con la versione dello schema, senza avanzi temporanei', () => {
    const mem = apriMemoriaConsumi(dati, MERC)
    mem.aggiorna([s(1000)], MERC)
    const file = join(dati, FILE_MEMORIA_CONSUMI)
    expect(existsSync(file)).toBe(true)
    const j = JSON.parse(readFileSync(file, 'utf8')) as { versione: number; voci: Record<string, unknown> }
    expect(j.versione).toBe(1)
    expect(Object.keys(j.voci)).toHaveLength(1)
    expect(readdirSync(dati)).toEqual([FILE_MEMORIA_CONSUMI])
  })

  it('dopo un riavvio ritrova i consumi e conta solo il nuovo', () => {
    apriMemoriaConsumi(dati, MERC).aggiorna([s(1000)], MERC)
    // «riavvio»: nuova istanza, stesso giorno, la chat è cresciuta di 400.
    const riavviata = apriMemoriaConsumi(dati, MERC + 5000)
    expect(consumiPerChat(riavviata.corrente(), undefined, 'pc', MERC).complessivo.oggi).toBe(1000)
    const m = riavviata.aggiorna([s(1400)], MERC + 10_000)
    expect(consumiPerChat(m, undefined, 'pc', MERC).chat[0]).toMatchObject({ oggi: 1400, settimana: 1400 })
  })

  it('dopo un riavvio il giorno dopo azzera oggi e tiene la settimana', () => {
    apriMemoriaConsumi(dati, MERC).aggiorna([s(1000)], MERC)
    const m = apriMemoriaConsumi(dati, GIOVE).aggiorna([s(1300, GIOVE)], GIOVE)
    expect(consumiPerChat(m, undefined, 'pc', GIOVE).chat[0]).toMatchObject({ oggi: 300, settimana: 1300 })
  })

  it('non riscrive il file se non è cambiato niente', () => {
    const mem = apriMemoriaConsumi(dati, MERC)
    mem.aggiorna([s(1000)], MERC)
    const file = join(dati, FILE_MEMORIA_CONSUMI)
    const prima = readFileSync(file, 'utf8')
    mem.aggiorna([s(1000)], MERC + 60_000)
    expect(readFileSync(file, 'utf8')).toBe(prima)
  })

  it.each(['{ rotto', '', '[1,2', 'null', '{"versione":1,"voci":"no"}'])('un file rovinato (%j) non fa cadere niente e viene rifatto sano', (contenuto) => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    writeFileSync(join(dati, FILE_MEMORIA_CONSUMI), contenuto, 'utf8')
    const mem = apriMemoriaConsumi(dati, MERC)
    expect(mem.corrente().voci).toEqual({})
    mem.aggiorna([s(500)], MERC)
    const sano = JSON.parse(readFileSync(join(dati, FILE_MEMORIA_CONSUMI), 'utf8')) as { versione: number }
    expect(sano.versione).toBe(1)
  })

  it('una cartella dati che non esiste non fa cadere l’aggiornamento', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const mem = apriMemoriaConsumi(join(dati, 'non', 'esiste'), MERC)
    expect(() => mem.aggiorna([s(10)], MERC)).not.toThrow()
  })

  it('i sorgenti collegano la memoria al modello dei consumi, a IPC e alla rotta del telefono', () => {
    const index = readFileSync(join(__dirname, '../../src/main/index.ts'), 'utf8')
    expect(index).toMatch(/memoriaConsumi = apriMemoriaConsumi\(dati\)/)
    expect(index).toMatch(/consumiPerChat\(memoria, limiti/)
    expect(index).toMatch(/arricchisciConsumi\(riassumiConsumi\(sessioni, Date\.now\(\)\), sessioni\)/)
    const ipc = readFileSync(join(__dirname, '../../src/main/ipc.ts'), 'utf8')
    expect(ipc).toMatch(/arricchisciConsumi\(c, sessioni\)/)
  })
})
