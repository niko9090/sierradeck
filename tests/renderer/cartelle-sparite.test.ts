import { describe, it, expect, beforeEach } from 'vitest'
import { diagnostica } from '../../src/renderer/diagnosi-chat'
import {
  azzeraCartelleSparite, cartellaSegnataSparita, dimenticaCartellaSparita, rigaDelGuasto, segnaCartellaSparita
} from '../../src/renderer/cartelle-sparite'
import { erroriDalLog } from '../../src/shared/salute'

const chat = { title: 'video installazione', sessionUuid: '11111111-2222-3333-4444-555555555555', cwd: 'C:\\Progetti\\video installazione' }
const spawnRifiutato = diagnostica({
  tipo: 'spawn-fallito',
  messaggio: "Error invoking remote method 'pty:spawn': Error: richiesta IPC non valida: cwd non accessibile (ENOENT)"
}, [])

describe('la cartella sparita non e un errore (0.94.3)', () => {
  beforeEach(() => azzeraCartelleSparite())

  it('la riga del registro e un avviso e non entra negli errori arrivati', () => {
    expect(spawnRifiutato.caso).toBe('cartella-sparita')
    const riga = rigaDelGuasto(spawnRifiutato, chat)
    expect(riga.livello).toBe('info')
    expect(riga.testo).toContain('non si apre — cartella-sparita')
    const registro = `2026-11-05T10:00:00.000Z [info] [app] ${riga.testo}`
    expect(erroriDalLog([registro], Date.parse('2026-11-05T11:00:00Z'), 24)).toEqual([])
  })

  it('gli altri casi restano errori e negli errori arrivati', () => {
    const casi = [
      diagnostica({ tipo: 'errore', messaggio: 'spawn claude.exe ENOENT' }, []),
      diagnostica({ tipo: 'errore', messaggio: 'PTY host terminato con codice 1' }, []),
      diagnostica({ tipo: 'uscita', codice: 1, trascorsoMs: 3000 }, ['qualcosa di strano'])
    ]
    for (const d of casi) {
      expect(d.caso).not.toBe('cartella-sparita')
      const riga = rigaDelGuasto(d, chat)
      expect(riga.livello).toBe('errore')
      const registro = `2026-11-05T10:00:00.000Z [ERRORE] [app] ${riga.testo}`
      expect(erroriDalLog([registro], Date.parse('2026-11-05T11:00:00Z'), 24)).toHaveLength(1)
    }
  })

  it('si segna una volta sola per chat e cartella: i montaggi dopo la trovano gia segnata', () => {
    expect(cartellaSegnataSparita(chat.sessionUuid, chat.cwd)).toBeUndefined()
    expect(segnaCartellaSparita(chat.sessionUuid, chat.cwd, spawnRifiutato)).toBe(true)
    expect(segnaCartellaSparita(chat.sessionUuid, chat.cwd, spawnRifiutato)).toBe(false)
    expect(cartellaSegnataSparita(chat.sessionUuid, chat.cwd)?.caso).toBe('cartella-sparita')
    // un'altra cartella (scelta dall'utente) o un'altra chat non sono segnate
    expect(cartellaSegnataSparita(chat.sessionUuid, 'C:\\altra')).toBeUndefined()
    expect(cartellaSegnataSparita('altra-chat', chat.cwd)).toBeUndefined()
  })

  it('quando la chat riparte il segno cade, e un nuovo guasto si riscrive', () => {
    segnaCartellaSparita(chat.sessionUuid, chat.cwd, spawnRifiutato)
    dimenticaCartellaSparita(chat.sessionUuid, chat.cwd)
    expect(cartellaSegnataSparita(chat.sessionUuid, chat.cwd)).toBeUndefined()
    expect(segnaCartellaSparita(chat.sessionUuid, chat.cwd, spawnRifiutato)).toBe(true)
  })
})
