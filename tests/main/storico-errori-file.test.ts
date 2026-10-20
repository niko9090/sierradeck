import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apriStoricoErrori, conStorico, leggiStoricoDi } from '../../src/main/storico-errori-file'
import { consoleNelRegistro } from '../../src/main/console-nel-registro'
import type { Registro } from '../../src/main/registro'

// Nella Temp finta della suite: la toglie la guardia alla fine (tests/setup).
const nuovaCartella = (): string => mkdtempSync(join(tmpdir(), 'sierradeck-test-errori-'))

const registroFinto = (): Registro & { righe: string[] } => {
  const righe: string[] = []
  return {
    righe,
    info: (m) => { righe.push(`info ${m}`) },
    errore: (m) => { righe.push(`ERRORE ${m}`) },
    file: () => 'oggi.log',
    cartella: () => '.'
  }
}

describe('storico degli errori su file', () => {
  it('scrive un file per processo e chi legge li unisce', () => {
    const dati = nuovaCartella()
    const app = apriStoricoErrori(dati, 'app', { versione: '0.81.0', ora: () => new Date('2026-10-19T15:00:00Z') })
    const servizio = apriStoricoErrori(dati, 'servizio', { versione: '0.81.0', ora: () => new Date('2026-10-19T15:05:00Z') })
    app.aggiungi('boom sul PC')
    servizio.aggiungi('boom nel servizio')
    app.scriviOra()
    servizio.scriviOra()
    const tutto = leggiStoricoDi(dati)
    expect(tutto.voci.map((v) => `${v.dove} ${v.messaggio}`)).toEqual(['servizio boom nel servizio', 'pc boom sul PC'])
  })

  it('i nomi del PC e dell utente non arrivano mai nel file', () => {
    const dati = nuovaCartella()
    const s = apriStoricoErrori(dati, 'app', { versione: '0.81.0', nomi: () => ['PC-DI-PROVA'] })
    s.aggiungi('PC-DI-PROVA non risponde, password=abc123')
    s.scriviOra()
    const testo = readFileSync(s.file, 'utf8')
    expect(testo).not.toContain('PC-DI-PROVA')
    expect(testo).not.toContain('abc123')
  })

  it('riapre lo storico che c era, e conta gli errori ripetuti', () => {
    const dati = nuovaCartella()
    const prima = apriStoricoErrori(dati, 'app', { versione: '0.81.0' })
    prima.aggiungi('salvataggio fallito in 12 ms')
    prima.scriviOra()
    const dopo = apriStoricoErrori(dati, 'app', { versione: '0.81.0' })
    dopo.aggiungi('salvataggio fallito in 40 ms')
    expect(dopo.leggi().voci).toHaveLength(1)
    expect(dopo.leggi().voci[0]?.volte).toBe(2)
  })
})

describe('conStorico', () => {
  it('ogni errore va nel registro e nello storico, con l ultima riga di poco prima come «cosa si faceva»', () => {
    const base = registroFinto()
    const visti: Array<{ testo: string; cosa?: string }> = []
    let ora = 1_000_000
    const r = conStorico(base, { aggiungi: (testo, cosa) => { visti.push({ testo, ...(cosa !== undefined ? { cosa } : {}) }) } }, () => ora)
    r.info('[drive] salvo 3 chat')
    ora += 10_000
    r.errore('[drive] 403 quota')
    ora += 10 * 60_000
    r.errore('[drive] 403 quota')
    expect(base.righe).toEqual(['info [drive] salvo 3 chat', 'ERRORE [drive] 403 quota', 'ERRORE [drive] 403 quota'])
    expect(visti).toEqual([{ testo: '[drive] 403 quota', cosa: '[drive] salvo 3 chat' }, { testo: '[drive] 403 quota' }])
  })

  it('l errore ripetuto dalla console del registro non entra due volte', () => {
    const base = registroFinto()
    const visti: string[] = []
    const c = { warn: (..._a: unknown[]) => undefined, error: (..._a: unknown[]) => undefined }
    const r = conStorico({ ...base, errore: (m) => { base.errore(m); c.error(`[registro] ${m}`) } }, { aggiungi: (t) => { visti.push(t) } })
    const togli = consoleNelRegistro(r, c)
    r.errore('una volta')
    togli()
    expect(visti).toEqual(['una volta'])
  })
})
