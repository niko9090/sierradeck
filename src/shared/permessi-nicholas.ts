import type { PartiDomanda } from './domanda-strutturata'

/**
 * **I permessi di Nicholas** (11/11). «Perché hai lasciato i limiti? Devono
 * poter essere sorpassati se decisi da me»: fino a oggi solo le cancellazioni
 * avevano un modo per ricevere il suo sì; ogni altro divieto era un muro.
 *
 * Ogni azione protetta sta in una **classe**. Per ogni progetto la classe è
 * `chiedi` (di serie: il programma blocca, e l'autopilota può far aprire al
 * programma una domanda a Nicholas) oppure `sempre` (l'ha tolto lui: non si
 * chiede più). Il permesso nasce **solo** da una sua risposta registrata dal
 * programma: mai da una frase del modello, mai da una scadenza, mai dalla
 * scelta consigliata presa da sola (la domanda è `maiDaSola`).
 *
 * Qui le parti pure, che usano il servizio, il Gestore e la pagina delle
 * impostazioni. Il registro dei sì sta in `autopilot-host/permessi-nicholas.ts`.
 */

export const CLASSI_PERMESSO = ['cancellazioni', 'push-forzato', 'posti-protetti', 'installazione', 'cose-altrui', 'sottofondo', 'strumenti-negati'] as const
export type ClassePermesso = typeof CLASSI_PERMESSO[number]
export type StatoPermesso = 'chiedi' | 'sempre'
/** Quello che si salva nelle impostazioni del progetto: solo le classi che Nicholas ha tolto. */
export type PermessiScelti = Partial<Record<ClassePermesso, 'sempre'>>

/** Quanto vale un «Sì, questa volta», in minuti. */
export const DURATA_PERMESSO_MIN = 30

/**
 * Le classi che non diventano mai «sempre»: installare SierraDeck si chiede
 * ogni volta (regola del 12/10: le versioni le installa Nicholas).
 */
export const SOLO_QUESTA_VOLTA: ReadonlySet<ClassePermesso> = new Set<ClassePermesso>(['installazione'])

/** `nome`: il titolo corto. `cosa`: l'azione, dopo «vuole». `comporta`: cosa succede davvero, per decidere. */
export const CLASSI: Record<ClassePermesso, { nome: string; cosa: string; comporta: string }> = {
  cancellazioni: {
    nome: 'Cancellare fuori dalle cartelle di lavoro',
    cosa: 'cancellare file o cartelle fuori dalle cartelle del progetto',
    comporta: 'Quello che viene cancellato non torna. Le cartelle di sistema, il profilo utente intero, la radice di un disco e AppData intera restano vietate comunque.'
  },
  'push-forzato': {
    nome: 'Push forzato e cancellazioni dal remoto',
    cosa: 'riscrivere o cancellare qualcosa che è già pubblicato (push forzato, un ramo o un tag tolti dal remoto)',
    comporta: 'La storia pubblicata cambia e non si rimette a posto da sola: gli altri PC che l’hanno già scaricata restano con un’altra storia.'
  },
  'posti-protetti': {
    nome: 'Scrivere nei posti protetti',
    cosa: 'scrivere un file in un posto protetto (sistema, programmi, chiavi, impostazioni di Claude o di SierraDeck, l’interno di .git)',
    comporta: 'Un file sbagliato lì può cambiare come si comportano il PC, Claude o SierraDeck, o far girare codice a ogni commit.'
  },
  installazione: {
    nome: 'Installare SierraDeck',
    cosa: 'installare una versione di SierraDeck su questo PC',
    comporta: 'Il programma si chiude e riparte con la versione nuova. Si chiede ogni volta: «sempre» qui non c’è.'
  },
  'cose-altrui': {
    nome: 'Chat, autopiloti, account e preferenze non suoi',
    cosa: 'chiamare una funzione del programma che tocca cose non sue (chat e autopiloti di altri, workspace, account, preferenze, «Porta qui»)',
    comporta: 'Può chiudere o cambiare lavoro che non è suo, o le impostazioni del programma.'
  },
  sottofondo: {
    nome: 'Comandi in sottofondo e attese lunghe',
    cosa: 'lanciare un comando in sottofondo, o aspettare a lungo a mano',
    comporta: 'Uno specialista può chiudere prima che il comando finisca, e lasciare il lavoro a metà o un programma acceso.'
  },
  'strumenti-negati': {
    nome: 'Strumenti e comandi che il programma nega',
    cosa: 'usare uno strumento o un comando che il programma di solito nega (Monitor, le sveglie della CLI, un comando per cui la CLI chiede il permesso)',
    comporta: 'Questi strumenti lanciano comandi che il programma non controlla prima.'
  }
}

/**
 * **Il pavimento che resta** (incidente del 14/10: cancellata per errore
 * AppData\Local). Va detto in chiaro dove si decide: nella domanda e nel «?».
 */
export const PAVIMENTO = 'Una cosa sola non si sblocca mai, nemmeno con «sempre»: cancellare le cartelle che reggono il PC (Windows e i programmi, il profilo utente intero, la radice di un disco, AppData intera) o un percorso con una variabile, di cui non si sa dove porta. Quelle si cancellano solo a mano.'

export function eClasse(x: unknown): x is ClassePermesso {
  return typeof x === 'string' && (CLASSI_PERMESSO as readonly string[]).includes(x)
}

