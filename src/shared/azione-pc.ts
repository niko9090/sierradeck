import { PROGRAMMI_CAPACITA } from './capacita-pc'

/**
 * **Un'azione singola su un altro PC** (k-166n3): un PC chiede a un altro, che sa
 * farla, UNA cosa precisa e riceve il risultato. Non è un compito affidato e non
 * è una shell: le azioni sono in un elenco chiuso, ognuna con argomenti controllati.
 * Un'azione sconosciuta o con argomenti sbagliati si rifiuta con il motivo in italiano.
 *
 * Tutto puro: la validazione sta qui, l'esecuzione in `main/azione-pc.ts`.
 */

export const ROTTA_AZIONE = '/api/azione'

export type AzionePc =
  /** Se un programma è installato (dal PATH di quel PC, senza lanciarlo). */
  | { tipo: 'stato-programma'; programma: string }
  /** La versione di un programma installato. */
  | { tipo: 'versione-programma'; programma: string }
  /** Se un indirizzo di rete è raggiungibile da quel PC (connessione TCP). */
  | { tipo: 'raggiungibile'; host: string; porta: number }
  /** Manda un file al telefono collegato a quel PC (con la conferma di chi sta là). */
  | { tipo: 'manda-file-telefono'; percorso: string }

export type TipoAzionePc = AzionePc['tipo']

export const TIPI_AZIONE_PC: readonly TipoAzionePc[] = ['stato-programma', 'versione-programma', 'raggiungibile', 'manda-file-telefono']

/** Il risultato di un'azione: il valore, o il motivo detto in italiano. */
export type RisultatoAzione<T = unknown> = { ok: true; valore: T } | { ok: false; motivo: string }

export type ValoreStatoProgramma = { installato: boolean }
export type ValoreVersioneProgramma = { versione: string }
export type ValoreRaggiungibile = { raggiungibile: boolean; ms: number }
export type ValoreMandaFile = { consegna: string; stato: string }

const HOST = /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/u
const PERCORSO_ASSOLUTO = /^(?:[A-Za-z]:[\\/]|\/)/u

export type AzioneValidata = { ok: true; azione: AzionePc } | { ok: false; motivo: string }

/** `x` da fuori (corpo di una richiesta): un'azione dell'elenco con gli argomenti giusti, o il motivo del no. */
export function validaAzione(x: unknown): AzioneValidata {
  const no = (motivo: string): AzioneValidata => ({ ok: false, motivo })
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return no('L’azione non è nel formato giusto: serve un oggetto con il campo «tipo».')
  const o = x as Record<string, unknown>
  if (typeof o.tipo !== 'string' || o.tipo === '') return no('Manca il tipo dell’azione.')
  const tipo = o.tipo
  switch (tipo) {
    case 'stato-programma':
    case 'versione-programma': {
      if (typeof o.programma !== 'string' || o.programma.trim() === '') return no('Manca il programma da guardare.')
      const programma = o.programma.trim().toLowerCase()
      if (!PROGRAMMI_CAPACITA.includes(programma)) return no(`Il programma «${programma.slice(0, 40)}» non è fra quelli che si possono guardare da un altro PC.`)
      return { ok: true, azione: { tipo, programma } }
    }
    case 'raggiungibile': {
      if (typeof o.host !== 'string' || !HOST.test(o.host.trim())) return no('L’indirizzo da controllare non è valido: serve un nome o un numero di rete, senza percorsi.')
      const porta = o.porta
      if (typeof porta !== 'number' || !Number.isInteger(porta) || porta < 1 || porta > 65535) return no('La porta non è valida: serve un numero intero da 1 a 65535.')
      return { ok: true, azione: { tipo, host: o.host.trim(), porta } }
    }
    case 'manda-file-telefono': {
      if (typeof o.percorso !== 'string' || o.percorso.trim() === '' || o.percorso.length > 1000 || o.percorso.includes('\0')) return no('Il file da mandare non è valido: serve il percorso intero, su quel PC.')
      if (!PERCORSO_ASSOLUTO.test(o.percorso.trim())) return no('Il percorso del file dev’essere intero (con la lettera dell’unità o dalla radice).')
      return { ok: true, azione: { tipo, percorso: o.percorso.trim() } }
    }
    default:
      return no(`L’azione «${tipo.slice(0, 40)}» non esiste: si possono chiedere solo ${TIPI_AZIONE_PC.join(', ')}.`)
  }
}

/** La capacità che quel PC deve avere per fare l'azione (come in `haCapacita`), se serve. */
export function capacitaRichiesta(a: AzionePc): string | undefined {
  switch (a.tipo) {
    case 'versione-programma': return a.programma
    case 'manda-file-telefono': return 'telefono'
    default: return undefined
  }
}

/** La capacità mancante, detta a parole. */
export function motivoSenzaCapacita(a: AzionePc, capacita: string): string {
  return capacita === 'telefono'
    ? 'A quel PC non è collegato nessun telefono: non posso mandargli il file.'
    : `Quel PC non ha «${capacita}» installato: non posso chiedergli questa azione.`
}

/** Un risultato da fuori (risposta di quel PC): la forma giusta o un rifiuto. */
export function risultatoValido(x: unknown): RisultatoAzione {
  if (typeof x === 'object' && x !== null) {
    const o = x as Record<string, unknown>
    if (o.ok === true && 'valore' in o) return { ok: true, valore: o.valore }
    if (o.ok === false && typeof o.motivo === 'string') return { ok: false, motivo: o.motivo.slice(0, 500) }
  }
  return { ok: false, motivo: 'Quel PC ha risposto in un modo che non capisco: forse ha una versione più vecchia, senza le azioni.' }
}
