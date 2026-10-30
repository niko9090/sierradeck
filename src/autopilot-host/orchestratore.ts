import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'
import { gitPerLeChat } from '../main/git-nel-path'
import { ambientePulito } from './supervisore'
import { applicaRiga, flussoVuoto, specialistiAlLavoro, type EffettoFlusso, type StatoFlusso } from '@shared/flusso-orchestratore'
import type { ImpostazioniOrchestratore, RigaDialogo } from './orchestratore-store'

/**
 * **L'orchestratore unico** (P3, 30/10/2026). Nicholas: «l'autopilota deve
 * essere UNO che parla con me dentro il workspace, come fa Claude Code con me
 * mentre lancia agenti specializzati; mi mostra l'avanzamento, anche in
 * percentuale, e la cosa si fa».
 *
 * Un processo `claude -p` **lungo** per workspace, in stream-json in entrata
 * e in uscita (provato il 30/10 con la CLI 2.1.314 e il login
 * dell'abbonamento):
 * - il servizio scrive sul suo ingresso i messaggi di Nicholas e gli eventi
 *   esterni (l'esito di un'unione, una risposta, una chat adottata);
 * - gli specialisti sono subagenti nativi (`--agents`, ognuno nel suo
 *   worktree): li lancia lui con lo strumento Agent, in sottofondo; la CLI lo
 *   sveglia quando finiscono. Al più `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`
 *   insieme (3 di serie, al più 4);
 * - `--permission-mode acceptEdits`, i divieti dal PreToolUse (`--settings`),
 *   e quello che chiede ancora un permesso passa da `--permission-prompt-tool`
 *   (lo strumento `permesso` del nostro MCP): diventa una domanda nel riquadro.
 *   **Mai** `bypassPermissions`, mai `--dangerously-skip-permissions`, mai
 *   `--bare` (ignorerebbe il login dell'abbonamento), e niente
 *   `ANTHROPIC_API_KEY` nell'ambiente del figlio;
 * - il processo si spegne dopo 10 minuti senza turni né specialisti al
 *   lavoro, e riparte con `--resume`; oltre 80k token di contesto la sessione
 *   ruota (quella nuova riceve lo stato e le ultime 10 battute);
 * - un turno alla volta per workspace e al più 2 su tutto il PC: quello che
 *   arriva durante un turno aspetta e parte insieme, alla fine del turno.
 */

// ---------------------------------------------------------------- tipi

export type TipoEvento = 'finito' | 'bloccato' | 'domanda' | 'silenzio' | 'unione' | 'fermo' | 'risposta' | 'adozione'
export type EventoOrchestratore = { tipo: TipoEvento; quando: string; testo: string; chat?: string }
export type MessaggioUtente = { quando: string; testo: string }

/** Un processo `claude` vivo: sostituibile, i test non avviano mai la CLI vera. */
export type ProcessoClaude = {
  scrivi: (riga: string) => void
  uccidi: () => void
  suRiga: (f: (riga: string) => void) => void
  suUscita: (f: (codice: number | null, stderr: string) => void) => void
}
export type AvviaProcesso = (p: { args: string[]; cwd: string; env: Record<string, string> }) => ProcessoClaude

// ---------------------------------------------------------------- costanti

export const MODELLO_ORCHESTRATORE = 'sonnet'
/** Gli eventi esterni (non i messaggi) si raccolgono un poco, per partire insieme. */
export const RACCOLTA_EVENTI_MS = 30_000
export const CHIAMATE_PC_MAX = 2
export const ROTAZIONE_TOKEN = 80_000
export const BATTUTE_SEMINA = 10
export const INATTIVO_MS = 10 * 60_000
export const SILENZIO_SPECIALISTA_MS = 20 * 60_000
/** Lo strumento MCP che risponde alle richieste di permesso. */
export const STRUMENTO_PERMESSO = 'mcp__sierradeck__permesso'

/**
 * Le regole dell'orchestratore: il suo `--append-system-prompt`. **Non
 * contengono niente che cambi** (né date, né nomi, né stato): il prefisso
 * del prompt resta in cache.
 */
