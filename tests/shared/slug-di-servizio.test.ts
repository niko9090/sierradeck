import { describe, it, expect } from 'vitest'
import { ePercorsoDiServizio, eSlugDiServizio } from '@shared/slug-di-servizio'

describe('le cartelle di trascrizioni che non sono chat di nessuno', () => {
  it('riconosce le sessioni observer di claude-mem, su qualunque utente', () => {
    // Sul fisso erano 621 voci nell'elenco Chat, e viaggiavano sul Drive.
    expect(eSlugDiServizio('C--Users-nikof--claude-mem-observer-sessions')).toBe(true)
    expect(eSlugDiServizio('C--Users-tecnico--claude-mem-observer-sessions')).toBe(true)
    expect(eSlugDiServizio('c--users-x--CLAUDE-MEM-OBSERVER-SESSIONS')).toBe(true)
  })

  it('non prende le cartelle vere, nemmeno quelle con tanti trattini', () => {
    // La forma slug e' a perdita: un'euristica sui `--` prenderebbe cartelle di
    // persone (`Game_ascensore`, spazi, punti). L'elenco e' esplicito.
    for (const slug of [
      'E--Users-nikof-Documents-SierraDeck',
      'C--Users-nikof-Documents-Game-ascensore',
      'C--Users-nikof--claude-mem',
      'C--Users-nikof-claude-mem-observer-sessions-vecchie',
      'D--lavoro--progetto--strano'
    ]) expect(eSlugDiServizio(slug)).toBe(false)
  })

  it('legge lo slug dentro un percorso del Drive o relativo alla radice', () => {
    expect(ePercorsoDiServizio('chat/C--Users-nikof--claude-mem-observer-sessions/abc.jsonl')).toBe(true)
    expect(ePercorsoDiServizio('C--Users-nikof--claude-mem-observer-sessions/abc.jsonl')).toBe(true)
    expect(ePercorsoDiServizio('chat/E--Users-nikof-Documents-SierraDeck/abc.jsonl')).toBe(false)
    expect(ePercorsoDiServizio('abc.jsonl')).toBe(false)
    expect(ePercorsoDiServizio('sierradeck/workspaces.json')).toBe(false)
  })
})
