import { describe, it, expect } from 'vitest'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { daQuanto } from '@shared/panoramica'
import {
  attivitaComando, attivitaStrumento, cosaFaDaSegnali, dalDelCompito, esitiDalRegistro, rigaEsito, righeLavoro, testoRigaLavoro, TESTI_RIASSUNTO
} from '@shared/riassunto-lavoro'
import { nuovoAutopilota, type Autopilota, type ChatGovernata } from '@shared/autopilota'
import { conversazione } from '@shared/chat-autopilota'
import { separaConversazione } from '@shared/panoramica'
import { leggiSegnale, type Segnale } from '@shared/segnali-chat'

/** 0.79.0: la dashboard dell'autopilota — riassunto dai segnali e dal registro, righe corte degli esiti. */

const ap = (chats: ChatGovernata[], decisioni: { quando: string; cosa: string }[] = [], extra: Partial<Autopilota> = {}): Autopilota => ({
  ...nuovoAutopilota({ id: 'ap-1', nome: 'Notte', obiettivo: 'Fare la dashboard', cwd: 'C:/progetto', criteri: [], iniziatoIl: '2026-10-18T08:00:00.000Z' }),
  chats, decisioni, ...extra
})
const chat = (id: string, ruolo: ChatGovernata['ruolo'], stato: ChatGovernata['stato'], compito: string, sessionId = `s-${id}`): ChatGovernata =>
  ({ id, compito, stato, cicli: 1, sessionId, ...(ruolo !== undefined ? { ruolo } : {}) })
const seg = (evento: Segnale['evento'], quando: string, altro: Partial<Segnale> = {}): Segnale => ({ sessione: 's', evento, quando, ...altro })