export const REGOLE_ORCHESTRATORE = [
  'Sei l’autopilota di SierraDeck per questo workspace, l’unico. Parli con Nicholas, che possiede il progetto, come un collega che coordina una squadra: lui ti dice cosa vuole, tu fai in modo che venga fatto da specialisti.',
  'Non scrivi codice e non modifichi i file del progetto tu: leggi (Read, Grep, Glob), decidi, e affidi il lavoro agli specialisti con lo strumento Agent, in sottofondo. Gli specialisti: sviluppatore, interfaccia, android (scrivono codice), verificatore (prova), revisore ed esploratore (solo lettura). Ognuno lavora nella sua copia del progetto, su un ramo suo.',
  'Ogni chiamata a uno strumento sierradeck la controlla il programma: se rifiuta, leggi il motivo e cambia strada, non insistere.',
  '',
  'Ogni messaggio che ricevi comincia con lo stato scritto dal programma (coda, piano, specialisti, percentuale, eventi recenti); poi i messaggi di Nicholas e gli eventi. Lo stato è la verità di adesso.',
  '',
  'Come porti avanti il lavoro:',
  '1. Ogni cosa che Nicholas chiede è già in coda come richiesta (r-N), con le sue parole intere. Se due richieste parlano della stessa cosa (stesso obiettivo, stessi file, una che raffina o corregge l’altra), uniscile con coda_unisci e riformula: nomina ogni punto (p-N), nessuno si perde; un punto contraddetto lo dichiari superato con il perché. Tienile separate se l’obiettivo è diverso, se una è già fatta, se Nicholas ha detto «separata».',
  '2. Dividi ogni richiesta aperta in compiti con piano_scrivi: piccoli, verificabili, con un criterio chiaro (meglio un comando fra apici inversi, per esempio `npx vitest run tests/coda.test.ts`), le dipendenze vere (dopo) e un peso da 1 a 3.',
  '3. Affida un compito pronto con Agent, in sottofondo: la descrizione COMINCIA con l’id del compito e due punti («k-3: …»), così il programma lo collega al piano; nel prompt metti cosa fare, dove, i vincoli e il criterio. Non più specialisti di quelli che servono.',
  '4. Quando uno specialista finisce, leggi il suo riepilogo e chiama unisci con il compito: il programma trova il ramo, lo prova nel principale, lo unisce e misura il criterio. L’esito ti arriva dopo, come evento. Criterio rosso o conflitto: affida la correzione a uno specialista, dicendo cosa non va.',
  '5. Uno specialista bloccato: se la risposta sta nel codice, nel quaderno o in quello che Nicholas ha già detto, decidi tu e rilancia. Chiedi a Nicholas con chiedi_utente solo una decisione che spetta a lui, con 2-4 scelte e la consigliata per prima.',
  '6. Quello che conviene ricordare per i lavori futuri va nel quaderno con quaderno_annota, una riga. Le righe LEZIONI: dei riepiloghi le annota già il programma.',
  '',
  'Regole che non si discutono:',
  '- I fatti vincono. Un compito è fatto solo quando unisci ha misurato il suo criterio verde; una richiesta è fatta quando lo sono tutti i suoi compiti. Non dire «fatto» prima.',
  '- La percentuale la calcola il programma: riportala com’è. Se è scesa perché sono arrivati punti nuovi, dillo.',
  '- Niente lavoro che non sia in coda. Niente push, niente pubblicazioni, niente installazioni.',
  '- Le chat adottate «solo mia» sono di Nicholas: non toccarle.',
  '',
  'Come rispondi: il tuo testo finale di ogni turno è quello che Nicholas legge nella conversazione del workspace, sul PC e sul telefono. In italiano, breve e concreto: cosa hai fatto adesso, cosa succede dopo, la percentuale se è cambiata. Agli eventi di routine basta una riga.'
].join('\n')

// ---------------------------------------------------------------- argomenti e prompt

export function argomentiOrchestratore(p: {
  modello: string
  sessione: { id: string; nuova: boolean }
  mcpConfig: string
  agenti: string
  impostazioni: string
}): string[] {
  return [
    '-p',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--verbose',
    '--model', p.modello,
    ...(p.sessione.nuova ? ['--session-id', p.sessione.id] : ['--resume', p.sessione.id]),
    '--append-system-prompt', REGOLE_ORCHESTRATORE,
    '--agents', p.agenti,
    '--settings', p.impostazioni,
    '--mcp-config', p.mcpConfig,
    // Solo il server di SierraDeck, non quelli di Nicholas.
    '--strict-mcp-config',
    '--permission-mode', 'acceptEdits',
    '--permission-prompt-tool', STRUMENTO_PERMESSO,
    // Le regole valgono anche per i subagenti: i comandi di shell passano senza
    // chiedere (li ferma il PreToolUse dei divieti, se serve); le modifiche ai
    // file le concede acceptEdits. Il resto chiede, con lo strumento `permesso`.
    '--allowedTools', STRUMENTI_CONCESSI
  ]
}

