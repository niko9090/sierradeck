import { describe, it, expect, afterEach, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apriContoDrive, FILE_SCOLLEGATO } from '../../src/main/cassaforte/conto-drive'
import { creaFornitoreToken } from '../../src/main/cassaforte/oauth-google'
import { avvisoDriveScollegato } from '@shared/scoperta-pc'

// 0.56.4: il supervisore chiedeva se il «revocata» delle 11:19 del 09/10 fosse
// un falso del vecchio difetto del rinnovo. Non lo era: un rinnovo di prova con
// il refresh token della copia di stato delle 10:09 ha avuto «invalid_grant —
// Token has been expired or revoked». Il collegamento era del 02/10 alle 10:20,
// il primo 401 del 09/10 alle 10:20: sette giorni esatti, il limite di Google
// per le app OAuth «in prova». Da qui: il token rifiutato si mette da parte, si
// fa un rinnovo di prova prima di chiedere di ricollegare, e l'avviso dice dei
// sette giorni quando è quello.

function cartella(): string {
  const d = mkdtempSync(join(tmpdir(), 'conto-drive-'))
  writeFileSync(join(d, 'google-oauth.json'), JSON.stringify({ clientId: 'cid', clientSecret: 'sec' }))
  return d
}

function google(risposta: 'ok' | 'invalid_grant') {
  const chiamate: string[] = []
  vi.stubGlobal('fetch', (async (url: string | URL) => {
    chiamate.push(String(url))
    return risposta === 'ok'
      ? new Response(JSON.stringify({ access_token: 'nuovo', expires_in: 3600 }), { status: 200 })
      : new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }), { status: 400 })
  }) as typeof fetch)
  return chiamate
}

afterEach(() => { vi.unstubAllGlobals() })

