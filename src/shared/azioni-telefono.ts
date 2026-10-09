/**
 * Gestire chat, workspace e autopiloti dal telefono (0.55.0), alla pari con il
 * PC. Le regole e i testi stanno qui, una volta sola: il pannello del PC, le
 * rotte del Client, la pagina del telefono e l'app (che li ricopia in Kotlin,
 * con un test che li confronta: `tests/shared/azioni-telefono-app.test.ts`).
 *
 * Il difetto da cui nasce (Nicholas, 09/10): «Ho provato nell'app sul cell di
 * aprire un workspace nuovo e una chat nuova ma non si riesce, va in errore, e
 * poi non posso eliminare workspace o chat. Quando voglio lanciare un
 * autopilota non mi chiede dove lanciarlo». Le cause sono nel quaderno
 * (`gestire-dal-telefono-chat-workspace-autopiloti.md`).
 */

import { REGOLE_PUBBLICAZIONE, type RegolaPubblicazione } from './harness'

/* ------------------------------------------------------------------ */
/* Le azioni che il Core chiede alla finestra                          */
/* ------------------------------------------------------------------ */

/**
 * Un'azione del telefono che la finestra esegue con lo stesso codice dei suoi
 * tasti. `chat` è l'id del riquadro (quello di `/api/stato`).
 */
export type AzioneFinestra =
  | { tipo: 'workspace'; azione: 'crea' | 'elimina'; nome: string }
  | { tipo: 'workspace'; azione: 'rinomina'; nome: string; nuovo: string }
  | { tipo: 'chat'; azione: 'dormi' | 'sveglia' | 'chiudi'; chat: string }
  | { tipo: 'chat'; azione: 'sposta'; chat: string; workspace: string }

export type EsitoAzioneFinestra = { ok: boolean; errore?: string }

/** Il corpo del messaggio alla finestra, letto senza fidarsi: o l'azione, o niente. */
export function leggiAzioneFinestra(x: unknown): AzioneFinestra | undefined {
  const o = typeof x === 'object' && x !== null ? x as Record<string, unknown> : {}
  const s = (k: string): string => typeof o[k] === 'string' ? (o[k] as string) : ''
  if (o.tipo === 'workspace') {
    if ((o.azione === 'crea' || o.azione === 'elimina') && s('nome') !== '') return { tipo: 'workspace', azione: o.azione, nome: s('nome') }
    if (o.azione === 'rinomina' && s('nome') !== '' && s('nuovo') !== '') return { tipo: 'workspace', azione: 'rinomina', nome: s('nome'), nuovo: s('nuovo') }
    return undefined
  }
  if (o.tipo === 'chat' && s('chat') !== '') {
    if (o.azione === 'dormi' || o.azione === 'sveglia' || o.azione === 'chiudi') return { tipo: 'chat', azione: o.azione, chat: s('chat') }
    if (o.azione === 'sposta' && s('workspace') !== '') return { tipo: 'chat', azione: 'sposta', chat: s('chat'), workspace: s('workspace') }
  }
  return undefined
}

/* ------------------------------------------------------------------ */
/* Le conferme: cosa succede e cosa no, per esteso                     */
/* ------------------------------------------------------------------ */

export type Conferma = { titolo: string; testo: string; azione: string }

/** ⏸ del PC: la chat resta al suo posto, si spegne solo il suo claude.exe. */
export function confermaDormi(titolo: string): Conferma {
  return {
    titolo: `Mettere a dormire «${titolo}»?`,
    testo: 'Si chiude il suo claude.exe sul computer e smette di occupare memoria. La chat resta nel suo workspace, al suo posto, con tutta la conversazione: con «Svegliala» riparte da dove era. Se sta lavorando adesso, il lavoro di questo turno si interrompe a metà: aspetta che abbia finito, se non sei sicuro.',
    azione: 'Metti a dormire'
  }
}

/** × del PC: la chat esce dal workspace; la conversazione resta su disco. */
export function confermaChiudi(titolo: string): Conferma {
  return {
    titolo: `Chiudere «${titolo}»?`,
    testo: 'Si chiude il suo claude.exe e la chat esce dal workspace: sul computer il suo riquadro sparisce. La conversazione non si cancella: resta su disco e si riapre quando vuoi da «Riprendi», con tutta la sua storia. Se sta lavorando adesso, il lavoro di questo turno si interrompe a metà. Per spegnerla lasciandola al suo posto usa invece «Metti a dormire».',
    azione: 'Chiudi la chat'
  }
}

/** ⇄ del PC verso un altro workspace. */
export function confermaSposta(titolo: string, workspace: string): Conferma {
  return {
    titolo: `Spostare «${titolo}» in «${workspace}»?`,
    testo: `La chat esce da questo workspace ed entra in «${workspace}». Il suo claude.exe si chiude adesso e riparte con tutta la conversazione quando sul computer si passa a «${workspace}». Niente si perde; se sta lavorando adesso, il lavoro di questo turno si interrompe a metà.`,
    azione: 'Sposta la chat'
  }
}

