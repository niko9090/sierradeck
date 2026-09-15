import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { pianificaRimappatura, pianificaRitorno } from '../../src/main/progetti/rimappa-di-massa'
import type { RegistroProgetti } from '../../src/main/progetti/registro'

/**
 * Le chat «rapite» prima della regola del 15/09 (adottate qui in una
 * cartella vuota mentre la loro cartella vive su un altro PC) tornano al
 * loro posto; e con la regola nuova non se ne rapiscono altre.
 */
const PROJECTS = 'C:\\Users\\nikof\\.claude\\projects'
const QUI = 'C:\\Users\\nikof\\Progetti SierraDeck\\fionda apl'
const ORIGINE = 'E:\\Documents\\Progetti SierraDeck\\fionda apl'
const registro: RegistroProgetti = {
  versione: 1,
  progetti: [
    { id: 'p1', nome: 'fionda apl', percorsi: { F: QUI }, origini: [ORIGINE], aggiuntoIl: 'T' },
    { id: 'p2', nome: 'Money', percorsi: { F: 'C:\\Users\\nikof\\Progetti SierraDeck\\Money' }, origini: ['C:\\Users\\nikof\\Documents\\Money'], aggiuntoIl: 'T' }
  ]
}
const portatile = (cwd: string): { id: string; nome: string } | undefined => (cwd.startsWith('E:\\Documents\\') ? { id: 'P', nome: 'Portatile' } : undefined)

describe('il ritorno delle chat rapite', () => {
  it('IL PUNTO: una chat adottata qui la cui origine e del portatile torna sotto la cartella d origine, col cwd riscritto all indietro', () => {
    const piano = pianificaRitorno({
      chat: [
        { uuid: 'u1', cwd: QUI, jsonlPath: join(PROJECTS, 'C--Users-nikof-Progetti-SierraDeck-fionda-apl', 'u1.jsonl') },
        { uuid: 'u2', cwd: join(QUI, 'src'), jsonlPath: join(PROJECTS, 'C--Users-nikof-Progetti-SierraDeck-fionda-apl-src', 'u2.jsonl') }
      ],
      registro, pcId: 'F', radiceProjects: PROJECTS, altrove: portatile
    })
    expect(piano).toEqual([
      { uuid: 'u1', da: QUI, a: ORIGINE, jsonlDa: join(PROJECTS, 'C--Users-nikof-Progetti-SierraDeck-fionda-apl', 'u1.jsonl'), jsonlA: join(PROJECTS, 'E--Documents-Progetti-SierraDeck-fionda-apl', 'u1.jsonl') },
      { uuid: 'u2', da: join(QUI, 'src'), a: join(ORIGINE, 'src'), jsonlDa: join(PROJECTS, 'C--Users-nikof-Progetti-SierraDeck-fionda-apl-src', 'u2.jsonl'), jsonlA: join(PROJECTS, 'E--Documents-Progetti-SierraDeck-fionda-apl-src', 'u2.jsonl') }
    ])
  })

  it('una cartella adottata da un origine che nessun PC ha resta qui: e un vecchio percorso, non un altro computer', () => {
    const piano = pianificaRitorno({
      chat: [{ uuid: 'u3', cwd: 'C:\\Users\\nikof\\Progetti SierraDeck\\Money', jsonlPath: join(PROJECTS, 'C--Users-nikof-Progetti-SierraDeck-Money', 'u3.jsonl') }],
      registro, pcId: 'F', radiceProjects: PROJECTS, altrove: portatile
    })
    expect(piano).toEqual([])
  })

  it('le chat fuori dalle cartelle adottate, o gia al loro posto, non si toccano', () => {
    const piano = pianificaRitorno({
      chat: [
        { uuid: 'u4', cwd: 'E:\\Users\\nikof\\Documents\\SierraDeck', jsonlPath: join(PROJECTS, 'E--Users-nikof-Documents-SierraDeck', 'u4.jsonl') },
        { uuid: 'u5', cwd: undefined, jsonlPath: join(PROJECTS, 'boh', 'u5.jsonl') }
      ],
      registro, pcId: 'F', radiceProjects: PROJECTS, altrove: portatile
    })
    expect(piano).toEqual([])
  })
})

describe('la rimappatura non rapisce piu', () => {
  it('una chat con la cartella di un altro PC si salta: risolvi non da una destinazione', () => {
    const piano = pianificaRimappatura({
      chat: [{ uuid: 'u1', cwd: ORIGINE, jsonlPath: join(PROJECTS, 'E--Documents-Progetti-SierraDeck-fionda-apl', 'u1.jsonl') }],
      radiceProjects: PROJECTS, esiste: () => false,
      risolvi: (cwd) => (portatile(cwd) !== undefined ? undefined : QUI)
    })
    expect(piano).toEqual([])
  })
})
