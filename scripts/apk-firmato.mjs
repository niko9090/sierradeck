// L'APK di rilascio, costruito e verificato: SOLO quello firmato con la chiave
// di Ferrari Consulenze, mai uno di debug.
//
// Perché (12/10): dalla 2.65.0 alla 2.66.0 è stato allegato a mano
// `outputs/apk/debug/app-debug.apk`, firmato «CN=Android Debug». Il telefono di
// Nicholas, che ha l'app firmata da Ferrari Consulenze, non lo installava. E
// `gradle … | tail` aveva nascosto anche i test rossi, perché il codice
// d'uscita era quello di `tail`.
//
// 1. `gradle assembleRelease` (salvo `senzaBuild`), con il suo codice d'uscita vero;
// 2. prende SOLO `android/app/build/outputs/apk/release/app-release.apk`;
// 3. lo verifica con `apksigner verify --print-certs`: il DN deve contenere
//    «O=Ferrari Consulenze» e non «Android Debug».
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const FIRMA_GIUSTA = 'O=Ferrari Consulenze'

export const ferma = (m) => { console.error(`APP ANDROID FERMATA: ${m}`); process.exit(1) }

/** La versione dell'app (versionName in android/app/build.gradle.kts). */
export function versioneApp() {
  const gradle = readFileSync('android/app/build.gradle.kts', 'utf8')
  const v = /versionName\s*=\s*"([0-9]+\.[0-9]+\.[0-9]+)"/.exec(gradle)?.[1]
  if (v === undefined) ferma('versionName non trovato in android/app/build.gradle.kts')
  return v
}

/** Costruisce (salvo `senzaBuild`) e verifica la firma. Torna il percorso dell'APK e la versione. */
export function apkFirmato({ senzaBuild = false } = {}) {
  const versione = versioneApp()
  if (!senzaBuild) {
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
  if (/Android Debug/i.test(certificati)) ferma('l\'APK è firmato con il certificato DEBUG: non si pubblica')
  if (!certificati.includes(FIRMA_GIUSTA)) ferma(`la firma non è quella di Ferrari Consulenze:\n${certificati}`)
  console.log(`firma verificata: ${(/certificate DN: (.+)/.exec(certificati)?.[1] ?? '').trim()}`)
  return { apk, versione }
}
