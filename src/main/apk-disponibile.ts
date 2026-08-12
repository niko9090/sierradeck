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

let ricordata: { quando: number; app: AppScaricabile | undefined } | undefined

export function leggiApkDalRelease(json: string): AppScaricabile | undefined {
  try {
    const release = JSON.parse(json) as { assets?: { name?: string; browser_download_url?: string }[] }
    for (const allegato of release.assets ?? []) {
      const trovata = VERSIONE_NEL_NOME.exec(allegato.name ?? '')
      if (trovata?.[1] === undefined || allegato.browser_download_url === undefined) continue
      return { versione: trovata[1], url: allegato.browser_download_url }
    }
    return undefined
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
  const app = await chiedi().catch(() => undefined)
  ricordata = { quando: adesso, app }
  return app
}

function chiedi(): Promise<AppScaricabile | undefined> {
  return new Promise((risolvi, rifiuta) => {
    const richiesta = get(
      'https://api.github.com/repos/niko9090/sierradeck/releases/latest',
      { headers: { 'User-Agent': 'SierraDeck', Accept: 'application/vnd.github+json' }, timeout: 10_000 },
      (risposta) => {
        let corpo = ''
        risposta.on('data', (c) => { corpo += c })
        risposta.on('end', () => risolvi(leggiApkDalRelease(corpo)))
      }
    )
    richiesta.on('timeout', () => { richiesta.destroy(); rifiuta(new Error('timeout')) })
    richiesta.on('error', rifiuta)
  })
}
