import { aggiungi, type Coda, type PuntoRichiesta, type Richiesta } from '@shared/coda-richieste'
import type { SceltaDomanda } from '@shared/domanda-strutturata'
import type { DomandaAperta } from './domande'

/**
 * **Le domande nascono nella chat dell'autopilota** (0.96.0, Nicholas 06/11:
 * «le domande me le fai anche nella chat dell'autopilota; se non viene letta
 * entro breve, perché non si va in quel workspace, allora sì che passa nella
 * sezione domande»).
 *
 * Qui le regole pure: quando una domanda passa dalla chat alle Domande, come
 * si legge una risposta scritta, e a quale richiesta della coda appartiene.
 */

/** Per i primi minuti la domanda sta solo nella chat: non è nelle Domande, nel conteggio, nelle notifiche. */
export const DOMANDA_IN_CHAT_MS = 10 * 60_000
/**
 * Vista in chat ma ancora senza risposta: passa comunque nelle Domande dopo
 * questo tempo. Chi l'ha letta e non ha risposto in mezz'ora l'ha rimandata;
 * la notifica gli ricorda che aspetta.
 */
export const DOMANDA_VISTA_SENZA_RISPOSTA_MS = 30 * 60_000

/**
 * Una domanda solo in chat deve passare alle Domande adesso?
 * `vistoIl`: l'ultima volta che la chat (o il suo workspace) è stata davanti a
 * Nicholas, sul PC o sul telefono. «Vista» = guardata dopo che la domanda è nata.
 */
export function devePassareAlleDomande(d: Pick<DomandaAperta, 'apertaIl'>, vistoIl: number | undefined, ora: number): { passa: boolean; vista: boolean } {
  const vista = vistoIl !== undefined && vistoIl >= d.apertaIl
  const trascorso = ora - d.apertaIl
  return { vista, passa: trascorso >= (vista ? DOMANDA_VISTA_SENZA_RISPOSTA_MS : DOMANDA_IN_CHAT_MS) }
}

/**
 * Le scelte come le manda l'autopilota a `chiedi_utente` («scelta → cosa
 * succede dopo»), la consigliata per prima. 11/11: se il modello scrive anche
 * lui «(consigliata)» nel testo, si toglie: a Nicholas arrivava «Sì, correggi
 * tutte e tre (consigliata) (consigliata)» (6 domande su 13), anche nel tasto.
 */
export function scelteProposte(righe: string[]): SceltaDomanda[] {
  const senzaSegno = (t: string): string => t.replace(/\s*\(\s*consigliat[ao]\s*\)/giu, ' ').replace(/\s+/gu, ' ').trim()
  return righe.map((s, i) => {
    const [scelta, conseguenza] = s.split(/\s*(?:→|->)\s*/u, 2)
    return { scelta: senzaSegno(scelta ?? s), conseguenza: senzaSegno(conseguenza ?? ''), ...(i === 0 ? { consigliata: true as const } : {}) }
  })
}

/** I tasti della chat: le scelte, senza «Ti scrivo io…» (quella è un campo da scrivere, non un tasto). */
export function scelteDaToccare(d: Pick<DomandaAperta, 'parti' | 'opzioni'>): string[] {
  if (d.parti !== undefined) return d.parti.scelte.filter((s) => s.libera !== true).map((s) => s.scelta)
  return d.opzioni ?? []
}

/**
 * Quello che Nicholas ha scritto in chat, come risposta: «1» o «2» sono la
 * prima e la seconda scelta, il nome di una scelta (anche con la maiuscola
 * diversa) è quella scelta; il resto è la sua risposta libera, com'è.
 */
export function rispostaScritta(testo: string, scelte: string[]): string {
  const t = testo.trim()
  const n = /^(\d{1,2})[.)]?$/u.exec(t)
  if (n !== null) {
    const i = Number(n[1]) - 1
    if (i >= 0 && i < scelte.length) return scelte[i]!
  }
  return scelte.find((s) => s.trim().toLowerCase() === t.toLowerCase()) ?? t
}

