import type { Autopilota, ChatGovernata } from '@shared/autopilota'
import { chatCheSostituisce, conSostituzione } from './mai-fermo'

/**
 * **Una chat il cui terminale non nasce** (0.84.4).
 *
 * Il 23/10 la Revisione del ramo c-98 è rimasta ferma dalle 04:04 alle 09:48
 * UTC: «in 90 secondi il terminale della chat non è nato», una consegna dopo
 * l'altra. La causa vera stava nel registro: la cartella della chat
 * (`ap-f1e631f5-c-98`) non c'era più, perché c-98 era finita e il suo ramo
 * unito e tolto, e `pty:spawn` rifiutava «cwd non accessibile». Il giro mai
 * fermo la trattava come una chat muta: la riprendeva, poi la sostituiva
 * (c-115 → c-117 → c-118) **nella stessa cartella sparita**, e al tetto delle
 * sostituzioni la riprendeva ogni 11 minuti per sempre.
 *
 * Qui la regola, pura: cosa si fa di una chat che non può nascere. Nessuna
 * domanda a Nicholas: o il posto si rimette in piedi, o il compito passa a una
 * chat nuova in un posto che c'è, o (Revisione di un ramo che non c'è più) il
 * compito è superato e la chat si chiude.
 */

/** Oltre queste chat di fila che non nascono, si smette e lo si dice a Nicholas (una riga, non una domanda). */
export const NON_NATE_MAX = 3

/** Com'è la cartella di una chat sul disco. `undefined`: non si può sapere (prove). */
export type StatoCopia = 'ok' | 'mancante' | 'non-git' | undefined

export type VistaNonNata = {
  copia: (cartella: string) => StatoCopia
  /** Il ramo esiste ancora nel repository. */
  ramoEsiste: (ramo: string) => boolean
}

export type RimedioNonNata =
  /** La Revisione rivede un ramo che non c'è più: il suo compito è superato, la chat si chiude. */
  | { tipo: 'superata'; motivo: string }
  /**
   * La copia non c'è ma il ramo sì: si rimette il worktree (di `chat`, sul suo
   * ramo) e la **stessa** chat riparte lì. È la «riaperta da sola».
   */
  | { tipo: 'ricrea'; chat: string; ramo: string; motivo: string }
  /** Il compito passa a una chat nuova; `nuovoPosto`: con una copia sua, perché il ramo non c'è più. */
  | { tipo: 'sostituisci'; cartella?: string; ramo?: string; nuovoPosto?: true; motivo: string }
  /** Troppe chat di fila non sono nate: niente altri tentativi automatici. */
  | { tipo: 'tetto'; motivo: string }

const sparita = (s: StatoCopia): boolean => s === 'mancante' || s === 'non-git'

/** La cartella della chat non c'è più (o non è più un worktree): non può nascere lì. */
export function postoSparito(c: ChatGovernata, v: Pick<VistaNonNata, 'copia'>): boolean {
  return c.cartella !== undefined && sparita(v.copia(c.cartella))
}

// `nonNate` conta le chat prima di questa: con lei sono `nonNate + 1`.
export const alTettoNonNate = (c: ChatGovernata): boolean => (c.nonNate ?? 0) + 1 >= NON_NATE_MAX
const alTetto = alTettoNonNate
const tettoDi = (perche: string): RimedioNonNata =>
  ({ tipo: 'tetto', motivo: `${NON_NATE_MAX} chat di fila su questo compito non hanno fatto nascere il terminale (${perche})` })

/**
 * Cosa fare di una chat che non è nata (o che non può nascere perché la sua
 * cartella non c'è). `perche` è il guasto visto: va nel motivo, per il diario.
 */
export function rimedioNonNata(a: Autopilota, c: ChatGovernata, v: VistaNonNata, perche: string): RimedioNonNata {
  if (c.ruolo === 'revisione') {
    const autore = a.chats.find((x) => x.id === c.revisioneDi)
    // Il ramo da rivedere non c'è più: unito e tolto, o scartato. Non c'è niente da rivedere.
    if (autore === undefined) return { tipo: 'superata', motivo: 'la chat da rivedere non c’è più' }
    if (autore.ramo === undefined || autore.conclusa !== undefined || !v.ramoEsiste(autore.ramo)) {
      return { tipo: 'superata', motivo: `il ramo da rivedere${autore.ramo !== undefined ? ` ${autore.ramo}` : ''} non c’è più (${autore.stato === 'finita' ? 'la chat che lo aveva è finita: unito o chiuso' : 'tolto'})` }
    }
    const posto = autore.cartella ?? c.cartella
    if (posto !== undefined && sparita(v.copia(posto))) return { tipo: 'ricrea', chat: autore.id, ramo: autore.ramo, motivo: `${perche}; rimetto la copia del ramo ${autore.ramo}` }
    if (alTetto(c)) return tettoDi(perche)
    return { tipo: 'sostituisci', ...(posto !== undefined ? { cartella: posto } : {}), motivo: perche }
  }
  if (c.cartella !== undefined && sparita(v.copia(c.cartella))) {
    if (c.ramo !== undefined && v.ramoEsiste(c.ramo)) return { tipo: 'ricrea', chat: c.id, ramo: c.ramo, motivo: `${perche}; rimetto la sua copia sul ramo ${c.ramo}` }
    if (alTetto(c)) return tettoDi(perche)
    return { tipo: 'sostituisci', nuovoPosto: true, motivo: `${perche}; il suo ramo non c’è più, la chat nuova ha una copia sua` }
  }
  if (alTetto(c)) return tettoDi(perche)
  // La cartella c'è (o è quella dell'autopilota): il guasto è del terminale, una chat nuova lì.
  return { tipo: 'sostituisci', ...(c.cartella !== undefined ? { cartella: c.cartella } : {}), ...(c.ramo !== undefined ? { ramo: c.ramo } : {}), motivo: perche }
}

