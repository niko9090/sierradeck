import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  _azzeraCacheAccesso, AVVISO_SCADENZA_MS, conAccessoClaude, DURATA_GETTONE_MS, eErroreAccesso, estraiGettone, fileAccesso,
  gettoneDaUsare, rigaDiAccessoRifiutato, salvaGettone, segnaRifiutato, statoAccesso, VARIABILE_GETTONE, type Dpapi
} from '@shared/accesso-claude'
import { comandoRinnovaAccesso, scriptRinnovaAccesso } from '@shared/rinnova-accesso'

// Un gettone finto, con la forma giusta. Le prove non chiamano mai PowerShell: DPAPI finto.
const GETTONE = `sk-ant-oat01-${'A1b2_C3-d4'.repeat(9)}`
let decifrate = 0
const dpapi: Dpapi = {
  cifra: (t) => Buffer.from(`x:${t}`).toString('base64'),
  decifra: (c) => { decifrate += 1; return Buffer.from(c, 'base64').toString().replace(/^x:/u, '') }
}

let dir: string
let file: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'accesso-')); file = join(dir, 'sotto', 'accesso-claude.json'); decifrate = 0; _azzeraCacheAccesso() })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('accesso a Claude di un anno', () => {
  it('trova il gettone anche spezzato su più righe e con i colori del terminale', () => {
    const uscita = `\x1b[32m✓ Long-lived authentication token created successfully!\x1b[0m\r\nYour OAuth token (valid for 1 year):\r\n${GETTONE.slice(0, 50)}\r\n${GETTONE.slice(50)}\r\nStore this token securely.`
    expect(estraiGettone(uscita)).toBe(GETTONE)
    expect(estraiGettone('nessun gettone qui sk-ant-api03-abc')).toBeUndefined()
  })

  it('riconosce l’errore del 16/11 come errore d’accesso', () => {
    expect(eErroreAccesso('Failed to authenticate: this login reached its time limit and cannot be renewed. Run `claude auth login`')).toBe(true)
    expect(eErroreAccesso('OAuth session expired')).toBe(true)
    expect(eErroreAccesso('You’ve hit your weekly limit · resets 1am')).toBe(false)
  })

  it('senza file: assente, e l’ambiente resta com’era', () => {
    expect(statoAccesso({ file })).toEqual({ stato: 'assente' })
    const r = conAccessoClaude({ A: '1' }, { file, dpapi })
    expect(r).toEqual({ env: { A: '1' }, conGettone: false })
  })

  it('salvato: cifrato sul disco, valido un anno, entra nell’ambiente', () => {
    const adesso = Date.parse('2026-11-16T12:00:00Z')
    salvaGettone(GETTONE, { file, adesso, dpapi })
    expect(readFileSync(file, 'utf8')).not.toContain(GETTONE)
    const s = statoAccesso({ file, adesso })
    expect(s.stato).toBe('valido')
    if (s.stato === 'valido') expect(s.scadeIl).toBe(adesso + DURATA_GETTONE_MS)
    const r = conAccessoClaude({ A: '1' }, { file, adesso, dpapi })
    expect(r.conGettone).toBe(true)
    expect(r.env[VARIABILE_GETTONE]).toBe(GETTONE)
  })

  it('decifra una volta sola finché il file non cambia', () => {
    const adesso = Date.now()
    salvaGettone(GETTONE, { file, adesso, dpapi })
    for (let i = 0; i < 5; i += 1) expect(gettoneDaUsare({ file, adesso, dpapi })).toBe(GETTONE)
    expect(decifrate).toBe(1)
  })

  it('in scadenza (ultime due settimane) si usa ancora; scaduto no', () => {
    const creato = Date.parse('2026-01-01T00:00:00Z')
    salvaGettone(GETTONE, { file, adesso: creato, dpapi })
    const quasi = creato + DURATA_GETTONE_MS - AVVISO_SCADENZA_MS + 1000
    expect(statoAccesso({ file, adesso: quasi }).stato).toBe('in-scadenza')
    expect(conAccessoClaude({}, { file, adesso: quasi, dpapi }).conGettone).toBe(true)
    const dopo = creato + DURATA_GETTONE_MS + 1000
    expect(statoAccesso({ file, adesso: dopo }).stato).toBe('scaduto')
    expect(conAccessoClaude({}, { file, adesso: dopo, dpapi }).conGettone).toBe(false)
  })

  it('rifiutato da Claude: non si usa più, finché non se ne salva uno nuovo', () => {
    salvaGettone(GETTONE, { file, dpapi })
    expect(segnaRifiutato('Failed to authenticate', { file })).toBe(true)
    expect(segnaRifiutato('di nuovo', { file })).toBe(false)
    expect(statoAccesso({ file }).stato).toBe('rifiutato')
    expect(conAccessoClaude({}, { file, dpapi }).conGettone).toBe(false)
    salvaGettone(GETTONE, { file, dpapi })
    expect(statoAccesso({ file }).stato).toBe('valido')
  })

  it('un gettone messo da chi ha avviato il programma vince', () => {
    salvaGettone(GETTONE, { file, dpapi })
    const r = conAccessoClaude({ [VARIABILE_GETTONE]: 'suo' }, { file, dpapi })
    expect(r).toEqual({ env: { [VARIABILE_GETTONE]: 'suo' }, conGettone: false })
  })

  it('file rovinato o DPAPI che fallisce: si fa come prima, senza sollevare', () => {
    salvaGettone(GETTONE, { file, dpapi })
    const rotto: Dpapi = { cifra: dpapi.cifra, decifra: () => { throw new Error('chiave di un altro utente') } }
    _azzeraCacheAccesso()
    expect(conAccessoClaude({}, { file, dpapi: rotto }).conGettone).toBe(false)
    writeFileSync(file, '{non json')
    expect(statoAccesso({ file }).stato).toBe('illeggibile')
    expect(conAccessoClaude({}, { file, dpapi }).conGettone).toBe(false)
  })

  it('non salva un testo che non è un gettone', () => {
    expect(() => salvaGettone('sk-ant-api03-chiave-api', { file, dpapi })).toThrow(/setup-token/u)
  })

  it('solo le righe d’errore della CLI contano come rifiuto, non il testo dell’assistente', () => {
    const errore = JSON.stringify({ type: 'result', is_error: true, result: 'Failed to authenticate: this login reached its time limit' })
    expect(rigaDiAccessoRifiutato(errore)).toMatch(/Failed to authenticate/u)
    const parla = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Failed to authenticate: lo correggo' }] } })
    expect(rigaDiAccessoRifiutato(parla)).toBeUndefined()
    expect(rigaDiAccessoRifiutato(JSON.stringify({ type: 'result', is_error: false, result: 'ok' }))).toBeUndefined()
    expect(rigaDiAccessoRifiutato('non json')).toBeUndefined()
  })

  it('il file sta nella copia di prova quando c’è, se no in %APPDATA%\\SierraDeck', () => {
    expect(fileAccesso({ SIERRADECK_PROVA: 'C:\\prova' })).toBe(join('C:\\prova', 'accesso-claude.json'))
    expect(fileAccesso({ APPDATA: 'C:\\Dati' })).toBe(join('C:\\Dati', 'SierraDeck', 'accesso-claude.json'))
  })
})

