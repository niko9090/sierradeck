import { describe, it, expect, afterEach, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { leggiSegreto, scriviSegreto, cifraLeCopie, eCifrato, SEGNO_CIFRATO, type Portachiavi } from '../../src/main/segreti-su-file'
import { apriContoDrive, FILE_TOKEN_DRIVE } from '../../src/main/cassaforte/conto-drive'
import { archivioSessione, FILE_ACCESSO_SUPABASE } from '../../src/main/accesso-supabase'
import { daCopiare, mettiAlSicuroLoStato, CARTELLA_COPIE } from '../../src/main/copie-di-versione'

/**
 * Audit I5 (0.86.2): i token del Drive e di Supabase erano JSON in chiaro, e
 * ogni copia di versione ne faceva un'altra copia. Adesso si cifrano con il
 * portachiavi del sistema (qui una finta reversibile), si migrano alla prima
 * lettura, e le copie di versione non li copiano più.
 */
function portachiaviFinto(disponibile = true): Portachiavi & { usi: number } {
  const p = {
    usi: 0,
    disponibile: () => disponibile,
    cifra: (c: string) => { p.usi += 1; return Buffer.from(`finto:${c}`, 'utf8').toString('base64') },
    decifra: (c: string) => {
      const t = Buffer.from(c, 'base64').toString('utf8')
      if (!t.startsWith('finto:')) throw new Error('non è mio')
      return t.slice('finto:'.length)
    }
  }
  return p
}

const TOKEN = { accessToken: 'accesso-di-prova', refreshToken: 'rinnovo-di-prova', scadeIl: Date.now() + 3_600_000 }

function cartella(): string {
  const d = mkdtempSync(join(tmpdir(), 'token-cifrati-'))
  writeFileSync(join(d, 'google-oauth.json'), JSON.stringify({ clientId: 'cid', clientSecret: 'sec' }))
  return d
}

afterEach(() => { vi.unstubAllGlobals() })

describe('segreti su file', () => {
  it('si scrivono cifrati e si rileggono; nel file non c è il testo in chiaro', () => {
    const d = cartella()
    const f = join(d, 'segreto.json')
    const p = portachiaviFinto()
    scriviSegreto(f, '{"a":"segretissimo"}', p, 'prova')
    const sulDisco = readFileSync(f, 'utf8')
    expect(sulDisco).not.toContain('segretissimo')
    expect(JSON.parse(sulDisco)[SEGNO_CIFRATO]).toBe(1)
    expect(leggiSegreto(f, p, 'prova')).toBe('{"a":"segretissimo"}')
  })

  it('senza portachiavi si fa come prima: in chiaro; un file cifrato senza portachiavi non si legge', () => {
    const d = cartella()
    const f = join(d, 'segreto.json')
    scriviSegreto(f, 'chiaro', portachiaviFinto(false), 'prova')
    expect(readFileSync(f, 'utf8')).toBe('chiaro')
    expect(leggiSegreto(f, undefined, 'prova')).toBe('chiaro')
    scriviSegreto(f, 'chiaro', portachiaviFinto(), 'prova')
    expect(leggiSegreto(f, undefined, 'prova')).toBeUndefined()
    expect(leggiSegreto(f, portachiaviFinto(false), 'prova')).toBeUndefined()
  })

  it('un file in chiaro di prima si migra alla prima lettura, tenendo la data', () => {
    const d = cartella()
    const f = join(d, 'vecchio.json')
    writeFileSync(f, '{"x":1}')
    const t = new Date('2026-10-01T10:00:00Z')
    utimesSync(f, t, t)
    expect(leggiSegreto(f, portachiaviFinto(), 'prova')).toBe('{"x":1}')
    expect(eCifrato(f)).toBe(true)
    expect(statSync(f).mtime.toISOString()).toBe(t.toISOString())
    expect(leggiSegreto(f, portachiaviFinto(), 'prova')).toBe('{"x":1}')
  })

  it('le copie di versione si cifrano sul posto, senza cancellarle', () => {
    const d = cartella()
    for (const v of ['0.84.0-a', '0.85.0-b', '0.86.0-c']) {
      mkdirSync(join(d, CARTELLA_COPIE, v), { recursive: true })
      writeFileSync(join(d, CARTELLA_COPIE, v, FILE_TOKEN_DRIVE), JSON.stringify(TOKEN))
    }
    expect(cifraLeCopie(d, CARTELLA_COPIE, FILE_TOKEN_DRIVE, portachiaviFinto(), 'prova')).toBe(3)
    for (const v of ['0.84.0-a', '0.85.0-b', '0.86.0-c']) {
      const f = join(d, CARTELLA_COPIE, v, FILE_TOKEN_DRIVE)
      expect(existsSync(f)).toBe(true)
      expect(readFileSync(f, 'utf8')).not.toContain('rinnovo-di-prova')
    }
    expect(cifraLeCopie(d, CARTELLA_COPIE, FILE_TOKEN_DRIVE, undefined, 'prova')).toBe(0)
  })
})

describe('il token del Drive', () => {
  it('quello in chiaro di prima si legge, e alla prima lettura diventa cifrato (con le copie)', () => {
    const d = cartella()
    writeFileSync(join(d, FILE_TOKEN_DRIVE), JSON.stringify(TOKEN))
    mkdirSync(join(d, CARTELLA_COPIE, '0.85.0-x'), { recursive: true })
    writeFileSync(join(d, CARTELLA_COPIE, '0.85.0-x', FILE_TOKEN_DRIVE), JSON.stringify(TOKEN))
    const conto = apriContoDrive(d, portachiaviFinto())
    expect(conto.stato().connesso).toBe(true)
    expect(readFileSync(join(d, FILE_TOKEN_DRIVE), 'utf8')).not.toContain('rinnovo-di-prova')
    expect(readFileSync(join(d, CARTELLA_COPIE, '0.85.0-x', FILE_TOKEN_DRIVE), 'utf8')).not.toContain('rinnovo-di-prova')
    // Un altro avvio, stesso portachiavi: ancora collegato.
    expect(apriContoDrive(d, portachiaviFinto()).stato().connesso).toBe(true)
  })

  it('il rinnovo di prova legge anche le copie cifrate', async () => {
    const d = cartella()
    writeFileSync(join(d, 'drive-scollegato.json'), JSON.stringify({ quando: '2026-10-09T11:19:48.877Z', motivo: 'revocata' }))
    const f = join(d, CARTELLA_COPIE, '0.56.0-b', FILE_TOKEN_DRIVE)
    mkdirSync(join(d, CARTELLA_COPIE, '0.56.0-b'), { recursive: true })
    scriviSegreto(f, JSON.stringify({ accessToken: 'a', refreshToken: 'giusto', scadeIl: 0 }), portachiaviFinto(), 'prova')
    const t = new Date('2026-10-09T09:29:00Z')
    utimesSync(f, t, t)
    const corpi: string[] = []
    vi.stubGlobal('fetch', (async (_u: string | URL, init?: RequestInit) => {
      corpi.push(String(init?.body ?? ''))
      return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })
    }) as typeof fetch)
    expect(await apriContoDrive(d, portachiaviFinto()).riprovaRevocata()).toBe('revocata')
    expect(corpi[0]).toContain('refresh_token=giusto')
  })

  it('senza portachiavi resta come prima', () => {
    const d = cartella()
    writeFileSync(join(d, FILE_TOKEN_DRIVE), JSON.stringify(TOKEN))
    expect(apriContoDrive(d, portachiaviFinto(false)).stato().connesso).toBe(true)
    expect(JSON.parse(readFileSync(join(d, FILE_TOKEN_DRIVE), 'utf8'))).toEqual(TOKEN)
  })
})

