import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { pianificaRimappatura, riscriviCwdRiga, sostituisciPrefisso } from '../../src/main/progetti/rimappa-di-massa'

/**
 * Nicholas (2026-09-13): «deve anche applicarsi la fix per chat gia'
 * scaricate». Le trascrizioni con la cartella dell'altro PC si spostano,
 * tutte insieme, sotto lo slug della cartella di qui, col `cwd` riscritto.
 */
const PROJECTS = 'C:\\Users\\nikof\\.claude\\projects'
const QUI = 'C:\\Users\\nikof\\Documents\\Progetti SierraDeck\\Wdeck'

describe('la cartella riscritta', () => {
  it('sostituisce il prefisso, anche per una sottocartella, ignorando maiuscole e barre finali', () => {
    expect(sostituisciPrefisso('E:\\Users\\nikof\\Documents\\Wdeck', 'E:\\Users\\nikof\\Documents\\Wdeck', QUI)).toBe(QUI)
    expect(sostituisciPrefisso('e:\\users\\NIKOF\\Documents\\Wdeck\\', 'E:\\Users\\nikof\\Documents\\Wdeck', QUI)).toBe(QUI)
    expect(sostituisciPrefisso('E:\\Users\\nikof\\Documents\\Wdeck\\src\\lib', 'E:\\Users\\nikof\\Documents\\Wdeck', QUI)).toBe(join(QUI, 'src', 'lib'))
    expect(sostituisciPrefisso('E:\\Users\\nikof\\Documents\\Wdeck-vecchio', 'E:\\Users\\nikof\\Documents\\Wdeck', QUI)).toBeUndefined()
    expect(sostituisciPrefisso('D:\\altro', 'E:\\Users\\nikof\\Documents\\Wdeck', QUI)).toBeUndefined()
  })

  it('una riga di trascrizione cambia solo nel cwd; le altre restano byte per byte', () => {
    const riga = '{"type":"user","cwd":"E:\\\\Users\\\\nikof\\\\Documents\\\\Wdeck","message":{"role":"user","content":"ciao"}}'
    const nuova = riscriviCwdRiga(riga, 'E:\\Users\\nikof\\Documents\\Wdeck', QUI)
    expect(JSON.parse(nuova)).toEqual({ type: 'user', cwd: QUI, message: { role: 'user', content: 'ciao' } })
    expect(riscriviCwdRiga('{"type":"summary","summary":"x"}', 'E:\\a', 'C:\\b')).toBe('{"type":"summary","summary":"x"}')
    expect(riscriviCwdRiga('non json con "cwd" dentro', 'E:\\a', 'C:\\b')).toBe('non json con "cwd" dentro')
    expect(riscriviCwdRiga('{"cwd":"D:\\\\altrove"}', 'E:\\a', 'C:\\b')).toBe('{"cwd":"D:\\\\altrove"}')
    expect(riscriviCwdRiga('', 'E:\\a', 'C:\\b')).toBe('')
  })
})

describe('il piano di rimappatura', () => {
  const risolvi = (cwd: string): string | undefined => (cwd.endsWith('Wdeck') ? QUI : undefined)

  it('sposta solo le chat con una cartella che qui non c’è, e chiede la destinazione una volta per cartella', () => {
    const chieste: string[] = []
    const piano = pianificaRimappatura({
      chat: [
        { uuid: 'u1', cwd: 'E:\\Users\\nikof\\Documents\\Wdeck', jsonlPath: join(PROJECTS, 'E--Users-nikof-Documents-Wdeck', 'u1.jsonl') },
        { uuid: 'u2', cwd: 'E:\\Users\\nikof\\Documents\\Wdeck', jsonlPath: join(PROJECTS, 'E--Users-nikof-Documents-Wdeck', 'u2.jsonl') },
        { uuid: 'u3', cwd: 'C:\\Users\\nikof\\Documents\\Qui', jsonlPath: join(PROJECTS, 'C--Users-nikof-Documents-Qui', 'u3.jsonl') },
        { uuid: 'u4', cwd: undefined, jsonlPath: join(PROJECTS, 'boh', 'u4.jsonl') },
        { uuid: 'u5', cwd: 'E:\\Users\\nikof\\Documents\\Sconosciuta', jsonlPath: join(PROJECTS, 'E--Users-nikof-Documents-Sconosciuta', 'u5.jsonl') }
      ],
      radiceProjects: PROJECTS,
      esiste: (p) => p === 'C:\\Users\\nikof\\Documents\\Qui',
      risolvi: (cwd) => { chieste.push(cwd); return risolvi(cwd) }
    })
    expect(piano.map((m) => m.uuid)).toEqual(['u1', 'u2'])
    expect(piano[0]).toEqual({
      uuid: 'u1', da: 'E:\\Users\\nikof\\Documents\\Wdeck', a: QUI,
      jsonlDa: join(PROJECTS, 'E--Users-nikof-Documents-Wdeck', 'u1.jsonl'),
      jsonlA: join(PROJECTS, 'C--Users-nikof-Documents-Progetti-SierraDeck-Wdeck', 'u1.jsonl')
    })
    expect(chieste).toEqual(['E:\\Users\\nikof\\Documents\\Wdeck', 'E:\\Users\\nikof\\Documents\\Sconosciuta'])
  })

  it('le cartelle nascoste degli strumenti (.claude-mem) non si toccano, e chi sta già al suo posto nemmeno', () => {
    const piano = pianificaRimappatura({
      chat: [
        { uuid: 'o1', cwd: 'C:\\Users\\tecnico\\.claude-mem\\observer-sessions', jsonlPath: join(PROJECTS, 'C--Users-tecnico--claude-mem-observer-sessions', 'o1.jsonl') },
        { uuid: 'u1', cwd: 'E:\\Users\\nikof\\Documents\\Wdeck', jsonlPath: join(PROJECTS, 'C--Users-nikof-Documents-Progetti-SierraDeck-Wdeck', 'u1.jsonl') }
      ],
      radiceProjects: PROJECTS, esiste: () => false, risolvi
    })
    expect(piano).toEqual([])
  })
})
