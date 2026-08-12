/**
 * Esito di un'indicizzazione completa. `errore` e' definito solo quando
 * l'indicizzazione non e' arrivata in fondo: la scrittura nell'indice avviene
 * in una transazione sola, quindi o entra tutto o non entra niente, e in quel
 * caso i due contatori non descrivono cio' che c'e' nel database.
 */
export type IndexOutcome = {
  indexed: number
  failed: number
  /** Quante sessioni erano già nell'indice e non sono state rilette. */
  riusate?: number
  errore?: string
}

/**
 * A che punto è la lettura delle sessioni.
 *
 * Il primo avvio dura minuti — 776 MB da leggere sulla macchina di riferimento
 * — e un'attesa senza numeri non si distingue da un programma bloccato.
 */
export type Avanzamento = {
  fase: 'scansione' | 'lettura' | 'pulizia' | 'fine'
  done: number
  total: number
  /** La cartella che si sta leggendo: dice che il lavoro procede davvero. */
  progetto?: string
  /** Quante sono state riprese dall'indice invece che rilette. */
  riusate: number
}

export type SessionSummary = {
  uuid: string
  projectSlug: string
  projectPath: string
  aiTitle: string | undefined
  cwd: string | undefined
  gitBranch: string | undefined
  model: string | undefined
  permissionMode: string | undefined
  claudeVersion: string | undefined
  messageCount: number
  firstTimestamp: string | undefined
  lastTimestamp: string | undefined
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  /**
   * Il primo messaggio scritto dall'utente, con gli spazi compressi e troncato.
   *
   * È ciò che dice di che cosa parla una conversazione quando il titolo non
   * c'è — sei sessioni su dieci sulla macchina di riferimento — ed è anche ciò
   * che distingue due chat con lo stesso titolo.
   */
  primoPrompt: string | undefined
  jsonlPath: string
  sizeBytes: number
  /**
   * Quando il `.jsonl` è stato scritto l'ultima volta.
   *
   * Insieme alla dimensione dice se il file è cambiato da quando fu indicizzato:
   * è quello che permette di saltarlo invece di rileggerlo.
   */
  mtimeMs: number
  /**
   * Righe non interpretabili incontrate leggendo il file. Il vincolo di piano
   * impone che una riga malformata sia saltata **e registrata**: questo campo
   * e' il posto dove la registrazione sopravvive. Il Task 8 indicizza solo
   * SessionSummary, quindi senza questo campo l'informazione morirebbe qui.
   * Le righe vuote non contano: sono benigne.
   */
  skippedLines: number
}
