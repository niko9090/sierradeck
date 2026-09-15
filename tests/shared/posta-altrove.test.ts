import { describe, it, expect } from 'vitest'
import {
  staSottoCartella, pcCheHaLaCartella, messaggioChatAltrove, leggiChatAltrove, PREFISSO_CHAT_ALTROVE, type BattitoPc
} from '../../src/shared/posta'

/**
 * Nicholas (2026-09-15): «ci sono ancora delle chat che quando vengono
 * passate dal cloud e si avviano mostrano directory che non vengono trovate
 * e errori in rosso praticamente sempre». La chat del portatile veniva
 * adottata qui in una cartella vuota. La domanda che lo evita: quella
 * cartella, ce l'ha un altro PC?
 */
const battito = (pcId: string, nome: string, battito: string, cartelle: string[], chat: BattitoPc['chat'] = []): BattitoPc =>
  ({ pcId, nome, versione: '0.27.0', battito, cartelle, chat })

describe('staSottoCartella', () => {
  it('percorsi di Windows: maiuscole, barre e barre finali non contano', () => {
    expect(staSottoCartella('E:\\Documents\\Progetti SierraDeck\\fionda apl', 'E:\\Documents\\Progetti SierraDeck\\fionda apl')).toBe(true)
    expect(staSottoCartella('e:/documents/progetti sierradeck/fionda apl/src', 'E:\\Documents\\Progetti SierraDeck\\fionda apl\\')).toBe(true)
    expect(staSottoCartella('E:\\Documents\\Progetti SierraDeck\\fionda apl-2', 'E:\\Documents\\Progetti SierraDeck\\fionda apl')).toBe(false)
    expect(staSottoCartella('C:\\altro', 'E:\\Documents')).toBe(false)
    expect(staSottoCartella('C:\\altro', '')).toBe(false)
  })
})

describe('pcCheHaLaCartella', () => {
  const portatile = battito('P', 'Portatile', '2026-09-15T08:00:00.000Z', ['E:\\Documents\\Progetti SierraDeck\\fionda apl'])
  const torre = battito('T', 'Torre', '2026-09-15T09:00:00.000Z', ['D:\\dev\\Wdeck'], [{ titolo: 'x', cwd: 'Z:\\V3.2.1', aspetta: true }])

  it('IL PUNTO: la cartella della chat del portatile e del portatile, anche in una sottocartella', () => {
    expect(pcCheHaLaCartella('E:\\Documents\\Progetti SierraDeck\\fionda apl', [portatile, torre])?.nome).toBe('Portatile')
    expect(pcCheHaLaCartella('E:\\Documents\\Progetti SierraDeck\\fionda apl\\src', [portatile, torre])?.nome).toBe('Portatile')
  })

  it('contano anche le chat aperte di quel PC, e un battito vecchio vale lo stesso: un PC spento ha ancora le sue cartelle', () => {
    expect(pcCheHaLaCartella('Z:\\V3.2.1\\lib', [portatile, torre])?.nome).toBe('Torre')
    const spento = battito('S', 'Spento', '2026-01-01T00:00:00.000Z', ['Q:\\vecchio'])
    expect(pcCheHaLaCartella('Q:\\vecchio', [spento])?.nome).toBe('Spento')
  })

  it('una cartella che nessuno ha: undefined; e me stesso non conto', () => {
    expect(pcCheHaLaCartella('C:\\Users\\nikof\\Documents\\Money', [portatile, torre])).toBeUndefined()
    expect(pcCheHaLaCartella('D:\\dev\\Wdeck', [portatile, torre], 'T')).toBeUndefined()
  })

  it('se piu PC ce l hanno vince chi ha battuto per ultimo', () => {
    const a = battito('A', 'A', '2026-09-15T08:00:00.000Z', ['X:\\p'])
    const b = battito('B', 'B', '2026-09-15T09:00:00.000Z', ['X:\\p'])
    expect(pcCheHaLaCartella('X:\\p', [a, b])?.nome).toBe('B')
  })
})

describe('il messaggio «chat di un altro PC»', () => {
  it('va e torna intero, dentro un Error come lo passa un invoke di Electron', () => {
    const c = { cwd: 'E:\\Documents\\x', pc: { id: 'P', nome: 'Portatile' }, sessionUuid: 'u-1' }
    const m = messaggioChatAltrove(c)
    expect(m.startsWith(PREFISSO_CHAT_ALTROVE)).toBe(true)
    expect(leggiChatAltrove(new Error(m))).toEqual(c)
    expect(leggiChatAltrove(new Error(`Error invoking remote method 'pty:spawn': Error: ${m}`))).toEqual(c)
    expect(leggiChatAltrove(m)).toEqual(c)
  })

  it('un errore qualunque non e una chat altrove', () => {
    expect(leggiChatAltrove(new Error('spawn ENOENT'))).toBeUndefined()
    expect(leggiChatAltrove(undefined)).toBeUndefined()
    expect(leggiChatAltrove(PREFISSO_CHAT_ALTROVE + 'non json')).toBeUndefined()
    expect(leggiChatAltrove(PREFISSO_CHAT_ALTROVE + '{"cwd":"x"}')).toBeUndefined()
  })
})
