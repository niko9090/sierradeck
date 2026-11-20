/**
 * Un'interrogazione dell'indice che, a connessione chiusa, risponde col valore
 * vuoto invece di lanciare.
 *
 * In uscita `chiudiRisorse()` chiude il db, ma la finestra ancora aperta puo'
 * interrogare i gestori un'ultima volta: «The database connection is not open»
 * finiva nel registro errori senza che ci fosse nulla da correggere.
 */
export function leggiDbOVuoto<T>(db: { open: boolean }, leggi: () => T, vuoto: T): T {
  return db.open ? leggi() : vuoto
}
