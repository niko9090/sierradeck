/**
 * Il titolo di un riquadro diventa il valore di `-n` sulla riga di comando di
 * claude.exe. Questo modulo tiene in un posto solo *quali* caratteri non ci
 * possono arrivare, perche' due luoghi diversi ne hanno bisogno per due
 * ragioni diverse e non devono divergere:
 *
 * - il renderer lo usa per **ripulire** un titolo prima di farlo entrare nel
 *   layout (i titoli nascono da `aiTitle`, cioe' testo generato da un modello
 *   e letto da disco: se un apice rendesse la chat non apribile, l'utente
 *   pagherebbe sul percorso principale il prezzo di un difetto altrui, per
 *   giunta su un testo che non ha scritto e non puo' cambiare);
 * - il Core lo usa per **rifiutare** una richiesta ostile, che resta la rete
 *   per il giorno in cui un titolo arrivera' da un'altra strada — un rinomina
 *   in F2, un layout persistito, un'importazione.
 *
 * Il carattere pericoloso e' il doppio apice, e la ragione e' precisa.
 * `argsToCommandLine` di node-pty (lib/windowsPtyAgent.js) racchiude un
 * argomento fra apici solo se contiene uno spazio E non e' gia' delimitato da
 * apici, ma fa comunque precedere da backslash gli apici interni. Un argomento
 * che *comincia e finisce* con un apice non viene quindi racchiuso, e
 * `CommandLineToArgvW` rilegge quei `\"` come apici letterali spezzando sugli
 * spazi: un titolo della forma `" --flag "` diventa tre argomenti distinti per
 * claude.exe. E' iniezione di argomenti.
 *
 * I caratteri di controllo seguono per la stessa via: un a capo dentro un
 * argomento non ha alcun significato utile e ne ha diversi indesiderati.
 */

/** Oltre questa lunghezza un titolo non e' piu' un'etichetta. */
export const TITOLO_MAX = 200

/** Il doppio apice, sostituito con quello tipografico: stesso aspetto, nessun effetto. */
const APICE_INNOCUO = '”'

function eDiControllo(carattere: string): boolean {
  const codice = carattere.codePointAt(0) ?? 0
  return codice < 0x20 || codice === 0x7f
}

/** Vero se il titolo, cosi' com'e', non puo' finire su una riga di comando. */
export function titoloPericoloso(titolo: string): boolean {
  if (titolo.includes('"')) return true
  for (const carattere of titolo) if (eDiControllo(carattere)) return true
  return false
}

/**
 * Rende innocuo un titolo **sostituendo**, non tagliando: un titolo che
 * diventasse vuoto o mozzato sarebbe peggio di uno con un apice reso in modo
 * diverso. Il doppio apice diventa quello tipografico, ogni carattere di
 * controllo diventa uno spazio, e gli spazi che ne risultano vengono raccolti.
 *
 * L'unico caso in cui si perde qualcosa e' la lunghezza, dove non c'e'
 * alternativa: accorciare e' comunque meglio di un riquadro che non si apre.
 */
export function normalizzaTitolo(titolo: string): string {
  let pulito = ''
  for (const carattere of titolo) {
    if (carattere === '"') pulito += APICE_INNOCUO
    else if (eDiControllo(carattere)) pulito += ' '
    else pulito += carattere
  }
  pulito = pulito.replace(/ {2,}/g, ' ').trim()
  if (pulito.length > TITOLO_MAX) pulito = pulito.slice(0, TITOLO_MAX - 1).trimEnd() + '…'
  return pulito
}
