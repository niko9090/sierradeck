import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { gitPerLeChat } from '../main/git-nel-path'
import { ambientePulito } from './supervisore'
import type { ImpostazioniOrchestratore, RigaDialogo } from './orchestratore-store'

/**
 * **L'orchestratore unico** (P3, 30/10/2026). Nicholas: «l'autopilota deve
 * essere UNO che parla con me dentro il workspace, come fa Claude Code con me
 * mentre lancia agenti specializzati; mi mostra l'avanzamento, anche in
 * percentuale, e la cosa si fa».
 *
 * Il servizio lo guida con `claude -p`, una chiamata alla volta:
 * - `--session-id` la prima volta, poi `--resume`: ricorda il discorso;
 * - `--model sonnet` di serie (opus a scelta, nelle impostazioni del workspace);
 * - `--append-system-prompt` con le regole, **sempre le stesse** (la cache resta calda);
 * - `--mcp-config` verso `/mcp/orchestratore?ws=…` con il gettone del workspace;
 * - `--allowedTools` solo i suoi strumenti e la lettura (Read, Grep, Glob).
 *   **Mai** `--dangerously-skip-permissions`: l'orchestratore non scrive nel
 *   repository, le mani le hanno gli specialisti;
 * - `--output-format json`, per leggere la risposta, la sessione e l'`usage`.
 *
 * Quando parte:
 * - un messaggio di Nicholas parte **subito** (o con la chiamata dopo, se una
 *   è già in volo per quel workspace);
 * - gli eventi degli specialisti (finito, bloccato, domanda, silenzio di 20
 *   minuti, esito di un'unione) si raccolgono per 30 s e partono insieme;
 * - al più 1 chiamata in volo per workspace e 2 su tutto il PC. Fra una
 *   chiamata e l'altra nessun processo resta acceso.
 *
 * La sessione ruota oltre 80k token di contesto: quella nuova riceve il
 * riassunto dello stato (che c'è sempre) più le ultime 10 battute.
 */

// ---------------------------------------------------------------- tipi

export type TipoEvento = 'finito' | 'bloccato' | 'domanda' | 'silenzio' | 'unione' | 'fermo' | 'risposta' | 'adozione'
export type EventoOrchestratore = { tipo: TipoEvento; quando: string; testo: string; chat?: string }
export type MessaggioUtente = { quando: string; testo: string }

/** L'esecuzione di `claude`: sostituibile, i test non chiamano mai la CLI vera. */
export type EsecutoreClaude = (p: { comando?: string; args: string[]; prompt: string; cwd: string; timeoutMs: number }) => Promise<{ stdout: string; stderr: string; codice: number }>

export type UscitaChiamata = { testo: string; sessione?: string; contesto?: number; errore?: string }

// ---------------------------------------------------------------- costanti

export const MODELLO_ORCHESTRATORE = 'sonnet'
export const RACCOLTA_EVENTI_MS = 30_000
export const CHIAMATE_PC_MAX = 2
export const ROTAZIONE_TOKEN = 80_000
export const BATTUTE_SEMINA = 10
export const SILENZIO_SPECIALISTA_MS = 20 * 60_000
const TIMEOUT_CHIAMATA_MS = 15 * 60_000

/** Gli strumenti concessi: i suoi (il server `sierradeck`) e la lettura. */
export const STRUMENTI_ORCHESTRATORE_CLI = 'mcp__sierradeck__*,mcp__sierradeck,Read,Grep,Glob'
/** Quelli che scrivono o eseguono: negati comunque, anche se un'impostazione li concedesse. */
export const STRUMENTI_NEGATI_CLI = 'Bash,Edit,Write,MultiEdit,NotebookEdit,WebFetch,WebSearch,Task'

/**
 * Le regole dell'orchestratore: il suo `--append-system-prompt`. **Non
 * contengono niente che cambi** da una chiamata all'altra (né date, né nomi,
 * né stato): così il prefisso del prompt resta in cache.
 */