export const STRUMENTI_CONCESSI = 'mcp__sierradeck__*,Read,Grep,Glob,Agent,Task,TodoWrite,Bash,PowerShell'

/** Gli argomenti che non devono mai esserci (controllati anche nei test). */
export const ARGOMENTI_VIETATI = ['--dangerously-skip-permissions', '--bare', 'bypassPermissions']

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

/** Il messaggio di un turno: stato, indice del quaderno, (le ultime battute), eventi e messaggi. */
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

/** La riga stream-json di un messaggio dell'utente. */
export function rigaUtente(testo: string): string {
  return JSON.stringify({ type: 'user', message: { role: 'user', content: testo }, parent_tool_use_id: null })
}

/** La sessione non c'è più (cancellata, o di un altro PC): si ricomincia con una nuova. */
export function sessionePersa(testo: string): boolean {
  return /no conversation found|session.*not found|sessione.*non trovata/iu.test(testo)
}

/** L'ambiente del figlio: ripulito, git nel PATH, il tetto dei subagenti, e mai la chiave API (vale l'abbonamento). */
export function ambienteOrchestratore(base: NodeJS.ProcessEnv, tetto: number): Record<string, string> {
  const env: Record<string, string> = { ...ambientePulito(base), ...gitPerLeChat(), CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: String(Math.min(4, Math.max(1, tetto))) }
  delete env.ANTHROPIC_API_KEY
  return env
}

// ---------------------------------------------------------------- il motore

export type ContestoTurno = {
  cwd: string
  riassunto: string
  indice: string
  /** I file per `--agents`, `--settings` e `--mcp-config` (scritti dal servizio). */
  agenti: string
  impostazioniCli: string
  mcpConfig: string
  /** Il tetto dei subagenti insieme (impostazione e posti del PC). */
  tetto: number
}

export type DipendenzeOrchestratore = {
  avvia: AvviaProcesso
  impostazioni: (ws: string) => ImpostazioniOrchestratore
  cambiaImpostazioni: (ws: string, f: (i: ImpostazioniOrchestratore) => ImpostazioniOrchestratore) => void
  /** `undefined` se il workspace non è più attivo. */
  contesto: (ws: string) => ContestoTurno | undefined
  ultime: (ws: string, n: number) => RigaDialogo[]
  /** Il testo finale di un turno: nel dialogo del workspace. */
  risposta: (ws: string, testo: string) => void
  errore: (ws: string, motivo: string) => void
  /** Gli effetti del flusso (specialisti partiti e finiti, costi) e lo stato per la vista. */
  flusso?: (ws: string, effetti: EffettoFlusso[], stato: StatoFlusso) => void
  adesso?: () => string
  nuovaSessione?: () => string
  ambiente?: (tetto: number) => Record<string, string>
  raccoltaMs?: number
  globaliMax?: number
  sogliaRotazione?: number
  inattivoMs?: number
}

export type Orchestratore = {
  /** Un messaggio di Nicholas: parte subito, o alla fine del turno in corso. */
  messaggio: (ws: string, m: MessaggioUtente) => void
  /** Un evento esterno: si raccoglie un poco con gli altri. */
  evento: (ws: string, e: EventoOrchestratore) => void
  inVolo: (ws: string) => boolean
  /** Turni in corso su tutto il PC. */
  chiamateInVolo: () => number
  inAttesa: (ws: string) => { messaggi: number; eventi: number }
  vivo: (ws: string) => boolean
  stato: (ws: string) => StatoFlusso
  /** Per i test e lo spegnimento: si risolve quando nessun turno è in corso né pronto. */
  quiete: () => Promise<void>
  /** Interruttore spento: spegne il processo e dimentica quello che aspettava. */
  dimentica: (ws: string) => void
  /** Spegne tutto (uscita del servizio). */
  spegni: () => void
}

