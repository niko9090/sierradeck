/**
 * Le preferenze dell'utente: quello che finora era deciso nel codice.
 *
 * Ogni valore qui dentro era una costante scelta da chi ha scritto il
 * programma. Va benissimo come punto di partenza — un programma che chiede
 * troppo prima di funzionare non lo usa nessuno — ma diventa una gabbia il
 * giorno in cui la porta è occupata, o il grigio dà fastidio agli occhi.
 *
 * Ogni preferenza ha un valore predefinito che vale da solo: chi non apre mai
 * questa finestra non deve accorgersi che esiste.
 */

export type Preferenze = {
  /** Il colore che tinge i comandi e le parti vive dell'interfaccia. */
  accento: string
  /** Quanto scuro è il fondo, da 0 (nero) a 100 (grigio chiaro). */
  chiarore: number
  /** La porta del Client sulla rete locale. */
  portaClient: number
  /** La porta del servizio autopiloti. */
  portaAutopiloti: number
  /** Salvare da soli alla chiusura, saltando i doppioni. */
  salvaAllaChiusura: boolean
  /** Mostrare la barra mentre una chat con molto storico si apre. */
  mostraAttesaChat: boolean
}

export const PREFERENZE_PREDEFINITE: Preferenze = {
  accento: '#4aa3ff',
  chiarore: 20,
  portaClient: 47640,
  portaAutopiloti: 47630,
  salvaAllaChiusura: true,
  mostraAttesaChat: true
}

/** Le porte sotto la 1024 le tiene il sistema, e sopra la 65535 non esistono. */
const PORTA_MIN = 1024
const PORTA_MAX = 65535

export function portaValida(n: unknown): boolean {
  return typeof n === 'number' && Number.isInteger(n) && n >= PORTA_MIN && n <= PORTA_MAX
}

/** Un colore in forma `#rrggbb`. Le altre forme non entrano nel foglio di stile. */
export function coloreValido(c: unknown): boolean {
  return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)
}

/**
 * Riporta dentro i binari quello che arriva da fuori.
 *
 * Valore per valore, non tutto o niente: un colore scritto male non deve far
 * perdere anche la porta che l'utente aveva impostato. È il contrario di come
 * si trattano i limiti dell'autopilota — lì la terna vale insieme — e la
 * differenza è che qui ogni preferenza sta in piedi da sola.
 */
export function normalizzaPreferenze(raw: unknown): Preferenze {
  if (typeof raw !== 'object' || raw === null) return { ...PREFERENZE_PREDEFINITE }
  const o = raw as Record<string, unknown>
  return {
    accento: coloreValido(o.accento) ? (o.accento as string).toLowerCase() : PREFERENZE_PREDEFINITE.accento,
    chiarore: typeof o.chiarore === 'number' && o.chiarore >= 0 && o.chiarore <= 100
      ? Math.round(o.chiarore)
      : PREFERENZE_PREDEFINITE.chiarore,
    portaClient: portaValida(o.portaClient) ? (o.portaClient as number) : PREFERENZE_PREDEFINITE.portaClient,
    portaAutopiloti: portaValida(o.portaAutopiloti)
      ? (o.portaAutopiloti as number)
      : PREFERENZE_PREDEFINITE.portaAutopiloti,
    salvaAllaChiusura: typeof o.salvaAllaChiusura === 'boolean'
      ? o.salvaAllaChiusura
      : PREFERENZE_PREDEFINITE.salvaAllaChiusura,
    mostraAttesaChat: typeof o.mostraAttesaChat === 'boolean'
      ? o.mostraAttesaChat
      : PREFERENZE_PREDEFINITE.mostraAttesaChat
  }
}

/**
 * La tavolozza che nasce dalle preferenze.
 *
 * Un colore solo e un cursore: da lì si ricava tutto il resto. Chiedere
 * all'utente dodici colori sarebbe chiedergli di fare il lavoro che deve fare
 * il programma — e il modo più sicuro per ottenere un'interfaccia illeggibile.
 */
export function tavolozza(p: Preferenze): Record<string, string> {
  const base = Math.round(8 + (p.chiarore / 100) * 22)
  const grigio = (livello: number): string => {
    const v = Math.max(0, Math.min(255, livello))
    return `#${v.toString(16).padStart(2, '0').repeat(3)}`
  }
  return {
    '--fondo': grigio(base),
    '--chassis': grigio(base + 15),
    '--chassis-alto': grigio(base + 23),
    '--chassis-premuto': grigio(base + 7),
    '--incisione': grigio(Math.max(0, base - 5)),
    '--luce-incisione': grigio(base + 38),
    '--accento': p.accento
  }
}
