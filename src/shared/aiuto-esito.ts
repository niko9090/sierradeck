import { eLimiteDelPiano } from './limite-del-piano'
import type { LavoroAffidato } from './aiuto-rete'

/**
 * **Perché un lavoro affidato non è riuscito, e quando non riaffidarlo** (13/11).
 *
 * Il caso vero: «Aiuta la rete» mandava un compito a un Aiutante con due posti
 * liberi; dopo una quindicina di secondi «fallito (lo specialista ha chiuso con
 * un errore)», e mezzo minuto dopo lo stesso compito allo stesso Aiutante, più
 * e più volte, e poi anche quello di un altro progetto. Nessuno vedeva perché:
 * il testo del `result` della CLI si buttava via.
 *
 * Qui, tutto puro:
 * - `motivoDelRisultato`: il perché in una frase italiana, con il tipo del
 *   `result` e un pezzo corto (ripulito) del testo e dello stderr;
 * - `causaDelMotivo`: la causa riconosciuta (accesso, limite del piano, …);
 * - `pauseAiuti`: le pause che seguono dai lavori affidati e chiusi (il loro
 *   elenco sta in `aiuti-affidati.json`, quindi valgono anche dopo un riavvio
 *   del servizio, senza un file in più).
 */

/** Le cause riconosciute. `compito` = colpa del lavoro stesso (prove rosse…): il PC che aiuta non c'entra. */
export type CausaFallimento =
  | 'accesso' | 'limite' | 'modello' | 'turni' | 'permesso' | 'git' | 'npm' | 'strumenti' | 'api' | 'pc' | 'progetto' | 'fermato' | 'compito' | 'sconosciuta'

const FRASI: Record<CausaFallimento, string> = {
  accesso: 'su quel PC Claude Code non ha l’accesso fatto (o è scaduto): là va aperto un terminale, scritto «claude» e rifatto l’accesso',
  limite: 'su quel PC il piano di Claude ha finito la quota',
  modello: 'su quel PC Claude Code non può usare il modello chiesto (il piano di quell’account non lo comprende?)',
  turni: 'lo specialista ha finito i turni a disposizione prima di chiudere il lavoro',
  permesso: 'lo specialista ha chiesto uno strumento che su quel PC non gli è concesso',
  git: 'su quel PC git non è riuscito ad aprire il progetto arrivato',
  npm: 'su quel PC l’installazione dei pacchetti (npm ci) non è riuscita',
  strumenti: 'su quel PC manca un programma che serve (Claude Code, git o Node.js)',
  api: 'il servizio di Claude non ha risposto (sovraccarico o guasto passeggero)',
  pc: 'quel PC non risponde più o ha perso il lavoro',
  progetto: 'il progetto di qui non si può spedire (niente commit sul ramo principale, o ramo staccato)',
  fermato: 'il lavoro è stato fermato',
  compito: 'il lavoro è finito con le prove o i controlli rossi',
  sconosciuta: 'lo specialista ha chiuso con un errore'
}

export function causaValida(x: unknown): x is CausaFallimento {
  return typeof x === 'string' && Object.prototype.hasOwnProperty.call(FRASI, x)
}

export function fraseCausa(c: CausaFallimento): string {
  return FRASI[c]
}

/** Le cause per cui il PC che aiuta non c'entra: non lo mettono in pausa (ma lo stesso compito non ci torna subito). */
const NON_DEL_PC: ReadonlySet<CausaFallimento> = new Set(['compito', 'turni', 'api', 'fermato', 'progetto'])

export function colpaDelPc(c: CausaFallimento): boolean {
  return !NON_DEL_PC.has(c)
}

/**
 * La causa, dal testo (result, stderr, messaggio di un errore). L'ordine conta:
 * l'accesso e il limite prima di tutto, perché il loro testo può nominare anche altro.
 */
export function causaDalTesto(testo: string, tipo?: string): CausaFallimento {
  const t = testo
  if (/not logged in|please run \/login|invalid api key|authentication[_ ]error|oauth token (?:has )?expired|token (?:has )?expired|api error:? 401|status(?: code)?:? 401|\b401 unauthori[sz]ed|\bunauthori[sz]ed\b|credentials? (?:not found|missing|expired)/iu.test(t)) return 'accesso'
  if (eLimiteDelPiano(t) || /credit balance is too low|usage limit|quota (?:exceeded|esaurita)/iu.test(t)) return 'limite'
  if (/model.{0,60}(?:not (?:available|found|supported)|non disponibile)|not_found_error.{0,40}model|invalid model|model.{0,30}is not available/iu.test(t)) return 'modello'
  if (tipo === 'error_max_turns' || /max(?:imum)?[ _-]turns/iu.test(t)) return 'turni'
  if (/overloaded|\b529\b|\b5\d\d\b.*api|api error|internal server error|econnreset|etimedout|enotfound|network error|socket hang up/iu.test(t)) return 'api'
  if (/is not recognized as an internal or external command|non è riconosciuto come comando|command not found|spawn \S+ enoent|\benoent\b.*(?:claude|git|node|npm)|(?:claude|git|node|npm)(?:\.exe)?.*\benoent\b/iu.test(t)) return 'strumenti'
  if (/\bnpm (?:ci|err!?|error)\b|npm ci uscito/iu.test(t)) return 'npm'
  if (/^git \w+:|\bfatal: |not a git repository|\bbundle\b.*(?:invalid|empty|vuoto)|worktree add|refusing to create empty bundle/imu.test(t)) return 'git'
  if (/permission (?:to use \S+ )?(?:has been |was )?denied|requires (?:approval|permission)|not allowed to use|tool .* (?:is )?not (?:allowed|permitted)|non (?:è )?concesso/iu.test(t)) return 'permesso'
  if (/\btests? (?:failed|falliti|rossi?)|prove rosse|typecheck (?:failed|fallito)|\bvitest\b.*\bfail/iu.test(t)) return 'compito'
  return 'sconosciuta'
}

