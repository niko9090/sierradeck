// Scrive `app-android.json`, l'allegato che dice al telefono qual e' l'ultima
// app: `{ versione, apk }`. Va allegato a OGNI pubblicazione insieme all'APK
// (`gh release create vX ... SierraDeck-<app>.apk app-android.json`): il
// telefono lo legge da `releases/latest/download/app-android.json`, senza
// passare dall'API di GitHub e dal suo limite di sessanta richieste l'ora.
//
//   node scripts/app-android-json.mjs [percorso-di-uscita]
//
// La versione dell'app viene da `android/app/build.gradle.kts` (versionName),
// il tag della pubblicazione da `package.json`.
import { readFileSync, writeFileSync } from 'node:fs'

const gradle = readFileSync('android/app/build.gradle.kts', 'utf8')
const versione = /versionName\s*=\s*"([0-9]+\.[0-9]+\.[0-9]+)"/.exec(gradle)?.[1]
if (versione === undefined) throw new Error('versionName non trovato in android/app/build.gradle.kts')
const tag = 'v' + JSON.parse(readFileSync('package.json', 'utf8')).version
const apk = `https://github.com/niko9090/sierradeck/releases/download/${tag}/SierraDeck-${versione}.apk`
const uscita = process.argv[2] ?? 'app-android.json'
writeFileSync(uscita, JSON.stringify({ versione, apk }, null, 2) + '\n')
console.log(`${uscita}: app ${versione} -> ${apk}`)
