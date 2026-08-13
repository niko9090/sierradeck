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
  /**
   * Accettare il Client anche da fuori la rete locale — una VPN, un altro
   * ufficio.
   *
   * Spento è la scelta prudente: con questo acceso resta **solo** la chiave del
   * dispositivo a difendere un programma che esegue codice, e i due muri
   * diventano uno. Chi lo accende lo sta scegliendo, e il pannello glielo dice.
   */
  clientOltreLaRete: boolean
  /**
   * Le chat che si lasciano cambiando workspace vanno a dormire.
   *
   * Spento vuol dire che restano accese, ed e il predefinito: il ritorno e
   * istantaneo. Con qualche workspace pieno pero sono dieci claude.exe accesi
   * per guardarne due, e allora conviene il contrario.
   */
  ibernaCambiandoWorkspace: boolean
  /**
   * Dove sta il diario dell'autopilota rispetto alla chat che governa.
   *
   * Non c'è una risposta giusta per tutti: su uno schermo largo si vuole di
   * fianco, su uno alto sotto, e chi ha due monitor lo vuole in una finestra
   * sua. `finestra` lo stacca del tutto — è la stessa vista del Client, sul
   * computer.
   */
  postoAutopilota: 'destra' | 'sinistra' | 'sopra' | 'sotto' | 'finestra'
  /** Quanto spazio prende, in percentuale del riquadro. */
  larghezzaAutopilota: number
  /**
   * Come si veste la console.
   *
   * Due risposte opposte alla stessa domanda - cosa deve fare la cornice
   * mentre guardi le chat lavorare - e nessuna delle due e giusta per tutti.
   *
   *  prende sul serio il mestiere che la console imita: metallo, solchi
   * incisi al posto degli spazi, densita alta. Si impara per posizione, e su
   * uno schermo pieno rende quattro righe di terminale in piu per riquadro.
   *
   *  toglie la cornice: superfici piatte separate dal solo contrasto,
   * angoli morbidi, aria. Costa quelle righe e le restituisce in riposo per
   * gli occhi, che dopo otto ore non e poco.
   */
  stile: 'banco' | 'foglio'
}

export const PREFERENZE_PREDEFINITE: Preferenze = {
  accento: '#4aa3ff',
  chiarore: 20,
  portaClient: 47640,
  portaAutopiloti: 47630,
  salvaAllaChiusura: true,
  mostraAttesaChat: true,
  clientOltreLaRete: false,
  ibernaCambiandoWorkspace: false,
  postoAutopilota: 'destra',
  larghezzaAutopilota: 34,
  // Il banco e quello che c e sempre stato: chi non sceglie non deve
  // ritrovarsi un programma diverso da quello di ieri.
  stile: 'banco'
}

/**
 * Quanto può stringersi e allargarsi il diario dell'autopilota.
 *
 * Sotto il 15% non ci sta più niente di leggibile; sopra il 70% il terminale —
 * che resta la cosa principale — diventa una striscia. Il numero sta qui perché
 * lo usano in tre: chi normalizza, il cursore delle impostazioni e la maniglia
 * sul bordo del pannello, e tre limiti diversi sarebbero tre comportamenti.
 */
