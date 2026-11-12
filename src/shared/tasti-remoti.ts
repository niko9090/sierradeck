/**
 * **I tasti veri per una chat di un altro PC** (0.102.2).
 *
 * Nicholas, 12/11: «deve essere come se stessimo scrivendo direttamente nella
 * chat». Il riquadro remoto mandava solo righe di testo: niente Esc, frecce,
 * Tab, Ctrl+C. Qui l'elenco chiuso dei tasti che si possono premere da lontano
 * e la sequenza che ognuno scrive nel terminale di là. Un nome che non è qui
 * non passa: da fuori non arriva mai una sequenza arbitraria.
 */
export const TASTI_REMOTI = {
  esc: '\x1b',
  invio: '\r',
  tab: '\t',
  'shift-tab': '\x1b[Z',
  su: '\x1b[A',
  giu: '\x1b[B',
  destra: '\x1b[C',
  sinistra: '\x1b[D',
  'ctrl-c': '\x03',
  cancella: '\x7f'
} as const

export type TastoRemoto = keyof typeof TASTI_REMOTI

export function tastoRemotoValido(x: unknown): x is TastoRemoto {
  return typeof x === 'string' && Object.prototype.hasOwnProperty.call(TASTI_REMOTI, x)
}

/** Il tasto della tastiera (KeyboardEvent) che diventa un tasto remoto; il resto si scrive come testo. */
export function tastoDaEvento(e: { key: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }): TastoRemoto | undefined {
  if (e.altKey || e.metaKey) return undefined
  if (e.ctrlKey) return e.key === 'c' || e.key === 'C' ? 'ctrl-c' : undefined
  switch (e.key) {
    case 'Escape': return 'esc'
    case 'Enter': return 'invio'
    case 'Tab': return e.shiftKey ? 'shift-tab' : 'tab'
    case 'ArrowUp': return 'su'
    case 'ArrowDown': return 'giu'
    case 'ArrowRight': return 'destra'
    case 'ArrowLeft': return 'sinistra'
    case 'Backspace': return 'cancella'
    default: return undefined
  }
}

/** I tasti della barretta sotto lo schermo remoto, nell'ordine in cui servono. */
export const BARRA_TASTI: { tasto: TastoRemoto; etichetta: string; titolo: string }[] = [
  { tasto: 'esc', etichetta: 'Esc', titolo: 'Esc: interrompe Claude o chiude un menu' },
  { tasto: 'su', etichetta: '↑', titolo: 'Freccia su' },
  { tasto: 'giu', etichetta: '↓', titolo: 'Freccia giù' },
  { tasto: 'invio', etichetta: 'Invio', titolo: 'Invio' },
  { tasto: 'tab', etichetta: 'Tab', titolo: 'Tab' },
  { tasto: 'shift-tab', etichetta: '⇧Tab', titolo: 'Maiuscolo+Tab: cambia modo (piano, modifiche automatiche)' },
  { tasto: 'ctrl-c', etichetta: 'Ctrl+C', titolo: 'Ctrl+C' }
]