/**
 * Un pezzo di testo da mettere nel motivo: una riga sola, corto, senza cose
 * private o segrete (chiavi, gettoni, la cartella dell'utente).
 */
export function estrattoSicuro(s: string, n = 200): string {
  const pulito = s
    .replace(/sk-ant-[\w-]+/gu, 'sk-ant-…')
    .replace(/\b(?:bearer|token|key|chiave)[=:\s]+[\w.~+/-]{12,}/giu, (m) => `${m.split(/[=:\s]/u)[0]}=…`)
    .replace(/[A-Za-z0-9+/_-]{40,}={0,2}/gu, '…')
    .replace(/([A-Za-z]:[\\/](?:Users|Utenti)[\\/])[^\\/\s"']+/giu, '$1…')
    .replace(/(\/(?:home|Users)\/)[^/\s"']+/gu, '$1…')
    .replace(/\s+/gu, ' ')
    .trim()
  return pulito.length > n ? `${pulito.slice(0, n - 1)}…` : pulito
}

/**
 * Il motivo di uno specialista che ha chiuso con un errore: la frase della
 * causa, poi fra parentesi il tipo del `result`, il suo testo e la coda dello
 * stderr (corti e ripuliti). Il testo intero resta nel riepilogo.
 */
export function motivoDelRisultato(r: { tipo?: string; testo?: string; stderr?: string; codice?: number | null }): { motivo: string; causa: CausaFallimento } {
  const testo = r.testo ?? ''
  const stderr = r.stderr ?? ''
  const causa = causaDalTesto(`${testo}\n${stderr}`, r.tipo)
  const dettagli: string[] = []
  if (r.tipo !== undefined && r.tipo !== '') dettagli.push(`tipo ${estrattoSicuro(r.tipo, 40)}`)
  if (testo.trim() !== '') dettagli.push(`«${estrattoSicuro(testo, 200)}»`)
  const coda = stderr.trim() !== '' ? estrattoSicuro(stderr.trim().slice(-400), 160) : ''
  if (coda !== '') dettagli.push(`stderr: ${coda}`)
  if (dettagli.length === 0 && r.codice !== undefined && r.codice !== null && r.codice !== 0) dettagli.push(`uscita ${String(r.codice)}`)
  return { motivo: `${fraseCausa(causa)}${dettagli.length > 0 ? ` (${dettagli.join('; ')})` : ''}`, causa }
}

/** La causa scritta in un motivo (anche di un PC di prima, che non la manda): dal testo. */
export function causaDelMotivo(motivo: string | undefined): CausaFallimento {
  if (motivo === undefined || motivo.trim() === '') return 'sconosciuta'
  for (const [c, f] of Object.entries(FRASI) as [CausaFallimento, string][]) if (c !== 'sconosciuta' && motivo.startsWith(f)) return c
  return causaDalTesto(motivo)
}

/** La frase corta di un motivo (quella prima delle parentesi coi dettagli), per la vista. */
export function motivoBreve(motivo: string): string {
  const nota = Object.values(FRASI).find((f) => motivo.startsWith(f))
  if (nota !== undefined) return nota
  const i = motivo.search(/ \(| — /u)
  return (i > 0 ? motivo.slice(0, i) : motivo).slice(0, 160)
}

// ---------------------------------------------------------------- le pause

/** Dopo un fallimento, lo stesso compito non torna su quel PC per questo tempo (va qui o altrove). */
export const RIPROVA_STESSO_PC_MS = 10 * 60_000
/** Due fallimenti dello stesso compito sullo stesso PC: quel PC è in pausa per tutto il progetto. */
export const PAUSA_PROGETTO_MS = 30 * 60_000
/** Tre compiti diversi falliti di fila su un PC (per colpa sua): il PC è in pausa per tutti. */
export const PAUSA_PC_MS = 30 * 60_000
export const FALLITI_PER_PAUSA_PROGETTO = 2
export const COMPITI_PER_PAUSA_PC = 3

export type PausaAiuto =
  | { tipo: 'spedizione'; workspace: string; fino: number; perche: string }
  | { tipo: 'compito'; pcId: string; workspace: string; compito: string; fino: number; perche: string }
  | { tipo: 'progetto'; pcId: string; workspace: string; fino: number; perche: string }
  | { tipo: 'pc'; pcId: string; fino: number; perche: string }

/** Lo stesso compito, per le pause: l'id del piano («k-34») o la descrizione ripulita. */
export function chiaveCompito(l: { compito?: string; descrizione: string }): string {
  return l.compito ?? l.descrizione.toLowerCase().replace(/\s+/gu, ' ').trim().slice(0, 120)
}

type Chiuso = LavoroAffidato & { fine: string }

/** La causa di un lavoro chiuso male: quella scritta, o letta dal motivo. */
const causaDi = (l: LavoroAffidato): CausaFallimento => (l.causa !== undefined ? l.causa : causaDelMotivo(l.motivo))

/**
 * Quanti compiti diversi sono falliti di fila su quel PC per colpa sua (un
 * lavoro riuscito azzera; un fallimento che non è colpa del PC non conta).
 */
export function serieGuasti(lavori: readonly LavoroAffidato[], pcId: string): { compiti: number; ultimo?: Chiuso } {
  const chiusi = lavori
    .filter((l): l is Chiuso => l.pcId === pcId && l.fine !== undefined && (l.stato === 'finito' || l.stato === 'fallito'))
    .sort((a, b) => Date.parse(a.fine) - Date.parse(b.fine))
  let compiti = new Set<string>()
  let ultimo: Chiuso | undefined
  for (const l of chiusi) {
    if (l.stato === 'finito') { compiti = new Set(); ultimo = undefined; continue }
    if (!colpaDelPc(causaDi(l))) continue
    compiti.add(chiaveCompito(l))
    ultimo = l
  }
  return { compiti: compiti.size, ...(ultimo !== undefined ? { ultimo } : {}) }
}

/** Le pause che valgono adesso, dai lavori affidati e chiusi. */
export function pauseAiuti(lavori: readonly LavoroAffidato[], adesso: number): PausaAiuto[] {
  const pause: PausaAiuto[] = []
  const falliti = lavori.filter((l): l is Chiuso => l.stato === 'fallito' && l.fine !== undefined && causaDi(l) !== 'fermato')
  // Per compito e PC.
  const gruppi = new Map<string, Chiuso[]>()
  for (const l of falliti) {
    if (causaDi(l) === 'progetto') continue
    const k = `${l.pcId}\u0000${l.workspace}\u0000${chiaveCompito(l)}`
    gruppi.set(k, [...(gruppi.get(k) ?? []), l])
  }
  // Un progetto che qui non si impacchetta: per un po' non si affida a nessun PC (resta qui).
  for (const l of falliti) {
    if (causaDi(l) !== 'progetto') continue
    const fino = Date.parse(l.fine) + PAUSA_PROGETTO_MS
    if (fino > adesso) pause.push({ tipo: 'spedizione', workspace: l.workspace, fino, perche: l.motivo !== undefined ? motivoBreve(l.motivo) : fraseCausa('progetto') })
  }
  for (const g of gruppi.values()) {
    const ultimo = g.reduce((a, b) => (Date.parse(b.fine) > Date.parse(a.fine) ? b : a))
    const fine = Date.parse(ultimo.fine)
    const perche = ultimo.motivo !== undefined ? motivoBreve(ultimo.motivo) : fraseCausa('sconosciuta')
    if (fine + RIPROVA_STESSO_PC_MS > adesso) pause.push({ tipo: 'compito', pcId: ultimo.pcId, workspace: ultimo.workspace, compito: chiaveCompito(ultimo), fino: fine + RIPROVA_STESSO_PC_MS, perche })
    if (g.length >= FALLITI_PER_PAUSA_PROGETTO && fine + PAUSA_PROGETTO_MS > adesso) pause.push({ tipo: 'progetto', pcId: ultimo.pcId, workspace: ultimo.workspace, fino: fine + PAUSA_PROGETTO_MS, perche })
  }
  // Per PC.
  for (const pcId of new Set(falliti.map((l) => l.pcId))) {
    const s = serieGuasti(lavori, pcId)
    if (s.compiti < COMPITI_PER_PAUSA_PC || s.ultimo === undefined) continue
    const fino = Date.parse(s.ultimo.fine) + PAUSA_PC_MS
    if (fino > adesso) pause.push({ tipo: 'pc', pcId, fino, perche: s.ultimo.motivo !== undefined ? motivoBreve(s.ultimo.motivo) : fraseCausa('sconosciuta') })
  }
  return pause
}

/** Quel PC può ricevere quel compito di quel progetto, con queste pause? */
export function pcInPausa(pause: readonly PausaAiuto[], pcId: string, workspace: string, compito: string): PausaAiuto | undefined {
  return pause.find((p) => (p.tipo === 'spedizione' ? p.workspace === workspace : p.pcId === pcId && (p.tipo === 'pc' || p.workspace === workspace) && (p.tipo !== 'compito' || p.compito === compito)))
}
