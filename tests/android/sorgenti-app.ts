import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * I sorgenti Kotlin dell'app, tutti insieme, per i test che guardano il codice.
 * Dalla 0.83.0 i file grandi sono divisi in pezzi sotto le 800 righe: una
 * funzione può cambiare file senza cambiare, e il test deve trovarla lo stesso.
 */
export function sorgentiApp(): string {
  const cartella = join(__dirname, '..', '..', 'android', 'app', 'src', 'main', 'java', 'it', 'ferrariconsulenze', 'sierradeck')
  return readdirSync(cartella).filter((f) => f.endsWith('.kt')).sort().map((f) => readFileSync(join(cartella, f), 'utf8')).join('\n')
}