/**
 * Per quanto un **testo libero** scritto nella chat vale come risposta alla
 * domanda aperta lì. Dopo, la domanda è nelle Domande con il suo campo, e
 * quello che Nicholas scrive in chat è un messaggio nuovo.
 */
export const RISPOSTA_LIBERA_ENTRO_MS = DOMANDA_VISTA_SENZA_RISPOSTA_MS

/**
 * Quello che Nicholas ha scritto in chat **è la risposta** alla domanda aperta lì? (11/11)
 *
 * Prima lo era sempre, qualunque cosa scrivesse e quando: l'08/11 un suo
 * sfogo è stato registrato come risposta a «Pubblico adesso la 0.97.1?» di tre
 * ore e mezza prima, e un altro messaggio come risposta a una domanda di 28
 * ore prima; tutti e due sono finiti fra le decisioni del quaderno.
 * - un numero o il nome di una scelta: è una risposta, sempre;
 * - un testo libero: solo se la domanda ha meno di mezz'ora.
 */
export function eRispostaInChat(testo: string, scelte: string[], apertaIl: number, ora: number): boolean {
  const t = testo.trim()
  if (rispostaScritta(t, scelte) !== t || scelte.some((s) => s.trim().toLowerCase() === t.toLowerCase())) return true
  return ora - apertaIl < RISPOSTA_LIBERA_ENTRO_MS
}

/**
 * Una risposta va scritta fra le **decisioni** del quaderno? (11/11) Lì stanno le
 * scelte di Nicholas che valgono per il futuro: non il «Consenti» a un permesso
 * (il 06/11 ne sono finiti due, con dentro il comando e un percorso del PC), non
 * il sì o il no a una cancellazione, non un «no» o un «lascia stare».
 */
export function decisioneDaRicordare(p: { domanda: string; risposta: string; diConsenso: boolean }): boolean {
  if (p.diConsenso) return false
  if (/^\s*(?:«[^»]*»\s+ti chiede:\s*)?Uno specialista chiede il permesso per /u.test(p.domanda)) return false
  return !rispostaSenzaLavoro(p.risposta)
}

/**
 * La richiesta della coda (r-N) da cui nasce una domanda. In ordine: quella
 * dichiarata dall'autopilota (se esiste); l'unica citata nel testo; l'unica
 * richiesta ancora aperta. Con più candidate, nessuna: meglio non ritirare mai
 * una domanda per sbaglio.
 *
 * 11/11: una richiesta **già chiusa** non lega la domanda. L'08/11 «Correggo le
 * tre cose…?» è nata legata a un'analisi appena finita: il programma l'ha
 * ritirata dopo 0,3 secondi («la richiesta è fatta») e l'autopilota l'ha
 * rifatta 37 secondi dopo. Dichiarata o citata ma chiusa: nessuna richiesta.
 */
export function richiestaDellaDomanda(coda: Pick<Coda, 'richieste' | 'compattate'>, dichiarata: string | undefined, testo: string): string | undefined {
  const esiste = (id: string): boolean => coda.richieste.some((r) => r.id === id) || coda.compattate.some((r) => r.id === id)
  const seAperta = (id: string): string | undefined => (richiestaChiusa(coda, id).chiusa ? undefined : id)
  const d = dichiarata?.trim().toLowerCase()
  if (d !== undefined && /^r-\d+$/u.test(d) && esiste(d)) return seAperta(d)
  const citate = [...new Set([...testo.toLowerCase().matchAll(/\br-\d+\b/gu)].map((m) => m[0]))].filter(esiste)
  if (citate.length === 1) return seAperta(citate[0]!)
  const aperte = coda.richieste.filter((r) => r.stato !== 'fatta' && r.chiusa === undefined)
  return aperte.length === 1 ? aperte[0]!.id : undefined
}

/**
 * La richiesta è chiusa (fatta, chiusa senza lavoro, già nello storico
 * compattato) o è stata unita a un'altra che lo è? Una richiesta che non
 * si trova da nessuna parte non dice niente: la domanda resta.
 * `il` (11/11): quando è stata chiusa, se si sa.
 */
