// Scrive `app-android.json`, l'allegato che dice al telefono qual e' l'ultima
// app: `{ versione, apk, programma, note }`. Va allegato a OGNI pubblicazione
// insieme all'APK (`gh release create vX ... SierraDeck-<app>.apk app-android.json`):
// il telefono lo legge da `releases/latest/download/app-android.json`, senza
// passare dall'API di GitHub e dal suo limite di sessanta richieste l'ora.
//
//   node scripts/app-android-json.mjs [percorso-di-uscita]
//
// La versione dell'app viene da `android/app/build.gradle.kts` (versionName),
// il tag della pubblicazione da `package.json`.
//
// Dalla 0.43.0 ci sono anche `programma` (la versione del programma) e `note`
// (le righe di novita.ts di quella versione, senza il grassetto): il controllo
// in background del telefono le mette nella notifica dell'aggiornamento. Le
// app vecchie leggono solo `versione` e `apk`, che non cambiano forma.
import { readFileSync, writeFileSync } from 'node:fs'
import { noteDi } from './note-novita.mjs'

const gradle = readFileSync('android/app/build.gradle.kts', 'utf8')
const versione = /versionName\s*=\s*"([0-9]+\.[0-9]+\.[0-9]+)"/.exec(gradle)?.[1]
if (versione === undefined) throw new Error('versionName non trovato in android/app/build.gradle.kts')
const programma = JSON.parse(readFileSync('package.json', 'utf8')).version
const tag = 'v' + programma
const apk = `https://github.com/niko9090/sierradeck/releases/download/${tag}/SierraDeck-${versione}.apk`
const note = noteDi(readFileSync('src/shared/novita.ts', 'utf8'), programma)
const uscita = process.argv[2] ?? 'app-android.json'
writeFileSync(uscita, JSON.stringify({ versione, apk, programma, note }, null, 2) + '\n')
console.log(`${uscita}: app ${versione} -> ${apk} (${note.length} righe di note)`)
