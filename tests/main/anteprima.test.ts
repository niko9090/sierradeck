import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { leggiAnteprima } from '../../src/main/anteprima'

function file(righe: unknown[], nome = 'sessione.jsonl'): string {
  const d = mkdtempSync(join(tmpdir(), 'anteprima-'))
  const f = join(d, nome)
  writeFileSync(f, righe.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
  return f
}

const utente = (testo: string, quando = '2026-08-11T09:00:00.000Z'): unknown => ({
  type: 'user', timestamp: quando, message: { role: 'user', content: testo }
})
const assistente = (testo: string, quando = '2026-08-11T09:00:05.000Z'): unknown => ({
  type: 'assistant', timestamp: quando, message: { role: 'assistant', content: [{ type: 'text', text: testo }] }
})

describe('leggiAnteprima', () => {
  it('riporta gli ultimi scambi, in ordine di tempo', async () => {
    const a = await leggiAnteprima(file([
      utente('prima domanda'), assistente('prima risposta'),
      utente('seconda domanda'), assistente('seconda risposta')
    ]))
    expect(a.scambi.map((s) => s.testo)).toEqual([
      'prima domanda', 'prima risposta', 'seconda domanda', 'seconda risposta'
    ])
    expect(a.scambi[0]?.ruolo).toBe('utente')
  })

  it('tiene solo gli ultimi, perche l anteprima e un assaggio', async () => {
    const molti = Array.from({ length: 40 }, (_, i) => utente(`domanda ${i}`))
    const a = await leggiAnteprima(file(molti), { scambiMax: 6 })
    expect(a.scambi).toHaveLength(6)
    expect(a.scambi.at(-1)?.testo).toBe('domanda 39')
  })

  it('accorcia i messaggi lunghi invece di riversarli', async () => {
    const a = await leggiAnteprima(file([utente('x'.repeat(2000))]))
    expect((a.scambi[0]?.testo.length ?? 0)).toBeLessThanOrEqual(400)
  })

  it('elenca le ultime azioni, che sono cio che sta facendo adesso', async () => {
    // E' la risposta a «non vedo che succede»: gli strumenti che la chat usa
    // dicono a che punto e', anche quando non ha ancora risposto niente.
    const a = await leggiAnteprima(file([
      { type: 'assistant', timestamp: '2026-08-11T09:00:00.000Z', message: { content: [
        { type: 'tool_use', name: 'Bash', input: { command: 'ssh -i ~/.ssh/ha_key ...' } }
      ] } },
      { type: 'assistant', timestamp: '2026-08-11T09:00:02.000Z', message: { content: [
        { type: 'tool_use', name: 'Read', input: { file_path: 'C:/p/configuration.yaml' } }
      ] } }
    ]))
    expect(a.azioni).toEqual(['Bash: ssh -i ~/.ssh/ha_key ...', 'Read: C:/p/configuration.yaml'])
  })

  it('dice quando la chat ha scritto l ultima volta', async () => {
    const a = await leggiAnteprima(file([utente('x', '2026-08-11T09:00:00.000Z'), assistente('y', '2026-08-11T09:30:00.000Z')]))
    expect(a.ultimaAttivita).toBe('2026-08-11T09:30:00.000Z')
  })

  it('non conta i risultati degli strumenti come domande dell utente', async () => {
    // Sono messaggi «user» anche quelli: se contassero, l'anteprima mostrerebbe
    // l'output di un comando al posto di cio' che l'utente ha chiesto.
    const a = await leggiAnteprima(file([
      utente('la mia domanda'),
      { type: 'user', message: { content: [{ type: 'tool_result', content: 'output lunghissimo' }] } }
    ]))
    expect(a.scambi.map((s) => s.testo)).toEqual(['la mia domanda'])
  })

  it('salta il preambolo iniettato dal sistema', async () => {
    const a = await leggiAnteprima(file([
      { type: 'user', isMeta: true, message: { content: 'contesto di sistema' } },
      utente('la mia domanda')
    ]))
    expect(a.scambi).toHaveLength(1)
  })

  it('regge un file che non esiste senza sollevare', async () => {
    const a = await leggiAnteprima(join(tmpdir(), 'non-esiste-affatto.jsonl'))
    expect(a.scambi).toEqual([])
    expect(a.errore).toBeDefined()
  })

  it('legge solo la coda di un file enorme', async () => {
    // Le trascrizioni arrivano a decine di megabyte: leggerle intere per
    // mostrare quattro righe bloccherebbe il processo che serve l'interfaccia.
    const grande = [
      ...Array.from({ length: 4000 }, (_, i) => utente(`riempitivo ${i} ${'z'.repeat(200)}`)),
      utente('ultima domanda'),
      assistente('ultima risposta')
    ]
    const a = await leggiAnteprima(file(grande), { scambiMax: 2 })
    expect(a.scambi.map((s) => s.testo)).toEqual(['ultima domanda', 'ultima risposta'])
  })
})