/** Dal disco: solo classi vere, solo `sempre`, e mai quelle che si chiedono ogni volta. */
export function leggiPermessi(x: unknown): PermessiScelti {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return {}
  const fuori: PermessiScelti = {}
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
    if (eClasse(k) && v === 'sempre' && !SOLO_QUESTA_VOLTA.has(k)) fuori[k] = 'sempre'
  }
  return fuori
}

export function statoPermesso(p: PermessiScelti | undefined, classe: ClassePermesso): StatoPermesso {
  return !SOLO_QUESTA_VOLTA.has(classe) && p?.[classe] === 'sempre' ? 'sempre' : 'chiedi'
}

/** Cambia lo stato di una classe; `chiedi` la toglie dall'elenco. Le classi «solo questa volta» restano `chiedi`. */
export function conPermesso(p: PermessiScelti | undefined, classe: ClassePermesso, stato: StatoPermesso): PermessiScelti {
  const { [classe]: _prima, ...resto } = p ?? {}
  return stato === 'sempre' && !SOLO_QUESTA_VOLTA.has(classe) ? { ...resto, [classe]: 'sempre' } : resto
}

/** Le scelte della domanda. La prima è il rifiuto: niente di «consigliato» verso il sì. */
export const SCELTA_PERMESSO_NO = 'No'
export const SCELTA_PERMESSO_VOLTA = 'Sì, questa volta'
export const SCELTA_PERMESSO_SEMPRE = 'Sì, sempre'

/** `soloVolta`: questa richiesta non può diventare «sempre» (per esempio cancellare una cartella di lavoro intera). */
export function sceltePermesso(classe: ClassePermesso, soloVolta = false): string[] {
  return SOLO_QUESTA_VOLTA.has(classe) || soloVolta ? [SCELTA_PERMESSO_NO, SCELTA_PERMESSO_VOLTA] : [SCELTA_PERMESSO_NO, SCELTA_PERMESSO_VOLTA, SCELTA_PERMESSO_SEMPRE]
}

const piano = (t: string): string => t.trim().toLowerCase().replace(/[ìí]/gu, 'i').replace(/[,.;:!«»"']/gu, ' ').replace(/\s+/gu, ' ').trim()

/**
 * La risposta di Nicholas. «sempre» solo con le parole della scelta (toccata o
 * scritta uguale) e solo dove si può; un altro sì vale «questa volta»; tutto
 * il resto, e ogni frase con una negazione, è no.
 */
export function leggiRispostaPermesso(classe: ClassePermesso, testo: string, soloVolta = false): 'volta' | 'sempre' | 'no' {
  const t = piano(testo)
  if (t === '') return 'no'
  if (t === piano(SCELTA_PERMESSO_SEMPRE)) return SOLO_QUESTA_VOLTA.has(classe) || soloVolta ? 'volta' : 'sempre'
  if (t === piano(SCELTA_PERMESSO_VOLTA)) return 'volta'
  if (/(^|\s)(no|non|nega|negato|niente|mai|deny|dont|not)(?=$|\s)/u.test(t)) return 'no'
  return /^(si|ok|okay|va bene|vai|certo|yes)(?=$|\s)/u.test(t) ? 'volta' : 'no'
}

const corta = (t: string, n: number): string => { const u = t.replace(/\s+/gu, ' ').trim(); return u.length > n ? `${u.slice(0, n - 1)}…` : u }

/**
 * **La domanda la scrive il programma**: cosa succede esattamente e dove.
 * `azioni` sono i comandi o i percorsi precisi, così come passeranno la
 * guardia; `detto` è il motivo dell'autopilota, riportato come suo e corto.
 */
export function partiDomandaPermesso(p: { classe: ClassePermesso; azioni: readonly string[]; progetto: string; detto?: string; soloVolta?: boolean }): PartiDomanda {
  const c = CLASSI[p.classe]
  const sempre = sceltePermesso(p.classe, p.soloVolta).includes(SCELTA_PERMESSO_SEMPRE)
  const elenco = p.azioni.map((a) => `• ${corta(a, 400)}`).join('\n')
  const detto = p.detto !== undefined && p.detto.trim() !== '' ? `\nL’autopilota dice che serve per: ${corta(p.detto, 200)} (parole sue, non controllate dal programma).` : ''
  return {
    staFacendo: `lavora al progetto «${corta(p.progetto, 60)}», e il programma ha bloccato un’azione protetta`,
    domanda: `Do il permesso di ${c.cosa}?`,
    perche: `È esattamente questo, nel progetto «${corta(p.progetto, 60)}»:\n${elenco}\n${c.comporta}${detto}`,
    scelte: [
      { scelta: SCELTA_PERMESSO_NO, conseguenza: 'resta bloccato, e l’autopilota cambia strada' },
      { scelta: SCELTA_PERMESSO_VOLTA, conseguenza: `per ${DURATA_PERMESSO_MIN} minuti passa solo quello scritto qui sopra, in questo progetto` },
      ...(sempre ? [{ scelta: SCELTA_PERMESSO_SEMPRE, conseguenza: `in questo progetto «${c.nome.toLowerCase()}» non si chiede più; si rimette in Impostazioni → Limiti` }] : [])
    ],
    seNonRispondi: 'resta bloccato: questa domanda non scade e nessuno decide al posto tuo'
  }
}
