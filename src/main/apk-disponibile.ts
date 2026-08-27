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
  try {
    // Si ricorda solo una risposta vera — anche «non c'è nessun APK». Un errore
    // di rete no: memorizzarlo terrebbe il Client a bocca asciutta per sei ore
    // anche a rete tornata. Meglio riprovare alla prossima apertura.
    const app = await chiedi()
    ricordata = { quando: adesso, app }
    return app
  } catch {
    return undefined
  }
}

function chiedi(): Promise<AppScaricabile | undefined> {
  return new Promise((risolvi, rifiuta) => {
    const richiesta = get(
      'https://api.github.com/repos/niko9090/sierradeck/releases?per_page=20',
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
