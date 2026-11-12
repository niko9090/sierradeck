/**
 * **I posti liberi degli altri PC** (0.103.0, tappa 3 del lavoro a distanza).
 *
 * Nicholas, 12/11: «utilizzare gli slot liberi degli altri PC», e i PC messi su
 * «Aiuta la rete» hanno la precedenza (ne ha tre da dedicare solo a questo).
 *
 * Come va: quando l'autopilota lancia uno specialista che scrive codice e un
 * altro PC ha un posto libero, il programma glielo affida invece di aprirlo
 * qui. Il PC che chiede spedisce il progetto (un `git bundle`, a pezzi, sul
 * collegamento sicuro fra i PC: niente GitHub, niente Drive); quello che aiuta
 * lo apre in una copia sua, lancia lo specialista con lo stesso ruolo e lo
 * stesso compito, e alla fine rimanda il ramo. Il ramo torna come
 * `worktree-agent-r<id>`, quindi l'unione e le pulizie lo trattano come quello
 * di uno specialista di qui.
 *
 * Tutto puro qui: le scelte e i controlli. I processi stanno nel servizio.
 */

/** Come un PC presta i suoi posti. */
export type ModoAiuto = 'dedicato' | 'posti-liberi' | 'no'

/** Per chi non ha scelto: presta solo i posti che non usa. */
export const MODO_AIUTO_PREDEFINITO: ModoAiuto = 'posti-liberi'

export function modoAiutoValido(x: unknown): x is ModoAiuto {
  return x === 'dedicato' || x === 'posti-liberi' || x === 'no'
}

/** La risposta di un PC a «quanti posti hai per gli altri?». */
export type PostiAiuto = { modo: ModoAiuto; liberi: number; tetto: number }

/** Un PC che può aiutare, come lo vede chi chiede. */
export type Aiutante = { pcId: string; nome: string; modo: ModoAiuto; liberi: number }

/**
 * I ruoli che possono partire su un altro PC: chi lavora nella sua copia e
 * rimanda un ramo. Il rilascio no (pubblica da qui, con le chiavi di qui),
 * Android no (serve l'SDK di quel PC), chi legge soltanto no (è veloce, e il
 * suo lavoro è il testo che dice, non un ramo).
 */
export const RUOLI_IN_VIAGGIO: ReadonlySet<string> = new Set(['sviluppatore', 'interfaccia', 'verificatore'])

/**
 * Dove va il prossimo specialista. Prima i PC «dedicati» con un posto libero
 * (quello più libero), poi questo PC se ha posto, poi gli altri PC che
 * prestano i posti liberi. `undefined`: resta qui (anche in fila, se qui è
 * pieno e fuori non c'è posto).
 */
export function scegliPosto(aiutanti: readonly Aiutante[], liberiQui: number): Aiutante | undefined {
  const conPosto = aiutanti.filter((a) => a.liberi > 0 && a.modo !== 'no')
  const migliore = (l: Aiutante[]): Aiutante | undefined => [...l].sort((p, q) => q.liberi - p.liberi || p.nome.localeCompare(q.nome))[0]
  const dedicato = migliore(conPosto.filter((a) => a.modo === 'dedicato'))
  if (dedicato !== undefined) return dedicato
  if (liberiQui > 0) return undefined
  return migliore(conPosto.filter((a) => a.modo === 'posti-liberi'))
}

/** Un pezzo del pacchetto: 3 MB, che in base64 stanno sotto il tetto delle richieste fra PC. */
export const PEZZO_BYTE = 3 * 1024 * 1024
/** Il tetto del corpo di una richiesta che porta un pezzo (base64 + il resto). */
export const TETTO_CORPO_PEZZO = 6 * 1024 * 1024
/** Il pacchetto più grande che si spedisce (oltre, il progetto resta qui). */
export const PACCHETTO_MAX_BYTE = 600 * 1024 * 1024

export function quantiPezzi(byte: number): number {
  return Math.max(1, Math.ceil(byte / PEZZO_BYTE))
}

/** L'id di un lavoro affidato: `r` e 12 cifre esadecimali. Niente altro passa (diventa un nome di cartella e di ramo). */
export function idLavoroValido(x: unknown): x is string {
  return typeof x === 'string' && /^r[0-9a-f]{12}$/u.test(x)
}

/** Il ramo con cui il lavoro torna: lo stesso schema degli specialisti di qui (`ramoDelloSpecialistaFinito`). */
export function ramoDiRitorno(id: string): string {
  return `worktree-agent-${id}`
}

/** Il nome di un progetto come cartella sul PC che aiuta: solo lettere, cifre, `-` e `_`. */
export function nomeProgettoSicuro(x: string): string {
  const n = x.normalize('NFKD').replace(/[^\w-]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 60)
  return n === '' ? 'progetto' : n
}

/** Il nome di un ramo che arriva da fuori: semplice, senza trucchi per git. */
export function ramoValido(x: unknown): x is string {
  return typeof x === 'string' && x.length > 0 && x.length <= 100 && /^[\w][\w./-]*$/u.test(x) && !x.includes('..') && !x.endsWith('.lock') && !x.endsWith('/')
}

/** Un commit per esteso. */
export function commitValido(x: unknown): x is string {
  return typeof x === 'string' && /^[0-9a-f]{40}$/u.test(x)
}

