import { describe, it, expect } from 'vitest'
import {
  componiUrlAutorizzazione, creaPkce, scambiaCodice, rinnova, creaFornitoreToken,
  SCOPE_DRIVE, type ConfigOAuth, type Gettoni
} from '../../src/main/cassaforte/oauth-google'

const CONFIG: ConfigOAuth = { clientId: 'cid.apps.googleusercontent.com', clientSecret: 'sec-123' }

/** Un endpoint token di Google finto: risponde a authorization_code e refresh_token. */
function googleFinto(opts?: { erroreRinnovo?: boolean }) {
  const richieste: Array<Record<string, string>> = []
  let contatore = 0
  const finto = (async (url: string | URL, init?: RequestInit): Promise<Response> => {
    const corpo = Object.fromEntries(new URLSearchParams(String(init?.body ?? '')))
    richieste.push({ url: String(url), ...corpo })
    if (corpo.grant_type === 'authorization_code') {
      contatore += 1
      return new Response(JSON.stringify({
        access_token: `at-${contatore}`, refresh_token: 'rt-1', expires_in: 3600
      }), { status: 200 })
    }
    if (corpo.grant_type === 'refresh_token') {
      if (opts?.erroreRinnovo === true) {
        return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })
      }
      contatore += 1
      // Google di norma NON rimanda il refresh token nel rinnovo: lo conserviamo noi.
      return new Response(JSON.stringify({ access_token: `at-${contatore}`, expires_in: 3600 }), { status: 200 })
    }
    return new Response('boh', { status: 404 })
  }) as typeof globalThis.fetch
  return { fetch: finto, richieste }
}

describe('OAuth Google — URL di autorizzazione', () => {
  it('mette scope minimo, PKCE S256 e offline+consent (per avere il refresh token)', () => {
    const url = new URL(componiUrlAutorizzazione(CONFIG, 'http://127.0.0.1:5000', 'CHAL', 'STATO'))
    const p = url.searchParams
    expect(p.get('client_id')).toBe(CONFIG.clientId)
    expect(p.get('redirect_uri')).toBe('http://127.0.0.1:5000')
    expect(p.get('scope')).toBe(SCOPE_DRIVE)
    expect(p.get('code_challenge')).toBe('CHAL')
    expect(p.get('code_challenge_method')).toBe('S256')
    expect(p.get('access_type')).toBe('offline')
    expect(p.get('prompt')).toBe('consent')
    expect(p.get('state')).toBe('STATO')
  })

  it('il PKCE genera verifier e challenge diversi ogni volta', () => {
    const a = creaPkce()
    const b = creaPkce()
    expect(a.verifier).not.toBe(b.verifier)
    expect(a.challenge).not.toBe(a.verifier)
    expect(a.challenge).not.toBe(b.challenge)
  })
})

describe('OAuth Google — scambio e rinnovo', () => {
  it('scambia il codice e calcola la scadenza dal momento dato', async () => {
    const g = googleFinto()
    const gettoni = await scambiaCodice({
      config: CONFIG, redirectUri: 'http://127.0.0.1:5000', code: 'CODE', verifier: 'VER',
      fetch: g.fetch, adesso: () => 1_000_000
    })
    expect(gettoni.accessToken).toBe('at-1')
    expect(gettoni.refreshToken).toBe('rt-1')
    expect(gettoni.scadeIl).toBe(1_000_000 + 3600 * 1000)
    // Ha mandato code_verifier e grant_type giusti.
    expect(g.richieste[0]?.code_verifier).toBe('VER')
    expect(g.richieste[0]?.grant_type).toBe('authorization_code')
  })

  it('il rinnovo conserva il refresh token anche se Google non lo rimanda', async () => {
    const g = googleFinto()
    const gettoni = await rinnova({
      config: CONFIG, refreshToken: 'rt-1', fetch: g.fetch, adesso: () => 2_000_000
    })
    expect(gettoni.accessToken).toBe('at-1')
    expect(gettoni.refreshToken).toBe('rt-1')
    expect(gettoni.scadeIl).toBe(2_000_000 + 3600 * 1000)
  })
})

describe('OAuth Google — fornitore di token con cache', () => {
  it('restituisce quello in cache finché è valido, senza chiamare la rete', async () => {
    const g = googleFinto()
    let salvato: Gettoni = { accessToken: 'valido', refreshToken: 'rt-1', scadeIl: 10_000_000 }
    const token = creaFornitoreToken({
      config: CONFIG, leggi: () => salvato, scrivi: (x) => { salvato = x },
      fetch: g.fetch, adesso: () => 9_000_000 // manca più di un minuto
    })
    expect(await token()).toBe('valido')
    expect(g.richieste.length).toBe(0)
  })

  it('rinnova e persiste quando manca poco alla scadenza', async () => {
    const g = googleFinto()
    let salvato: Gettoni = { accessToken: 'vecchio', refreshToken: 'rt-1', scadeIl: 9_000_000 }
    const token = creaFornitoreToken({
      config: CONFIG, leggi: () => salvato, scrivi: (x) => { salvato = x },
      fetch: g.fetch, adesso: () => 8_999_999 // scade fra meno del margine
    })
    const at = await token()
    expect(at).toBe('at-1')
    // Ha persistito i nuovi token, conservando il refresh.
    expect(salvato.accessToken).toBe('at-1')
    expect(salvato.refreshToken).toBe('rt-1')
    expect(g.richieste[0]?.grant_type).toBe('refresh_token')
  })

  it('senza autorizzazione salvata, si lamenta chiaramente', async () => {
    const token = creaFornitoreToken({
      config: CONFIG, leggi: () => undefined, scrivi: () => {}, adesso: () => 0
    })
    await expect(token()).rejects.toThrow(/non connesso/)
  })

  it('token scaduto e refresh rifiutato: chiede di riconnettere', async () => {
    const g = googleFinto({ erroreRinnovo: true })
    const salvato: Gettoni = { accessToken: 'x', refreshToken: 'rt-morto', scadeIl: 0 }
    const token = creaFornitoreToken({
      config: CONFIG, leggi: () => salvato, scrivi: () => {}, fetch: g.fetch, adesso: () => 1_000_000
    })
    await expect(token()).rejects.toThrow(/rinnovo fallito/)
  })
})