export const LARGHEZZA_DIARIO = { min: 15, max: 70 } as const

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
      : PREFERENZE_PREDEFINITE.mostraAttesaChat,
    // Il predefinito prudente vale anche quando il valore è scritto male: una
    // preferenza illeggibile non deve poter aprire una porta.
    clientOltreLaRete: o.clientOltreLaRete === true,
    ibernaCambiandoWorkspace: o.ibernaCambiandoWorkspace === true,
    postoAutopilota:
      o.postoAutopilota === 'sinistra' || o.postoAutopilota === 'sopra' ||
      o.postoAutopilota === 'sotto' || o.postoAutopilota === 'finestra'
        ? o.postoAutopilota
        : PREFERENZE_PREDEFINITE.postoAutopilota,
    // Sotto il 15% non ci sta niente di leggibile, sopra il 70% non resta chat:
    // i due estremi sono entrambi un modo di non vedere quello che serve.
    larghezzaAutopilota:
      typeof o.larghezzaAutopilota === 'number' &&
      o.larghezzaAutopilota >= LARGHEZZA_DIARIO.min && o.larghezzaAutopilota <= LARGHEZZA_DIARIO.max
        ? Math.round(o.larghezzaAutopilota)
        : PREFERENZE_PREDEFINITE.larghezzaAutopilota,
    // Solo i due nomi che conosciamo: uno stile inventato lascerebbe la console
    // senza token e con essa senza colori, che è il modo peggiore di scoprire
    // che il file era stato scritto a mano.
    stile: o.stile === 'foglio' ? 'foglio' : PREFERENZE_PREDEFINITE.stile
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
  const comuni = {
    '--fondo': grigio(base),
    '--chassis': grigio(base + 15),
    '--chassis-alto': grigio(base + 23),
    '--chassis-premuto': grigio(base + 7),
    // I grigi che mancavano alla tavolozza, e che il foglio di stile si
    // scriveva a mano uno per uno: trentadue valori che **non seguivano il
    // cursore del chiarore**, perché nessuno li ricavava dal fondo. Sono gli
    // stessi di prima, ma adesso si muovono con gli altri.
    '--fondo-cupo': grigio(Math.max(0, base - 8)),
    '--chassis-acceso': grigio(base + 31),
    '--primario': grigio(base + 38),
    '--primario-alto': grigio(base + 50),
    '--testo-spento': grigio(base + 73),
    '--accento': p.accento,
    // Quanto spazio prende il diario dell'autopilota dentro il suo riquadro.
    // Sta qui perché è di qui che passano tutte le misure che l'utente sceglie:
    // il cursore delle impostazioni e la maniglia sul bordo scrivono lo stesso
    // numero, e il foglio di stile non ne conosce nessun altro.
    '--diario-largh': `${p.larghezzaAutopilota}%`
  }

  // Le due vesti cambiano **gli stessi** token, ed è la ragione per cui
  // possono convivere: nessun componente sa quale dei due stili ha addosso.
  // Chi disegna guarda `--incisione` e `--raggio`, non «banco» o «foglio».
  if (p.stile === 'foglio') {
    return {
      ...comuni,
      // Cinque misure di testo, rapporto costante 1.25: il Foglio si legge, e
      // il testo è la sua unica gerarchia — non avendo né rilievi né solchi.
      '--t0': '11px',
      '--t1': '13px',
      '--t2': '15px',
      '--t3': '19px',
      '--t4': '26px',
      // Quattro passi, mezzo passo più larghi di quelli del banco: è l'aria a
      // separare le cose, dove là separava un solco. Non il doppio — la fascia
      // porta gli stessi comandi, e raddoppiarne i margini li spingerebbe
      // fuori dallo schermo su una finestra stretta.
      '--s1': '6px',
      '--s2': '12px',
      '--s3': '18px',
      '--s4': '26px',
      // Il foglio non ha solchi: al loro posto c'è aria e un bordo quieto.
      // La variabile resta, perché il CSS la chiede — cambia cosa contiene.
      '--incisione': 'transparent',
      '--luce-incisione': grigio(base + 18),
      '--bordo': grigio(base + 18),
      '--separazione': '10px',
      '--raggio': '10px',
      '--fascia-h': '46px',
      '--testata-h': '34px',
      '--rilievo': 'none'
    }
  }

  return {
    ...comuni,
    // Cinque misure e non undici. Il banco le tiene strette — 9 per la
    // serigrafia, 12 per i comandi — perché ogni pixel non speso in cornice è
    // un pixel di conversazione.
    '--t0': '10px',
    '--t1': '11px',
    '--t2': '12px',
    '--t3': '14px',
    '--t4': '19px',
    // Quattro passi su griglia da 4, scelti fra i valori che il banco già
    // usava: consolidare non deve voler dire cambiargli faccia.
    '--s1': '4px',
    '--s2': '8px',
    '--s3': '12px',
    '--s4': '20px',
    // Il banco separa con un solco inciso largo un pixel: ogni pixel non speso
    // in cornice è un pixel di conversazione.
    '--incisione': grigio(Math.max(0, base - 5)),
    '--luce-incisione': grigio(base + 38),
    '--bordo': grigio(Math.max(0, base - 5)),
    '--separazione': '1px',
    '--raggio': '2px',
    '--fascia-h': '40px',
    '--testata-h': '26px',
    '--rilievo': `inset 0 1px 0 ${grigio(base + 38)}`
  }
}
