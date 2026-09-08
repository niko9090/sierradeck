import { get } from 'node:https'

/**
 * Dov'è l'APK dell'app, e quale versione è.
 *
 * Il tasto «Scarica» apriva GitHub e lasciava lì: una pagina piena di file,
 * da cui bisogna capire quale prendere. Da un telefono è il momento in cui si
 * rinuncia. Qui si chiede una volta sola quale sia l'ultimo APK, e il tasto
 * porta **al file**, non alla pagina che lo contiene.
 *
 * La versione la si legge dal nome del file, non dal tag del Release: l'app ha
 * una vita sua, e un APK allegato a «SierraDeck 0.9» può essere ancora la
 * stessa versione di prima.
 */

export type AppScaricabile = { versione: string; url: string }

/** Sei ore: l'app non esce tre volte al giorno, e chiederlo a ogni apertura è sprecato. */
const VALIDA_MS = 6 * 60 * 60 * 1000
const VERSIONE_NEL_NOME = /SierraDeck-(\d+\.\d+\.\d+)\.apk$/
/** Da dove puo' venire un APK, e da nessun altro posto: e' l'unica cosa che il telefono installa. */
const ORIGINE_APK = 'https://github.com/niko9090/sierradeck/releases/download/'
/**
 * Il file `app-android.json` allegato a ogni pubblicazione (dalla 0.17.0).
 *
 * `releases/latest/download/<file>` rimanda all'allegato dell'ultima
 * pubblicazione: un file da CDN, non una chiamata all'API, senza il limite
 * delle sessanta richieste l'ora per indirizzo che da un telefono si supera
 * senza accorgersene. L'API resta come ripiego.
 */
const FILE_APP = 'https://github.com/niko9090/sierradeck/releases/latest/download/app-android.json'

let ricordata: { quando: number; app: AppScaricabile | undefined } | undefined

type Release = { assets?: { name?: string; browser_download_url?: string }[] }

/** Confronto numero per numero: «0.9.0» è **prima** di «0.10.0», non dopo. */
function piuNuova(a: string, b: string): boolean {
  const x = a.split('.').map((n) => Number(n) || 0)
  const y = b.split('.').map((n) => Number(n) || 0)
  for (let i = 0; i < 3; i += 1) {
    const p = x[i] ?? 0
    const q = y[i] ?? 0
    if (p !== q) return q > p
  }
  return false
}

/**
 * L'APK più recente fra quelli allegati alle pubblicazioni.
 *
 * Non solo l'ultima: l'app e il programma escono quando hanno qualcosa da dare,
 * e quasi mai insieme. Guardando solo l'ultima pubblicazione, il primo rilascio
 * del programma **senza** APK allegato faceva sparire l'app dal telefono —
 * niente da scaricare, niente da aggiornare, e nessun errore da nessuna parte.
 * Qui si scorrono le ultime pubblicazioni e si tiene la versione più alta.
 *
 * Accetta sia l'elenco delle pubblicazioni sia una sola: chi ha già una
 * risposta di `/releases/latest` non deve cambiare nulla.
 */
export function leggiApkDalRelease(json: string): AppScaricabile | undefined {
  try {
    const letto = JSON.parse(json) as Release | Release[]
    const releases = Array.isArray(letto) ? letto : [letto]
    let migliore: AppScaricabile | undefined
    for (const release of releases) {
      for (const allegato of release.assets ?? []) {
        const trovata = VERSIONE_NEL_NOME.exec(allegato.name ?? '')
        if (trovata?.[1] === undefined || allegato.browser_download_url === undefined) continue
        const candidata = { versione: trovata[1], url: allegato.browser_download_url }
        if (migliore === undefined || piuNuova(migliore.versione, candidata.versione)) {
          migliore = candidata
        }
      }
    }
    return migliore
  } catch {
    return undefined
  }
}

/**
 * Chiede a GitHub qual è l'ultimo APK.
 *
 * Non solleva mai e non blocca niente: senza rete si torna `undefined`, e il
 * Client semplicemente non propone l'app. Un invito che non si può accettare è
 * peggio di nessun invito.
 */
export async function apkDisponibile(adesso = Date.now()): Promise<AppScaricabile | undefined> {
  if (ricordata !== undefined && adesso - ricordata.quando < VALIDA_MS) return ricordata.app
  // Si ricorda solo una risposta vera — anche «non c'è nessun APK». Un errore
  // di rete no: memorizzarlo terrebbe il Client a bocca asciutta per sei ore
  // anche a rete tornata. Meglio riprovare alla prossima apertura.
  const dalFile = await scarica(FILE_APP, 'application/json').then(leggiAppAndroidJson).catch(() => undefined)
  if (dalFile !== undefined) {
    ricordata = { quando: adesso, app: dalFile }
    return dalFile
  }
  try {
    const app = leggiApkDalRelease(
      await scarica('https://api.github.com/repos/niko9090/sierradeck/releases?per_page=20', 'application/vnd.github+json')
    )
    ricordata = { quando: adesso, app }
    return app
  } catch {
    return undefined
  }
}

/**
 * `app-android.json`: `{ "versione": "2.26.0", "apk": "https://…/SierraDeck-2.26.0.apk" }`.
 *
 * Lo scrive `npm run app-android-json` a ogni pubblicazione. Si accetta solo
 * un APK che sta dove deve: e' quello che il telefono installera'.
 */
export function leggiAppAndroidJson(json: string): AppScaricabile | undefined {
  try {
    const letto = JSON.parse(json) as { versione?: unknown; apk?: unknown }
    if (typeof letto.versione !== 'string' || typeof letto.apk !== 'string') return undefined
    if (!/^\d+\.\d+\.\d+$/.test(letto.versione) || !letto.apk.startsWith(ORIGINE_APK)) return undefined
    return { versione: letto.versione, url: letto.apk }
  } catch {
    return undefined
  }
}

/** Un GET che segue i rimandi (GitHub serve gli allegati dietro un 302) e pretende un 200. */
function scarica(indirizzo: string, accetta: string, salti = 4): Promise<string> {
  return new Promise((risolvi, rifiuta) => {
    const richiesta = get(
      indirizzo,
      { headers: { 'User-Agent': 'SierraDeck', Accept: accetta }, timeout: 10_000 },
      (risposta) => {
        const codice = risposta.statusCode ?? 0
        const dove = risposta.headers.location
        if (codice >= 301 && codice <= 308 && dove !== undefined) {
          risposta.resume()
          if (salti <= 0) { rifiuta(new Error('troppi rimandi')); return }
          scarica(new URL(dove, indirizzo).toString(), accetta, salti - 1).then(risolvi, rifiuta)
          return
        }
        if (codice !== 200) { risposta.resume(); rifiuta(new Error(`ha risposto ${codice}`)); return }
        let corpo = ''
        risposta.on('data', (c) => { corpo += c })
        risposta.on('end', () => risolvi(corpo))
      }
    )
    richiesta.on('timeout', () => { richiesta.destroy(); rifiuta(new Error('timeout')) })
    richiesta.on('error', rifiuta)
  })
}
