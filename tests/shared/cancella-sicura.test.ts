import { describe, it, expect, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  cancellaSicura, cestinoSicuro, controllaCancellazione, CancellazioneRifiutata, type AmbienteCancellazione
} from '../../src/shared/cancella-sicura'

/**
 * La guardia unica delle cancellazioni (0.72.0), dopo la cancellazione di
 * AppData\Local del 14/10/2026. Un caso per ogni cartella vietata.
 */
const CASA = 'C:\\Users\\mario'
const W: AmbienteCancellazione = {
  windows: true,
  casa: CASA,
  temp: `${CASA}\\AppData\\Local\\Temp`,
  env: {
    USERPROFILE: CASA,
    APPDATA: `${CASA}\\AppData\\Roaming`,
    LOCALAPPDATA: `${CASA}\\AppData\\Local`,
    TEMP: `${CASA}\\AppData\\Local\\Temp`,
    TMP: `${CASA}\\AppData\\Local\\Temp`,
    SystemDrive: 'C:',
    SystemRoot: 'C:\\Windows',
    ProgramFiles: 'C:\\Program Files',
    'ProgramFiles(x86)': 'C:\\Program Files (x86)',
    ProgramData: 'C:\\ProgramData'
  }
}
/** Anche con il permesso più largo possibile: la radice del disco. */
const TUTTO = ['C:\\', 'D:\\', 'E:\\']

describe.runIf(process.platform === 'win32')('cancellaSicura: le cartelle vietate (Windows)', () => {
  const VIETATE: Array<[string, string]> = [
    ['la radice C:\\', 'C:\\'],
    ['la radice D:\\', 'D:\\'],
    ['la radice E:', 'E:'],
    ['le cartelle degli utenti', 'C:\\Users'],
    ['la cartella dell’utente', CASA],
    ['la cartella dell’utente con la barra in fondo', `${CASA}\\`],
    ['la cartella dell’utente scritta in maiuscolo', CASA.toUpperCase()],
    ['AppData', `${CASA}\\AppData`],
    ['AppData\\Local', `${CASA}\\AppData\\Local`],
    ['AppData\\Local con le barre al contrario', 'C:/Users/mario/AppData/Local'],
    ['AppData\\Roaming', `${CASA}\\AppData\\Roaming`],
    ['AppData\\LocalLow', `${CASA}\\AppData\\LocalLow`],
    ['Temp intera', `${CASA}\\AppData\\Local\\Temp`],
    ['Temp intera, raggiunta con ..', `${CASA}\\AppData\\Local\\Temp\\x\\..`],
    ['AppData\\Local raggiunta da Temp con ..', `${CASA}\\AppData\\Local\\Temp\\sierradeck-criterio-1\\..\\..`],
    ['Documenti', `${CASA}\\Documents`],
    ['Desktop', `${CASA}\\Desktop`],
    ['Download', `${CASA}\\Downloads`],
    ['.claude', `${CASA}\\.claude`],
    ['Program Files', 'C:\\Program Files'],
    ['Program Files (x86)', 'C:\\Program Files (x86)'],
    ['ProgramData', 'C:\\ProgramData'],
    ['Windows', 'C:\\Windows']
  ]
  for (const [nome, percorso] of VIETATE) {
    it(`rifiuta ${nome} (${percorso}), anche con tutto il disco permesso`, () => {
      const e = controllaCancellazione(percorso, { dentro: TUTTO, ambiente: W })
      expect(e.ok).toBe(false)
      expect(() => cancellaSicura(percorso, { dentro: TUTTO, ambiente: W })).toThrow(CancellazioneRifiutata)
    })
  }

  it('rifiuta un percorso dentro AppData\\Local se il permesso è la cartella dell’utente', () => {
    expect(controllaCancellazione(`${CASA}\\AppData\\Local\\Google\\Chrome`, { dentro: [CASA], ambiente: W }).ok).toBe(false)
  })
  it('rifiuta Windows\\System32 e Program Files\\Qualcosa con il permesso del disco intero', () => {
    expect(controllaCancellazione('C:\\Windows\\System32', { dentro: TUTTO, ambiente: W }).ok).toBe(false)
    expect(controllaCancellazione('C:\\Program Files\\Docker', { dentro: TUTTO, ambiente: W }).ok).toBe(false)
  })
  it('rifiuta un percorso relativo, vuoto, o senza cartelle permesse', () => {
    expect(controllaCancellazione('note\\x', { dentro: TUTTO, ambiente: W }).ok).toBe(false)
    expect(controllaCancellazione('', { dentro: TUTTO, ambiente: W }).ok).toBe(false)
    expect(controllaCancellazione(`${CASA}\\progetti\\x`, { dentro: [], ambiente: W }).ok).toBe(false)
  })
  it('rifiuta la cartella permessa stessa: si cancella solo quello che c’è dentro', () => {
    expect(controllaCancellazione('E:\\lavoro\\note', { dentro: ['E:\\lavoro\\note'], ambiente: W }).ok).toBe(false)
  })
  it('rifiuta un percorso fuori dalle cartelle permesse', () => {
    expect(controllaCancellazione('E:\\altro\\x', { dentro: ['E:\\lavoro\\note'], ambiente: W }).ok).toBe(false)
  })

  it('accetta una cartella di lavoro dentro Temp, se il permesso è Temp', () => {
    expect(controllaCancellazione(`${CASA}\\AppData\\Local\\Temp\\sierradeck-criterio-abc`, { dentro: [W.temp], ambiente: W }).ok).toBe(true)
  })
  it('accetta una copia di versione dentro la sua cartella in Roaming', () => {
    const radice = `${CASA}\\AppData\\Roaming\\SierraDeck\\copie-di-versione`
    expect(controllaCancellazione(`${radice}\\0.70.0-20261013`, { dentro: [radice], ambiente: W }).ok).toBe(true)
  })
  it('accetta un file dentro note\\ di un progetto su un altro disco', () => {
    expect(controllaCancellazione('E:\\lavoro\\note\\vero-copia', { dentro: ['E:\\lavoro\\note'], ambiente: W }).ok).toBe(true)
  })
})

