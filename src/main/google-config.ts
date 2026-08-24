import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ConfigOAuth } from './cassaforte/oauth-google'

/**
 * Le credenziali del client OAuth «Desktop» di SierraDeck — cioè quelle
 * dell'**app**, non di un utente: alimentano il pulsante «Connetti Google Drive»
 * di chiunque, e ognuno concede accesso solo al proprio Drive.
 *
 * NON stanno nel repo, per due motivi: GitHub bloccherebbe il push riconoscendo
 * il pattern del `client_secret`, e comunque è roba da non pubblicare. Si leggono
 * a runtime, in quest'ordine:
 *   1. variabili d'ambiente `SD_GOOGLE_CLIENT_ID` / `SD_GOOGLE_CLIENT_SECRET`;
 *   2. un file `google-oauth.json` nella cartella dati (userData), non versionato.
 *
 * Per un client «Desktop» il secret è pensato per stare nel client (PKCE
 * protegge lo scambio), quindi va bene averlo sulla macchina. Per la
 * **distribuzione** futura andrà iniettato nel build (env in fase di
 * compilazione); finché è uno solo, il file locale basta. Se manca, il Drive
 * semplicemente non è configurato e l'app lo dice, senza rompersi.
 */
export function configGoogle(dati: string): ConfigOAuth | undefined {
  const idEnv = process.env.SD_GOOGLE_CLIENT_ID
  const segretoEnv = process.env.SD_GOOGLE_CLIENT_SECRET
  if (idEnv !== undefined && idEnv !== '' && segretoEnv !== undefined && segretoEnv !== '') {
    return { clientId: idEnv, clientSecret: segretoEnv }
  }
  const file = join(dati, 'google-oauth.json')
  if (existsSync(file)) {
    try {
      const j = JSON.parse(readFileSync(file, 'utf8')) as { clientId?: unknown; clientSecret?: unknown }
      if (typeof j.clientId === 'string' && typeof j.clientSecret === 'string') {
        return { clientId: j.clientId, clientSecret: j.clientSecret }
      }
    } catch (err) {
      console.error('[drive] google-oauth.json illeggibile:', err)
    }
  }
  return undefined
}
