import { describe, it, expect } from 'vitest'
import { diagnostica, senzaSequenze, tettoAttesaMs, USCITA_PRECOCE_MS } from '../../src/renderer/diagnosi-chat'

/**
 * Nicholas (23/09): «una procedura per risolvere il problema di chat che non
 * si aprono». Da cio' che il terminale ha detto si decide il caso e l'azione.
 */
describe('la diagnosi di una chat che non si apre', () => {
  it('la cartella sparita si riconosce dal rifiuto dello spawn, e si offre di scegliere la cartella', () => {
    const d = diagnostica({ tipo: 'spawn-fallito', messaggio: "Error invoking remote method 'pty:spawn': Error: richiesta IPC non valida: cwd non accessibile (E:\\Progetti\\x)" }, [])
    expect(d.caso).toBe('cartella-sparita')
    expect(d.azioni).toEqual(['scegli-cartella', 'avanzata'])
    expect(d.dettaglio).toContain('cwd non accessibile')
  })

  it('claude.exe che manca, l’host caduto, la sessione in uso, la trascrizione assente, il login scaduto', () => {
    expect(diagnostica({ tipo: 'errore', messaggio: 'spawn claude.exe ENOENT' }, []).caso).toBe('claude-assente')
    expect(diagnostica({ tipo: 'errore', messaggio: 'PTY host terminato con codice 1' }, []).caso).toBe('host')
    expect(diagnostica({ tipo: 'uscita', codice: 1, trascorsoMs: 3000 }, ['\x1b[31mError: Session ID abc is already in use\x1b[0m']).caso).toBe('sessione-in-uso')
    expect(diagnostica({ tipo: 'uscita', codice: 1, trascorsoMs: 3000 }, ['No conversation found with session ID abc']).caso).toBe('trascrizione-assente')
    const accesso = diagnostica({ tipo: 'uscita', codice: 1, trascorsoMs: 2000 }, ['Not logged in. Please run /login'])
    expect(accesso.caso).toBe('accesso')
    expect(accesso.azioni).toContain('accedi')
  })

  it('un’uscita senza parole note e’ «morta», con il codice e le ultime righe nel dettaglio', () => {
    const d = diagnostica({ tipo: 'uscita', codice: 2, trascorsoMs: 4200 }, ['riga uno', '', 'Something broke here'])
    expect(d.caso).toBe('morta')
    expect(d.titolo).toContain('codice 2')
    expect(d.dettaglio).toContain('uscito con 2 dopo 4 s')
    expect(d.dettaglio).toContain('Something broke here')
    expect(d.azioni).toEqual(['riprova', 'nuova-chat', 'avanzata'])
  })

  it('lenta: dice quanto e’ passato e quanto era previsto, e lascia aspettare', () => {
    const d = diagnostica({ tipo: 'lenta', trascorsoMs: 61_000, previstoMs: 20_000 }, [])
    expect(d.caso).toBe('lenta')
    expect(d.spiegazione).toContain('61 s')
    expect(d.azioni[0]).toBe('aspetta')
    expect(tettoAttesaMs(5000)).toBe(20_000)
    expect(tettoAttesaMs(30_000)).toBe(60_000)
    expect(USCITA_PRECOCE_MS).toBe(90_000)
  })

  it('le sequenze del terminale non finiscono nel dettaglio', () => {
    expect(senzaSequenze('\x1b[1;31mrosso\x1b[0m e \x1b]0;titolo\x07pulito\r')).toBe('rosso e pulito')
    const d = diagnostica({ tipo: 'errore', messaggio: 'boh' }, ['\x1b[2J\x1b[Hqualcosa di strano'])
    expect(d.caso).toBe('sconosciuto')
    expect(d.dettaglio).toBe('boh\nqualcosa di strano')
  })
})