/**
 * La chat nuova che prende il compito di quella non nata: come la
 * sostituzione del giro mai fermo, ma nel posto deciso qui e senza contare fra
 * le sostituzioni per silenzio (non è stata zitta: non è mai partita).
 */
export function chatNataAlPosto(a: Autopilota, vecchia: ChatGovernata, sessionId: string, il: string, posto: { cartella?: string; ramo?: string }): ChatGovernata {
  const base = chatCheSostituisce(a, vecchia, sessionId, il)
  const { cartella: _c, ramo: _r, sostituzioni: _s, ...senza } = base
  return {
    ...senza,
    ...(posto.cartella !== undefined ? { cartella: posto.cartella } : {}),
    ...(posto.ramo !== undefined ? { ramo: posto.ramo } : {}),
    ...(vecchia.sostituzioni !== undefined ? { sostituzioni: vecchia.sostituzioni } : {}),
    nonNate: (vecchia.nonNate ?? 0) + 1
  }
}

/**
 * L'autopilota con il compito passato alla chat nuova, e i messaggi che
 * aspettavano la vecchia girati alla nuova: se no restano in coda per una
 * chat finita.
 */
export function conNataAlPosto(a: Autopilota, vecchiaId: string, nuova: ChatGovernata, il: string): Autopilota {
  const dopo = conSostituzione(a, vecchiaId, nuova, il)
  return {
    ...dopo,
    daConsegnare: dopo.daConsegnare.map((m) => (m.chats.includes(vecchiaId) ? { ...m, chats: [...new Set(m.chats.map((x) => (x === vecchiaId ? nuova.id : x)))] } : m))
  }
}

/** La Revisione superata: finita, senza giri, la conversazione nel recupero. */
export function conRevisioneSuperata(a: Autopilota, chatId: string, il: string): Autopilota {
  const daParte = (a.daParte ?? []).filter((k) => k !== chatId)
  const { daParte: _via, ...senza } = a
  return {
    ...senza,
    ...(daParte.length > 0 ? { daParte } : {}),
    chats: a.chats.map((c) => {
      if (c.id !== chatId) return c
      const { ripresa: _r, ...resto } = c
      return { ...resto, stato: 'finita' as const, nelRecupero: il, dal: il }
    }),
    daConsegnare: a.daConsegnare.flatMap((m) => {
      if (!m.chats.includes(chatId)) return [m]
      const chats = m.chats.filter((x) => x !== chatId)
      return chats.length > 0 ? [{ ...m, chats }] : []
    })
  }
}

/** Il primo messaggio della chat nuova: perché c'è, e da dove riparte. */
export function testoNataAlPosto(vecchia: ChatGovernata, motivo: string): string {
  const ultime = vecchia.ultimeIstruzioni?.trim() ?? ''
  return [
    `Prendi in mano il compito della chat ${vecchia.id}: il suo terminale non è mai partito (${motivo}). Non è un tuo errore e non serve chiedere niente a Nicholas.`,
    'Prima guarda cosa c’è già (git log, git status, i file cambiati) e riparti da lì, senza rifare quello che è già fatto.',
    ...(ultime !== '' ? ['', `L’ultima istruzione che aveva ricevuto:\n${ultime}`] : [])
  ].join('\n')
}

/** Alla chat che riparte nella sua copia rimessa in piedi: cosa è successo, e l'ultima istruzione. */
export function testoCopiaRimessa(c: ChatGovernata, ramo: string): string {
  const ultime = c.ultimeIstruzioni?.trim() ?? ''
  return [
    `La tua copia del progetto non c’era più e il tuo terminale non poteva partire: il programma l’ha rimessa sul ramo ${ramo}. Non serve chiedere niente a Nicholas.`,
    'Guarda com’è messa (git log, git status) e riprendi da lì.',
    '',
    ultime !== '' ? `L’ultima istruzione che avevi ricevuto:\n${ultime}` : `Il tuo compito: ${c.compito}`,
    '',
    'Chiudi il turno con la riga SEGNALE, come sempre.'
  ].join('\n')
}
