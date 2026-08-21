/**
 * Le regole di una password, in un posto solo e provabile.
 *
 * Poche e chiare: abbastanza da non essere indovinabile, non tante da spingere a
 * scriverla su un foglietto. La valutazione torna riga per riga, così
 * l'interfaccia può accendere ogni requisito man mano che si digita — dire «non
 * valida» e basta è il modo più veloce di far arrabbiare chi si registra.
 */

export type ValutazionePassword = {
  /** Almeno 8 caratteri. */
  lunghezza: boolean
  /** Almeno una lettera. */
  lettera: boolean
  /** Almeno un numero. */
  numero: boolean
  /** Tutte soddisfatte. */
  ok: boolean
}

/** Le regole in parole, per mostrarle accanto ai segni di spunta. */
export const REGOLE_PASSWORD: { chiave: keyof Omit<ValutazionePassword, 'ok'>; testo: string }[] = [
  { chiave: 'lunghezza', testo: 'almeno 8 caratteri' },
  { chiave: 'lettera', testo: 'una lettera' },
  { chiave: 'numero', testo: 'un numero' }
]

export function valutaPassword(password: string): ValutazionePassword {
  const lunghezza = password.length >= 8
  const lettera = /[a-zA-Z]/.test(password)
  const numero = /[0-9]/.test(password)
  return { lunghezza, lettera, numero, ok: lunghezza && lettera && numero }
}
