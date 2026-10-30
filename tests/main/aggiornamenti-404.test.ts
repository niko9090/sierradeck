import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { leggiErroreAggiornamento } from '../../src/main/aggiornamenti'

/**
 * Audit I7 (0.86.2): con `releaseType: release` il rilascio diventava pubblico
 * prima che i file fossero caricati, e i PC prendevano 404 su latest.yml (49
 * nel registro del 29/10), scritti due volte ciascuno con tutte le
 * intestazioni HTTP e mostrati come errore.
 */
const errore404 = (): Error => {
  const e = new Error(
    'Cannot find latest.yml in the latest release artifacts (https://github.com/esempio/prova/releases/download/v9.9.9/latest.yml): HttpError: 404 \n' +
    '"method: GET url: https://github.com/esempio/prova/releases/download/v9.9.9/latest.yml"\n' +
    '\nHeaders: {\n  "server": "github.com",\n  "x-github-request-id": "ABCD:1234",\n  "set-cookie": "x=y"\n}'
  )
  ;(e as Error & { code: string }).code = 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND'
  return e
}

describe('leggiErroreAggiornamento', () => {
  it('il 404 su latest.yml e "nessun aggiornamento per ora", in una riga senza intestazioni', () => {
    const { manca, breve } = leggiErroreAggiornamento(errore404())
    expect(manca).toBe(true)
    expect(breve).toContain('Cannot find latest.yml')
    expect(breve).not.toMatch(/Headers|x-github-request-id|set-cookie/)
    expect(breve).not.toContain('\n')
  })

  it('lo riconosce anche come testo (l eco del registro di electron-updater)', () => {
    expect(leggiErroreAggiornamento(`Error: ${errore404().message}`).manca).toBe(true)
  })

  it('un altro errore resta un errore, ma breve', () => {
    const e = new Error(`net::ERR_INTERNET_DISCONNECTED\n    at qualcosa (file.js:1:1)\nHeaders: {"a":"b"}`)
    const r = leggiErroreAggiornamento(e)
    expect(r.manca).toBe(false)
    expect(r.breve).toBe('net::ERR_INTERNET_DISCONNECTED')
    const lungo = leggiErroreAggiornamento(new Error('x'.repeat(1000)))
    expect(lungo.breve.length).toBeLessThanOrEqual(300)
  })

  it('un 500 su latest.yml non e "manca": e un guasto vero', () => {
    expect(leggiErroreAggiornamento(new Error('Cannot find latest.yml in the latest release artifacts (u): HttpError: 500 \nHeaders: {}')).manca).toBe(false)
  })
})

describe('electron-builder.yml', () => {
  it('pubblica in bozza: il rilascio si rende pubblico a mano, a file caricati', () => {
    const yml = readFileSync('electron-builder.yml', 'utf8')
    expect(yml).toMatch(/^\s*releaseType:\s*draft\s*$/m)
    expect(yml).not.toMatch(/^\s*releaseType:\s*release\s*$/m)
  })

  it('nessuno script conta su un rilascio gia pubblico alla creazione', () => {
    for (const f of ['scripts/allega-apk.mjs', 'scripts/ripara-release.mjs']) {
      const s = readFileSync(f, 'utf8')
      expect(s).not.toMatch(/releaseType|--draft=true|gh', \['release', 'create'/)
    }
  })
})
