/**
 * Cosa dire a una chat che continua a sbattere contro lo stesso muro.
 *
 * Ripetere «correggi e riprova» a chi ha già corretto e riprovato tre volte
 * produce il quarto tentativo identico: il modello non sa di essere in un
 * cerchio, perché ogni turno comincia senza memoria dei precedenti. È
 * l'autopilota che vede la ripetizione, ed è lui che deve rompere lo schema.
 *
 * Le strategie salgono di radicalità: prima si guarda meglio, poi si dubita di
 * ciò che si sta misurando, poi si cambia strada, infine si torna indietro. Una
 * per giro, sempre diversa — perché lo scopo è proprio non ripetersi.
 */
export type Strategia = {
  /** Come compare nel log e nella storia: serve a leggere cosa è successo. */
  nome: string
  istruzioni: string
}

export const STRATEGIE = [
  {
    nome: 'capire',
    istruzioni:
      'Smetti di correggere e comincia a capire. Il tentativo precedente non ha ' +
      'cambiato nulla, quindi la causa che avevi in mente non era quella.\n' +
      "1. Leggi l'errore per intero, non la prima riga.\n" +
      '2. Riproduci il fallimento nel modo più piccolo che riesci a isolare.\n' +
      '3. Scrivi in una frase qual è la causa e come fai a saperlo.\n' +
      'Solo dopo tocca il codice, e cambia una cosa sola.'
  },
  {
    nome: 'dubitare della misura',
    istruzioni:
      'Metti in dubbio la verifica stessa, non solo il codice.\n' +
      '1. Il comando sta misurando davvero il criterio, o qualcosa di più largo?\n' +
      "2. Sta fallendo per il codice o per l'ambiente in cui gira — percorsi, " +
      "permessi, un processo rimasto aperto, rumore su stderr, un codice d'uscita " +
      'sporcato da qualcosa che non c’entra con il risultato?\n' +
      '3. Prova a eseguire a mano il pezzo che il comando esegue, e confronta.\n' +
      'Se il comando non è in grado di misurare il criterio, dillo apertamente e ' +
      'proponi un comando migliore: continuare a inseguire una misura sbagliata ' +
      'non porta da nessuna parte.'
  },
  {
    nome: 'cambiare strada',
    istruzioni:
      "L'approccio scelto non funziona. Non difenderlo.\n" +
      '1. Elenca almeno tre strade diverse per arrivare allo stesso risultato.\n' +
      '2. Scarta quella già tentata.\n' +
      '3. Scegli la più semplice fra le rimaste e applicala per intero, non a metà.\n' +
      'Buttare il lavoro fatto finora è permesso, e spesso è la mossa giusta.'
  },
  {
    nome: 'tornare sul solido',
    istruzioni:
      'Riparti da uno stato che funziona.\n' +
      '1. Guarda cosa hai cambiato: `git status` e `git diff`.\n' +
      '2. Se le modifiche si sono accumulate senza mai dare un esito verde, ' +
      'annulla quelle che non servono e torna al punto noto.\n' +
      '3. Riapplica il cambiamento minimo, uno per volta, verificando dopo ognuno.\n' +
      'Meglio ripartire da poco che continuare su un terreno che non regge.'
  }
  // Tupla e non array: cosi' `STRATEGIE[0]` e' una strategia certa, e non un
  // «forse c'e'» da sciogliere ogni volta che la si nomina.
] as const satisfies readonly Strategia[]

/**
 * Quale mossa fare dopo `ripetute` giri con lo stesso identico esito.
 *
 * Sotto la soglia si lascia lavorare: due tentativi uguali sono normali, è alla
 * terza che si smette di essere sfortuna. Oltre l'ultima strategia si restituisce
 * `undefined`, e chi chiama sa che le strade sono finite — non che il lavoro è
 * finito.
 */
export function strategiaPer(ripetute: number, soglia: number): Strategia | undefined {
  if (ripetute < soglia) return undefined
  return STRATEGIE[ripetute - soglia]
}

/** `true` quando le strategie sono esaurite: da qui in poi serve un umano. */
export function strategieFinite(ripetute: number, soglia: number): boolean {
  return ripetute >= soglia + STRATEGIE.length
}