export const REGOLE_ORCHESTRATORE = [
  'Sei l’autopilota di SierraDeck per questo workspace, l’unico. Parli con Nicholas, che possiede il progetto, come un collega che coordina una squadra: lui ti dice cosa vuole, tu fai in modo che venga fatto da specialisti che lavorano ognuno nella sua chat, nella sua copia del progetto.',
  'Non scrivi codice e non tocchi i file del progetto: puoi leggerli (Read, Grep, Glob) e agire solo con gli strumenti sierradeck. Ogni tua chiamata a uno strumento la controlla il programma: se rifiuta, leggi il motivo e cambia strada, non insistere.',
  '',
  'A ogni chiamata ricevi lo stato scritto dal programma (coda, piano, specialisti, percentuale, eventi recenti) e, dopo, i messaggi nuovi di Nicholas e gli eventi degli specialisti. Lo stato è la verità di adesso: parti da lì.',
  '',
  'Come porti avanti il lavoro:',
  '1. Ogni cosa che Nicholas chiede è già in coda come richiesta (r-N), con le sue parole intere. Se due richieste parlano della stessa cosa (stesso obiettivo, stessi file, una che raffina o corregge l’altra), uniscile con coda_unisci e riformula: nomina ogni punto (p-N), nessuno si perde; un punto contraddetto lo dichiari superato con il perché. Tienile separate se l’obiettivo è diverso, se una è già fatta, se Nicholas ha detto «separata», o se unire farebbe aspettare una cosa piccola dietro una grande.',
  '2. Dividi ogni richiesta aperta in compiti con piano_scrivi: piccoli, verificabili, con un criterio chiaro (meglio se con un comando fra apici inversi, per esempio `npx vitest run tests/coda.test.ts`), le dipendenze vere (dopo) e un peso da 1 a 3. Una richiesta piccola può essere un compito solo.',
  '3. Affida i compiti pronti con specialista_apri: il ruolo giusto e istruzioni concrete (cosa fare, dove, vincoli, come verificarlo). I tetti li decide il programma: se rifiuta, aspetta che uno specialista finisca.',
  '4. Quando uno specialista dice di aver finito, chiama unisci con la sua chat. L’esito arriva come evento in una chiamata dopo: con il criterio verde chiudi la chat con specialista_chiudi «unita», passando le lezioni utili; con il criterio rosso o un conflitto scrivi allo specialista cosa correggere con specialista_scrivi.',
  '5. Uno specialista bloccato, o che fa una domanda: se la risposta sta nel codice, nel quaderno o in quello che Nicholas ha già detto, rispondi tu con specialista_scrivi. Chiedi a Nicholas con chiedi_utente solo per una decisione che spetta a lui, con 2-4 scelte e la consigliata per prima.',
  '6. Quello che conviene ricordare per i lavori futuri (una trappola, una convenzione, una decisione presa) va nel quaderno con quaderno_annota, una riga.',
  '',
  'Regole che non si discutono:',
  '- I fatti vincono. Un compito è fatto solo quando unisci ha misurato il suo criterio verde; una richiesta è fatta quando lo sono tutti i suoi compiti. Non dire «fatto» prima.',
  '- La percentuale la calcola il programma: riportala com’è, non stimarla tu. Se è scesa perché sono arrivati punti nuovi, dillo.',
  '- Niente lavoro che non sia in coda, e niente specialisti in più del necessario.',
  '- Non promettere quello che non fai in questa chiamata: se aspetti un evento (un’unione, uno specialista), dillo così.',
  '- Le chat adottate «solo mia» sono di Nicholas: non scriverle.',
  '',
  'Come rispondi: il testo finale della chiamata è quello che Nicholas legge nella conversazione del workspace, sul PC e sul telefono. In italiano, breve e concreto: cosa hai fatto adesso, cosa succede dopo, la percentuale se è cambiata. Se rispondi solo a eventi di routine basta una riga. Niente elenchi tecnici, e gli id (r-N, c-N) solo quando aiutano.'
].join('\n')

// ---------------------------------------------------------------- argomenti, prompt, uscita

export function argomentiOrchestratore(p: { modello: string; sessione: { id: string; nuova: boolean }; mcpConfig: string }): string[] {
  return [
    // Il prompt arriva dall'ingresso (come il supervisore, 0.85.1): niente tetto della riga di comando.
    '-p',
    '--output-format', 'json',
    '--model', p.modello,
    ...(p.sessione.nuova ? ['--session-id', p.sessione.id] : ['--resume', p.sessione.id]),
    '--append-system-prompt', REGOLE_ORCHESTRATORE,
    '--mcp-config', p.mcpConfig,
    // Solo il server di SierraDeck, non quelli di Nicholas.
    '--strict-mcp-config',
    '--allowedTools', STRUMENTI_ORCHESTRATORE_CLI,
    '--disallowedTools', STRUMENTI_NEGATI_CLI
  ]
}