describe('cancellaSicura sul disco vero (in una cartella finta)', () => {
  const fatte: string[] = []
  afterEach(() => { fatte.splice(0) })
  const ambienteFinto = (radice: string): AmbienteCancellazione => ({
    windows: process.platform === 'win32',
    casa: join(radice, 'casa'),
    temp: join(radice, 'casa', 'AppData', 'Local', 'Temp'),
    env: { LOCALAPPDATA: join(radice, 'casa', 'AppData', 'Local'), APPDATA: join(radice, 'casa', 'AppData', 'Roaming') }
  })

  it('cancella davvero una cartella permessa, e solo quella', () => {
    const r = mkdtempSync(join(tmpdir(), 'sd-cancella-'))
    const lavoro = join(r, 'lavoro')
    mkdirSync(join(lavoro, 'via', 'sotto'), { recursive: true })
    mkdirSync(join(lavoro, 'resta'), { recursive: true })
    writeFileSync(join(lavoro, 'via', 'sotto', 'f.txt'), 'x')
    expect(cancellaSicura(join(lavoro, 'via'), { dentro: [lavoro], ambiente: ambienteFinto(r) })).toBe('cancellata')
    expect(readdirSync(lavoro)).toEqual(['resta'])
    expect(cancellaSicura(join(lavoro, 'via'), { dentro: [lavoro], ambiente: ambienteFinto(r) })).toBe('non-c-era')
  })

  it('con «recupero» sposta invece di cancellare', () => {
    const r = mkdtempSync(join(tmpdir(), 'sd-cancella-'))
    const lavoro = join(r, 'lavoro')
    mkdirSync(join(lavoro, 'vecchia'), { recursive: true })
    writeFileSync(join(lavoro, 'vecchia', 'f.txt'), 'x')
    const recupero = join(r, 'recupero')
    expect(cancellaSicura(join(lavoro, 'vecchia'), { dentro: [lavoro], come: { modo: 'recupero', cartella: recupero }, ambiente: ambienteFinto(r) })).toBe('spostata')
    expect(existsSync(join(lavoro, 'vecchia'))).toBe(false)
    expect(readdirSync(recupero)[0]).toMatch(/^vecchia\./)
  })

  it('una giunzione che porta dentro AppData non passa: conta il percorso vero', () => {
    const r = mkdtempSync(join(tmpdir(), 'sd-cancella-'))
    const a = ambienteFinto(r)
    const local = join(r, 'casa', 'AppData', 'Local')
    mkdirSync(join(local, 'Programmi'), { recursive: true })
    writeFileSync(join(local, 'Programmi', 'importante.txt'), 'x')
    const lavoro = join(r, 'lavoro')
    mkdirSync(lavoro, { recursive: true })
    symlinkSync(local, join(lavoro, 'scorciatoia'), 'junction')
    expect(() => cancellaSicura(join(lavoro, 'scorciatoia', 'Programmi'), { dentro: [lavoro], ambiente: a })).toThrow(CancellazioneRifiutata)
    expect(existsSync(join(local, 'Programmi', 'importante.txt'))).toBe(true)
  })

  it('il Cestino passa dalla stessa guardia: rifiutato, non chiama il cestino', async () => {
    const r = mkdtempSync(join(tmpdir(), 'sd-cancella-'))
    const a = ambienteFinto(r)
    const chiamati: string[] = []
    const cestino = (p: string): Promise<void> => { chiamati.push(p); return Promise.resolve() }
    await expect(cestinoSicuro(a.casa, { dentro: [r], ambiente: a }, cestino)).rejects.toThrow(CancellazioneRifiutata)
    await expect(cestinoSicuro(join(a.casa, 'AppData', 'Local'), { dentro: [r], ambiente: a }, cestino)).rejects.toThrow(CancellazioneRifiutata)
    await cestinoSicuro(join(r, 'progetto'), { dentro: [r], ambiente: a }, cestino)
    expect(chiamati).toEqual([join(r, 'progetto')])
  })
})
