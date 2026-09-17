import { describe, expect, it } from 'vitest'
import { pianificaRitorno } from '../../src/main/progetti/rimappa-di-massa'
import { giaArrivata } from '../../src/main/cassaforte/incrementale'
import type { RegistroProgetti } from '../../src/main/progetti/registro'

/**
 * 17/09/2026: il registro dei progetti diceva che «un altro PC» (058be…, un
 * vecchio id di questa stessa macchina, o il portatile con lo stesso utente)
 * usa `C:\Users\nikof\Progetti SierraDeck\Wdeck`, che pero' esiste qui. Ogni
 * cinque minuti: 15 chat «tornate» sotto lo slug dell'altro, riscaricate dal
 * Drive, «rimappate» di nuovo qui. Due regole chiudono il giro.
 */
const PROJECTS = 'C:\\Users\\nikof\\.claude\\projects'
const MIA = 'C:\\Users\\nikof\\Progetti SierraDeck\\Wdeck'
const SUA = 'E:\\Documents\\Progetti SierraDeck\\Wdeck'
const registro: RegistroProgetti = {
  versione: 1,
  progetti: [{ id: 'w', nome: 'Wdeck', percorsi: { F: MIA, P: MIA }, origini: [SUA], aggiuntoIl: 'T' }]
}
const chat = [{ uuid: 'u1', cwd: MIA, jsonlPath: `${PROJECTS}\\C--Users-nikof-Progetti-SierraDeck-Wdeck\\u1.jsonl` }]
const altrove = (cwd: string): { id: string; nome: string } | undefined => (cwd === SUA ? { id: 'P', nome: 'Portatile' } : undefined)

describe('una cartella che esiste qui e mia: la chat non «torna» a nessuno', () => {
  it('senza la regola tornava sotto lo slug dell altro PC (il vecchio comportamento)', () => {
    const piano = pianificaRitorno({ chat, registro, pcId: 'F', radiceProjects: PROJECTS, altrove })
    expect(piano).toHaveLength(1)
    expect(piano[0]?.a).toBe(SUA)
  })

  it('con la regola resta dov e', () => {
    const piano = pianificaRitorno({ chat, registro, pcId: 'F', radiceProjects: PROJECTS, altrove, esiste: (p) => p === MIA })
    expect(piano).toHaveLength(0)
  })

  it('una chat la cui cartella NON esiste qui torna ancora al suo PC', () => {
    const rapita = [{ uuid: 'u2', cwd: 'C:\\Users\\nikof\\Progetti SierraDeck\\fionda apl', jsonlPath: `${PROJECTS}\\x\\u2.jsonl` }]
    const reg: RegistroProgetti = {
      versione: 1,
      progetti: [{ id: 'f', nome: 'fionda apl', percorsi: { F: 'C:\\Users\\nikof\\Progetti SierraDeck\\fionda apl' }, origini: ['E:\\Documents\\Progetti SierraDeck\\fionda apl'], aggiuntoIl: 'T' }]
    }
    const piano = pianificaRitorno({
      chat: rapita, registro: reg, pcId: 'F', radiceProjects: PROJECTS,
      altrove: (c) => (c.startsWith('E:\\Documents\\') ? { id: 'P', nome: 'Portatile' } : undefined),
      esiste: () => false
    })
    expect(piano).toHaveLength(1)
  })
})

describe('giaArrivata: una voce del Drive gia scesa e poi spostata non si riscarica', () => {
  const drive = { nome: 'f_1', size: 1000, mtime: 1_700_000_000_000, sha: 'abc' }
  it('sconosciuta al manifesto locale: e nuova, si scarica', () => {
    expect(giaArrivata(undefined, drive)).toBe(false)
  })
  it('stessa impronta: gia arrivata', () => {
    expect(giaArrivata({ ...drive }, drive)).toBe(true)
  })
  it('impronta diversa: e cresciuta sul Drive, si scarica', () => {
    expect(giaArrivata({ ...drive, sha: 'def', size: 1200 }, drive)).toBe(false)
  })
  it('senza impronta si confrontano dimensione e data', () => {
    expect(giaArrivata({ nome: 'f_1', size: 1000, mtime: 1_700_000_000_000 }, { nome: 'f_1', size: 1000, mtime: 1_700_000_000_000 })).toBe(true)
    expect(giaArrivata({ nome: 'f_1', size: 900, mtime: 1_700_000_000_000 }, { nome: 'f_1', size: 1000, mtime: 1_700_000_000_000 })).toBe(false)
  })
})