const orario = (iso: string): string => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const PAROLA_EVENTO: Record<TipoEvento, string> = {
  finito: 'ha finito',
  bloccato: 'è bloccato',
  domanda: 'chiede',
  silenzio: 'tace',
  unione: 'unione',
  fermo: 'si è fermato',
  risposta: 'risposta di Nicholas',
  adozione: 'adozione'
}

/** Il prompt di una chiamata: stato, indice del quaderno, (le ultime battute), messaggi ed eventi. */
export function componiPrompt(p: {
  riassunto: string
  indice: string
  semina?: RigaDialogo[]
  messaggi: MessaggioUtente[]
  eventi: EventoOrchestratore[]
}): string {
  const righe: string[] = ['<stato>', p.riassunto.trim(), '</stato>']
  if (p.indice.trim() !== '') righe.push('', '<quaderno>', p.indice.trim(), '</quaderno>')
  if (p.semina !== undefined && p.semina.length > 0) {
    righe.push('', '<ultime-battute>', 'Sessione nuova: le ultime battute del dialogo, per riprendere il filo.')
    for (const r of p.semina) righe.push(`[${orario(r.quando)}] ${r.da === 'tu' ? 'Nicholas' : r.da === 'lui' ? 'tu' : 'evento'}: ${r.testo.replace(/\s+/gu, ' ').slice(0, 600)}`)
    righe.push('</ultime-battute>')
  }
  if (p.eventi.length > 0) {
    righe.push('', '<eventi>')
    for (const e of p.eventi) righe.push(`[${orario(e.quando)}] ${e.chat !== undefined ? `${e.chat} ` : ''}${PAROLA_EVENTO[e.tipo]}: ${e.testo.replace(/\s+/gu, ' ').slice(0, 1500)}`)
    righe.push('</eventi>')
  }
  if (p.messaggi.length > 0) {
    righe.push('', '<nicholas>')
    for (const m of p.messaggi) righe.push(`[${orario(m.quando)}] ${m.testo}`)
    righe.push('</nicholas>')
  } else {
    righe.push('', 'Nessun messaggio nuovo di Nicholas: rispondi agli eventi.')
  }
  return righe.join('\n')
}

/** La risposta di `claude -p --output-format json`: il testo, la sessione e i token di contesto. */
export function leggiUscita(stdout: string): UscitaChiamata {
  let o: Record<string, unknown>
  try {
    o = JSON.parse(stdout) as Record<string, unknown>
  } catch {
    // Non è JSON: il testo grezzo è comunque l'unica cosa che c'è.
    return stdout.trim() === '' ? { testo: '', errore: 'nessuna risposta' } : { testo: stdout.trim() }
  }
  const u = (typeof o.usage === 'object' && o.usage !== null ? o.usage : {}) as Record<string, unknown>
  const n = (k: string): number => (typeof u[k] === 'number' ? u[k] as number : 0)
  const contesto = n('input_tokens') + n('cache_read_input_tokens') + n('cache_creation_input_tokens')
  const testo = typeof o.result === 'string' ? o.result.trim() : ''
  return {
    testo,
    ...(typeof o.session_id === 'string' && o.session_id !== '' ? { sessione: o.session_id } : {}),
    ...(contesto > 0 ? { contesto } : {}),
    ...(o.is_error === true ? { errore: testo !== '' ? testo : String(o.subtype ?? 'errore') } : {})
  }
}

/** La sessione non c'è più (cancellata, o di un altro PC): si ricomincia con una nuova. */
export function sessionePersa(testo: string): boolean {
  return /no conversation found|session.*not found|sessione.*non trovata/iu.test(testo)
}

// ---------------------------------------------------------------- il motore

export type DipendenzeOrchestratore = {
  esegui: EsecutoreClaude
  impostazioni: (ws: string) => ImpostazioniOrchestratore
  cambiaImpostazioni: (ws: string, f: (i: ImpostazioniOrchestratore) => ImpostazioniOrchestratore) => void
  /** Cartella, riassunto dello stato e indice del quaderno; `undefined` se il workspace non è più attivo. */
  contesto: (ws: string) => { cwd: string; riassunto: string; indice: string } | undefined
  /** Le ultime battute del dialogo (per seminare una sessione nuova). */
  ultime: (ws: string, n: number) => RigaDialogo[]
  mcpConfig: (ws: string) => string
  /** Il testo finale di una chiamata: nel dialogo del workspace. */
  risposta: (ws: string, testo: string) => void
  /** Una chiamata non riuscita: una riga nel dialogo. */
  errore: (ws: string, motivo: string) => void
  nuovaSessione?: () => string
  /** Per i test: i tempi. */
  raccoltaMs?: number
  globaliMax?: number
  sogliaRotazione?: number
  timeoutMs?: number
}

