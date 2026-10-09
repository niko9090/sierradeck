import { describe, it, expect } from 'vitest'
import { creaFornitoreToken, AUTORIZZAZIONE_REVOCATA, type ConfigOAuth, type Gettoni } from '../../src/main/cassaforte/oauth-google'
import { conRinnovo, creaArchivioDrive } from '../../src/main/cassaforte/google-drive'

// Caso del 09/10: dalle 10:20 ogni chiamata al Drive rispondeva 401 con un token
// che per il nostro orologio valeva ancora un'ora. Il fornitore rinnovava solo a
// scadenza, quindi si è ritentato per un'ora con lo stesso token rifiutato.

const CONFIG: ConfigOAuth = { clientId: 'cid.apps.googleusercontent.com', clientSecret: 'sec-123' }

/** Google finto: endpoint dei token + Drive che accetta solo l'ultimo token dato. */
function google(opts?: { revocata?: boolean; lentezzaRinnovo?: number }) {
  let valido = 'vecchio'
  let n = 0
  const rinnovi: number[] = []
  const driveChiamate: string[] = []
  const fetch = (async (url: string | URL, init?: RequestInit): Promise<Response> => {
    const u = String(url)
    if (u.includes('oauth2.googleapis.com/token')) {
      rinnovi.push(Date.now())
      if (opts?.lentezzaRinnovo !== undefined) await new Promise((r) => setTimeout(r, opts.lentezzaRinnovo))
      if (opts?.revocata === true) return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })
      n += 1
      valido = `nuovo-${n}`
      return new Response(JSON.stringify({ access_token: valido, expires_in: 3600 }), { status: 200 })
    }
    const auth = new Headers(init?.headers).get('Authorization') ?? ''
    driveChiamate.push(auth)
    if (auth !== `Bearer ${valido}`) return new Response('{"error":{"code":401,"message":"Request had invalid authentication credentials."}}', { status: 401 })
    return new Response(JSON.stringify({ files: [] }), { status: 200 })
  }) as typeof globalThis.fetch
  // Google ha smesso di accettare 'vecchio' anche se non è scaduto.
  const rifiutaVecchio = (): void => { valido = 'altro' }
  return { fetch, rinnovi, driveChiamate, rifiutaVecchio }
}

function fornitore(g: ReturnType<typeof google>, salvato: { g: Gettoni | undefined }, scartato: { si: boolean }) {
  return creaFornitoreToken({
    config: CONFIG,
    leggi: () => salvato.g,
    scrivi: (x) => { salvato.g = x },
    scarta: () => { scartato.si = true; salvato.g = undefined },
    fetch: g.fetch,
    adesso: () => 1_000_000
  })
}

describe('Drive: un 401 con il token non scaduto (0.56.3)', () => {
  it('rinnova subito e ripete la chiamata una volta, senza scollegare', async () => {
    const g = google()
    g.rifiutaVecchio()
    const salvato = { g: { accessToken: 'vecchio', refreshToken: 'rt', scadeIl: 1_000_000 + 3_000_000 } as Gettoni | undefined }
    const scartato = { si: false }
    const token = fornitore(g, salvato, scartato)
    const archivio = creaArchivioDrive({ token, rinnova: token.rinnova, fetch: g.fetch })
    await expect(archivio.elenca()).resolves.toBeDefined()
    expect(g.rinnovi.length).toBe(1)
    expect(g.driveChiamate).toEqual(['Bearer vecchio', 'Bearer nuovo-1'])
    expect(salvato.g?.accessToken).toBe('nuovo-1')
    expect(salvato.g?.refreshToken).toBe('rt')
    expect(scartato.si).toBe(false)
  })

  it('due chiamanti che prendono 401 insieme fanno un rinnovo solo', async () => {
    const g = google({ lentezzaRinnovo: 30 })
    g.rifiutaVecchio()
    const salvato = { g: { accessToken: 'vecchio', refreshToken: 'rt', scadeIl: 4_000_000 } as Gettoni | undefined }
    const token = fornitore(g, salvato, { si: false })
    const f = conRinnovo(g.fetch, token.rinnova)
    const chiama = async (): Promise<number> => (await f('https://www.googleapis.com/drive/v3/files', { headers: { Authorization: `Bearer ${await token()}` } })).status
    expect(await Promise.all([chiama(), chiama(), chiama()])).toEqual([200, 200, 200])
    expect(g.rinnovi.length).toBe(1)
  })

  it('chi arriva dopo un rinnovo già fatto usa il token nuovo senza rinnovare di nuovo', async () => {
    const g = google()
    g.rifiutaVecchio()
    const salvato = { g: { accessToken: 'vecchio', refreshToken: 'rt', scadeIl: 4_000_000 } as Gettoni | undefined }
    const token = fornitore(g, salvato, { si: false })
    expect(await token.rinnova('vecchio')).toBe('nuovo-1')
    // Un secondo 401 ancora con 'vecchio' (partito prima del rinnovo): niente secondo rinnovo.
    expect(await token.rinnova('vecchio')).toBe('nuovo-1')
    expect(g.rinnovi.length).toBe(1)
  })

  it('scollega solo se il rinnovo risponde invalid_grant', async () => {
    const g = google({ revocata: true })
    g.rifiutaVecchio()
    const salvato = { g: { accessToken: 'vecchio', refreshToken: 'rt', scadeIl: 4_000_000 } as Gettoni | undefined }
    const scartato = { si: false }
    const token = fornitore(g, salvato, scartato)
    const archivio = creaArchivioDrive({ token, rinnova: token.rinnova, fetch: g.fetch })
    await expect(archivio.elenca()).rejects.toThrow(AUTORIZZAZIONE_REVOCATA)
    expect(scartato.si).toBe(true)
  })

  it('un 401 che resta 401 dopo il rinnovo non gira in tondo', async () => {
    let chiamate = 0
    const sempre401 = (async () => { chiamate += 1; return new Response('', { status: 401 }) }) as unknown as typeof globalThis.fetch
    let rinnovi = 0
    const f = conRinnovo(sempre401, async () => { rinnovi += 1; return 'x' })
    expect((await f('https://www.googleapis.com/drive/v3/files', { headers: { Authorization: 'Bearer a' } })).status).toBe(401)
    expect(chiamate).toBe(2)
    expect(rinnovi).toBe(1)
  })

  it('senza Authorization (es. caricamento a sessione) il 401 passa com è', async () => {
    let rinnovi = 0
    const f = conRinnovo((async () => new Response('', { status: 401 })) as unknown as typeof globalThis.fetch, async () => { rinnovi += 1; return 'x' })
    expect((await f('https://upload.example/sessione', { method: 'PUT' })).status).toBe(401)
    expect(rinnovi).toBe(0)
  })
})
