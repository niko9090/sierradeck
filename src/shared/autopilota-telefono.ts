import type { Autopilota, ChatGovernata, Decisione, ScambioDialogo } from './autopilota'
import { autopilotaLeggero, type AutopilotaLeggero } from './autopilota-leggero'
import type { Battuta } from './chat-autopilota'
import type { Specialisti } from './specialisti'

/**
 * La scheda **leggera** di un autopilota per il telefono e la pagina
 * (`/api/autopilota` con `leggero`), con i campi scelti a mano (m-collegamento).
 *
 * Fino alla 0.100.0 la scheda leggera era l'autopilota intero (`...a`) con
 * solo decisioni e dialogo accorciati: le chat governate (anche quelle finite
 * da settimane, con il loro compito intero), gli specialisti, i testi lunghi
 * delle battute viaggiavano interi ogni due secondi. È la rotta sospettata dei
 * 214 MB che il 31/10 hanno fatto cadere l'app due volte.
 *
 * Qui passano solo i campi che l'app 2.99.0 e la pagina leggono davvero, ogni
 * testo ha un tetto e le chat sono solo quelle vive. La scheda intera (senza
 * `leggero`, «Mostra tutta la conversazione») resta com'era.
 */

/** Quanto è lungo al più un testo della scheda leggera: una battuta, un obiettivo. */
export const TESTO_MAX = 8000
/** Il resto di una nota, l'esito di una battuta, una riga di una chat. */
export const DETTAGLIO_MAX = 1000
/** Quante chat vive al più (il tetto vero è 8: questo è solo un paracadute). */
export const CHAT_VIVE_MAX = 40
/** Degli specialisti finiti, quanti restano nell'elenco (gli ultimi). */
export const SPECIALISTI_FINITI_MAX = 10

/** Un testo con il suo tetto, e il segno che è stato tagliato. */
export function taglia(testo: string, max: number): string {
  return testo.length <= max ? testo : `${testo.slice(0, max)}…`
}

function tagliaSe<T extends string | undefined>(testo: T, max: number): T {
  return (typeof testo === 'string' ? taglia(testo, max) : testo) as T
}

/** Viva: non finita e non avviata alla chiusura. È quella che il telefono deve vedere. */
export function chatViva(c: ChatGovernata): boolean {
  return c.stato !== 'finita' && c.fine === undefined && c.conclusa === undefined
}

function decisioneLeggera(d: Decisione): Decisione {
  return { quando: d.quando, cosa: taglia(d.cosa, DETTAGLIO_MAX * 2), ...(d.traguardo !== undefined ? { traguardo: { ...d.traguardo, ...(d.traguardo.nota !== undefined ? { nota: taglia(d.traguardo.nota, DETTAGLIO_MAX) } : {}) } } : {}) }
}

function scambioLeggero(s: ScambioDialogo): ScambioDialogo {
  return {
    quando: s.quando,
    da: s.da,
    testo: taglia(s.testo, TESTO_MAX),
    ...(s.esito !== undefined ? { esito: taglia(s.esito, DETTAGLIO_MAX) } : {}),
    ...(s.traccia === true ? { traccia: true as const } : {}),
    ...(s.risponde !== undefined ? { risponde: taglia(s.risponde, TESTO_MAX) } : {}),
    ...(s.domanda !== undefined ? { domanda: { id: s.domanda.id, scelte: s.domanda.scelte.slice(0, 10).map((x) => taglia(x, 300)), ...(s.domanda.chiusa === true ? { chiusa: true as const } : {}) } } : {})
  }
}

function chatLeggera(c: ChatGovernata): Record<string, unknown> {
  return {
    id: c.id,
    compito: taglia(c.compito, DETTAGLIO_MAX),
    stato: c.stato,
    cicli: c.cicli,
    ...(c.ruolo !== undefined ? { ruolo: c.ruolo } : {}),
    ...(c.ultimaAzione !== undefined ? { ultimaAzione: taglia(c.ultimaAzione, DETTAGLIO_MAX) } : {}),
    ...(c.dal !== undefined ? { dal: c.dal } : {}),
    ...(c.sessionId !== undefined ? { sessionId: c.sessionId } : {})
  }
}

/** La scheda leggera: solo i campi scelti, con i tetti. */
export function autopilotaPerTelefono(a: Autopilota): Record<string, unknown> {
  const l = autopilotaLeggero(a) as AutopilotaLeggero
  const vive = (a.chats ?? []).filter(chatViva)
  const fuori: Record<string, unknown> = {
    id: a.id,
    nome: taglia(a.nome, DETTAGLIO_MAX),
    obiettivo: taglia(a.obiettivo, TESTO_MAX),
    cwd: a.cwd,
    stato: a.stato,
    cicli: a.cicli,
    iniziatoIl: a.iniziatoIl,
    ultimoEvento: a.ultimoEvento,
    tettoChat: a.tettoChat,
    decisioni: (l.decisioni ?? []).map(decisioneLeggera),
    dialogo: (l.dialogo ?? []).map(scambioLeggero),
    chats: vive.slice(-CHAT_VIVE_MAX).map(chatLeggera)
  }
  const facoltativi: Record<string, unknown> = {
    workspace: a.workspace,
    sessionId: a.sessionId,
    motivoSospensione: tagliaSe(a.motivoSospensione, DETTAGLIO_MAX * 2),
    fermatoIl: a.fermatoIl,
    archiviato: a.archiviato,
    annuncio: a.annuncio,
    fermatoPerAggiornamento: a.fermatoPerAggiornamento,
    pubblicazione: a.pubblicazione,
    pubblicazioneInAttesa: a.pubblicazioneInAttesa,
    vaSulCloud: a.vaSulCloud,
    ramoBase: a.ramoBase,
    troncati: l.troncati
  }
  for (const [k, v] of Object.entries(facoltativi)) if (v !== undefined) fuori[k] = v
  // Quante chat c'erano in tutto, se quelle mandate sono di meno: per chi vuole dirlo.
  if (vive.length !== (a.chats ?? []).length || vive.length > CHAT_VIVE_MAX) fuori.chatsTutte = (a.chats ?? []).length
  return fuori
}

/** Le battute della conversazione con i tetti: la coda (80) la sceglie già `codaConversazione`. */
export function battuteLeggere(chat: Battuta[]): Battuta[] {
  return chat.map((b) => ({
    ...b,
    testo: taglia(b.testo, TESTO_MAX),
    ...(b.dettaglio !== undefined ? { dettaglio: taglia(b.dettaglio, DETTAGLIO_MAX) } : {}),
    ...(b.domanda !== undefined ? { domanda: { id: b.domanda.id, scelte: b.domanda.scelte.slice(0, 10).map((x) => taglia(x, 300)) } } : {})
  }))
}

/** Gli specialisti: tutti quelli al lavoro, degli altri gli ultimi; i testi con il tetto. */
export function specialistiLeggeri(s: Specialisti): Specialisti {
  const finiti = s.elenco.filter((x) => x.chiusa === true)
  const tenuti = new Set(finiti.slice(-SPECIALISTI_FINITI_MAX))
  return {
    riga: taglia(s.riga, DETTAGLIO_MAX),
    elenco: s.elenco
      .filter((x) => x.chiusa !== true || tenuti.has(x))
      .map((x) => ({ ...x, compito: taglia(x.compito, DETTAGLIO_MAX), ultimaAzione: taglia(x.ultimaAzione, DETTAGLIO_MAX), cosa: taglia(x.cosa, DETTAGLIO_MAX) }))
  }
}
