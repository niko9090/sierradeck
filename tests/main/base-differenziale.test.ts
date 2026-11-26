import { describe, it, expect } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { gzipSync } from 'node:zlib'
import {
  allineaBaseDifferenziale, cartellaCacheUpdater, confrontaVersioni, lunghezzaDescritta, togliScaricatoSuperato,
  versioneDaNomeInstaller, CARTELLA_IN_ATTESA, INSTALLER_BASE, MAPPA_BASE
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

/** Come lo lascia electron-updater: `pending/<installer>` + `pending/update-info.json`. */
function inAttesa(d: string, versione: string, lunghezza: number): string {
  const dir = join(d, CARTELLA_IN_ATTESA)
  mkdirSync(dir, { recursive: true })
  const nome = `SierraDeck-Setup-${versione}.exe`
  writeFileSync(join(dir, nome), Buffer.alloc(lunghezza))
  writeFileSync(join(dir, 'update-info.json'), JSON.stringify({ fileName: nome, sha512: 'x', isAdminRightsRequired: false }))
  return dir
}

describe('versioni dello scaricato', () => {
  it('legge la versione dal nome dell installer', () => {
    expect(versioneDaNomeInstaller('SierraDeck-Setup-0.121.1.exe')).toBe('0.121.1')
    expect(versioneDaNomeInstaller('SierraDeck-Setup-1.2.3-beta.1.exe')).toBe('1.2.3-beta.1')
    expect(versioneDaNomeInstaller('installer.exe')).toBeUndefined()
  })
  it('confronta per pezzi numerici', () => {
    expect(confrontaVersioni('0.119.2', '0.119.10')).toBeLessThan(0)
    expect(confrontaVersioni('0.120.0', '0.119.9')).toBeGreaterThan(0)
    expect(confrontaVersioni('0.121.1', '0.121.1')).toBe(0)
  })
})

describe('togliScaricatoSuperato', () => {
  it('toglie la versione in attesa uguale o piu vecchia di quella installata', () => {
    for (const v of ['0.121.1', '0.119.2']) {
      const d = cache(300, [300])
      const dir = inAttesa(d, v, 300)
      expect(togliScaricatoSuperato(d, '0.121.1')).toEqual({ esito: 'tolto', versione: v })
      expect(existsSync(dir)).toBe(false)
      expect(existsSync(join(d, INSTALLER_BASE))).toBe(true)
      // La seconda volta non c'è più niente: nessuna riga ripetuta.
      expect(togliScaricatoSuperato(d, '0.121.1')).toEqual({ esito: 'niente' })
    }
  })
  it('lascia la versione piu nuova, pronta da installare', () => {
    const d = cache(300, [300])
    const dir = inAttesa(d, '0.122.0', 305)
    expect(togliScaricatoSuperato(d, '0.121.1')).toEqual({ esito: 'niente' })
    expect(existsSync(join(dir, 'SierraDeck-Setup-0.122.0.exe'))).toBe(true)
  })
  it('senza pending o con update-info.json rotto non tocca niente', () => {
    expect(togliScaricatoSuperato(cache(300), '0.121.1')).toEqual({ esito: 'niente' })
    const d = cache(300)
    mkdirSync(join(d, CARTELLA_IN_ATTESA))
    writeFileSync(join(d, CARTELLA_IN_ATTESA, 'update-info.json'), '{rotto')
    expect(togliScaricatoSuperato(d, '0.121.1')).toEqual({ esito: 'niente' })
    expect(existsSync(join(d, CARTELLA_IN_ATTESA))).toBe(true)
  })
})

describe('la mappa ricopiata dalla versione pronta', () => {
  it('si toglie e si riconosce come quella dello scaricato', () => {
    // 25/11: 0.119.1 installata, 0.119.2 pronta; electron-updater ricopia la sua mappa a ogni ricerca.
    const d = cache(300, [100, 205])
    inAttesa(d, '0.119.2', 305)
    const e = allineaBaseDifferenziale(d)
    expect(e).toMatchObject({ esito: 'tolta', dalloScaricato: true })
    expect(e.esito === 'tolta' && e.perche).toMatch(/0\.119\.2 già scaricata/)
    expect(existsSync(join(d, MAPPA_BASE))).toBe(false)
  })
  it('una mappa di un altra lunghezza non e dello scaricato', () => {
    const d = cache(300, [100, 205])
    inAttesa(d, '0.119.2', 999)
    const e = allineaBaseDifferenziale(d)
    expect(e.esito === 'tolta' && e.dalloScaricato).toBeFalsy()
  })
})