export function richiestaChiusa(coda: Pick<Coda, 'richieste' | 'compattate'>, id: string): { chiusa: boolean; come?: string; il?: string } {
  const viva = coda.richieste.find((r) => r.id === id) ?? coda.richieste.find((r) => r.unioni.some((u) => u.fonti.includes(id)))
  if (viva !== undefined) {
    const il = viva.chiusa?.il ?? viva.fattaIl
    const quando = il !== undefined ? { il } : {}
    if (viva.chiusa !== undefined) return { chiusa: true, come: viva.id === id ? 'chiusa senza lavoro' : `unita a ${viva.id}, chiusa`, ...quando }
    if (viva.stato === 'fatta') return { chiusa: true, come: viva.id === id ? 'fatta' : `unita a ${viva.id}, fatta`, ...quando }
    return { chiusa: false }
  }
  const storica = coda.compattate.find((r) => r.id === id)
  return storica !== undefined ? { chiusa: true, come: 'fatta', il: storica.fattaIl } : { chiusa: false }
}

/**
 * 11/11: la chiusura della richiesta è arrivata **dopo** la domanda? Solo allora
 * la domanda è superata. Senza una data leggibile vale sì: la domanda nasce
 * legata solo a richieste aperte, quindi la chiusura è per forza successiva.
 */
export function chiusaDopoLaDomanda(chiusura: { il?: string }, apertaIl: number): boolean {
  const t = chiusura.il !== undefined ? Date.parse(chiusura.il) : Number.NaN
  return Number.isNaN(t) || t >= apertaIl
}

// ── La scadenza di una domanda (11/11) ──

/**
 * Dopo quanto una domanda **non rischiosa** senza risposta la decide il
 * programma, con la scelta consigliata. Prima era un giorno per tutte, con la
 * frase «fra un giorno… decido io»: troppo per una scelta che non rischia
 * niente, e sbagliato per una che spetta solo a Nicholas.
 */
export const DOMANDA_DECIDO_IO_MS = 60 * 60_000

const INIZIO_PAROLA = '(?<![\\p{L}])'
const FINE_PAROLA = '(?![\\p{L}])'
/**
 * Le parole che fanno una domanda **rischiosa**: cose di Nicholas che non si
 * rimettono a posto (cancellare, account, soldi, dati), cose che restano sue
 * per regola (installare, pubblicare, spegnere o fermare qualcosa di suo), e
 * i fatti che sa solo lui («eri sul wifi di casa?»). Nel dubbio è rischiosa:
 * resta aperta, e nessuno decide al posto suo.
 */
const PAROLE_DI_RISCHIO = new RegExp([
  // cancellare, togliere, perdere
  'cancell', 'elimin', 'rimuov', 'rimoz', 'svuot', 'disinstall', 'formatt', 'sovrascriv', 'togli', `tolg[oa]${FINE_PAROLA}`, `tolt[oaie]${FINE_PAROLA}`, `butt(?:o|a|i|are|arl[oaie])${FINE_PAROLA}`, `perd(?:o|i|e|ere|ita)${FINE_PAROLA}`,
  // account e accessi
  'account', 'password', 'credenzial', `chiav[ei]${FINE_PAROLA}`, `token${FINE_PAROLA}`, `login${FINE_PAROLA}`,
  // soldi
  'pagament', `pag(?:o|a|hi|are|ato|ata)${FINE_PAROLA}`, `cost(?:o|a|i|ano)${FINE_PAROLA}`, 'soldi', '€', `euro${FINE_PAROLA}`, 'abbonament', 'acquist', `compr(?:o|a|i|are)${FINE_PAROLA}`, 'prezz',
  // dati suoi
  `drive${FINE_PAROLA}`, 'dati personali', 'i tuoi dati', 'backup', 'privat',
  // spegnere e fermare cose sue
  'spegn', `spent[oaie]${FINE_PAROLA}`, `ferm(?:o|a|i|are|arl[oaie]|iamo)${FINE_PAROLA}`, 'chiud', 'sospend', 'riavvi',
  // installare e pubblicare
  'install', 'pubblic', 'rilasc', `release${FINE_PAROLA}`,
  // un fatto che sa solo lui, non una scelta
  `(?:eri|eravate|avevi)${FINE_PAROLA}`, `hai (?:visto|fatto|provato|usato|ricevuto|notato)${FINE_PAROLA}`, `ti (?:risulta|compare|appare|è arrivat[oa])${FINE_PAROLA}`
].map((p) => `${INIZIO_PAROLA}${p}`).join('|'), 'iu')

