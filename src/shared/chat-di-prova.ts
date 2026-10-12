/**
 * Le chat di prova (0.63.0, decisione di Nicholas del 12/10: «se devi chiudere
 * delle chat di prova devi essere autonomo»).
 *
 * Chiudere una chat resta vietato alle chat governate (`/api/chat/chiudi` è
 * fra le rotte che l'hook nega): le chat di Nicholas non le chiude nessun
 * autopilota. Le chat di **prova**, quelle che servono a collaudare il
 * programma fra i PC, sì: si chiudono con `/api/prova/chiudi`, e a decidere
 * se una chat è di prova è il **PC dove vive**, guardando la sua cartella,
 * non chi chiede.
 *
 * È di prova una chat che lavora in una cartella il cui nome comincia con
 * «SierraDeck-prova-». Nessun progetto vero si chiama così.
 */

export const PREFISSO_CARTELLA_PROVA = 'SierraDeck-prova-'

/** La cartella è una cartella di prova? Conta solo il suo nome, non quelli sopra. */
export function cartellaDiProva(cwd: string): boolean {
  const nome = cwd.split(/[\\/]+/).filter((p) => p !== '').pop() ?? ''
  return nome.length > PREFISSO_CARTELLA_PROVA.length && nome.toLowerCase().startsWith(PREFISSO_CARTELLA_PROVA.toLowerCase())
}