describe('la sequenza «Rinnova l’accesso a Claude»', () => {
  it('lancia setup-token, legge il gettone, lo cifra con DPAPI e scrive il file per intero', () => {
    const s = scriptRinnovaAccesso("C:\\Users\\o'neil\\claude.exe", 'C:\\Dati\\SierraDeck\\accesso-claude.json')
    expect(s).toContain("& 'C:\\Users\\o''neil\\claude.exe' setup-token")
    expect(s).toContain('GetBufferContents')
    expect(s).toContain('-AsSecureString')
    expect(s).toContain('ProtectedData]::Protect')
    expect(s).toContain("$file = 'C:\\Dati\\SierraDeck\\accesso-claude.json'")
    expect(s).toContain('Move-Item -Force')
    expect(s).toContain('AddDays(365)')
  })

  it('il comando passa lo script in base64 (niente segreti né apici sulla riga di comando)', () => {
    const c = comandoRinnovaAccesso('claude.exe', 'C:\\x.json')
    expect(c.comando).toBe('cmd.exe')
    expect(c.args.slice(0, 5)).toEqual(['/d', '/c', 'start', '"SierraDeck"', 'powershell.exe'])
    const i = c.args.indexOf('-EncodedCommand')
    expect(i).toBeGreaterThan(-1)
    expect(Buffer.from(c.args[i + 1]!, 'base64').toString('utf16le')).toContain('setup-token')
  })
})