/** Il testo del PC (PannelloWorkspace), parola per parola. */
export function confermaEliminaWorkspace(nome: string): Conferma {
  return {
    titolo: `Eliminare il workspace «${nome}»?`,
    testo: 'Il workspace sparisce dalla fascia e le chat che contiene escono dalla disposizione: i loro terminali si spengono. Le conversazioni restano su disco e si ritrovano nell’elenco Chat (Sessioni), da dove si riaprono in un altro workspace. Prima di eliminare viene messa da parte una copia dell’archivio dei workspace (workspaces.prima-dell-eliminazione.json, nella cartella dei dati). Se il workspace viaggia anche sul Drive, lì resta: si toglie da lì con «Togli dal Drive» nella scheda Drive.',
    azione: 'Elimina il workspace'
  }
}

/** Perché «Elimina» non c'è: l'ultimo workspace resta, come sul PC. */
export const ULTIMO_WORKSPACE = 'L’ultimo workspace non si può eliminare: non resterebbe dove salvare il layout.'

export function confermaRinominaWorkspace(nome: string): Conferma {
  return {
    titolo: `Rinominare «${nome}»?`,
    testo: 'Cambia solo il nome: le chat restano dove sono e chi lavora continua a lavorare.',
    azione: 'Rinomina'
  }
}

export function confermaEliminaAutopilota(nome: string): Conferma {
  return {
    titolo: `Eliminare l’autopilota «${nome}»?`,
    testo: 'L’autopilota sparisce dall’elenco e le sue chat si fermano. I file che ha già cambiato nel progetto restano come sono (e i suoi commit restano nel git del progetto), ma il suo diario, le domande e i passaggi non si recuperano più. Per fermarlo e basta usa «Ferma»: si riprende quando vuoi.',
    azione: 'Elimina l’autopilota'
  }
}

/* ------------------------------------------------------------------ */
/* Il nome di un workspace                                             */
/* ------------------------------------------------------------------ */

export const NOME_WORKSPACE_MAX = 60

/** Lo stesso controllo di `validateNomeWorkspace` del Core, con il perché in parole. */
export function controllaNomeWorkspace(nome: string, esistenti: readonly string[] = []): { ok: true; nome: string } | { ok: false; errore: string } {
  const pulito = nome.trim()
  if (pulito === '') return { ok: false, errore: 'Scrivi il nome del workspace.' }
  if (pulito.length > NOME_WORKSPACE_MAX) return { ok: false, errore: `Il nome è troppo lungo: al massimo ${NOME_WORKSPACE_MAX} caratteri.` }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(pulito)) return { ok: false, errore: 'Il nome non può contenere caratteri di controllo.' }
  if (esistenti.includes(pulito)) return { ok: false, errore: `«${pulito}» esiste già: scegli un altro nome.` }
  return { ok: true, nome: pulito }
}

/* ------------------------------------------------------------------ */
/* Un autopilota nuovo                                                  */
/* ------------------------------------------------------------------ */

export type Partenza = 'via' | 'subito'

/** Quando parte, dopo la preparazione. «via» è quello di sempre. */
export const PARTENZE: { valore: Partenza; etichetta: string; spiega: string }[] = [
  {
    valore: 'via',
    etichetta: 'aspetta il mio «Vai»',
    spiega: 'Legge il progetto, ti fa al massimo un paio di domande, si scrive i criteri se non li hai dati e aspetta il tuo «Vai» prima di cominciare. Non parte da solo.'
  },
  {
    valore: 'subito',
    etichetta: 'parte da solo',
    spiega: 'Legge il progetto e, se ha domande, le fa come sempre; appena ha le risposte e i criteri comincia a lavorare senza aspettare il tuo «Vai».'
  }
]

export const OBIETTIVO_MAX = 200_000
export const NOME_AUTOPILOTA_MAX = 80

/** Quello che si compila: gli stessi campi della finestra del PC, più la partenza. */
export type BozzaAutopilota = {
  obiettivo: string
  cwd: string
  nome: string
  /** Uno per riga. */
  criteri: string
  pubblicazione: RegolaPubblicazione
  cloud: boolean
  partenza: Partenza
  /** Il workspace in cui nascono le sue chat; vuoto = quello davanti sul PC. */
  workspace: string
}

export const BOZZA_AUTOPILOTA_VUOTA: BozzaAutopilota = {
  obiettivo: '', cwd: '', nome: '', criteri: '', pubblicazione: 'stabile', cloud: false, partenza: 'via', workspace: ''
}

/** Quello che va al servizio, già pulito. */
export type RichiestaAutopilota = {
  nome: string
  obiettivo: string
  cwd: string
  criteri: { descrizione: string }[]
  pubblicazione: RegolaPubblicazione
  vaSulCloud?: true
  workspace?: string
  partenza: Partenza
}