describe('la sessione di Supabase', () => {
  it('si scrive cifrata, si rilegge, e quella in chiaro di prima si migra', () => {
    const d = cartella()
    writeFileSync(join(d, FILE_ACCESSO_SUPABASE), JSON.stringify({ 'sb-chiave': 'sessione-di-prova' }))
    const archivio = archivioSessione(d, portachiaviFinto())
    expect(archivio.getItem('sb-chiave')).toBe('sessione-di-prova')
    expect(readFileSync(join(d, FILE_ACCESSO_SUPABASE), 'utf8')).not.toContain('sessione-di-prova')
    archivio.setItem('altra', 'valore-nuovo')
    expect(readFileSync(join(d, FILE_ACCESSO_SUPABASE), 'utf8')).not.toContain('valore-nuovo')
    expect(archivioSessione(d, portachiaviFinto()).getItem('altra')).toBe('valore-nuovo')
    archivio.removeItem('altra')
    expect(archivio.getItem('altra')).toBeNull()
  })
})

describe('le copie di versione non copiano i token', () => {
  it('fuori google-drive-token.json, il rifiutato e accesso-supabase.json; il resto si copia', () => {
    const d = cartella()
    for (const n of [FILE_TOKEN_DRIVE, 'google-drive-token.rifiutato.json', FILE_ACCESSO_SUPABASE, 'workspace.json']) writeFileSync(join(d, n), '{}')
    expect(daCopiare(d)).toEqual(['google-oauth.json', 'workspace.json'])
    const esito = mettiAlSicuroLoStato(d, '9.9.9', new Date('2026-10-30T08:00:00Z'))
    expect(esito.fatta).toBe(true)
    const copia = join(d, CARTELLA_COPIE, esito.cartella as string)
    expect(existsSync(join(copia, 'workspace.json'))).toBe(true)
    expect(existsSync(join(copia, FILE_TOKEN_DRIVE))).toBe(false)
    expect(existsSync(join(copia, FILE_ACCESSO_SUPABASE))).toBe(false)
  })
})
