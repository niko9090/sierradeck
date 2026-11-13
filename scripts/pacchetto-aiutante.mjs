// L'installer di SierraDeck Aiutante (12/11), solo costruito: niente si carica.
//
//   npm run pacchetto-aiutante
//
// Prima `npm run build-aiutante` (lo fa lo script npm), poi electron-builder con
// la configurazione dell'Aiutante e la sua versione (src/aiutante/versione.json).
// Il risultato sta in dist-aiutante/: SierraDeck-Aiutante-Setup-<versione>.exe,
// il suo .blockmap e aiutante.yml (il canale «aiutante»: mai latest.yml, che è del
// programma completo). Lo carica scripts/allega-aiutante.mjs, dentro `npm run pubblica`.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const CONFIG_AIUTANTE = 'electron-builder-aiutante.yml'

/** La versione dell'Aiutante: indipendente da quella del programma completo. */
export function versioneAiutante() {
  const v = JSON.parse(readFileSync(join('src', 'aiutante', 'versione.json'), 'utf8')).versione
  if (typeof v !== 'string' || !/^\d+\.\d+\.\d+$/.test(v)) throw new Error(`versione dell'Aiutante non valida in src/aiutante/versione.json: ${v}`)
  return v
}

/** Il nome dell'installer, come lo scrive electron-builder (productName con il trattino al posto dello spazio). */
export function nomeInstaller(versione) {
  return `SierraDeck-Aiutante-Setup-${versione}.exe`
}

/** Il file degli aggiornamenti dell'Aiutante: il canale «aiutante» di electron-builder. */
export const YML_AIUTANTE = 'aiutante.yml'

/** Gli argomenti di electron-builder: sempre la configurazione dell'Aiutante, mai quella del programma completo. */
export function argomentiBuilder(versione) {
  return ['electron-builder', '--win', '--config', CONFIG_AIUTANTE, '--publish', 'never', `-c.extraMetadata.version=${versione}`]
}

export function costruisci() {
  const versione = versioneAiutante()
  const r = spawnSync('npx', argomentiBuilder(versione), { stdio: 'inherit', shell: true })
  if (r.status !== 0) {
    console.error(`\n[pacchetto-aiutante] electron-builder è uscito con ${r.status}\n`)
    process.exit(1)
  }
  return versione
}

// Lanciato da solo (non importato da allega-aiutante.mjs).
if (process.argv[1] !== undefined && process.argv[1].replace(/\\/g, '/').endsWith('scripts/pacchetto-aiutante.mjs')) {
  const v = costruisci()
  console.log(`\nSierraDeck Aiutante ${v}: installer in dist-aiutante/${nomeInstaller(v)}`)
}
