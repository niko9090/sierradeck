import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
// @ts-expect-error script .mjs senza tipi
import { noteDi } from '../../scripts/note-novita.mjs'

describe('noteDi: riga unica e più righe', () => {
  it('legge la forma a riga unica', () => {
    const src = [
      "  { versione: '9.9.9',",
      "    righe: ['**Uno:** due [3] e l\\'apice.'],",
      '  },',
      "  { versione: '9.9.8', righe: ['x'] }"
    ].join('\n')
    expect(noteDi(src, '9.9.9')).toEqual(["Uno: due [3] e l'apice."])
    expect(noteDi(src, '9.9.8')).toEqual(['x'])
  })

  it('legge la forma su più righe', () => {
    const src = [
      "  { versione: '9.9.9',",
      '    righe: [',
      "      '**A:** uno',",
      "      'B due',",
      '    ],',
      '  },',
      "  { versione: '9.9.8', righe: ['x'] }"
    ].join('\n')
    expect(noteDi(src, '9.9.9')).toEqual(['A: uno', 'B due'])
  })

  it('la voce vera 0.112.1 di novita.ts non è vuota', () => {
    const src = readFileSync('src/shared/novita.ts', 'utf8')
    const note = noteDi(src, '0.112.1')
    expect(note.length).toBeGreaterThan(0)
    expect(note[0]).toContain('Chiusura più pulita')
  })
})
