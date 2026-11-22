import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
// @ts-expect-error script .mjs senza tipi
import { noteDi, noteDiOErrore } from '../../scripts/note-novita.mjs'

describe('note-novita: tutti e due i formati', () => {
  it('note dell\'Aiutante 1.3.0 dal file vero', () => {
    const src = readFileSync('src/aiutante/novita-aiutante.txt', 'utf8')
    const note: string[] = noteDi(src, '1.3.0')
    expect(note).toHaveLength(2)
    expect(note[0]).toContain('Le chiavi di rete')
    expect(note[1]).toContain("L'Aiutante non dice più")
    expect(note.join('')).not.toContain('versione:')
  })

  it('note del programma 0.113.0 come prima', () => {
    const src = readFileSync('src/shared/novita.ts', 'utf8')
    const note: string[] = noteDi(src, '0.113.0')
    expect(note.length).toBeGreaterThan(0)
    expect(note.join('')).not.toContain('**')
  })

  it('versione mancante: [] e, con noteDiOErrore, un errore chiaro', () => {
    const src = readFileSync('src/aiutante/novita-aiutante.txt', 'utf8')
    expect(noteDi(src, '99.0.0')).toEqual([])
    expect(() => noteDiOErrore(src, '99.0.0', 'novita-aiutante.txt')).toThrow(/mancano le novità della versione 99\.0\.0 in novita-aiutante\.txt/)
  })
})
