import { describe, it, expect } from 'vitest'
// @ts-expect-error script .mjs senza tipi
import { noteDi } from '../../scripts/note-novita.mjs'

describe('noteDi (note di app-android.json)', () => {
  it('toglie gli escape della stringa: apici e barre rovesciate', () => {
    const src = [
      "  { versione: '9.9.9',",
      '    righe: [',
      "      '**Dopo AppData\\\\Local** l\\'avviso.'",
      '    ]',
      '  },',
      "  { versione: '9.9.8', righe: ['x'] }"
    ].join('\n')
    expect(noteDi(src, '9.9.9')).toEqual(["Dopo AppData\\Local l'avviso."])
  })
})
