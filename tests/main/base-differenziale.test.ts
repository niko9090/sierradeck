import { describe, it, expect } from 'vitest'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { gzipSync } from 'node:zlib'
import {
  allineaBaseDifferenziale, cartellaCacheUpdater, lunghezzaDescritta, INSTALLER_BASE, MAPPA_BASE
} from '../../src/main/base-differenziale'

/**
 * 31/10: ogni aggiornamento riscaricava 110 MB con «sha512 checksum mismatch».
 * `current.blockmap` era la mappa della versione scaricata e non installata,
 * `installer.exe` quello della versione installata: i pezzi montati insieme
 * davano un file sbagliato.
 */
function mappa(sizes: number[]): Buffer {
  return gzipSync(Buffer.from(JSON.stringify({ version: '2', files: [{ name: 'file', offset: 0, checksums: sizes.map((_, i) => `c${i}`), sizes }] })))
}

function cache(installer?: number, sizes?: number[] | Buffer): string {
  const d = mkdtempSync(join(tmpdir(), 'sd-updater-'))
  if (installer !== undefined) writeFileSync(join(d, INSTALLER_BASE), Buffer.alloc(installer))
  if (sizes !== undefined) writeFileSync(join(d, MAPPA_BASE), Buffer.isBuffer(sizes) ? sizes : mappa(sizes))
  return d
}

describe('lunghezzaDescritta', () => {
  it('somma i pezzi della mappa', () => {
    expect(lunghezzaDescritta(mappa([8192, 16384, 100]))).toBe(24676)
  })

  it('una mappa rotta non ha lunghezza', () => {
    expect(lunghezzaDescritta(Buffer.from('non sono gzip'))).toBeUndefined()
    expect(lunghezzaDescritta(gzipSync(Buffer.from('{"files":[{"sizes":["x"]}]}')))).toBeUndefined()
    expect(lunghezzaDescritta(gzipSync(Buffer.from('{"files":[]}')))).toBeUndefined()
  })
})

describe('allineaBaseDifferenziale', () => {
  it('la mappa di installer.exe resta: il differenziale parte da lì', () => {
    const d = cache(300, [100, 200])
    expect(allineaBaseDifferenziale(d)).toEqual({ esito: 'allineata' })
    expect(existsSync(join(d, MAPPA_BASE))).toBe(true)
  })

  it('la mappa di una versione scaricata e non installata si toglie', () => {
    // installer.exe della 0.88.9 (113694501 byte), mappa della 0.88.8 (113689846)
    const d = cache(300, [100, 205])
    const e = allineaBaseDifferenziale(d)
    expect(e.esito).toBe('tolta')
    expect(e.esito === 'tolta' && e.perche).toMatch(/305 byte.*300/)
    expect(existsSync(join(d, MAPPA_BASE))).toBe(false)
    expect(existsSync(join(d, INSTALLER_BASE))).toBe(true)
  })

  it('una mappa illeggibile si toglie: electron-updater ne prende una buona', () => {
    const d = cache(300, Buffer.from('rotta'))
    expect(allineaBaseDifferenziale(d)).toEqual({ esito: 'tolta', perche: 'mappa illeggibile' })
    expect(existsSync(join(d, MAPPA_BASE))).toBe(false)
  })

  it('senza installer.exe o senza mappa non tocca niente', () => {
    const senzaInstaller = cache(undefined, [100])
    expect(allineaBaseDifferenziale(senzaInstaller)).toEqual({ esito: 'senza-installer' })
    expect(existsSync(join(senzaInstaller, MAPPA_BASE))).toBe(true)
    expect(allineaBaseDifferenziale(cache(300))).toEqual({ esito: 'senza-mappa' })
    expect(allineaBaseDifferenziale(join(tmpdir(), 'sd-updater-che-non-esiste'))).toEqual({ esito: 'senza-mappa' })
  })
})

describe('cartellaCacheUpdater', () => {
  it('usa il nome scritto in app-update.yml, sotto LOCALAPPDATA', () => {
    const risorse = mkdtempSync(join(tmpdir(), 'sd-risorse-'))
    writeFileSync(join(risorse, 'app-update.yml'), 'owner: a\r\nrepo: b\r\nprovider: github\r\nupdaterCacheDirName: prova-updater\r\n')
    expect(cartellaCacheUpdater(risorse, 'C:\\Locale')).toBe(join('C:\\Locale', 'prova-updater'))
  })

  it('senza app-update.yml vale il nome di serie', () => {
    const risorse = mkdtempSync(join(tmpdir(), 'sd-risorse-'))
    expect(cartellaCacheUpdater(risorse, 'C:\\Locale')).toBe(join('C:\\Locale', 'sierradeck-updater'))
  })
})