/** Gli strumenti che uno specialista può avere su un altro PC. Il resto si toglie. */
export const STRUMENTI_AIUTO: readonly string[] = ['Read', 'Grep', 'Glob', 'Bash', 'PowerShell', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'TodoWrite']

export function strumentiAmmessi(lista: unknown): string[] {
  if (!Array.isArray(lista)) return ['Read', 'Grep', 'Glob']
  return [...new Set(lista.filter((s): s is string => typeof s === 'string' && STRUMENTI_AIUTO.includes(s)))]
}

/**
 * Quello che su un altro PC non si fa mai: pubblicare (push, release),
 * installare, cambiare le impostazioni di git. Il ramo lo rimanda il programma
 * e lo unisce il PC che l'ha chiesto.
 */
export const VIETATI_AIUTO: readonly string[] = [
  'Bash(git push:*)', 'Bash(git config:*)', 'Bash(git remote:*)', 'Bash(gh:*)',
  'Bash(npm publish:*)', 'Bash(npm run pubblica:*)', 'Bash(npm run allega-apk:*)', 'Bash(npm run pubblica-app:*)', 'Bash(npm install:*)',
  'PowerShell(git push*)', 'PowerShell(gh *)', 'PowerShell(npm run pubblica*)', 'PowerShell(npm run allega-apk*)', 'PowerShell(npm run pubblica-app*)',
  'WebFetch', 'WebSearch', 'Agent', 'Task'
]

export const MODELLI_AIUTO: readonly string[] = ['haiku', 'sonnet', 'opus']

export function modelloAiuto(x: unknown): string {
  return typeof x === 'string' && MODELLI_AIUTO.includes(x) ? x : 'sonnet'
}

/** Come sta un lavoro, dal lato di chi aiuta. */
export type StatoAiuto = 'ricevo' | 'preparo' | 'lavoro' | 'finito' | 'fallito' | 'fermato'

export type VistaLavoroAiutato = {
  id: string
  stato: StatoAiuto
  attivita?: string
  riepilogo?: string
  motivo?: string
  /** A lavoro finito: il ramo da ritirare, e quanto pesa il suo pacchetto (0 = nessun commit). */
  ramo?: string
  byte?: number
  commit?: number
}

/** Un lavoro affidato, dal lato di chi chiede (lo tiene il servizio, sopravvive ai riavvii). */
export type LavoroAffidato = {
  id: string
  workspace: string
  cwd: string
  pcId: string
  pcNome: string
  ruolo: string
  descrizione: string
  compito?: string
  prompt: string
  sistema: string
  modello: string
  strumenti: string[]
  /** da-spedire → spedito (là lavora) → finito / fallito. */
  stato: 'da-spedire' | 'spedito' | 'finito' | 'fallito'
  inizio: string
  fine?: string
  attivita?: string
  riepilogo?: string
  /** Il ramo arrivato qui, se lo specialista ha fatto commit. */
  ramo?: string
}

export function lavoroAffidatoValido(x: unknown): LavoroAffidato | undefined {
  if (typeof x !== 'object' || x === null) return undefined
  const o = x as Record<string, unknown>
  const t = (k: string): string | undefined => (typeof o[k] === 'string' ? o[k] as string : undefined)
  const stato = t('stato')
  if (!idLavoroValido(o.id) || t('workspace') === undefined || t('cwd') === undefined || t('pcId') === undefined) return undefined
  if (stato !== 'da-spedire' && stato !== 'spedito' && stato !== 'finito' && stato !== 'fallito') return undefined
  return {
    id: o.id,
    workspace: t('workspace')!,
    cwd: t('cwd')!,
    pcId: t('pcId')!,
    pcNome: t('pcNome') ?? t('pcId')!.slice(0, 8),
    ruolo: t('ruolo') ?? 'sviluppatore',
    descrizione: t('descrizione') ?? '',
    ...(t('compito') !== undefined ? { compito: t('compito')! } : {}),
    prompt: t('prompt') ?? '',
    sistema: t('sistema') ?? '',
    modello: modelloAiuto(o.modello),
    strumenti: strumentiAmmessi(o.strumenti),
    stato,
    inizio: t('inizio') ?? new Date(0).toISOString(),
    ...(t('fine') !== undefined ? { fine: t('fine')! } : {}),
    ...(t('attivita') !== undefined ? { attivita: t('attivita')! } : {}),
    ...(t('riepilogo') !== undefined ? { riepilogo: t('riepilogo')! } : {}),
    ...(ramoValido(o.ramo) ? { ramo: o.ramo } : {})
  }
}

/** Il «no» all'Agent dell'autopilota quando il lavoro va a un altro PC: non deve rilanciarlo. */
export function motivoAffidato(pcNome: string, compito: string | undefined): string {
  const chi = compito !== undefined ? compito : 'questo lavoro'
  return `Fatto: ${chi} è affidato a ${pcNome}, che ha un posto libero (Aiuta la rete). Lo specialista lavora là su una copia del progetto, con lo stesso ruolo e lo stesso messaggio; il ramo torna qui e il programma lo unisce da solo, come per gli altri. Non rilanciarlo: l’esito ti arriva come evento. Intanto puoi affidare altro.`
}

/** Quanto si aspetta un PC che aiuta e non risponde più, prima di dire che il lavoro è perso. */
export const SILENZIO_MAX_MS = 20 * 60_000
/** Un lavoro che dura oltre questo si ferma (come uno specialista di qui che non finisce più). */
export const LAVORO_MAX_MS = 3 * 60 * 60_000
