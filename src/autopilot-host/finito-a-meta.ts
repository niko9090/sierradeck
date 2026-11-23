import { rigaRapporto } from '@shared/rapporti-chat'

/**
 * **Lo specialista che si ferma a metà** (k-174a, 22/11). Nicholas: «ci sono
 * delle chat che hanno ripreso a fermarsi senza aver completato il compito».
 *
 * Uno specialista è un sotto-agente: quando chiude il turno il suo stato diventa
 * «finito», qualunque cosa abbia scritto. Se l'ultima frase è «lancio i test,
 * aspetto l'esito e riprendo», nessuno lo risveglierà (l'esito di un comando in
 * sottofondo non arriva a un sotto-agente): il programma però lo dava per finito,
 * univa il ramo a metà e misurava i criteri su un lavoro non fatto.
 *
 * Qui si riconosce quel caso dal messaggio finale: una promessa di continuare o
 * di aspettare nelle ultime righe, senza un «RAPPORTO: finita» né un
 * «bloccata»/«mi serve» detto apposta.
 */

/** Il tetto di rilanci per lo stesso specialista: oltre, lo si tratta come finito e decide l'autopilota. */
export const MEZZE_FINI_MAX = 3

/** k-178k: il tetto di rilanci automatici per uno specialista fermato (appeso o morto) a metà sullo stesso compito. */
export const FERMATI_RILANCI_MAX = 3

const ULTIME_RIGHE = 4

/** I verbi d'azione di chi sta per fare qualcosa: «lancio», «eseguo», «controllo»… */
const AZIONI = String.raw`(?:lancio|eseguo|avvio|faccio|scrivo|controllo|verifico|provo|correggo|aggiungo|committo|compilo|passo\s+a|vado\s+a|rilancio|misuro|sistemo|completo|finisco)`

const PROMESSA = new RegExp([
  // k-178l: «Adesso lancio la suite completa.» in fondo: l'azione è annunciata, non fatta.
  String.raw`\b(?:adesso|ora|poi|quindi|subito|infine|dopo)\s+(?:\p{L}+\s+)?${AZIONI}(?![\p{L}\d])`,
  String.raw`\b(?:lancerò|rilancerò|farò|eseguirò|avvierò|controllerò|verificherò|scriverò|correggerò|aggiungerò|compilerò|completerò|finirò|misurerò)(?![\p{L}\d])`,
  String.raw`\b(?:riprendo|riprenderò|riparto|ripartirò|continuo|continuerò|proseguo|proseguirò)(?![\p{L}\d])`,
  String.raw`\b(?:vado|andrò)\s+avanti\b`,
  String.raw`\b(?:aspetto|attendo|resto\s+in\s+attesa)\s+(?:che\b|l['’]\s*esito|il\s+(?:risultato|termine|completamento)|i\s+risultati|la\s+fine|di\s+vedere)`,
  String.raw`\bappena\s+(?:finisc\w+|termin\w+|arriv\w+|ho\s+l['’]\s*esito)\b[^.\n]*\b(?:procedo|riprendo|continuo|proseguo)\b`
].join('|'), 'iu')

/** Una riga che dice di aver rinunciato a continuare: «non continuo», «senza riprendere». */
const NEGATA = /\b(?:non|senza|mai)\s+(?:\w+\s+)?(?:riprendo|continuo|proseguo|aspetto|attendo)\b/iu

const pulisci = (r: string): string => r.replace(/^[*_`>\s•-]+|[*_`\s]+$/g, '').trim()

/**
 * La frase con cui lo specialista dice di continuare o aspettare, se il suo
 * messaggio finale finisce così; `undefined` se ha chiuso davvero (finita,
 * bloccata, mi serve) o non promette niente.
 */
export function promessaSenzaFine(messaggio: string | undefined): string | undefined {
  if (messaggio === undefined || messaggio.trim() === '') return undefined
  const rapporto = rigaRapporto(messaggio)
  if (rapporto !== undefined && (rapporto.tipo === 'finita' || rapporto.tipo === 'bloccata' || rapporto.tipo === 'serve')) return undefined
  // «bloccato: …» nel riepilogo è il modo di dire che si è fermato per una decisione.
  if (/^\s*[*_`]*bloccat[oa][*_`]*\s*:/imu.test(messaggio)) return undefined
  const righe = messaggio.split(/\r?\n/).map(pulisci).filter((r) => r !== '' && !/^(?:SEGNALE|LEZIONI)[*_`\s]*:/iu.test(r))
  const ultime = righe.slice(-ULTIME_RIGHE)
  for (let i = ultime.length - 1; i >= 0; i -= 1) {
    const r = ultime[i] ?? ''
    if (PROMESSA.test(r) && !NEGATA.test(r)) return r.length > 200 ? `${r.slice(0, 199)}…` : r
  }
  return undefined
}

/** Gli specialisti che scrivono o provano il codice: per loro il riepilogo senza una chiusura detta apposta è lavoro a metà. */
export const RUOLI_CHE_SCRIVONO: ReadonlySet<string> = new Set(['sviluppatore', 'interfaccia', 'android', 'verificatore'])

/**
 * Perché il riepilogo di uno specialista suona «a metà», o `undefined` se ha chiuso.
 * Oltre alla promessa di {@link promessaSenzaFine}, per chi scrive codice (k-178l) conta come
 * a metà anche un riepilogo senza `RAPPORTO: finita`, `bloccata` o `mi serve` (né «bloccato: …»):
 * il prompt gliela chiede, e senza non si sa se ha finito. Esploratore, revisore e rilascio restano fuori.
 * Un riepilogo vuoto non dice niente: non è un «a metà».
 */
export function fermoAMeta(ruolo: string, messaggio: string | undefined): string | undefined {
  const promessa = promessaSenzaFine(messaggio)
  if (promessa !== undefined) return promessa
  if (!RUOLI_CHE_SCRIVONO.has(ruolo) || messaggio === undefined || messaggio.trim() === '') return undefined
  const rapporto = rigaRapporto(messaggio)
  if (rapporto !== undefined && (rapporto.tipo === 'finita' || rapporto.tipo === 'bloccata' || rapporto.tipo === 'serve')) return undefined
  if (/^\s*[*_`]*bloccat[oa][*_`]*\s*:/imu.test(messaggio)) return undefined
  const ultima = messaggio.split(/\r?\n/).map(pulisci).filter((r) => r !== '' && !/^(?:SEGNALE|LEZIONI)[*_`\s]*:/iu.test(r)).pop() ?? ''
  return `chiuso senza RAPPORTO: finita, bloccata o mi serve (ultima riga: ${ultima.slice(0, 120)})`
}
