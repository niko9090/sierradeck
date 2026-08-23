import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

/**
 * L'accesso a Google Drive, con il flusso OAuth giusto per un'**app installata**.
 *
 * Non c'è un server nostro a fare da intermediario (sarebbe contro tutto il senso
 * del BYOS): il programma parla direttamente con Google. Si usa il flusso
 * «loopback» con **PKCE**, quello che Google raccomanda per le app desktop:
 *
 *  1. si apre un mini server su `127.0.0.1` su una porta libera;
 *  2. si manda l'utente sul browser di sistema a dare il consenso;
 *  3. Google rimanda il browser su `http://127.0.0.1:<porta>?code=...`;
 *  4. il mini server prende il `code`, lo scambia con i token, e si spegne.
 *
 * PKCE (un segreto usa-e-getta per scambio) fa sì che intercettare il `code` non
 * basti: senza il `code_verifier` non si ottengono token. Per questo il
 * `client_secret` di un client «Desktop» non è un segreto vero e può stare
 * nell'app, come la chiave anon di Supabase.
 *
 * Lo **scope è il più piccolo possibile**: `drive.appdata`. Tocchiamo solo la
 * cartella privata dell'app nel Drive, mai i file dell'utente.
 *
 * Le parti con la rete (`fetch`) e con il browser (`apriBrowser`) sono iniettabili
 * per poter provare tutta la logica — URL, scambio, rinnovo, cache — senza rete e
 * senza aprire davvero un browser.
 */

const AUTORIZZA = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN = 'https://oauth2.googleapis.com/token'
export const SCOPE_DRIVE = 'https://www.googleapis.com/auth/drive.appdata'

/** Margine prima della scadenza: si rinnova un minuto prima, non all'ultimo istante. */
const MARGINE_MS = 60_000

type Fetch = typeof globalThis.fetch

export type ConfigOAuth = { clientId: string; clientSecret: string }

/** I token, come li teniamo noi. `scadeIl` è epoch in ms. */
export type Gettoni = {
  accessToken: string
  /** C'è solo dopo il primo consenso (`access_type=offline`); il rinnovo lo conserva. */
  refreshToken?: string
  scadeIl: number
}

function base64url(b: Buffer): string {
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Il segreto usa-e-getta di PKCE: un verifier casuale e la sua impronta SHA-256. */
export function creaPkce(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

/** L'URL a cui mandare l'utente per il consenso. Puro: si verifica pezzo per pezzo. */
export function componiUrlAutorizzazione(
  config: ConfigOAuth,
  redirectUri: string,
  challenge: string,
  state: string
): string {
  const p = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE_DRIVE,
    // `offline` + `consent` sono ciò che ci fa avere il **refresh token**: senza,
    // Google lo dà solo la primissima volta e mai più, e al secondo accesso
    // resteremmo senza modo di rinnovare.
    access_type: 'offline',
    prompt: 'consent',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state
  })
  return `${AUTORIZZA}?${p.toString()}`
}

type RispostaToken = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

function gettoniDa(j: RispostaToken, adesso: number, refreshPrecedente?: string): Gettoni {
  if (j.access_token === undefined) {
    throw new Error(`Google OAuth: risposta senza access_token${j.error !== undefined ? ` (${j.error})` : ''}`)
  }
  const scadeIl = adesso + (j.expires_in ?? 3600) * 1000
  const refreshToken = j.refresh_token ?? refreshPrecedente
  return { accessToken: j.access_token, scadeIl, ...(refreshToken !== undefined ? { refreshToken } : {}) }
}

/** Scambia il `code` del consenso con i token. Testabile con un `fetch` finto. */
export async function scambiaCodice(deps: {
  config: ConfigOAuth
  redirectUri: string
  code: string
  verifier: string
  fetch?: Fetch
  adesso?: () => number
}): Promise<Gettoni> {
  const f = deps.fetch ?? fetch
  const r = await f(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: deps.config.clientId,
      client_secret: deps.config.clientSecret,
      code: deps.code,
      code_verifier: deps.verifier,
      grant_type: 'authorization_code',
      redirect_uri: deps.redirectUri
    }).toString()
  })
  const j = (await r.json()) as RispostaToken
  if (!r.ok) throw new Error(`Google OAuth: scambio codice fallito (${r.status}) ${j.error ?? ''}`)
  return gettoniDa(j, (deps.adesso ?? Date.now)())
}