describe('attività in parole semplici', () => {
  it('dal comando, non dalla descrizione della chat', () => {
    expect(attivitaComando('npx vitest run tests/shared')).toBe('fa girare i test')
    expect(attivitaComando('cd android && gradle testDebugUnitTest assembleDebug --no-daemon')).toBe('fa girare i test')
    expect(attivitaComando('npm run typecheck')).toBe('compila il programma')
    expect(attivitaComando('git add -A && git commit -m "x"')).toBe('salva il lavoro')
    expect(attivitaComando('git merge main')).toBe('unisce il lavoro delle altre chat')
    expect(attivitaComando('git diff --stat')).toBe('guarda le modifiche')
    expect(attivitaComando('npm run pubblica')).toBe('prepara la release')
    expect(attivitaComando('grep -rn foo src')).toBe('legge il codice')
    expect(attivitaComando('curl http://127.0.0.1')).toBe('esegue un comando')
  })
  it('gli strumenti: file con il solo nome, mai il percorso intero', () => {
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
  it('chiede un permesso o fa una domanda: aspetta te', () => {
    const p = cosaFaDaSegnali([seg('UserPromptSubmit', '1'), seg('PermissionRequest', '2', { strumento: 'Bash', dettaglio: 'git commit -m x' })])
    expect(p).toMatchObject({ aspettaTe: true, cosa: 'aspetta il tuo permesso: salva il lavoro', dal: '2' })
    const d = cosaFaDaSegnali([seg('UserPromptSubmit', '1'), seg('PreToolUse', '2', { strumento: 'AskUserQuestion' })])
    expect(d).toMatchObject({ aspettaTe: true, cosa: 'ti fa una domanda' })
  })
  it('fine turno, errore, nessun segnale', () => {
    expect(cosaFaDaSegnali([seg('UserPromptSubmit', '1'), seg('Stop', '2')])).toMatchObject({ cosa: 'ha finito il turno', lavora: false, aspettaTe: false })
    expect(cosaFaDaSegnali([seg('StopFailure', '2')])?.cosa).toBe('si è fermata per un errore')
    expect(cosaFaDaSegnali([])).toBeUndefined()
  })
})

// I testi esatti che scrive il servizio (autopilot-host/server.ts, `annota`):
// se cambiano là, questi test devono rompersi.
const DIARIO = [
  { quando: '2026-10-18T08:01:00.000Z', cosa: 'apro la chat c-1 (Sviluppo) (ramo ap/ap-1/c-1): Riassunto dai segnali' },
  { quando: '2026-10-18T08:02:00.000Z', cosa: 'apro la chat c-2 (Interfaccia) (ramo ap/ap-1/c-2): Dashboard sul PC' },
  { quando: '2026-10-18T08:30:00.000Z', cosa: 'c-1 ha finito il suo compito: il ramo ap/ap-1/c-1 passa alla Revisione prima di essere unito' },
  { quando: '2026-10-18T08:31:00.000Z', cosa: 'apro la chat c-3 (Revisione): Rivedi il ramo ap/ap-1/c-1' },
  { quando: '2026-10-18T08:40:00.000Z', cosa: 'Revisione c-3: da rifare per c-1 — manca il test di src/x.ts:12' },
  { quando: '2026-10-18T08:50:00.000Z', cosa: 'Revisione c-3: OK per c-1 (ap/ap-1/c-1), unito nel ramo principale. Visto src/x.ts:12' },
  { quando: '2026-10-18T09:00:00.000Z', cosa: 'chiudo la chat c-4: il suo pezzo è fatto' },
  { quando: '2026-10-18T09:10:00.000Z', cosa: 'Revisione c-3: c-2 rimandato indietro 3 volte, chiedo a te' }
]

describe('esiti dal registro', () => {
  const a = ap([
    chat('c-1', 'sviluppo', 'finita', 'Riassunto dai segnali'),
    chat('c-2', 'interfaccia', 'bloccata', 'Dashboard sul PC'),
    chat('c-3', 'revisione', 'finita', 'Rivedi il ramo ap/ap-1/c-1'),
    chat('c-4', 'rilascio', 'finita', 'Prepara la 0.79.0')
  ], DIARIO)
  it('uno per ogni specialista che finisce e ogni decisione della Revisione', () => {
    expect(esitiDalRegistro(a).map((e) => [e.tipo, e.chat])).toEqual([
      ['alla-revisione', 'c-1'], ['da-rifare', 'c-1'], ['approvato', 'c-1'], ['finito', 'c-4'], ['decidi-tu', 'c-2']
    ])
  })
  it('righe corte, senza rami, id o note tecniche', () => {
    const righe = esitiDalRegistro(a).map(rigaEsito)
    expect(righe).toEqual([
      'Sviluppo ha finito «Riassunto dai segnali»: ora lo controlla la Revisione.',
      'Revisione: «Riassunto dai segnali» da correggere, Sviluppo lo rifà.',
      'Revisione: «Riassunto dai segnali» va bene, unito al resto.',
      'Rilascio ha finito «Prepara la 0.79.0».',
      'Revisione: «Dashboard sul PC» rimandato 3 volte. Decidi tu, fra le domande.'
    ])
    for (const r of righe) {
      expect(r).not.toMatch(/c-\d|ap\/|ramo|src\//)
      expect(r.length).toBeLessThan(110)
    }
  })
  it('nella conversazione come battute sue, fuori da «Cosa è successo»', () => {
    const { messaggi, eventi } = separaConversazione(conversazione(a))
    const esiti = messaggi.filter((b) => b.tono === 'esito')
    expect(esiti.map((b) => b.da)).toEqual(['lui', 'lui', 'lui', 'lui', 'lui'])
    expect(esiti[0]?.testo).toContain('ora lo controlla la Revisione')
    // La nota tecnica dello stesso momento resta fra gli eventi.
    expect(eventi.some((b) => b.testo.includes('ap/ap-1/c-1 passa alla Revisione'))).toBe(true)
  })
  it('da quando una chat lavora al compito: l’ultima apertura o l’ultimo «da rifare»', () => {
    expect(dalDelCompito(DIARIO, 'c-1')).toBe('2026-10-18T08:40:00.000Z')
    expect(dalDelCompito(DIARIO, 'c-2')).toBe('2026-10-18T08:02:00.000Z')
    expect(dalDelCompito(DIARIO, 'c-9')).toBeUndefined()
  })
})

describe('righeLavoro', () => {
  const segnali: Record<string, Segnale[]> = {
    's-c-5': [seg('UserPromptSubmit', '2026-10-18T09:20:00.000Z'), seg('PostToolUse', '2026-10-18T09:21:00.000Z', { strumento: 'Edit', dettaglio: 'C:/p/src/App.tsx' })],
    's-c-6': [seg('UserPromptSubmit', '2026-10-18T09:20:00.000Z'), seg('PermissionRequest', '2026-10-18T09:22:00.000Z', { strumento: 'Bash', dettaglio: 'npm test' })],
    's-ad': [seg('UserPromptSubmit', '2026-10-18T09:25:00.000Z')],
    's-ferma': [seg('Stop', '2026-10-18T09:25:00.000Z')]
  }
  const di = (s: string): Segnale[] => segnali[s] ?? []
  const a = ap([
    chat('c-6', 'collaudo', 'lavoro', 'Prove dal vero'),
    chat('c-5', 'sviluppo', 'lavoro', 'Riassunto dai segnali\nseconda riga lunga'),
    chat('c-7', 'revisione', 'pausa', 'Rivedi'),
    chat('c-8', 'interfaccia', 'bloccata', 'Testi'),
    chat('c-1', 'sviluppo', 'finita', 'Vecchio')
  ], [{ quando: '2026-10-18T09:00:00.000Z', cosa: 'apro la chat c-5 (Sviluppo): Riassunto' }], {
    adottate: [
      { sessionId: 's-ad', titolo: 'Chat già avviata' },
      { sessionId: 's-ferma', titolo: 'Ferma' },
      { sessionId: 's-mia', titolo: 'Mia', soloMia: true }
    ] as Autopilota['adottate']
  })
  const r = righeLavoro(a, di)
  it('una riga per chat al lavoro, in ordine fisso per ruolo; le finite e le adottate ferme no', () => {
    expect(r.map((x) => x.id)).toEqual(['c-5', 'c-8', 'c-6', 'c-7', 'adottata:s-ad'])
  })
  it('specialista, cosa fa, da quando, se aspetta te', () => {
    expect(r[0]).toMatchObject({ nomeRuolo: 'Sviluppo', compito: 'Riassunto dai segnali', cosa: 'modifica il codice (App.tsx)', dal: '2026-10-18T09:00:00.000Z', aspettaTe: false, sessione: 's-c-5' })
    expect(r[1]).toMatchObject({ nomeRuolo: 'Interfaccia', cosa: 'aspetta una tua risposta', aspettaTe: true })
    expect(r[2]).toMatchObject({ nomeRuolo: 'Collaudo', cosa: 'aspetta il tuo permesso: fa girare i test', aspettaTe: true, dal: '2026-10-18T09:22:00.000Z' })
    expect(r[3]).toMatchObject({ nomeRuolo: 'Revisione', cosa: 'in pausa per i limiti del piano', aspettaTe: false })
    expect(r[4]).toMatchObject({ nomeRuolo: 'Chat', cosa: 'ci pensa', compito: 'Chat già avviata' })
  })
  it('senza segnali resta lo stato del registro', () => {
    const solo = righeLavoro(ap([chat('c-1', 'sviluppo', 'lavoro', 'X')]), () => [])
    expect(solo[0]).toMatchObject({ cosa: 'al lavoro', aspettaTe: false })
  })
  it('la chat unica: una riga, «aspetta una tua risposta» quando ha una domanda aperta', () => {
    const unica = ap([], [], { sessionId: 's-u', stato: 'attesa' })
    expect(righeLavoro(unica, () => [])).toEqual([expect.objectContaining({ nomeRuolo: 'Chat unica', cosa: 'aspetta una tua risposta', aspettaTe: true })])
    expect(righeLavoro({ ...unica, stato: 'finito' }, () => [])).toEqual([])
  })
  it('la riga intera in testo, e i testi corti con il «?»', () => {
    expect(testoRigaLavoro(r[2]!, 'da 3 min')).toBe('Collaudo · aspetta il tuo permesso: fa girare i test · da 3 min · aspetta te')
    expect(TESTI_RIASSUNTO.titolo.length).toBeLessThan(20)
    expect(TESTI_RIASSUNTO.aiuto).toContain('◆')
  })
})

/**
 * I casi per l'app (`RiassuntoLavoroTest.kt`): le righe come le manda il PC in
 * `/api/panoramica` e il testo atteso di ognuna a un'ora fissa. `AGGIORNA=1` riscrive.
 */
describe('i casi per l’app', () => {
  it('le righe e i loro testi sono quelli che l’app legge nei suoi test', () => {
    const ora = Date.parse('2026-10-18T10:00:00.000Z')
    const di = (s: string): Segnale[] => (s === 's-c-2' ? [seg('UserPromptSubmit', '2026-10-18T09:30:00.000Z'), seg('PreToolUse', '2026-10-18T09:31:00.000Z', { strumento: 'Bash', comando: 'npm test' })]
      : s === 's-c-3' ? [seg('UserPromptSubmit', '2026-10-18T09:40:00.000Z'), seg('PermissionRequest', '2026-10-18T09:55:00.000Z', { strumento: 'Bash', dettaglio: 'git push' })] : [])
    const a = ap([chat('c-3', 'collaudo', 'lavoro', 'Prove dal vero'), chat('c-2', 'sviluppo', 'lavoro', 'Riassunto'), chat('c-4', 'rilascio', 'pausa', 'Release')],
      [{ quando: '2026-10-18T07:00:00.000Z', cosa: 'apro la chat c-2 (Sviluppo): Riassunto' }])
    const righe = righeLavoro(a, di)
    const casi = { ora, testiFissi: TESTI_RIASSUNTO, righe, testi: righe.map((r) => testoRigaLavoro(r, daQuanto(r.dal !== undefined ? Date.parse(r.dal) : undefined, ora))) }
    expect(casi.testi).toEqual([
      'Sviluppo · fa girare i test · da 3 h',
      'Collaudo · aspetta il tuo permesso: esegue un comando · da 5 min · aspetta te',
      'Rilascio · in pausa per i limiti del piano'
    ])
    const file = join(__dirname, '..', '..', 'android', 'app', 'src', 'test', 'resources', 'riassunto', 'lavoro-0.79.json')
    const atteso = `${JSON.stringify(casi, null, 2)}\n`
    if (process.env.AGGIORNA === '1' || !existsSync(file)) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, atteso) }
    expect(readFileSync(file, 'utf8').replace(/\r\n/g, '\n')).toBe(atteso)
  })
})
