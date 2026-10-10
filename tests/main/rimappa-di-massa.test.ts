import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { pianificaRimappatura, riscriviCwdRiga, sostituisciPrefisso } from '../../src/main/progetti/rimappa-di-massa'

/**
 * Nicholas (2026-09-13): «deve anche applicarsi la fix per chat gia'
 * scaricate». Le trascrizioni con la cartella dell'altro PC si spostano,
 * tutte insieme, sotto lo slug della cartella di qui, col `cwd` riscritto.
 */
const PROJECTS = 'C:\\Users\\utente\\.claude\\projects'
const QUI = 'C:\\Users\\utente\\Documents\\Progetti SierraDeck\\Wdeck'

describe('la cartella riscritta', () => {
  it('sostituisce il prefisso, anche per una sottocartella, ignorando maiuscole e barre finali', () => {
    expect(sostituisciPrefisso('E:\\Users\\utente\\Documents\\Wdeck', 'E:\\Users\\utente\\Documents\\Wdeck', QUI)).toBe(QUI)
    expect(sostituisciPrefisso('e:\\users\\UTENTE\\Documents\\Wdeck\\', 'E:\\Users\\utente\\Documents\\Wdeck', QUI)).toBe(QUI)
    expect(sostituisciPrefisso('E:\\Users\\utente\\Documents\\Wdeck\\src\\lib', 'E:\\Users\\utente\\Documents\\Wdeck', QUI)).toBe(join(QUI, 'src', 'lib'))
    expect(sostituisciPrefisso('E:\\Users\\utente\\Documents\\Wdeck-vecchio', 'E:\\Users\\utente\\Documents\\Wdeck', QUI)).toBeUndefined()
    expect(sostituisciPrefisso('D:\\altro', 'E:\\Users\\utente\\Documents\\Wdeck', QUI)).toBeUndefined()
  })

  it('una riga di trascrizione cambia solo nel cwd; le altre restano byte per byte', () => {
    const riga = '{"type":"user","cwd":"E:\\\\Users\\\\utente\\\\Documents\\\\Wdeck","message":{"role":"user","content":"ciao"}}'
    const nuova = riscriviCwdRiga(riga, 'E:\\Users\\utente\\Documents\\Wdeck', QUI)
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
        { uuid: 'u1', cwd: 'E:\\Users\\utente\\Documents\\Wdeck', jsonlPath: join(PROJECTS, 'E--Users-utente-Documents-Wdeck', 'u1.jsonl') },
        { uuid: 'u2', cwd: 'E:\\Users\\utente\\Documents\\Wdeck', jsonlPath: join(PROJECTS, 'E--Users-utente-Documents-Wdeck', 'u2.jsonl') },
        { uuid: 'u3', cwd: 'C:\\Users\\utente\\Documents\\Qui', jsonlPath: join(PROJECTS, 'C--Users-utente-Documents-Qui', 'u3.jsonl') },
        { uuid: 'u4', cwd: undefined, jsonlPath: join(PROJECTS, 'boh', 'u4.jsonl') },
        { uuid: 'u5', cwd: 'E:\\Users\\utente\\Documents\\Sconosciuta', jsonlPath: join(PROJECTS, 'E--Users-utente-Documents-Sconosciuta', 'u5.jsonl') }
      ],
      radiceProjects: PROJECTS,
      esiste: (p) => p === 'C:\\Users\\utente\\Documents\\Qui',
      risolvi: (cwd) => { chieste.push(cwd); return risolvi(cwd) }
    })
    expect(piano.map((m) => m.uuid)).toEqual(['u1', 'u2'])
    expect(piano[0]).toEqual({
      uuid: 'u1', da: 'E:\\Users\\utente\\Documents\\Wdeck', a: QUI,
      jsonlDa: join(PROJECTS, 'E--Users-utente-Documents-Wdeck', 'u1.jsonl'),
      jsonlA: join(PROJECTS, 'C--Users-utente-Documents-Progetti-SierraDeck-Wdeck', 'u1.jsonl')
    })
    expect(chieste).toEqual(['E:\\Users\\utente\\Documents\\Wdeck', 'E:\\Users\\utente\\Documents\\Sconosciuta'])
  })

  it('le cartelle nascoste degli strumenti (.claude-mem) non si toccano, e chi sta già al suo posto nemmeno', () => {
    const piano = pianificaRimappatura({
      chat: [
        { uuid: 'o1', cwd: 'C:\\Users\\tecnico\\.claude-mem\\observer-sessions', jsonlPath: join(PROJECTS, 'C--Users-tecnico--claude-mem-observer-sessions', 'o1.jsonl') },
        { uuid: 'u1', cwd: 'E:\\Users\\utente\\Documents\\Wdeck', jsonlPath: join(PROJECTS, 'C--Users-utente-Documents-Progetti-SierraDeck-Wdeck', 'u1.jsonl') }
      ],
      radiceProjects: PROJECTS, esiste: () => false, risolvi
    })
    expect(piano).toEqual([])
  })
})

describe('le cartelle temporanee non diventano progetti', () => {
  it('una chat nata in Temp o in AppData resta dov’è', () => {
    const chiamate: string[] = []
    const piano = pianificaRimappatura({
      chat: [
        { uuid: 'u1', cwd: 'C:\\Users\\utente\\AppData\\Local\\Temp\\prova-xyz', jsonlPath: 'C:\\p\\x\\u1.jsonl' },
        { uuid: 'u2', cwd: 'C:\\Temp\\altro', jsonlPath: 'C:\\p\\y\\u2.jsonl' },
        { uuid: 'u3', cwd: 'C:\\Users\\utente\\Documents\\Portfolio', jsonlPath: 'C:\\p\\z\\u3.jsonl' }
      ],
      radiceProjects: 'C:\\p',
      esiste: () => false,
      risolvi: (cwd) => { chiamate.push(cwd); return 'C:\\Progetti\\Portfolio' }
    })
    expect(chiamate).toEqual(['C:\\Users\\utente\\Documents\\Portfolio'])
    expect(piano.map((m) => m.uuid)).toEqual(['u3'])
  })
})
