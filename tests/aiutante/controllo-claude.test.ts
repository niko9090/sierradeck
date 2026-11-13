import { describe, it, expect } from 'vitest'
import {
  ARGOMENTI_PROVA, ARGOMENTI_STATO, bloccoDaClaude, classificaProva, classificaStato, combina, comandoAccesso, esitoDaLavoro, serveProvaPiena
} from '../../src/aiutante/controllo-claude'

/**
 * 13/11, Aiutante 1.0.3: Claude Code provato davvero. Il caso vero: ogni
 * lavoro falliva in un quarto di minuto perché l'accesso era scaduto, mentre
 * il controllo di prima guardava solo che il file delle credenziali ci fosse.
 */
const u = (p: Partial<{ codice: number | null; stdout: string; stderr: string; errore: string; scaduto: boolean }>) => ({ codice: 0, stdout: '', stderr: '', ...p })

describe('la prova gratis: claude auth status --json', () => {
  it('collegato, non collegato, CLI mancante', () => {
    expect(classificaStato(u({ stdout: '{"loggedIn": true, "authMethod": "claude.ai"}' })).stato).toBe('ok')
    expect(classificaStato(u({ codice: 1, stdout: '{"loggedIn": false}' })).stato).toBe('accesso')
    expect(classificaStato(u({ codice: 1, errore: 'ENOENT' })).stato).toBe('mancante')
    expect(classificaStato(u({ codice: 1, stderr: "'claude' is not recognized as an internal or external command" })).stato).toBe('mancante')
  })
  it('una CLI vecchia senza «auth status»: non decide, decide la prova piena', () => {
    expect(classificaStato(u({ codice: 1, stderr: "error: unknown command 'auth'" })).stato).toBe('controllo')
  })
  it('è davvero gratis: nessun -p, nessun modello', () => {
    expect(ARGOMENTI_STATO).not.toContain('-p')
    expect(ARGOMENTI_STATO.join(' ')).toBe('auth status --json')
  })
})

describe('la prova piena: claude -p col modello più piccolo', () => {
  it('va: result senza errore', () => {
    expect(classificaProva(u({ stdout: JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'ok' }) })).stato).toBe('ok')
  })
  it('accesso scaduto, non collegato, chiave sbagliata → accesso', () => {
    for (const testo of ['OAuth token has expired. Please run /login', 'Invalid API key · Please run /login', 'Not logged in · Please run /login']) {
      const e = classificaProva(u({ codice: 1, stdout: JSON.stringify({ type: 'result', is_error: true, result: testo }) }))
      expect(e.stato).toBe('accesso')
      expect(e.estratto).toContain(testo.slice(0, 10))
    }
  })
  it('limite del piano → limite', () => {
    expect(classificaProva(u({ codice: 1, stdout: JSON.stringify({ type: 'result', is_error: true, result: 'Claude AI usage limit reached|1763049600' }) })).stato).toBe('limite')
  })
  it('CLI mancante, tempo scaduto, altro con l’estratto', () => {
    expect(classificaProva(u({ codice: 1, errore: 'ENOENT' })).stato).toBe('mancante')
    expect(classificaProva(u({ codice: null, scaduto: true })).stato).toBe('altro')
    const e = classificaProva(u({ codice: 1, stderr: 'qualcosa di strano è successo' }))
    expect(e.stato).toBe('altro')
    expect(e.estratto).toContain('qualcosa di strano')
  })
  it('l’estratto non porta segreti né la cartella dell’utente', () => {
    const e = classificaProva(u({ codice: 1, stderr: 'errore in C:\\Users\\qualcuno\\.claude con sk-ant-abc123def456ghi789' }))
    expect(e.estratto).not.toContain('qualcuno')
    expect(e.estratto).not.toContain('abc123def456')
  })
  it('costa il minimo: haiku, niente strumenti, niente MCP, niente sessione salvata', () => {
    const a = ARGOMENTI_PROVA.join(' ')
    expect(a).toContain('--model haiku')
    expect(ARGOMENTI_PROVA[ARGOMENTI_PROVA.indexOf('--tools') + 1]).toBe('')
    expect(a).toContain('--no-session-persistence')
    expect(a).toContain('--strict-mcp-config')
  })
})

describe('quando fare la prova piena e come unire le due', () => {
  it('all’avvio, a richiesta e finché Claude non va; mai con tutti i posti occupati', () => {
    expect(serveProvaPiena({ prima: undefined, forzata: false, inCorso: 0, tetto: 2 })).toBe(true)
    expect(serveProvaPiena({ prima: { stato: 'ok' }, forzata: false, inCorso: 0, tetto: 2 })).toBe(false)
    expect(serveProvaPiena({ prima: { stato: 'ok' }, forzata: true, inCorso: 1, tetto: 2 })).toBe(true)
    expect(serveProvaPiena({ prima: { stato: 'accesso' }, forzata: false, inCorso: 0, tetto: 2 })).toBe(true)
    expect(serveProvaPiena({ prima: { stato: 'ok' }, forzata: true, inCorso: 2, tetto: 2 })).toBe(false)
  })
  it('«collegato» dallo stato non basta a cancellare un accesso scaduto visto da un lavoro', () => {
    const daLavoro = { stato: 'accesso' as const, da: 'lavoro' as const }
    expect(combina({ stato: 'ok' }, undefined, daLavoro).stato).toBe('accesso')
    expect(combina({ stato: 'ok' }, { stato: 'ok' }, daLavoro).stato).toBe('ok')
    expect(combina({ stato: 'accesso' }, undefined, { stato: 'ok' }).stato).toBe('accesso')
    expect(combina({ stato: 'ok' }, undefined, undefined).stato).toBe('ok')
  })
  it('un lavoro fallito conta solo per l’accesso e il piano', () => {
    expect(esitoDaLavoro('accesso', 'OAuth session expired', 1)?.stato).toBe('accesso')
    expect(esitoDaLavoro('limite', 'usage limit', 1)?.stato).toBe('limite')
    expect(esitoDaLavoro('compito', 'prove rosse', 1)).toBeUndefined()
    expect(esitoDaLavoro('git', 'fatal', 1)).toBeUndefined()
  })
  it('il motivo nel battito: solo quando Claude non va', () => {
    expect(bloccoDaClaude({ stato: 'ok' })).toBeUndefined()
    expect(bloccoDaClaude({ stato: 'controllo' })).toBeUndefined()
    expect(bloccoDaClaude({ stato: 'accesso' })).toBe('Claude non collegato o accesso scaduto')
  })
})

describe('«Collega Claude»: il terminale', () => {
  it('PowerShell visibile con claude auth login, il percorso fra apici', () => {
    const c = comandoAccesso("C:\\Programmi\\l'utente\\claude.exe")
    expect(c.comando).toBe('powershell.exe')
    expect(c.args).toContain('-NoExit')
    const script = c.args[c.args.length - 1] ?? ''
    expect(script).toContain("& 'C:\\Programmi\\l''utente\\claude.exe' auth login")
  })
})
