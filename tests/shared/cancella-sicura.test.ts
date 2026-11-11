import { describe, it, expect, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { finche, programmaVivoIn } from '../setup/programma-vivo'
import {
  cancellaSicura, cancellaSicuraAsincrona, cestinoSicuro, controllaCancellazione, divietoAssoluto, eBloccoTemporaneo, CancellazioneRifiutata,
  type AmbienteCancellazione
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
    it(`rifiuta ${nome} (${percorso}), anche con tutto il disco permesso`, async () => {
      const e = controllaCancellazione(percorso, { dentro: TUTTO, ambiente: W })
      expect(e.ok).toBe(false)
      expect(() => cancellaSicura(percorso, { dentro: TUTTO, ambiente: W })).toThrow(CancellazioneRifiutata)
      // 11/11: la variante che non ferma il processo passa dagli stessi controlli.
      await expect(cancellaSicuraAsincrona(percorso, { dentro: TUTTO, ambiente: W })).rejects.toThrow(CancellazioneRifiutata)
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

describe('divietoAssoluto: quello che nessun consenso scioglie', () => {
  it.each([
    'C:\\', CASA, `${CASA}\\AppData`, `${CASA}\\AppData\\Local`, `${CASA}\\AppData\\Roaming`, 'C:\\Windows', 'C:\\Program Files', 'C:\\Users'
  ])('%s: vietato', (p) => {
    expect(divietoAssoluto(p, W)).toBeDefined()
  })
  it('un percorso preciso dentro una cartella protetta, o altrove, non è vietato in assoluto', () => {
    expect(divietoAssoluto(`${CASA}\\AppData\\Local\\Prova\\cache`, W)).toBeUndefined()
    expect(divietoAssoluto('E:\\vecchio\\copie', W)).toBeUndefined()
  })
  it('un percorso non assoluto è rifiutato', () => {
    expect(divietoAssoluto('note\\x', W)).toBeDefined()
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

/**
 * 11/11: la stessa guardia, senza fermare il processo. Il servizio ha un filo
 * solo, e togliere una copia grande con `rmSync` lo teneva fermo 8-10 secondi.
 */
describe('cancellaSicuraAsincrona: gli stessi controlli, senza fermare il processo (11/11)', () => {
  const ambienteFinto = (radice: string): AmbienteCancellazione => ({
    windows: process.platform === 'win32',
    casa: join(radice, 'casa'),
    temp: join(radice, 'casa', 'AppData', 'Local', 'Temp'),
    env: { LOCALAPPDATA: join(radice, 'casa', 'AppData', 'Local'), APPDATA: join(radice, 'casa', 'AppData', 'Roaming') }
  })

  it('cancella davvero una cartella permessa, e solo quella', async () => {
    const r = mkdtempSync(join(tmpdir(), 'sd-cancella-as-'))
    const lavoro = join(r, 'lavoro')
    mkdirSync(join(lavoro, 'via', 'sotto'), { recursive: true })
    mkdirSync(join(lavoro, 'resta'), { recursive: true })
    writeFileSync(join(lavoro, 'via', 'sotto', 'f.txt'), 'x')
    expect(await cancellaSicuraAsincrona(join(lavoro, 'via'), { dentro: [lavoro], ambiente: ambienteFinto(r) })).toBe('cancellata')
    expect(readdirSync(lavoro)).toEqual(['resta'])
    expect(await cancellaSicuraAsincrona(join(lavoro, 'via'), { dentro: [lavoro], ambiente: ambienteFinto(r) })).toBe('non-c-era')
  })

  it('una cartella con dentro un archivio .asar se ne va intera', async () => {
    // Nel servizio (Electron) `fs` vede un .asar come una cartella: qui si prova solo che il file non fa da ostacolo.
    const r = mkdtempSync(join(tmpdir(), 'sd-cancella-as-'))
    const lavoro = join(r, 'lavoro')
    mkdirSync(join(lavoro, 'copia', 'dist', 'resources'), { recursive: true })
    writeFileSync(join(lavoro, 'copia', 'dist', 'resources', 'app.asar'), 'non è un archivio vero')
    expect(await cancellaSicuraAsincrona(join(lavoro, 'copia'), { dentro: [lavoro], ambiente: ambienteFinto(r) })).toBe('cancellata')
    expect(readdirSync(lavoro)).toEqual([])
  })

  it('con «recupero» sposta invece di cancellare', async () => {
    const r = mkdtempSync(join(tmpdir(), 'sd-cancella-as-'))
    const lavoro = join(r, 'lavoro')
    mkdirSync(join(lavoro, 'vecchia'), { recursive: true })
    writeFileSync(join(lavoro, 'vecchia', 'f.txt'), 'x')
    const recupero = join(r, 'recupero')
    expect(await cancellaSicuraAsincrona(join(lavoro, 'vecchia'), { dentro: [lavoro], come: { modo: 'recupero', cartella: recupero }, ambiente: ambienteFinto(r) })).toBe('spostata')
    expect(existsSync(join(lavoro, 'vecchia'))).toBe(false)
    expect(readdirSync(recupero)[0]).toMatch(/^vecchia\./)
  })

  it('rifiuta come la sorella: fuori dal permesso, la cartella permessa stessa, e niente viene toccato', async () => {
    const r = mkdtempSync(join(tmpdir(), 'sd-cancella-as-'))
    const a = ambienteFinto(r)
    const lavoro = join(r, 'lavoro')
    const altro = join(r, 'altro')
    mkdirSync(join(lavoro, 'dentro'), { recursive: true })
    mkdirSync(altro, { recursive: true })
    writeFileSync(join(altro, 'f.txt'), 'x')
    await expect(cancellaSicuraAsincrona(altro, { dentro: [lavoro], ambiente: a })).rejects.toThrow(CancellazioneRifiutata)
    await expect(cancellaSicuraAsincrona(lavoro, { dentro: [lavoro], ambiente: a })).rejects.toThrow(CancellazioneRifiutata)
    await expect(cancellaSicuraAsincrona(join(lavoro, 'dentro'), { dentro: [], ambiente: a })).rejects.toThrow(CancellazioneRifiutata)
    await expect(cancellaSicuraAsincrona(a.casa, { dentro: [r], ambiente: a })).rejects.toThrow(CancellazioneRifiutata)
    expect(existsSync(join(altro, 'f.txt'))).toBe(true)
    expect(existsSync(join(lavoro, 'dentro'))).toBe(true)
  })

  it('una giunzione che porta dentro AppData non passa: conta il percorso vero', async () => {
    const r = mkdtempSync(join(tmpdir(), 'sd-cancella-as-'))
    const a = ambienteFinto(r)
    const local = join(r, 'casa', 'AppData', 'Local')
    mkdirSync(join(local, 'Programmi'), { recursive: true })
    writeFileSync(join(local, 'Programmi', 'importante.txt'), 'x')
    const lavoro = join(r, 'lavoro')
    mkdirSync(lavoro, { recursive: true })
    symlinkSync(local, join(lavoro, 'scorciatoia'), 'junction')
    await expect(cancellaSicuraAsincrona(join(lavoro, 'scorciatoia', 'Programmi'), { dentro: [lavoro], ambiente: a })).rejects.toThrow(CancellazioneRifiutata)
    expect(existsSync(join(local, 'Programmi', 'importante.txt'))).toBe(true)
  })

  it.runIf(process.platform === 'win32')('una cartella tenuta da un programma vivo non si toglie: l’errore è un blocco che passa, e dopo si toglie', async () => {
    const r = mkdtempSync(join(tmpdir(), 'sd-cancella-as-'))
    const lavoro = join(r, 'lavoro')
    const usata = join(lavoro, 'usata')
    mkdirSync(usata, { recursive: true })
    writeFileSync(join(usata, 'f.txt'), 'x')
    // Un programma che ha quella cartella come cartella di lavoro: Windows non la lascia togliere finché vive.
    const vivo = await programmaVivoIn(usata)
    try {
      const errore = await cancellaSicuraAsincrona(usata, { dentro: [lavoro], ambiente: ambienteFinto(r) }).then(() => undefined, (e: unknown) => e)
      expect(errore).toBeDefined()
      expect(errore).not.toBeInstanceOf(CancellazioneRifiutata)
      expect(eBloccoTemporaneo(String(errore))).toBe(true)
      expect(existsSync(usata)).toBe(true)
    } finally {
      await vivo.ferma()
    }
    // Finito il programma la cartella si toglie (Windows la lascia un attimo dopo: si riprova).
    const dopo = await finche(() => cancellaSicuraAsincrona(usata, { dentro: [lavoro], ambiente: ambienteFinto(r) }).then((e) => e, () => 'ancora-tenuta' as const), (e) => e !== 'ancora-tenuta')
    expect(dopo).toBe('cancellata')
    expect(existsSync(usata)).toBe(false)
  })
})

describe('eBloccoTemporaneo (k-165)', () => {
  it('riconosce i file tenuti da un programma e i percorsi troppo lunghi', () => {
    expect(eBloccoTemporaneo('Error: EPERM, Permission denied: x')).toBe(true)
    expect(eBloccoTemporaneo('EBUSY: resource busy or locked')).toBe(true)
    expect(eBloccoTemporaneo("error: failed to delete 'E:/x': Filename too long")).toBe(true)
    expect(eBloccoTemporaneo('ENOTEMPTY: directory not empty')).toBe(true)
    expect(eBloccoTemporaneo('EACCES: permission denied')).toBe(true)
    expect(eBloccoTemporaneo('The process cannot access the file because it is being used by another process.')).toBe(true)
  })
  it('un altro errore resta un errore', () => {
    expect(eBloccoTemporaneo('cancellazione rifiutata: fuori dalla cartella delle copie')).toBe(false)
    expect(eBloccoTemporaneo('collegamenti non staccati: x')).toBe(false)
    expect(eBloccoTemporaneo('')).toBe(false)
  })
  it('un rifiuto della guardia non passa mai da solo, qualunque cosa ci sia scritta nel percorso (11/11)', () => {
    expect(eBloccoTemporaneo('CancellazioneRifiutata: cancellazione rifiutata: E:\\copie\\EPERM non sta dentro una cartella permessa per questa cancellazione')).toBe(false)
  })
})