/** La domanda (frase, scelte e conseguenze) tocca qualcosa che resta di Nicholas? */
export function domandaRischiosa(testo: string): boolean {
  return PAROLE_DI_RISCHIO.test(testo.replace(/\s+/gu, ' '))
}

const traQuanto = (ms: number): string => (ms === 60 * 60_000 ? 'un’ora' : `${Math.max(1, Math.round(ms / 60_000))} minuti`)

/** «Se non rispondi», nei due casi: resta lì (rischiosa), o scelgo io la consigliata dopo un'ora. */
export function seNonRispondi(p: { rischiosa: boolean; consigliata?: string }): string {
  if (p.rischiosa) return 'non decido io al posto tuo: la domanda resta qui finché non rispondi, e intanto porto avanti il resto'
  return p.consigliata !== undefined && p.consigliata !== ''
    ? `intanto porto avanti il resto; se entro ${traQuanto(DOMANDA_DECIDO_IO_MS)} non rispondi scelgo io «${p.consigliata}» e te lo scrivo`
    : `intanto porto avanti il resto; se entro ${traQuanto(DOMANDA_DECIDO_IO_MS)} non rispondi decido io la strada più prudente e te lo scrivo`
}

/**
 * Cosa fa la scadenza con una domanda aperta, adesso.
 * - `resta`: rischiosa, o segnata «mai da sola», o non è ancora il momento;
 * - `decide`: non rischiosa e ferma da un'ora: la consigliata, se c'è;
 * - `chiude`: di prima dell'11/11 o non aperta dall'autopilota, ferma da un
 *   giorno: si chiude senza decidere niente (com'era).
 */
export function scadenzaDomanda(
  d: Pick<DomandaAperta, 'apertaIl' | 'contesto' | 'parti'>, ora: number, giornoMs: number
): { cosa: 'resta' } | { cosa: 'decide'; scelta?: string } | { cosa: 'chiude' } {
  const c = d.contesto
  if (c?.maiDaSola === true || c?.rischiosa === true) return { cosa: 'resta' }
  if (c?.rischiosa === false) {
    if (ora - d.apertaIl < DOMANDA_DECIDO_IO_MS) return { cosa: 'resta' }
    const scelta = d.parti?.scelte.find((s) => s.consigliata === true && s.libera !== true)?.scelta
    return scelta !== undefined && scelta !== '' ? { cosa: 'decide', scelta } : { cosa: 'decide' }
  }
  return ora - d.apertaIl < giornoMs ? { cosa: 'resta' } : { cosa: 'chiude' }
}

// ── La risposta di Nicholas diventa lavoro (k-64) ──

/**
 * Una risposta che non chiede lavoro: «no», «lascia stare», «non serve».
 * Solo se è tutta qui: «no, fai invece X» è lavoro.
 */
export function rispostaSenzaLavoro(testo: string): boolean {
  const t = testo.trim().toLowerCase().replace(/[.!…]+$/u, '').replace(/\s+/gu, ' ')
  if (t === '') return true
  return /^(no|nope|niente|nulla|annulla|annullata|ferma|fermati|stop|non serve|non ora|non adesso|no grazie|lascia stare|lascia perdere|lascia così|lascia cosi|non farlo|non farla|non farle|non fare niente|non fare nulla|ignora|ignorala|ignoralo|lascialo|lasciala)(,? (grazie|per ora|adesso|ora))?$/u.test(t)
    || /^no\b.{0,12}\b(lascia|stare|niente|grazie)\b.{0,12}$/u.test(t)
}

