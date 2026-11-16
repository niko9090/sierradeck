import { eventiPiuRecentiInCima, type EventoAiuto, type TipoEventoAiuto } from '../shared/eventi-aiuto'

/**
 * «Passaggi di mano» nella finestra dell'Aiutante: da quali PC a quali PC è
 * passato un lavoro, e perché. Funzioni pure; i tipi e l'ordine vengono dal
 * registro condiviso (`eventi-aiuto`), le stesse parole del programma completo.
 */

/** Quante righe si mostrano nella finestra (la finestra è piccola). */
export const PASSAGGI_VISIBILI = 8

export const ETICHETTA_PASSAGGIO: Record<TipoEventoAiuto, string> = {
  affidato: 'Affidato',
  'risorsa-mancante': 'Manca qualcosa',
  rifiutato: 'Rifiutato',
  riassegnato: 'Passato ad altro PC',
  arreso: 'Lasciato'
}

export const NESSUN_PASSAGGIO = 'Nessun passaggio finora.'

const due = (n: number): string => String(n).padStart(2, '0')

/** «16/11 09:05»; se l'istante non si legge, il testo com'è. */
export function oraPassaggio(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${due(d.getDate())}/${due(d.getMonth() + 1)} ${due(d.getHours())}:${due(d.getMinutes())}`
}

/** Una riga: ora, lavoro, da PC a PC, motivo. */
export function rigaPassaggio(e: EventoAiuto): string {
  const motivo = e.motivo.trim() !== '' ? e.motivo.trim() : (e.risorsa !== undefined ? `manca ${e.risorsa}` : ETICHETTA_PASSAGGIO[e.tipo].toLowerCase())
  return `${oraPassaggio(e.quando)} · ${e.compito} · ${e.daPc} → ${e.aPc} · ${ETICHETTA_PASSAGGIO[e.tipo]}: ${motivo}`
}

/** Le righe da mostrare, le più recenti in cima; elenco vuoto → una riga sola. */
export function righePassaggi(elenco: readonly EventoAiuto[], visibili: number = PASSAGGI_VISIBILI): string[] {
  if (elenco.length === 0) return [NESSUN_PASSAGGIO]
  const righe = eventiPiuRecentiInCima(elenco).slice(0, visibili).map(rigaPassaggio)
  return elenco.length > visibili ? [...righe, `…e altri ${elenco.length - visibili}`] : righe
}