export type Orchestratore = {
  /** Un messaggio di Nicholas: la chiamata parte subito, o dopo quella in volo. */
  messaggio: (ws: string, m: MessaggioUtente) => void
  /** Un evento di uno specialista: si raccoglie per 30 s con gli altri. */
  evento: (ws: string, e: EventoOrchestratore) => void
  inVolo: (ws: string) => boolean
  /** Chiamate in volo su tutto il PC. */
  chiamateInVolo: () => number
  inAttesa: (ws: string) => { messaggi: number; eventi: number }
  /** Per i test e lo spegnimento: si risolve quando non c'è più niente in volo né pronto. */
  quiete: () => Promise<void>
  /** Toglie tutto quello che aspetta di un workspace (interruttore spento). */
  dimentica: (ws: string) => void
}

type StatoWs = { messaggi: MessaggioUtente[]; eventi: EventoOrchestratore[]; timer?: ReturnType<typeof setTimeout>; eventiPronti: boolean; inVolo: boolean }

export function creaOrchestratore(d: DipendenzeOrchestratore): Orchestratore {
  const stati = new Map<string, StatoWs>()
  const fila: string[] = []
  let inVoloPc = 0
  const raccoltaMs = d.raccoltaMs ?? RACCOLTA_EVENTI_MS
  const globali = d.globaliMax ?? CHIAMATE_PC_MAX
  const soglia = d.sogliaRotazione ?? ROTAZIONE_TOKEN
  const nuova = d.nuovaSessione ?? ((): string => randomUUID())
  let attese: (() => void)[] = []

  const di = (ws: string): StatoWs => {
    let s = stati.get(ws)
    if (s === undefined) { s = { messaggi: [], eventi: [], eventiPronti: false, inVolo: false }; stati.set(ws, s) }
    return s
  }
  const pronto = (s: StatoWs): boolean => !s.inVolo && (s.messaggi.length > 0 || (s.eventiPronti && s.eventi.length > 0))
  const forseQuiete = (): void => {
    if (inVoloPc > 0 || [...stati.values()].some(pronto)) return
    const a = attese
    attese = []
    for (const r of a) r()
  }
  const metti = (ws: string): void => {
    if (!fila.includes(ws)) fila.push(ws)
    avanza()
  }
  const avanza = (): void => {
    while (inVoloPc < globali) {
      const i = fila.findIndex((w) => pronto(di(w)))
      if (i < 0) break
      const [ws] = fila.splice(i, 1)
      void chiama(ws!)
    }
    // Chi in fila non è più pronto (già servito) esce.
    for (let i = fila.length - 1; i >= 0; i -= 1) { const s = stati.get(fila[i]!); if (s === undefined || (!pronto(s) && !s.inVolo && s.messaggi.length === 0 && s.eventi.length === 0)) fila.splice(i, 1) }
    forseQuiete()
  }

  const chiama = async (ws: string): Promise<void> => {
    const s = di(ws)
    const messaggi = s.messaggi
    const eventi = s.eventi
    s.messaggi = []
    s.eventi = []
    s.eventiPronti = false
    if (s.timer !== undefined) { clearTimeout(s.timer); s.timer = undefined }
    s.inVolo = true
    inVoloPc += 1
    try {
      await chiamaOra(ws, messaggi, eventi, 0)
    } catch (err) {
      d.errore(ws, err instanceof Error ? err.message : String(err))
    } finally {
      s.inVolo = false
      inVoloPc -= 1
      // Quello che è arrivato intanto riparte subito (i messaggi) o alla sua raccolta (gli eventi).
      if (pronto(s)) metti(ws)
      else avanza()
    }
  }

  const chiamaOra = async (ws: string, messaggi: MessaggioUtente[], eventi: EventoOrchestratore[], tentativo: number): Promise<void> => {
    const ctx = d.contesto(ws)
    if (ctx === undefined) return
    const imp = d.impostazioni(ws)
    const nuovaSess = imp.sessione === undefined
    const id = imp.sessione ?? nuova()
    const semina = nuovaSess || imp.daSeminare === true ? d.ultime(ws, BATTUTE_SEMINA) : undefined
    const prompt = componiPrompt({ riassunto: ctx.riassunto, indice: ctx.indice, ...(semina !== undefined ? { semina } : {}), messaggi, eventi })
    const args = argomentiOrchestratore({ modello: imp.modello === 'opus' ? 'opus' : MODELLO_ORCHESTRATORE, sessione: { id, nuova: nuovaSess }, mcpConfig: d.mcpConfig(ws) })
    const r = await d.esegui({ args, prompt, cwd: ctx.cwd, timeoutMs: d.timeoutMs ?? TIMEOUT_CHIAMATA_MS })
    const u = leggiUscita(r.stdout)
    const motivo = r.codice !== 0 ? (u.errore ?? (r.stderr.trim().slice(0, 400) || `uscito con ${r.codice}`)) : u.errore
    if (motivo !== undefined) {
      // La sessione da riprendere non c'è più: una nuova, seminata, e si riprova una volta.
      if (!nuovaSess && tentativo === 0 && sessionePersa(`${motivo} ${r.stderr}`)) {
        d.cambiaImpostazioni(ws, (i) => ({ ...i, sessione: undefined, daSeminare: true, rotazioni: (i.rotazioni ?? 0) + 1 }))
        await chiamaOra(ws, messaggi, eventi, 1)
        return
      }
      // I messaggi di Nicholas non si perdono: tornano in attesa per la chiamata dopo.
      const s = di(ws)
      s.messaggi = [...messaggi, ...s.messaggi]
      d.errore(ws, motivo)
      return
    }
    const contesto = u.contesto
    const ruota = contesto !== undefined && contesto > soglia
    d.cambiaImpostazioni(ws, (i) => ({
      ...i,
      ...(ruota ? { sessione: undefined, daSeminare: true, rotazioni: (i.rotazioni ?? 0) + 1 } : { sessione: u.sessione ?? id, daSeminare: undefined }),
      ...(contesto !== undefined ? { contesto } : {})
    }))
    if (ruota) console.info(`[orchestratore] ${ws} — contesto a ${contesto} token: la prossima chiamata apre una sessione nuova, con il riassunto e le ultime ${BATTUTE_SEMINA} battute`)
    if (u.testo !== '') d.risposta(ws, u.testo)
  }

  return {
    messaggio(ws, m) {
      const s = di(ws)
      s.messaggi.push(m)
      // Gli eventi in raccolta partono con il messaggio: una chiamata sola.
      if (s.eventi.length > 0) s.eventiPronti = true
      metti(ws)
    },
    evento(ws, e) {
      const s = di(ws)
      s.eventi.push(e)
      if (s.timer !== undefined || s.eventiPronti) return
      s.timer = setTimeout(() => {
        s.timer = undefined
        s.eventiPronti = true
        metti(ws)
      }, raccoltaMs)
      s.timer.unref?.()
    },
    inVolo: (ws) => stati.get(ws)?.inVolo === true,
    chiamateInVolo: () => inVoloPc,
    inAttesa: (ws) => ({ messaggi: stati.get(ws)?.messaggi.length ?? 0, eventi: stati.get(ws)?.eventi.length ?? 0 }),
    quiete: () => new Promise<void>((r) => { attese.push(r); forseQuiete() }),
    dimentica(ws) {
      const s = stati.get(ws)
      if (s === undefined) return
      if (s.timer !== undefined) clearTimeout(s.timer)
      s.messaggi = []
      s.eventi = []
      s.eventiPronti = false
      s.timer = undefined
    }
  }
}

// ---------------------------------------------------------------- la CLI vera

/**
 * `claude -p` davvero: il prompt sull'ingresso, l'ambiente ripulito come per
 * il supervisore, Git nel PATH. Non solleva: un guasto torna come codice.
 */
export function esecutoreClaudeReale(claudeCmd: string): EsecutoreClaude {
  return ({ args, prompt, cwd, timeoutMs }) => new Promise((ris) => {
    if (!existsSync(cwd)) { ris({ stdout: '', stderr: `la cartella «${cwd}» non esiste`, codice: 1 }); return }
    const figlio = execFile(claudeCmd, args, {
      cwd,
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
      env: { ...ambientePulito(process.env), ...gitPerLeChat() }
    }, (err, stdout, stderr) => {
      const codice = err === null ? 0 : typeof err.code === 'number' ? err.code : 1
      ris({ stdout: String(stdout), stderr: `${err !== null && err.killed === true ? `scaduto dopo ${Math.round(timeoutMs / 60_000)} minuti. ` : ''}${String(stderr)}`, codice })
    })
    figlio.stdin?.on('error', () => { /* lo dice l'uscita */ })
    figlio.stdin?.end(prompt, 'utf8')
  })
}
