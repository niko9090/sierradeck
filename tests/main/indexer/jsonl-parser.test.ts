import { describe, it, expect } from 'vitest'
import { parseLine } from '../../../src/main/indexer/jsonl-parser'

describe('parseLine', () => {
  it('estrae i metadati da una riga utente', () => {
    const riga = JSON.stringify({
      type: 'user', timestamp: '2026-08-07T14:00:36.733Z', cwd: 'C:\\p',
      gitBranch: 'main', version: '2.1.224', permissionMode: 'default',
      message: { role: 'user', content: 'ciao' }
    })
    const r = parseLine(riga)
    expect(r?.type).toBe('user')
    expect(r?.cwd).toBe('C:\\p')
    expect(r?.gitBranch).toBe('main')
    expect(r?.version).toBe('2.1.224')
    expect(r?.isMessage).toBe(true)
  })

  it('estrae usage e modello da una riga assistant', () => {
    const riga = JSON.stringify({
      type: 'assistant',
      message: {
        role: 'assistant', model: 'claude-opus-5',
        usage: {
          input_tokens: 2, output_tokens: 925,
          cache_read_input_tokens: 879391, cache_creation_input_tokens: 748
        }
      }
    })
    const r = parseLine(riga)
    expect(r?.model).toBe('claude-opus-5')
    expect(r?.usage).toEqual({ input: 2, output: 925, cacheRead: 879391, cacheWrite: 748 })
    expect(r?.isMessage).toBe(true)
  })

  it('estrae il titolo generato dal campo aiTitle', () => {
    // Forma reale verificata sui file su disco: la riga porta `aiTitle`,
    // non `title`. Leggere il campo sbagliato non fa fallire nulla — fa
    // sparire in silenzio il titolo di ogni sessione.
    const r = parseLine(JSON.stringify({
      type: 'ai-title',
      aiTitle: 'Rifattorizzazione carrello',
      sessionId: '11111111-2222-3333-4444-555555555555'
    }))
    expect(r?.aiTitle).toBe('Rifattorizzazione carrello')
    expect(r?.isMessage).toBe(false)
  })

  it('non confonde un campo title con il titolo generato', () => {
    const r = parseLine(JSON.stringify({ type: 'ai-title', title: 'campo sbagliato' }))
    expect(r?.aiTitle).toBeUndefined()
  })

  it('non considera messaggio le righe di servizio', () => {
    expect(parseLine(JSON.stringify({ type: 'attachment' }))?.isMessage).toBe(false)
    expect(parseLine(JSON.stringify({ type: 'queue-operation' }))?.isMessage).toBe(false)
  })

  it('estrae il testo di un messaggio utente scritto come stringa', () => {
    const r = parseLine(JSON.stringify({ type: 'user', message: { content: 'ciao, sistemami il parser' } }))
    expect(r?.testoUtente).toBe('ciao, sistemami il parser')
  })

  it('estrae il testo anche quando il contenuto e a blocchi', () => {
    // Le sessioni con allegati o immagini portano il testo dentro un array di
    // blocchi: e' la forma normale, non un caso limite.
    const r = parseLine(JSON.stringify({
      type: 'user',
      message: { content: [{ type: 'image', source: {} }, { type: 'text', text: 'guarda questo' }] }
    }))
    expect(r?.testoUtente).toBe('guarda questo')
  })

  it('non prende per prompt il risultato di uno strumento', () => {
    // Claude Code scrive i risultati degli strumenti come messaggi «user»: se
    // contassero, il primo prompt di una chat sarebbe l'output di un comando.
    const r = parseLine(JSON.stringify({
      type: 'user',
      message: { content: [{ type: 'tool_result', content: 'ok' }] }
    }))
    expect(r?.testoUtente).toBeUndefined()
  })

  it('segnala le righe di contesto e quelle dei sottoagenti', () => {
    // Il preambolo iniettato dal sistema e i messaggi dei sottoagenti non sono
    // cose che ha scritto l'utente, e come firma di una conversazione
    // renderebbero identiche chat che non c'entrano niente fra loro.
    expect(parseLine(JSON.stringify({ type: 'user', isMeta: true, message: { content: 'x' } }))?.diServizio).toBe(true)
    expect(parseLine(JSON.stringify({ type: 'user', isSidechain: true, message: { content: 'x' } }))?.diServizio).toBe(true)
    expect(parseLine(JSON.stringify({ type: 'user', message: { content: 'x' } }))?.diServizio).toBe(false)
  })

  it('non attribuisce testo utente a un messaggio dell assistente', () => {
    const r = parseLine(JSON.stringify({ type: 'assistant', message: { content: 'risposta' } }))
    expect(r?.testoUtente).toBeUndefined()
  })

  it('restituisce undefined su JSON non valido', () => {
    expect(parseLine('non-json')).toBeUndefined()
    expect(parseLine('')).toBeUndefined()
  })

  it('restituisce undefined se manca il campo type', () => {
    expect(parseLine(JSON.stringify({ foo: 1 }))).toBeUndefined()
  })

  it('tollera usage parziale trattando i mancanti come zero', () => {
    const r = parseLine(JSON.stringify({
      type: 'assistant', message: { usage: { output_tokens: 5 } }
    }))
    expect(r?.usage).toEqual({ input: 0, output: 5, cacheRead: 0, cacheWrite: 0 })
  })
})