describe('il rifiuto di Google: messo da parte e verificato (0.56.4)', () => {
  it('su invalid_grant il token non si cancella: si mette da parte, con il momento del collegamento', async () => {
    const d = cartella()
    writeFileSync(join(d, 'google-drive-token.json'), JSON.stringify({ accessToken: 'a', refreshToken: 'r', scadeIl: 0, collegatoIl: Date.parse('2026-10-02T10:20:59Z') }))
    google('invalid_grant')
    const conto = apriContoDrive(d)
    await expect(conto.archivio().elenca()).rejects.toThrow(/ricollega/)
    expect(existsSync(join(d, 'google-drive-token.json'))).toBe(false)
    expect(existsSync(join(d, 'google-drive-token.rifiutato.json'))).toBe(true)
    expect(conto.scollegamento()).toMatchObject({ motivo: 'revocata', collegatoIl: '2026-10-02T10:20:59.000Z' })
  })

  it('il rinnovo di prova che riesce: era un falso, il Drive torna collegato da solo', async () => {
    const d = cartella()
    writeFileSync(join(d, 'google-drive-token.rifiutato.json'), JSON.stringify({ accessToken: 'a', refreshToken: 'r', scadeIl: 0, email: 'esempio@example.com' }))
    writeFileSync(join(d, FILE_SCOLLEGATO), JSON.stringify({ quando: '2026-10-09T11:19:48.877Z', motivo: 'revocata' }))
    google('ok')
    const conto = apriContoDrive(d)
    expect(await conto.riprovaRevocata()).toBe('tornato')
    expect(conto.stato().connesso).toBe(true)
    expect(conto.stato().email).toBe('esempio@example.com')
    expect(conto.scollegamento()).toBeUndefined()
  })

  it('il rinnovo di prova che conferma: segnato «verificata», e non si riprova più', async () => {
    const d = cartella()
    writeFileSync(join(d, 'google-drive-token.rifiutato.json'), JSON.stringify({ accessToken: 'a', refreshToken: 'r', scadeIl: 0 }))
    writeFileSync(join(d, FILE_SCOLLEGATO), JSON.stringify({ quando: '2026-10-09T11:19:48.877Z', motivo: 'revocata' }))
    const chiamate = google('invalid_grant')
    const conto = apriContoDrive(d)
    expect(await conto.riprovaRevocata()).toBe('revocata')
    expect(conto.scollegamento()).toEqual({ quando: '2026-10-09T11:19:48.877Z', motivo: 'revocata', verificata: true })
    expect(existsSync(join(d, 'google-drive-token.rifiutato.json'))).toBe(false)
    expect(await conto.riprovaRevocata()).toBe('non-so')
    expect(chiamate).toHaveLength(1)
  })

  it('per gli scollegamenti di prima: prova il token dell ultima copia di stato fatta prima', async () => {
    const d = cartella()
    writeFileSync(join(d, FILE_SCOLLEGATO), JSON.stringify({ quando: '2026-10-09T11:19:48.877Z', motivo: 'revocata' }))
    const copia = (nome: string, quando: string, refresh: string): void => {
      mkdirSync(join(d, 'copie-di-versione', nome), { recursive: true })
      const f = join(d, 'copie-di-versione', nome, 'google-drive-token.json')
      writeFileSync(f, JSON.stringify({ accessToken: 'a', refreshToken: refresh, scadeIl: 0 }))
      const t = new Date(quando)
      utimesSync(f, t, t)
    }
    copia('0.55.0-a', '2026-10-09T08:30:00Z', 'vecchio')
    copia('0.56.0-b', '2026-10-09T09:29:00Z', 'giusto')
    copia('0.56.1-c', '2026-10-09T12:17:00Z', 'dopo')
    const corpi: string[] = []
    vi.stubGlobal('fetch', (async (_u: string | URL, init?: RequestInit) => {
      corpi.push(String(init?.body ?? ''))
      return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })
    }) as typeof fetch)
    expect(await apriContoDrive(d).riprovaRevocata()).toBe('revocata')
    expect(corpi[0]).toContain('refresh_token=giusto')
  })

  it('senza un token da provare: «niente», e non ci si riprova a ogni avvio', async () => {
    const d = cartella()
    writeFileSync(join(d, FILE_SCOLLEGATO), JSON.stringify({ quando: '2026-10-09T11:19:48.877Z', motivo: 'revocata' }))
    const conto = apriContoDrive(d)
    expect(await conto.riprovaRevocata()).toBe('niente')
    expect(JSON.parse(readFileSync(join(d, FILE_SCOLLEGATO), 'utf8')).verificata).toBe(true)
  })

  it('il rinnovo conserva il momento del collegamento', async () => {
    let salvato: any = { accessToken: 'a', refreshToken: 'r', scadeIl: 0, collegatoIl: 123 }
    const f = (async () => new Response(JSON.stringify({ access_token: 'b', expires_in: 3600 }), { status: 200 })) as unknown as typeof fetch
    const t = creaFornitoreToken({ config: { clientId: 'c', clientSecret: 's' }, leggi: () => salvato, scrivi: (g) => { salvato = g }, fetch: f, adesso: () => 1_000_000 })
    expect(await t()).toBe('b')
    expect(salvato.collegatoIl).toBe(123)
  })
})

describe('l avviso dice dei sette giorni quando è quello', () => {
  it('sette giorni esatti dal collegamento: app OAuth in prova, e cosa fare', () => {
    const a = avvisoDriveScollegato({
      configurato: true, connesso: false,
      dal: { quando: '2026-10-09T10:20:47.000Z', motivo: 'revocata', collegatoIl: '2026-10-02T10:20:59.000Z' },
      adesso: Date.parse('2026-10-09T13:00:00Z')
    })
    expect(a?.testo).toContain('sette giorni esatti')
    expect(a?.testo).toContain('In produzione')
  })
  it('altrimenti, la spiegazione generale', () => {
    const a = avvisoDriveScollegato({
      configurato: true, connesso: false,
      dal: { quando: '2026-10-09T10:20:47.000Z', motivo: 'revocata', collegatoIl: '2026-10-05T10:20:59.000Z' },
      adesso: Date.parse('2026-10-09T13:00:00Z')
    })
    expect(a?.testo).not.toContain('sette giorni esatti')
    expect(a?.testo).toContain('invalid_grant')
  })
})