type StatoWs = {
  proc?: ProcessoClaude
  flusso: StatoFlusso
  messaggi: MessaggioUtente[]
  eventi: EventoOrchestratore[]
  eventiPronti: boolean
  timer?: ReturnType<typeof setTimeout>
  inattivo?: ReturnType<typeof setTimeout>
  /** Quello che il turno in corso ha portato: torna in attesa se il processo muore. */
  inviati?: { messaggi: MessaggioUtente[]; eventi: EventoOrchestratore[] }
  ruota: boolean
  tentativi: number
}

export function creaOrchestratore(d: DipendenzeOrchestratore): Orchestratore {
  const stati = new Map<string, StatoWs>()
  const fila: string[] = []
  const raccoltaMs = d.raccoltaMs ?? RACCOLTA_EVENTI_MS
  const globali = d.globaliMax ?? CHIAMATE_PC_MAX
  const soglia = d.sogliaRotazione ?? ROTAZIONE_TOKEN
  const inattivoMs = d.inattivoMs ?? INATTIVO_MS
  const nuova = d.nuovaSessione ?? ((): string => randomUUID())
  const adesso = d.adesso ?? ((): string => new Date().toISOString())
  const ambiente = d.ambiente ?? ((t: number) => ambienteOrchestratore(process.env, t))
  let attese: (() => void)[] = []

  const di = (ws: string): StatoWs => {
    let s = stati.get(ws)
    if (s === undefined) { s = { flusso: flussoVuoto(), messaggi: [], eventi: [], eventiPronti: false, ruota: false, tentativi: 0 }; stati.set(ws, s) }
    return s
  }
  const inTurno = (s: StatoWs): boolean => s.proc !== undefined && s.flusso.inTurno
  const turniPc = (): number => [...stati.values()].filter(inTurno).length
  const pronto = (s: StatoWs): boolean => !inTurno(s) && (s.messaggi.length > 0 || (s.eventiPronti && s.eventi.length > 0))
  const forseQuiete = (): void => {
    if (turniPc() > 0 || [...stati.values()].some(pronto)) return
    const a = attese
    attese = []
    for (const r of a) r()
  }
  const avanza = (): void => {
    for (const ws of [...fila]) {
      if (turniPc() >= globali) break
      const s = di(ws)
      if (!pronto(s)) { if (!inTurno(s)) fila.splice(fila.indexOf(ws), 1); continue }
      fila.splice(fila.indexOf(ws), 1)
      manda(ws, s)
    }
    forseQuiete()
  }
  const metti = (ws: string): void => {
    if (!fila.includes(ws)) fila.push(ws)
    avanza()
  }

  const spegniSe = (ws: string, s: StatoWs, perche: string): void => {
    if (s.proc === undefined) return
    console.info(`[orchestratore] ${ws} — spengo il processo: ${perche}`)
    const p = s.proc
    s.proc = undefined
    s.flusso = { ...s.flusso, inTurno: false }
    try { p.uccidi() } catch { /* già uscito */ }
  }

  /** A riposo (nessun turno, nessuno specialista): ruota subito se serve, se no si spegne dopo 10 minuti. */
  const riposo = (ws: string, s: StatoWs): void => {
    if (s.inattivo !== undefined) { clearTimeout(s.inattivo); s.inattivo = undefined }
    if (s.proc === undefined || inTurno(s) || specialistiAlLavoro(s.flusso).length > 0 || pronto(s)) return
    if (s.ruota) {
      s.ruota = false
      d.cambiaImpostazioni(ws, (i) => ({ ...i, sessione: undefined, daSeminare: true, rotazioni: (i.rotazioni ?? 0) + 1 }))
      spegniSe(ws, s, `contesto oltre ${soglia} token: la prossima volta una sessione nuova, con lo stato e le ultime ${BATTUTE_SEMINA} battute`)
      return
    }
    s.inattivo = setTimeout(() => { s.inattivo = undefined; if (!inTurno(s) && specialistiAlLavoro(s.flusso).length === 0) spegniSe(ws, s, `fermo da ${Math.round(inattivoMs / 60_000)} minuti; riparte con --resume`) }, inattivoMs)
    s.inattivo.unref?.()
  }

  const suEffetti = (ws: string, s: StatoWs, effetti: EffettoFlusso[]): void => {
    for (const e of effetti) {
      if (e.tipo === 'sessione') d.cambiaImpostazioni(ws, (i) => ({ ...i, sessione: e.id, daSeminare: undefined }))
      else if (e.tipo === 'costo') {
        if (e.costo.contesto > 0) d.cambiaImpostazioni(ws, (i) => ({ ...i, contesto: e.costo.contesto }))
        if (e.costo.contesto > soglia) s.ruota = true
      } else if (e.tipo === 'risposta') {
        s.inviati = undefined
        s.tentativi = 0
        if (e.errore !== undefined) d.errore(ws, e.errore)
        else if (e.testo !== '') d.risposta(ws, e.testo)
      }
    }
    try { d.flusso?.(ws, effetti, s.flusso) } catch (err) { console.error(`[orchestratore] ${ws} — effetti del flusso:`, err) }
    if (effetti.some((e) => e.tipo === 'risposta' || e.tipo === 'specialista-finito')) {
      // Fine del turno: quello che aspettava parte adesso, o si va a riposo.
      if (pronto(s)) metti(ws)
      else { avanza(); riposo(ws, s) }
    }
  }

  const avviaProcesso = (ws: string, s: StatoWs, ctx: ContestoTurno): { nuovaSess: boolean } => {
    const imp = d.impostazioni(ws)
    const nuovaSess = imp.sessione === undefined
    const id = imp.sessione ?? nuova()
    const args = argomentiOrchestratore({
      modello: imp.modello === 'opus' ? 'opus' : MODELLO_ORCHESTRATORE,
      sessione: { id, nuova: nuovaSess },
      mcpConfig: ctx.mcpConfig, agenti: ctx.agenti, impostazioni: ctx.impostazioniCli
    })
    if (nuovaSess) d.cambiaImpostazioni(ws, (i) => ({ ...i, sessione: id }))
    const p = d.avvia({ args, cwd: ctx.cwd, env: ambiente(ctx.tetto) })
    s.proc = p
    console.info(`[orchestratore] ${ws} — processo avviato (${nuovaSess ? 'sessione nuova' : `ripresa ${id.slice(0, 8)}`}, al più ${ctx.tetto} specialisti insieme)`)
    p.suRiga((riga) => {
      if (s.proc !== p) return
      const r = applicaRiga(s.flusso, riga, adesso())
      s.flusso = r.stato
      if (r.effetti.length > 0) suEffetti(ws, s, r.effetti)
      else try { d.flusso?.(ws, [], s.flusso) } catch { /* solo la vista */ }
    })
    p.suUscita((codice, stderr) => {
      if (s.proc !== p) return
      s.proc = undefined
      const eraInTurno = s.flusso.inTurno
      s.flusso = { ...s.flusso, inTurno: false, specialisti: s.flusso.specialisti.map((x) => (specialistiAlLavoro({ ...s.flusso, specialisti: [x] }).length > 0 ? { ...x, stato: 'fermato' as const, fine: adesso() } : x)) }
      if (s.inattivo !== undefined) { clearTimeout(s.inattivo); s.inattivo = undefined }
      const persi = s.inviati
      s.inviati = undefined
      if (eraInTurno || persi !== undefined) {
        // Quello che il turno portava non si perde: torna in attesa.
        if (persi !== undefined) { s.messaggi = [...persi.messaggi, ...s.messaggi]; s.eventi = [...persi.eventi, ...s.eventi]; if (s.eventi.length > 0) s.eventiPronti = true }
        const motivo = stderr.trim().slice(-400) || `uscito con ${String(codice)}`
        if (!nuovaSess && sessionePersa(motivo) && s.tentativi === 0) {
          d.cambiaImpostazioni(ws, (i) => ({ ...i, sessione: undefined, daSeminare: true, rotazioni: (i.rotazioni ?? 0) + 1 }))
          s.tentativi += 1
          metti(ws)
          return
        }
        s.tentativi += 1
        d.errore(ws, motivo)
        // Un secondo guasto di fila non riparte da solo: aspetta il prossimo messaggio.
        if (s.tentativi < 2) metti(ws)
        else { const fermo = s.messaggi.length; s.eventiPronti = false; if (fermo === 0) s.eventi = [] }
      }
      try { d.flusso?.(ws, [], s.flusso) } catch { /* solo la vista */ }
      avanza()
    })
    return { nuovaSess }
  }

  const manda = (ws: string, s: StatoWs): void => {
    const ctx = d.contesto(ws)
    if (ctx === undefined) { s.messaggi = []; s.eventi = []; s.eventiPronti = false; return }
    if (s.inattivo !== undefined) { clearTimeout(s.inattivo); s.inattivo = undefined }
    const messaggi = s.messaggi
    const eventi = s.eventiPronti ? s.eventi : []
    s.messaggi = []
    if (s.eventiPronti) { s.eventi = []; s.eventiPronti = false }
    if (s.timer !== undefined && eventi.length > 0) { clearTimeout(s.timer); s.timer = undefined }
    const appena = s.proc === undefined ? avviaProcesso(ws, s, ctx) : undefined
    const imp = d.impostazioni(ws)
    const semina = appena?.nuovaSess === true || imp.daSeminare === true ? d.ultime(ws, BATTUTE_SEMINA) : undefined
    const testo = componiPrompt({ riassunto: ctx.riassunto, indice: ctx.indice, ...(semina !== undefined ? { semina } : {}), messaggi, eventi })
    s.inviati = { messaggi, eventi }
    s.flusso = { ...s.flusso, inTurno: true }
    try {
      s.proc!.scrivi(`${rigaUtente(testo)}\n`)
    } catch (err) {
      d.errore(ws, `ingresso del processo chiuso: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return {
    messaggio(ws, m) {
      const s = di(ws)
      s.messaggi.push(m)
      // Gli eventi in raccolta partono con il messaggio: un turno solo.
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
    inVolo: (ws) => { const s = stati.get(ws); return s !== undefined && inTurno(s) },
    chiamateInVolo: turniPc,
    inAttesa: (ws) => ({ messaggi: stati.get(ws)?.messaggi.length ?? 0, eventi: stati.get(ws)?.eventi.length ?? 0 }),
    vivo: (ws) => stati.get(ws)?.proc !== undefined,
    stato: (ws) => stati.get(ws)?.flusso ?? flussoVuoto(),
    quiete: () => new Promise<void>((r) => { attese.push(r); forseQuiete() }),
    dimentica(ws) {
      const s = stati.get(ws)
      if (s === undefined) return
      if (s.timer !== undefined) clearTimeout(s.timer)
      if (s.inattivo !== undefined) clearTimeout(s.inattivo)
      s.messaggi = []
      s.eventi = []
      s.eventiPronti = false
      s.timer = undefined
      s.inattivo = undefined
      s.inviati = undefined
      spegniSe(ws, s, 'interruttore spento')
      forseQuiete()
    },
    spegni() {
      for (const [ws, s] of stati) {
        if (s.timer !== undefined) clearTimeout(s.timer)
        if (s.inattivo !== undefined) clearTimeout(s.inattivo)
        spegniSe(ws, s, 'il servizio si spegne')
      }
    }
  }
}

// ---------------------------------------------------------------- la CLI vera

/**
 * `claude` davvero, lungo: righe JSON in entrata e in uscita. Non solleva:
 * una cartella che non c'è o un avvio fallito tornano come uscita.
 */
export function avviaProcessoReale(claudeCmd: string): AvviaProcesso {
  return ({ args, cwd, env }) => {
    const righe: ((r: string) => void)[] = []
    const uscite: ((c: number | null, e: string) => void)[] = []
    let stderr = ''
    let uscito: { codice: number | null; e: string } | undefined
    const esci = (codice: number | null, e: string): void => {
      if (uscito !== undefined) return
      uscito = { codice, e }
      for (const f of uscite) f(codice, e)
    }
    if (!existsSync(cwd)) {
      setImmediate(() => esci(1, `la cartella «${cwd}» non esiste`))
      return { scrivi: () => {}, uccidi: () => {}, suRiga: (f) => { righe.push(f) }, suUscita: (f) => { uscite.push(f) } }
    }
    const figlio = spawn(claudeCmd, args, { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    createInterface({ input: figlio.stdout }).on('line', (r) => { for (const f of righe) f(r) })
    figlio.stderr.on('data', (b: Buffer) => { stderr = (stderr + b.toString('utf8')).slice(-4000) })
    figlio.on('error', (err) => esci(1, `${stderr}\n${err.message}`))
    figlio.on('close', (codice) => esci(codice, stderr))
    figlio.stdin.on('error', () => { /* lo dice l'uscita */ })
    return {
      scrivi: (r) => { figlio.stdin.write(r, 'utf8') },
      uccidi: () => { try { figlio.stdin.end() } catch { /* già chiuso */ } figlio.kill() },
      suRiga: (f) => { righe.push(f) },
      suUscita: (f) => { if (uscito !== undefined) f(uscito.codice, uscito.e); else uscite.push(f) }
    }
  }
}
