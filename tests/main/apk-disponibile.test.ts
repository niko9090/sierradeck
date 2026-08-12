import { describe, it, expect } from 'vitest'
import { leggiApkDalRelease } from '../../src/main/apk-disponibile'

describe('leggiApkDalRelease', () => {
  it('trova l APK e la sua versione', () => {
    const json = JSON.stringify({
      tag_name: 'v0.9.0',
      assets: [
        { name: 'SierraDeck-Setup-0.9.0.exe', browser_download_url: 'https://x/exe' },
        { name: 'SierraDeck-1.0.2.apk', browser_download_url: 'https://x/apk' }
      ]
    })
    expect(leggiApkDalRelease(json)).toEqual({ versione: '1.0.2', url: 'https://x/apk' })
  })

  it('la versione viene dal nome del file, non dal tag', () => {
    // L'app ha una vita sua: un APK allegato a «SierraDeck 0.9» puo' essere
    // ancora la stessa versione di prima.
    const json = JSON.stringify({
      tag_name: 'v0.9.0',
      assets: [{ name: 'SierraDeck-1.0.2.apk', browser_download_url: 'https://x/apk' }]
    })
    expect(leggiApkDalRelease(json)?.versione).toBe('1.0.2')
  })

  it('senza APK non inventa niente', () => {
    const json = JSON.stringify({ assets: [{ name: 'note.txt', browser_download_url: 'https://x' }] })
    expect(leggiApkDalRelease(json)).toBeUndefined()
  })

  it('una risposta illeggibile non fa esplodere niente', () => {
    expect(leggiApkDalRelease('non e json')).toBeUndefined()
  })
})
