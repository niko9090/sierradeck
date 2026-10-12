// Allega l'app Android a una release: SOLO l'APK di rilascio, firmato con la
// chiave di Ferrari Consulenze, e `app-android.json` che punta a lui.
//
//   node scripts/allega-apk.mjs [--senza-build] [--solo-verifica]
//
// Perché (12/10): dalla 2.65.0 alla 2.66.0 è stato allegato a mano
// `outputs/apk/debug/app-debug.apk`, firmato «CN=Android Debug». Il telefono di
// Nicholas, che ha l'app firmata da Ferrari Consulenze, non lo installava. E
// `gradle … | tail` aveva nascosto anche i test rossi, perché il codice
// d'uscita era quello di `tail`.
//
// Cosa fa, e dove si ferma con un errore:
// 1. `gradle assembleRelease` (salvo `--senza-build`), con il suo codice d'uscita vero;
// 2. prende SOLO `android/app/build/outputs/apk/release/app-release.apk`;
// 3. lo verifica con `apksigner verify --print-certs`: il DN deve contenere
//    «O=Ferrari Consulenze» e non «Android Debug»;
// 4. lo copia come `SierraDeck-<versionName>.apk`, scrive `app-android.json`
//    e li carica sulla release `v<versione di package.json>` (`gh release upload --clobber`).
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { noteDi } from './note-novita.mjs'

const FIRMA_GIUSTA = 'O=Ferrari Consulenze'
const args = new Set(process.argv.slice(2))
const ferma = (m) => { console.error(`ALLEGA APK FERMATO: ${m}`); process.exit(1) }

const gradle = readFileSync('android/app/build.gradle.kts', 'utf8')
const versione = /versionName\s*=\s*"([0-9]+\.[0-9]+\.[0-9]+)"/.exec(gradle)?.[1]
if (versione === undefined) ferma('versionName non trovato in android/app/build.gradle.kts')
const programma = JSON.parse(readFileSync('package.json', 'utf8')).version

if (!args.has('--senza-build')) {
  const g = spawnSync('gradle', ['assembleRelease', '--no-daemon', '-q'], { cwd: 'android', stdio: 'inherit', shell: true })
  if (g.status !== 0) ferma(`gradle assembleRelease è uscito con ${g.status}`)
}

const apk = join('android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')
if (!existsSync(apk)) ferma(`manca ${apk}: l'APK di rilascio non c'è (la chiave ~/.sierradeck-chiave.jks e il suo .pass ci sono?)`)

// apksigner: dalla cartella dell'SDK di android/local.properties, o da ANDROID_HOME.
const sdk = (() => {
  try {
    const p = /sdk\.dir\s*=\s*(.+)/.exec(readFileSync('android/local.properties', 'utf8'))?.[1]?.trim()
    if (p !== undefined) return p.replace(/\\\\/g, '\\').replace(/\\:/g, ':')
  } catch { /* niente */ }
  return process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT
})()
if (sdk === undefined) ferma('non trovo l\'SDK di Android (android/local.properties o ANDROID_HOME)')
const strumenti = join(sdk, 'build-tools')
const ultima = existsSync(strumenti) ? readdirSync(strumenti).sort().pop() : undefined
const apksigner = ultima === undefined ? undefined : join(strumenti, ultima, process.platform === 'win32' ? 'apksigner.bat' : 'apksigner')
if (apksigner === undefined || !existsSync(apksigner)) ferma(`apksigner non trovato in ${strumenti}`)
const v = spawnSync(apksigner, ['verify', '--print-certs', apk], { encoding: 'utf8', shell: process.platform === 'win32' })
const certificati = `${v.stdout ?? ''}${v.stderr ?? ''}`
if (v.status !== 0) ferma(`apksigner non verifica l'APK:\n${certificati}`)
if (/Android Debug/i.test(certificati)) ferma('l\'APK è firmato con il certificato DEBUG: non si allega')
if (!certificati.includes(FIRMA_GIUSTA)) ferma(`la firma non è quella di Ferrari Consulenze:\n${certificati}`)
console.log(`firma verificata: ${(/certificate DN: (.+)/.exec(certificati)?.[1] ?? '').trim()}`)

if (args.has('--solo-verifica')) process.exit(0)

const tag = `v${programma}`
const cartella = mkdtempSync(join(tmpdir(), 'apk-'))
const nomeApk = join(cartella, `SierraDeck-${versione}.apk`)
copyFileSync(apk, nomeApk)
const json = join(cartella, 'app-android.json')
const note = noteDi(readFileSync('src/shared/novita.ts', 'utf8'), programma)
writeFileSync(json, JSON.stringify({ versione, apk: `https://github.com/niko9090/sierradeck/releases/download/${tag}/SierraDeck-${versione}.apk`, programma, note }, null, 2) + '\n')
const u = spawnSync('gh', ['release', 'upload', tag, nomeApk, json, '--clobber'], { stdio: 'inherit', shell: true })
if (u.status !== 0) ferma(`gh release upload è uscito con ${u.status}`)
console.log(`allegati a ${tag}: SierraDeck-${versione}.apk (firmato Ferrari Consulenze) e app-android.json`)
