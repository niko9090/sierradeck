import { describe, it, expect } from 'vitest'
import { attivitaComando, attivitaDaSegnali, attivitaStrumento, cosaFaDaSegnali } from '@shared/attivita-chat'
import { riassuntoAlLavoro, sottoAlLavoro, type SchedaChat } from '@shared/panoramica'
import { leggiSegnale, type Segnale } from '@shared/segnali-chat'

/** 0.79.0: cosa fa adesso una chat, in parole semplici, dai segnali di Claude Code (mai dalle sue parole). */

const seg = (evento: Segnale['evento'], quando: string, altro: Partial<Segnale> = {}): Segnale => ({ sessione: 's', evento, quando, ...altro })

describe('attività in parole semplici', () => {
  it('dal comando, non dalla descrizione della chat', () => {
    expect(attivitaComando('npx vitest run tests/shared')).toBe('fa girare i test')
    expect(attivitaComando('cd android && gradle testDebugUnitTest assembleDebug --no-daemon')).toBe('fa girare i test')
    expect(attivitaComando('node --test')).toBe('fa girare i test')
    expect(attivitaComando('npm run typecheck')).toBe('compila il programma')
    expect(attivitaComando('git add -A && git commit -m "x"')).toBe('salva il lavoro')
    expect(attivitaComando('git merge main')).toBe('unisce il lavoro delle altre chat')
    expect(attivitaComando('git diff --stat')).toBe('guarda le modifiche')
    expect(attivitaComando('npm run pubblica')).toBe('prepara la release')
    expect(attivitaComando('grep -rn foo src')).toBe('legge il codice')
    expect(attivitaComando('curl http://127.0.0.1')).toBe('esegue un comando')
  })
  it('gli strumenti: del file solo il nome, mai il percorso intero', () => {
    expect(attivitaStrumento('Edit', 'E:/x/src/renderer/App.tsx')).toBe('modifica il codice (App.tsx)')
    expect(attivitaStrumento('Write', '{"file_path":"a b"}')).toBe('modifica il codice')
    expect(attivitaStrumento('Read', 'C:/x.ts')).toBe('legge il codice')
    expect(attivitaStrumento('Agent')).toBe('si fa aiutare da un agente')
    expect(attivitaStrumento('mcp__claude-in-chrome__navigate')).toBe('prova nel browser')
    expect(attivitaStrumento('Bash', 'Run the tests', 'npm test')).toBe('fa girare i test')
    expect(attivitaStrumento('Sconosciuto')).toBe('lavora')
  })
  it('il comando arriva dal JSON vero dell’hook', () => {
    const g = leggiSegnale({ hook_event_name: 'PreToolUse', session_id: 's', tool_name: 'Bash', tool_input: { command: 'npm test', description: 'Run tests' } }, 't')
    expect(g?.comando).toBe('npm test')
    expect(g?.dettaglio).toBe('Run tests')
  })
})

