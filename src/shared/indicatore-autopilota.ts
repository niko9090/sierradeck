import { attivitaComando } from './attivita-chat'
import type { Segnale } from './segnali-chat'

/**
 * **I segnali veri** delle chat (0.85.0): commit, test, file cambiati, uscita
 * del terminale, letti dagli hook di Claude Code, mai dallo stato dichiarato
 * dalle chat. Il Gestore li legge e li manda al servizio con i battiti; il
 * servizio li aggiunge all'elenco degli autopiloti. E il PC carico (0.85.1).
 *
 * P4: l'indicatore a tre righe del Punto (versione, criteri, promesse) non c'è
 * più: l'avanzamento è la coda e il piano dell'orchestratore.
 */

/** Il tipo di un segnale vero, dal più parlante al più generico. */
export type TipoSegnaleVero = 'commit' | 'test' | 'file' | 'terminale'
export type SegnaleVero = { tipo: TipoSegnaleVero; quando: string }

/** Il PC al limite (0.85.1): l'autopilota rimanda chat nuove e comandi pesanti, e dice chi consuma di più. */
export type PcCarico = { motivo: string; dal: string; programma?: string }
/** Quello che il servizio aggiunge all'elenco: l'ultimo segnale vero per chat, e il PC carico. */
export type SegniVeri = { segniVeri?: Record<string, SegnaleVero>; pcCarico?: PcCarico }

/** «PC carico: aspetto», uguale nell'indicatore e nel «no» a una chat. */
export function rigaPcCarico(p: PcCarico): string {
  return `PC carico: aspetto — ${p.motivo}${p.programma !== undefined ? `; consuma di più ${p.programma}` : ''}`
}

const istante = (s: string | undefined): number | undefined => {
  const t = Date.parse(s ?? '')
  return Number.isNaN(t) ? undefined : t
}

/**
 * L'ultimo segnale vero di una chat dai suoi hook: uno strumento usato
 * (`PreToolUse`/`PostToolUse`) o un turno chiuso (`Stop`, `StopFailure`).
 * Non contano `UserPromptSubmit` e `SessionStart`, che arrivano quando il
 * servizio le consegna un messaggio, né le notifiche.
 */
export function segnaleVeroDa(segnali: readonly Segnale[]): SegnaleVero | undefined {
  for (let i = segnali.length - 1; i >= 0; i -= 1) {
    const s = segnali[i]!
    if (s.evento === 'Stop' || s.evento === 'StopFailure') return { tipo: 'terminale', quando: s.quando }
    if (s.evento !== 'PreToolUse' && s.evento !== 'PostToolUse') continue
    const st = s.strumento ?? ''
    if (st === 'Bash' || st === 'PowerShell') {
      const comando = s.comando ?? s.dettaglio ?? ''
      if (/\bgit\s+(-C\s+\S+\s+)?commit\b/i.test(comando)) return { tipo: 'commit', quando: s.quando }
      if (attivitaComando(comando) === 'fa girare i test') return { tipo: 'test', quando: s.quando }
      return { tipo: 'terminale', quando: s.quando }
    }
    if (st === 'Edit' || st === 'Write' || st === 'MultiEdit' || st === 'NotebookEdit') return { tipo: 'file', quando: s.quando }
    return { tipo: 'terminale', quando: s.quando }
  }
  return undefined
}

/** I segni veri da JSON (il servizio li manda così): uno illeggibile sparisce. */
export function leggiSegnaleVero(x: unknown): SegnaleVero | undefined {
  if (typeof x !== 'object' || x === null) return undefined
  const o = x as Record<string, unknown>
  const tipo = o.tipo
  if (tipo !== 'commit' && tipo !== 'test' && tipo !== 'file' && tipo !== 'terminale') return undefined
  return typeof o.quando === 'string' && istante(o.quando) !== undefined ? { tipo, quando: o.quando } : undefined
}
