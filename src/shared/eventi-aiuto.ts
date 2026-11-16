import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { scriviJsonAtomico } from './scrittura-atomica'

/**
 * I passaggi di mano dei lavori mandati a un altro PC della rete («Aiuta la
 * rete»): quando un lavoro viene affidato, quando il PC non può agire perché
 * gli manca una risorsa, quando rifiuta, quando passa ad altro PC, quando ci si
 * arrende. Restano in un file JSON nella cartella dati `aiuto`, gli ultimi
 * `TETTO_EVENTI_AIUTO`, e si leggono in una sezione del programma.
 *
 * Funzioni pure per l'elenco; solo `leggiEventiAiuto` e `salvaEventiAiuto`
 * toccano il disco, e non sollevano mai.
 */

export type TipoEventoAiuto = 'affidato' | 'risorsa-mancante' | 'rifiutato' | 'riassegnato' | 'arreso'

export type EventoAiuto = {
  /** Quando è successo (ISO). */
  quando: string
  lavoroId: string
  /** Il compito, in poche parole. */
  compito: string
  /** Il PC che ha mandato il lavoro (nome da mostrare). */
  daPc: string
  /** Il PC che l'ha ricevuto o a cui è passato (nome da mostrare). */
  aPc: string
  tipo: TipoEventoAiuto
  /** Il perché, in italiano semplice. */
  motivo: string
  /** La risorsa che mancava, se è il caso (per esempio «il progetto»). */
  risorsa?: string
}

export const TETTO_EVENTI_AIUTO = 500

export const CARTELLA_EVENTI_AIUTO = 'aiuto'
export const FILE_EVENTI_AIUTO = 'eventi-aiuto.json'

const TIPI: readonly TipoEventoAiuto[] = ['affidato', 'risorsa-mancante', 'rifiutato', 'riassegnato', 'arreso']

function eEvento(v: unknown): v is EventoAiuto {
  if (typeof v !== 'object' || v === null) return false
  const e = v as Record<string, unknown>
  return typeof e.quando === 'string' && typeof e.lavoroId === 'string' && typeof e.compito === 'string' &&
    typeof e.daPc === 'string' && typeof e.aPc === 'string' && typeof e.motivo === 'string' &&
    typeof e.tipo === 'string' && (TIPI as readonly string[]).includes(e.tipo) &&
    (e.risorsa === undefined || typeof e.risorsa === 'string')
}

/** L'elenco da un testo JSON: se è rovinato o ha un'altra forma, vuoto. Le voci storte si scartano. */
export function eventiDaTesto(testo: string): EventoAiuto[] {
  try {
    const v: unknown = JSON.parse(testo)
    const elenco = Array.isArray(v) ? v : (typeof v === 'object' && v !== null ? (v as { eventi?: unknown }).eventi : undefined)
    return Array.isArray(elenco) ? elenco.filter(eEvento) : []
  } catch {
    return []
  }
}

/** Aggiunge un evento in fondo (i più vecchi prima) e tiene gli ultimi `tetto`. Non cambia l'elenco dato. */
export function aggiungiEventoAiuto(elenco: readonly EventoAiuto[], evento: EventoAiuto, tetto: number = TETTO_EVENTI_AIUTO): EventoAiuto[] {
  const nuovo = [...elenco, evento]
  return tetto > 0 && nuovo.length > tetto ? nuovo.slice(nuovo.length - tetto) : nuovo
}

// In un file senza disco (16/11): lo usa anche la finestra dell'Aiutante, che gira nel browser.
export { eventiPiuRecentiInCima } from './eventi-aiuto-elenco'

export function fileEventiAiuto(dati: string): string {
  return join(dati, CARTELLA_EVENTI_AIUTO, FILE_EVENTI_AIUTO)
}

/** Legge l'elenco dal file: se manca o è rovinato, vuoto, senza errori. */
export function leggiEventiAiuto(dati: string): EventoAiuto[] {
  try {
    return eventiDaTesto(readFileSync(fileEventiAiuto(dati), 'utf8'))
  } catch {
    return []
  }
}

/** Salva l'elenco (scrittura atomica). `false` se non riesce. */
export function salvaEventiAiuto(dati: string, elenco: readonly EventoAiuto[]): boolean {
  const file = fileEventiAiuto(dati)
  try {
    if (!existsSync(dirname(file))) mkdirSync(dirname(file), { recursive: true })
  } catch {
    return false
  }
  return scriviJsonAtomico(file, elenco, 'eventi-aiuto')
}

/**
 * Registra un passaggio di mano: legge, aggiunge con il tetto, salva. Da
 * chiamare dove un lavoro viene affidato, rifiutato, passato o lasciato. Non
 * solleva mai: un registro che non si scrive non deve fermare il lavoro.
 */
export function registraEventoAiuto(dati: string, evento: EventoAiuto, tetto: number = TETTO_EVENTI_AIUTO): boolean {
  try {
    return salvaEventiAiuto(dati, aggiungiEventoAiuto(leggiEventiAiuto(dati), evento, tetto))
  } catch {
    return false
  }
}