describe('cosaFaDaSegnali', () => {
  it('al lavoro: l’ultimo strumento del turno', () => {
    const r = cosaFaDaSegnali([
      seg('PostToolUse', '1', { strumento: 'Edit', dettaglio: 'C:/vecchio.ts' }),
      seg('UserPromptSubmit', '2'),
      seg('PostToolUse', '3', { strumento: 'Read' }),
      seg('PreToolUse', '4', { strumento: 'Bash', comando: 'npx vitest run' })
    ])
    expect(r).toEqual({ cosa: 'fa girare i test', dal: '2', aspettaTe: false, lavora: true })
  })
  it('un turno appena partito, senza strumenti: «ci pensa» (lo strumento del turno prima non conta)', () => {
    expect(cosaFaDaSegnali([seg('PostToolUse', '1', { strumento: 'Edit' }), seg('UserPromptSubmit', '2')])?.cosa).toBe('ci pensa')
  })
  it('chiede un permesso o fa una domanda: aspetta te; il permesso si racconta dal comando', () => {
    const p = cosaFaDaSegnali([seg('UserPromptSubmit', '1'), seg('PermissionRequest', '2', { strumento: 'Bash', dettaglio: 'Run the tests', comando: 'npx vitest run' })])
    expect(p).toMatchObject({ aspettaTe: true, cosa: 'aspetta il tuo permesso: fa girare i test', dal: '2' })
    const d = cosaFaDaSegnali([seg('UserPromptSubmit', '1'), seg('PreToolUse', '2', { strumento: 'AskUserQuestion' })])
    expect(d).toMatchObject({ aspettaTe: true, cosa: 'ti fa una domanda' })
  })
  it('fine turno, errore, chiusa, nessun segnale', () => {
    expect(cosaFaDaSegnali([seg('UserPromptSubmit', '1'), seg('Stop', '2')])).toMatchObject({ cosa: 'ha finito il turno', lavora: false, aspettaTe: false })
    expect(cosaFaDaSegnali([seg('StopFailure', '2')])?.cosa).toBe('si è fermata per un errore')
    expect(cosaFaDaSegnali([seg('SessionEnd', '1')])?.cosa).toBe('chat chiusa')
    expect(cosaFaDaSegnali([])).toBeUndefined()
  })
  it('un «al lavoro» che tace da più di 10 minuti non racconta più l’ultimo strumento (Stop perso)', () => {
    const segnali = [seg('UserPromptSubmit', '2026-10-18T09:00:00.000Z'), seg('PreToolUse', '2026-10-18T09:01:00.000Z', { strumento: 'Bash', comando: 'npm test' })]
    expect(cosaFaDaSegnali(segnali, Date.parse('2026-10-18T09:05:00.000Z'))).toMatchObject({ cosa: 'fa girare i test', lavora: true })
    expect(cosaFaDaSegnali(segnali, Date.parse('2026-10-18T09:31:00.000Z'))).toMatchObject({ cosa: 'nessun segnale da 30 min', lavora: false })
  })
  it('nel riassunto va solo un’attività vera: lavora o aspetta te', () => {
    expect(attivitaDaSegnali([seg('UserPromptSubmit', '1'), seg('PostToolUse', '2', { strumento: 'Read' })])).toBe('legge il codice')
    expect(attivitaDaSegnali([seg('UserPromptSubmit', '1'), seg('PermissionRequest', '2', { strumento: 'Bash', comando: 'git commit -m x' })])).toBe('aspetta il tuo permesso: salva il lavoro')
    expect(attivitaDaSegnali([seg('UserPromptSubmit', '1'), seg('Stop', '2')])).toBeUndefined()
    expect(attivitaDaSegnali([])).toBeUndefined()
  })
})

describe('«Al lavoro» con l’attività dai segnali', () => {
  const ORA = Date.parse('2026-10-18T10:00:00.000Z')
  type Scheda = SchedaChat & { sessione?: string; dal?: number; suPc?: string }
  const schede: Scheda[] = [
    { id: 'p1', titolo: 'Somma', stato: 'lavora', nataIl: 1, ruolo: 'sviluppo', sessione: 's1', dal: ORA - 3 * 60_000 },
    { id: 'p2', titolo: 'Prove', stato: 'chiede', nataIl: 2, ruolo: 'collaudo', sessione: 's2', dal: ORA - 60_000 },
    { id: 'p3', titolo: 'Lontana', stato: 'lavora', nataIl: 3, sessione: 's3', suPc: 'PORTATILE' }
  ]
  const ap = { sessionId: undefined, chats: [
    { id: 'c-1', compito: 'Somma', stato: 'lavoro' as const, cicli: 1, sessionId: 's1', ruolo: 'sviluppo' as const },
    { id: 'c-2', compito: 'Prove', stato: 'lavoro' as const, cicli: 1, sessionId: 's2', ruolo: 'collaudo' as const }
  ] }
  const attivita = (s: string): string | undefined => (s === 's1' ? 'fa girare i test' : s === 's2' ? 'aspetta il tuo permesso: salva il lavoro' : s === 's3' ? 'NON DEVE COMPARIRE' : undefined)
  it('ogni riga dice cosa fa adesso accanto a «da quanto»; una chat di un altro PC no (i segnali sono di qui)', () => {
    const r = riassuntoAlLavoro(ap, schede, ORA, attivita)
    expect(r.map((x) => x.id)).toEqual(['p2', 'p1', 'p3'])
    expect(sottoAlLavoro(r[0]!)).toBe('aspetta il tuo permesso: salva il lavoro · da 1 min')
    expect(sottoAlLavoro(r[1]!)).toBe('fa girare i test · da 3 min')
    expect(r[2]!.adesso).toBeUndefined()
    expect(sottoAlLavoro(r[2]!)).toBe('su PORTATILE')
  })
  it('senza attività (nessun segnale) la riga resta com’era', () => {
    const r = riassuntoAlLavoro(ap, schede, ORA)
    expect(r[0]!.adesso).toBeUndefined()
    expect(sottoAlLavoro(r[0]!)).toBe('aspetta te · da 1 min')
  })
})