/** Se il nome è vuoto: le prime otto parole dell'obiettivo, al massimo 60 caratteri (come il PC). */
export function nomeDaObiettivo(obiettivo: string): string {
  return obiettivo.trim().split(/\s+/).slice(0, 8).join(' ').slice(0, 60)
}

export function criteriDaTesto(testo: string): { descrizione: string }[] {
  return testo.split(/\r?\n/).map((r) => r.trim()).filter((r) => r !== '').map((descrizione) => ({ descrizione }))
}

/** Un percorso assoluto: `C:\…`, `\\server\…` o `/…`. Un pezzo di nome non è una cartella. */
export function percorsoAssoluto(p: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(p) || /^\\\\[^\\]+\\[^\\]+/.test(p) || p.startsWith('/')
}

/**
 * La validazione di un autopilota nuovo, la stessa sul PC, nella rotta del
 * telefono, nella pagina e nell'app. Il primo problema, con il campo, in
 * parole da leggere; se va, la richiesta pronta.
 *
 * Che la cartella **esista** lo controlla il PC che la riceve: è l'unico che
 * può guardarla.
 */
export function controllaBozzaAutopilota(b: BozzaAutopilota):
  | { ok: true; richiesta: RichiestaAutopilota }
  | { ok: false; campo: 'obiettivo' | 'cwd' | 'nome' | 'pubblicazione' | 'partenza' | 'workspace'; errore: string } {
  const obiettivo = b.obiettivo.trim()
  if (obiettivo === '') return { ok: false, campo: 'obiettivo', errore: 'Scrivi prima cosa vuoi ottenere.' }
  if (obiettivo.length > OBIETTIVO_MAX) return { ok: false, campo: 'obiettivo', errore: `L’obiettivo è troppo lungo: al massimo ${OBIETTIVO_MAX.toLocaleString('it-IT')} caratteri.` }
  const cwd = b.cwd.trim()
  if (cwd === '') return { ok: false, campo: 'cwd', errore: 'Scegli la cartella in cui lavora.' }
  if (!percorsoAssoluto(cwd)) return { ok: false, campo: 'cwd', errore: 'La cartella dev’essere un percorso intero del computer (per esempio C:\\Progetti\\Esempio): sceglila dall’elenco o sfogliando.' }
  if (!REGOLE_PUBBLICAZIONE.some((r) => r.valore === b.pubblicazione)) return { ok: false, campo: 'pubblicazione', errore: 'Scegli la regola di pubblicazione: beta, stabile o versione unica.' }
  if (!PARTENZE.some((p) => p.valore === b.partenza)) return { ok: false, campo: 'partenza', errore: 'Scegli quando parte: dopo il tuo «Vai» o da solo.' }
  let workspace: string | undefined
  if (b.workspace.trim() !== '') {
    const w = controllaNomeWorkspace(b.workspace)
    if (!w.ok) return { ok: false, campo: 'workspace', errore: w.errore }
    workspace = w.nome
  }
  const nome = b.nome.trim() !== '' ? b.nome.trim().slice(0, NOME_AUTOPILOTA_MAX) : nomeDaObiettivo(obiettivo)
  return {
    ok: true,
    richiesta: {
      nome, obiettivo, cwd,
      criteri: criteriDaTesto(b.criteri),
      pubblicazione: b.pubblicazione,
      ...(b.cloud ? { vaSulCloud: true as const } : {}),
      ...(workspace !== undefined ? { workspace } : {}),
      partenza: b.partenza
    }
  }
}

/**
 * La bozza dal corpo di `/api/autopilota/crea`. I telefoni di prima mandano
 * `obiettivo`, `cartella`, `pubblicazione`, `vaSulCloud`; dalla 0.55.0 anche
 * `nome`, `criteri` (testo, uno per riga, o elenco), `workspace`, `partenza`.
 */
export function bozzaDaCorpo(x: unknown): BozzaAutopilota {
  const o = typeof x === 'object' && x !== null ? x as Record<string, unknown> : {}
  const s = (k: string): string => typeof o[k] === 'string' ? (o[k] as string) : ''
  const criteri = Array.isArray(o.criteri)
    ? o.criteri.map((c) => typeof c === 'string' ? c : (typeof c === 'object' && c !== null && typeof (c as { descrizione?: unknown }).descrizione === 'string' ? (c as { descrizione: string }).descrizione : '')).join('\n')
    : s('criteri')
  return {
    obiettivo: s('obiettivo'),
    cwd: s('cartella') !== '' ? s('cartella') : s('cwd'),
    nome: s('nome'),
    criteri,
    // Un telefono di prima senza regola: la stessa partenza del PC, «stabile».
    pubblicazione: (o.pubblicazione === undefined ? 'stabile' : s('pubblicazione')) as RegolaPubblicazione,
    cloud: o.vaSulCloud === true,
    partenza: (o.partenza === undefined ? 'via' : s('partenza')) as Partenza,
    workspace: s('workspace')
  }
}
