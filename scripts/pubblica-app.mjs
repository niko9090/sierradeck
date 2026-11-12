// Pubblica l'app Android PER CONTO SUO (0.103.2, Nicholas 12/11: «separale»).
//
//   npm run pubblica-app            (anche `npm run allega-apk`, il nome di prima)
//   node scripts/pubblica-app.mjs [--senza-build] [--solo-verifica]
//
// L'app e il programma del PC sono due programmi: un cambio solo all'app non
// deve più costruire e caricare un installer del PC uguale a prima. L'app esce
// nella pubblicazione fissa «App Android» (tag `app-android`), che NON è mai
// l'ultima: il programma del PC si aggiorna leggendo solo l'ultima
// (`releases/latest`), quindi non la vede.
//
// Cosa fa, e dove si ferma con un errore:
// 1. costruisce e verifica l'APK firmato Ferrari Consulenze (`apk-firmato.mjs`);
// 2. le novità di quella versione da `android/novita-app.txt` (obbligatorie);
// 3. se quella versione è già pubblicata si ferma: va alzato versionName;
// 4. carica `SierraDeck-<versione>.apk` e `app-android.json` su «App Android»
//    (creata in BOZZA la prima volta, pubblicata solo a file caricati, sempre
//    con `--latest=false`);
// 5. per le app di prima (fino alla 3.0.2), che cercano il file nell'ultima
//    pubblicazione del programma, copia `app-android.json` anche lì;
// 6. controlla che sia tutto su, e non in bozza.
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apkFirmato, ferma } from './apk-firmato.mjs'
import { noteDi } from './note-novita.mjs'

export const TAG_APP = 'app-android'
const REPO = 'niko9090/sierradeck'
const args = new Set(process.argv.slice(2))
const gh = (a) => spawnSync('gh', a, { encoding: 'utf8' })

const { apk, versione } = apkFirmato({ senzaBuild: args.has('--senza-build') })
if (args.has('--solo-verifica')) process.exit(0)

const fileNovita = join('android', 'novita-app.txt')
const note = existsSync(fileNovita) ? noteDi(readFileSync(fileNovita, 'utf8'), versione) : []
if (note.length === 0) ferma(`mancano le novità della ${versione} in ${fileNovita} (una voce «versione: '${versione}'» con le sue righe)`)

const vista = gh(['release', 'view', TAG_APP, '--json', 'assets,isDraft'])
const esiste = vista.status === 0
const nomeApk = `SierraDeck-${versione}.apk`
if (esiste) {
  const nomi = (JSON.parse(vista.stdout).assets ?? []).map((x) => x.name)
  if (nomi.includes(nomeApk)) ferma(`l'app ${versione} è già pubblicata: alza versionName (e versionCode) in android/app/build.gradle.kts`)
}

const cartella = mkdtempSync(join(tmpdir(), 'app-'))
const copia = join(cartella, nomeApk)
copyFileSync(apk, copia)
const json = join(cartella, 'app-android.json')
writeFileSync(json, JSON.stringify({ versione, apk: `https://github.com/${REPO}/releases/download/${TAG_APP}/${nomeApk}`, note }, null, 2) + '\n')
const testo = join(cartella, 'note.md')
writeFileSync(testo, `## App Android ${versione}\n\n${note.map((r) => `- ${r}`).join('\n')}\n\nÈ l'app per il telefono: si aggiorna da sola dall'app, oppure si scarica da qui. Non è una versione del programma del PC.\n`)

if (!esiste) {
  const c = gh(['release', 'create', TAG_APP, '--draft', '--latest=false', '--target', 'main', '--title', `App Android ${versione}`, '--notes-file', testo])
  if (c.status !== 0) ferma(`gh release create (bozza) è uscito con ${c.status}: ${c.stderr}`)
}
const u = spawnSync('gh', ['release', 'upload', TAG_APP, copia, json, '--clobber'], { stdio: 'inherit' })
if (u.status !== 0) ferma(`gh release upload è uscito con ${u.status}`)
const e = gh(['release', 'edit', TAG_APP, '--draft=false', '--latest=false', '--title', `App Android ${versione}`, '--notes-file', testo])
if (e.status !== 0) ferma(`gh release edit è uscito con ${e.status}: ${e.stderr}`)

// Le app fino alla 3.0.2 cercano il file nell'ultima pubblicazione del programma.
const ultima = gh(['api', `repos/${REPO}/releases/latest`, '--jq', '.tag_name']).stdout.trim()
if (/^v\d+\.\d+\.\d+$/.test(ultima)) {
  const c = spawnSync('gh', ['release', 'upload', ultima, json, '--clobber'], { stdio: 'inherit' })
  if (c.status !== 0) ferma(`app-android.json non copiato su ${ultima} (le app di prima non vedrebbero la ${versione})`)
  console.log(`app-android.json copiato anche su ${ultima}, per le app di prima`)
} else console.warn(`non trovo l'ultima pubblicazione del programma (${ultima}): le app di prima vedranno la ${versione} alla prossima`)

const controllo = gh(['release', 'view', TAG_APP, '--json', 'isDraft,assets'])
const fatto = JSON.parse(controllo.stdout || '{}')
const caricati = (fatto.assets ?? []).map((x) => x.name)
if (fatto.isDraft !== false || !caricati.includes(nomeApk) || !caricati.includes('app-android.json')) ferma(`«App Android» non è a posto: bozza=${fatto.isDraft}, file=${caricati.join(', ')}`)
console.log(`pubblicata l'app ${versione} (firmata Ferrari Consulenze) su «App Android», senza toccare il programma del PC`)
