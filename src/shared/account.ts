/** Chi ha fatto l'accesso. */
export type Utente = { id: string; email: string }

/** L'esito di una registrazione o di un accesso. */
export type EsitoAccesso =
  | { stato: 'entrato'; utente: Utente }
  /** Registrazione fatta, ma serve confermare l'email prima di entrare. */
  | { stato: 'confermaEmail' }
  | { stato: 'errore'; messaggio: string }
