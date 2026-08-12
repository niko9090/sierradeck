export type GeometriaMonitor = {
  bounds: { x: number; y: number; width: number; height: number }
  scaleFactor: number
}

/**
 * La chiave che identifica un monitor nell'archivio dei layout.
 *
 * Deliberatamente **non** usa `Display.id` di Electron. Su Windows quell'id non
 * è stabile: cambia al riavvio, all'aggiornamento del driver video e allo
 * scollegamento di uno schermo. Un layout salvato sotto un id che poi cambia
 * diventa irraggiungibile, e l'utente vede il proprio setup sparire senza
 * ragione apparente.
 *
 * La geometria è più stabile: per una postazione fissa, posizione, risoluzione e
 * scalatura restano quelle. E soprattutto degrada nel verso giusto — se non
 * combacia si riparte dal layout predefinito, mentre un id riciclato da un altro
 * schermo restituirebbe il layout *sbagliato*, che è peggio di nessun layout.
 *
 * La posizione fa parte della chiave perché due schermi identici affiancati
 * hanno la stessa risoluzione e vanno distinti.
 */
export function chiaveMonitor(m: GeometriaMonitor): string {
  const b = m.bounds
  return `${b.width}x${b.height}@${b.x},${b.y}@${m.scaleFactor}`
}
