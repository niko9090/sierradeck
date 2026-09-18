// Ferma la costruzione dell'installer se mancano le credenziali OAuth di
// Google Drive: senza, l'app esce con «Google Drive non configurato» e il
// salvataggio sul Drive smette di funzionare su ogni PC che la installa.
//
// E' successo con la 0.29.0 (18/09/2026), costruita su un portatile dove
// `google-oauth.json` non c'era: il build non si lamenta (le stringhe restano
// vuote apposta, per chi vuole solo provare a compilare), ma un installer
// pubblicato cosi' spegne il Drive a chi lo installa. Da qui `pacchetto` e
// `pubblica` passano prima di qui.
//
// Le credenziali si leggono come in `electron.vite.config.ts`: variabili
// `SD_GOOGLE_CLIENT_ID`/`SD_GOOGLE_CLIENT_SECRET`, oppure `google-oauth.json`
// nella radice del repo (non versionato).
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function ci() {
  const id = process.env.SD_GOOGLE_CLIENT_ID
  const segreto = process.env.SD_GOOGLE_CLIENT_SECRET
  if (id !== undefined && id !== '' && segreto !== undefined && segreto !== '') return true
  const file = resolve('google-oauth.json')
  if (!existsSync(file)) return false
  try {
    const j = JSON.parse(readFileSync(file, 'utf8'))
    return typeof j.clientId === 'string' && j.clientId !== '' && typeof j.clientSecret === 'string' && j.clientSecret !== ''
  } catch {
    return false
  }
}

if (!ci()) {
  console.error(
    'FERMO: mancano le credenziali OAuth di Google Drive (SD_GOOGLE_CLIENT_ID/SECRET o google-oauth.json nella radice).\n' +
    'Un installer costruito senza spegne il Drive a chi lo installa (successo con la 0.29.0). Recuperale dal PC dove ci sono,\n' +
    'oppure da un installer gia\' pubblicato (vedi .sierradeck/quaderno/release-senza-credenziali-drive.md).'
  )
  process.exit(1)
}
console.log('credenziali OAuth di Google Drive: presenti')