export type EsitoRispostaInCoda = {
  coda: Coda
  /** punto: p-N alla richiesta aperta; riaperta: la richiesta chiusa senza lavoro è tornata aperta; nuova: richiesta nuova; nota: «no», nessun lavoro; niente: già registrata. */
  esito: 'punto' | 'riaperta' | 'nuova' | 'nota' | 'niente'
  richiesta?: string
  punto?: string
}

/**
 * Cosa fa la coda con la risposta a una domanda dell'autopilota, così che
 * `piano_scrivi` abbia sempre una richiesta aperta a cui legare il compito:
 * - richiesta ancora aperta: la risposta è un punto nuovo (p-N);
 * - chiusa senza lavoro: si riapre e riceve il punto;
 * - già fatta, nello storico o senza richiesta: richiesta nuova (domanda + risposta; se la vecchia è fatta, la «segue»);
 * - solo un «no»: nessun lavoro, nessuna richiesta (la nota resta nel dialogo).
 * La stessa risposta che arriva due volte non si ripete.
 *
 * `chi: 'programma'` (11/11): Nicholas non ha risposto e il programma ha scelto
 * la consigliata di una domanda non rischiosa. Entra in coda allo stesso modo,
 * ma il testo non dice che ha risposto lui.
 */
export function rispostaInCoda(coda: Coda, p: { domanda: string; risposta: string; richiestaId?: string; quando: string; chi?: 'programma' }): EsitoRispostaInCoda {
  const domanda = p.domanda.replace(/\s+/gu, ' ').trim()
  const risposta = p.risposta.trim()
  const testo = p.chi === 'programma'
    ? `Scelta consigliata, presa dal programma senza risposta di Nicholas, a «${domanda.slice(0, 300)}»: ${risposta}`
    : `Risposta di Nicholas a «${domanda.slice(0, 300)}»: ${risposta}`
  const id = p.richiestaId
  const viva = id === undefined ? undefined : (coda.richieste.find((r) => r.id === id) ?? coda.richieste.find((r) => r.unioni.some((u) => u.fonti.includes(id))))
  const gia = coda.richieste.find((r) => r.chiusa === undefined && r.stato !== 'fatta' && r.punti.some((x) => x.testo === testo) || r.originali.some((o) => o.testo === testo))
  if (gia !== undefined) return { coda, esito: 'niente', richiesta: gia.id }
  if (rispostaSenzaLavoro(risposta)) return { coda, esito: 'nota', ...(viva !== undefined ? { richiesta: viva.id } : {}) }

  const conPunto = (r: Richiesta, riapri: boolean): EsitoRispostaInCoda => {
    const punto: PuntoRichiesta = { id: `p-${coda.prossimo.p}`, testo, da: r.id, stato: 'aperto' }
    const { chiusa: _chiusa, ...resto } = r
    const nuova: Richiesta = { ...(riapri ? resto : r), punti: [...r.punti, punto], ...(riapri ? { stato: 'in-coda' as const } : {}) }
    return {
      coda: { ...coda, prossimo: { ...coda.prossimo, p: coda.prossimo.p + 1 }, richieste: coda.richieste.map((x) => (x.id === r.id ? nuova : x)) },
      esito: riapri ? 'riaperta' : 'punto', richiesta: r.id, punto: punto.id
    }
  }
  if (viva !== undefined && viva.chiusa === undefined && viva.stato !== 'fatta') return conPunto(viva, false)
  if (viva !== undefined && viva.chiusa !== undefined) return conPunto(viva, true)
  const m = aggiungi(coda, { testo, quando: p.quando, ...(viva !== undefined ? { segue: viva.id } : {}) })
  return { coda: m.coda, esito: 'nuova', richiesta: m.richiesta.id, punto: m.richiesta.punti[0]!.id }
}
