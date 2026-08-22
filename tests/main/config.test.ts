import { describe, it, expect } from 'vitest'
import { resolveClaudeCommand, buildClaudeArgs } from '../../src/main/config'
import { DIRETTIVA_QUADERNO } from '../../src/shared/quaderno-istruzioni'

// L'obbligo del quaderno viaggia in `--append-system-prompt` in OGNI chat: gli
// array attesi lo includono subito dopo `--dangerously-skip-permissions`.
const QUADERNO = ['--append-system-prompt', DIRETTIVA_QUADERNO]

describe('configurazione avvio Claude Code', () => {
  it('usa il percorso esplicito quando presente', () => {
    expect(resolveClaudeCommand({ GESTORE_CLAUDE_PATH: 'C:\\x\\claude.exe' }))
      .toBe('C:\\x\\claude.exe')
  })

  it('ricade su claude.exe, con estensione, sul PATH', () => {
    // L'estensione non e' un dettaglio: node-pty su Windows cerca il nome
    // file letterale in ogni cartella del PATH e non applica PATHEXT.
    expect(resolveClaudeCommand({})).toBe('claude.exe')
  })

  it('costruisce gli argomenti con session-id', () => {
    expect(buildClaudeArgs('abc-123')).toEqual([
      '--session-id', 'abc-123', '--dangerously-skip-permissions', ...QUADERNO
    ])
  })

  it('impone il quaderno in ogni chat, con il percorso e il verbo giusto', () => {
    // Se questa regola sparisse dagli argomenti, il quaderno tornerebbe a
    // riempirsi solo a mano: è il cuore della funzione, non un dettaglio.
    const args = buildClaudeArgs('abc-123')
    expect(args).toContain('--append-system-prompt')
    const direttiva = args[args.indexOf('--append-system-prompt') + 1] ?? ''
    expect(direttiva).toContain('.sierradeck/quaderno/')
    expect(direttiva).toContain('DEVI')
  })

  it('salta le richieste di permesso in ogni chat, anche senza nome', () => {
    // Ogni riquadro nasce da qui: se il flag mancasse in un ramo, quella chat
    // si fermerebbe alla prima domanda e l'utente non capirebbe perche' solo
    // quella.
    expect(buildClaudeArgs('abc-123')).toContain('--dangerously-skip-permissions')
    expect(buildClaudeArgs('abc-123', 'Titolo')).toContain('--dangerously-skip-permissions')
  })

  it('aggiunge il nome quando fornito', () => {
    expect(buildClaudeArgs('abc-123', 'Rifattorizzazione')).toEqual([
      '--session-id', 'abc-123', '--dangerously-skip-permissions', ...QUADERNO, '-n', 'Rifattorizzazione'
    ])
  })

  it('riprende una sessione gia esistente invece di ricrearla', () => {
    // Verificato sulla CLI: `--session-id` su un id gia' usato non riapre
    // niente, stampa «Session ID <id> is already in use» e il riquadro resta
    // morto. E' la strada che percorre ogni chat ripristinata all'avvio.
    expect(buildClaudeArgs('abc-123', 'Titolo', true)).toEqual([
      '--resume', 'abc-123', '--dangerously-skip-permissions', ...QUADERNO, '-n', 'Titolo'
    ])
  })

  it('crea la sessione quando la trascrizione non c e ancora', () => {
    // Il caso simmetrico: `--resume` su un id mai scritto fallisce a sua volta.
    // Vale per il riquadro aperto e mai usato prima di chiudere la finestra.
    expect(buildClaudeArgs('abc-123', undefined, false)).toEqual([
      '--session-id', 'abc-123', '--dangerously-skip-permissions', ...QUADERNO
    ])
  })

  it('omette il nome se vuoto o solo spazi', () => {
    expect(buildClaudeArgs('abc-123', '   ')).toEqual([
      '--session-id', 'abc-123', '--dangerously-skip-permissions', ...QUADERNO
    ])
  })
})

describe('scelta del modello', () => {
  it('passa il modello a Claude Code quando ne e stato scelto uno', () => {
    const args = buildClaudeArgs('11111111-2222-3333-4444-555555555555', undefined, false, 'sonnet')
    expect(args[args.indexOf('--model') + 1]).toBe('sonnet')
  })

  it('senza scelta non impone niente e lascia il predefinito', () => {
    // Il modello predefinito e' quello configurato dall'utente in Claude Code:
    // imporne uno nostro sarebbe una decisione presa al posto suo.
    expect(buildClaudeArgs('11111111-2222-3333-4444-555555555555')).not.toContain('--model')
  })

  it('vale anche quando la chat si riprende', () => {
    const args = buildClaudeArgs('11111111-2222-3333-4444-555555555555', undefined, true, 'opus')
    expect(args).toContain('--resume')
    expect(args[args.indexOf('--model') + 1]).toBe('opus')
  })
})