/** Rinnova l'access token dal refresh token. Il refresh token resta valido e si conserva. */
export async function rinnova(deps: {
  config: ConfigOAuth
  refreshToken: string
  fetch?: Fetch
  adesso?: () => number
}): Promise<Gettoni> {
  const f = deps.fetch ?? fetch
  const r = await f(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: deps.config.clientId,
      client_secret: deps.config.clientSecret,
      refresh_token: deps.refreshToken,
      grant_type: 'refresh_token'
    }).toString()
  })
  const j = (await r.json()) as RispostaToken
  if (!r.ok) throw new Error(`Google OAuth: rinnovo fallito (${r.status}) ${j.error ?? ''}`)
  return gettoniDa(j, (deps.adesso ?? Date.now)(), deps.refreshToken)
}

/**
 * Un fornitore di access token per `creaMagazzinoDrive`: restituisce quello in
 * cache finché è valido, lo rinnova quando manca poco. Persiste i token tramite
 * `store` (di solito un file in userData), così la connessione sopravvive alla
 * chiusura del programma.
 */
export function creaFornitoreToken(deps: {
  config: ConfigOAuth
  leggi: () => Gettoni | undefined
  scrivi: (g: Gettoni) => void
  fetch?: Fetch
  adesso?: () => number
}): () => Promise<string> {
  const adesso = deps.adesso ?? Date.now
  return async () => {
    const g = deps.leggi()
    if (g === undefined) throw new Error('Google Drive non connesso: manca l’autorizzazione')
    if (g.scadeIl - adesso() > MARGINE_MS) return g.accessToken
    if (g.refreshToken === undefined) {
      throw new Error('token scaduto e nessun refresh token: riconnetti Google Drive')
    }
    const nuovi = await rinnova({
      config: deps.config,
      refreshToken: g.refreshToken,
      ...(deps.fetch !== undefined ? { fetch: deps.fetch } : {}),
      adesso
    })
    deps.scrivi(nuovi)
    return nuovi.accessToken
  }
}

/**
 * Il flusso completo di consenso: apre il mini server, manda al browser, aspetta
 * il `code`, lo scambia. Restituisce i token da salvare.
 *
 * `apriBrowser` è iniettabile (nel programma vero è `shell.openExternal`): così
 * questo modulo non dipende da Electron e resta provabile. Il server si spegne da
 * solo appena preso il codice, o allo scadere di `timeoutMs`.
 */
export function connetti(deps: {
  config: ConfigOAuth
  apriBrowser: (url: string) => void
  fetch?: Fetch
  timeoutMs?: number
}): Promise<Gettoni> {
  const { verifier, challenge } = creaPkce()
  const state = base64url(randomBytes(16))
  return new Promise<Gettoni>((risolvi, rifiuta) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      // Il browser chiede anche /favicon.ico e simili: rispondi solo alla rotta col codice.
      if (!url.searchParams.has('code') && !url.searchParams.has('error')) {
        res.writeHead(204).end()
        return
      }
      const pagina = (msg: string): void => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(`<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;background:#0b0c0e;color:#e8eaed;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h2>SierraDeck</h2><p>${msg}</p><p style="opacity:.6">Puoi chiudere questa scheda e tornare all’app.</p></div>`)
      }
      const errore = url.searchParams.get('error')
      const code = url.searchParams.get('code')
      const statoRicevuto = url.searchParams.get('state')
      const chiudi = (): void => { server.close() }
      if (errore !== null) {
        pagina('Autorizzazione annullata.')
        chiudi(); rifiuta(new Error(`Google OAuth: consenso negato (${errore})`)); return
      }
      if (statoRicevuto !== state) {
        pagina('Richiesta non valida.')
        chiudi(); rifiuta(new Error('Google OAuth: state non combacia (possibile richiesta falsa)')); return
      }
      if (code === null) {
        pagina('Richiesta senza codice.')
        chiudi(); rifiuta(new Error('Google OAuth: redirect senza code')); return
      }
      const port = (server.address() as AddressInfo).port
      const redirectUri = `http://127.0.0.1:${port}`
      scambiaCodice({
        config: deps.config, redirectUri, code, verifier,
        ...(deps.fetch !== undefined ? { fetch: deps.fetch } : {})
      })
        .then((g) => { pagina('Google Drive collegato ✓'); chiudi(); risolvi(g) })
        .catch((e: unknown) => { pagina('Errore nello scambio del codice.'); chiudi(); rifiuta(e) })
    })

    server.on('error', rifiuta)
    // Porta 0 = una libera qualsiasi; solo su loopback, mai esposto in rete.
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port
      const redirectUri = `http://127.0.0.1:${port}`
      deps.apriBrowser(componiUrlAutorizzazione(deps.config, redirectUri, challenge, state))
    })

    const timeout = setTimeout(() => {
      server.close()
      rifiuta(new Error('Google OAuth: nessuna risposta entro il tempo previsto'))
    }, deps.timeoutMs ?? 5 * 60_000)
    // Non tenere vivo il processo solo per questo timer.
    timeout.unref?.()
    server.on('close', () => clearTimeout(timeout))
  })
}
