import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
// @ts-expect-error script .mjs senza tipi
import { esaminaRelease, leggiYml, rapporto, soloDaRenderePubblica, tagDelProgramma } from '../../scripts/controlla-release.mjs'
// @ts-expect-error script .mjs senza tipi
import { daCaricare, nomeLocale } from '../../scripts/carica-programma.mjs'

/**
 * 25/11 (0.119.0): la release era Latest ma senza installer né latest.yml per
 * ~20 minuti. electron-builder pubblica in bozza e, trovata la release già
 * pubblica, aveva saltato il caricamento senza fermarsi. Ora i 3 file del
 * programma li carica comunque `carica-programma.mjs`, e l'ultimo passo di
 * `npm run pubblica` guarda il risultato su GitHub (`controlla-release.mjs`).
 */
type Problema = { tipo: string; motivo: string; rimedio: string }

const V = '9.8.7'
const VA = '1.2.3'
const EXE = `SierraDeck-Setup-${V}.exe`
const EXE_A = `SierraDeck-Aiutante-Setup-${VA}.exe`
const yml = (versione: string, exe: string, size: number, sha = 'abc=='): string =>
  `version: ${versione}\nfiles:\n  - url: ${exe}\n    sha512: ${sha}\n    size: ${size}\npath: ${exe}\nsha512: ${sha}\nreleaseDate: '2026-11-25T10:00:00.000Z'\n`
const LATEST = yml(V, EXE, 1000)
const AIUTANTE = yml(VA, EXE_A, 500)
const assetsGiusti = () => [
  { name: 'latest.yml', size: LATEST.length },
  { name: EXE, size: 1000 },
  { name: `${EXE}.blockmap`, size: 10 },
  { name: 'app-android.json', size: 20 },
  { name: 'aiutante.yml', size: AIUTANTE.length },
  { name: EXE_A, size: 500 },
  { name: `${EXE_A}.blockmap`, size: 5 }
]
const buona = () => ({
  versione: V,
  versioneAiutante: VA,
  release: { isDraft: false, assets: assetsGiusti() },
  ultima: `v${V}`,
  latestRemoto: LATEST,
  aiutanteRemoto: AIUTANTE,
  latestLocale: LATEST
})
const esamina = (d: object): Problema[] => esaminaRelease(d) as Problema[]

describe('controlla-release: il confronto', () => {
  it('release pubblica, Latest, 7 file giusti: nessun problema', () => {
    expect(esamina(buona())).toEqual([])
    expect(rapporto(`v${V}`, [])).toMatch(/a posto/u)
  })

  it('in bozza e non Latest: solo da rendere pubblica, col comando giusto', () => {
    const p = esamina({ ...buona(), release: { isDraft: true, assets: assetsGiusti() }, ultima: 'v9.8.6' })
    expect(p.map((x) => x.tipo).sort()).toEqual(['bozza', 'ultima'])
    expect(p[0]?.rimedio).toBe(`gh release edit v${V} --draft=false --latest`)
    expect(soloDaRenderePubblica(p)).toBe(true)
  })

  it('una release passata (l’ultima è già dopo) non si rimette Latest', () => {
    const p = esamina({ ...buona(), release: { isDraft: true, assets: assetsGiusti() }, ultima: 'v9.10.0' })
    expect(p.map((x) => x.tipo)).toEqual(['bozza', 'file'])
    expect(p[1]?.rimedio).toMatch(/--vecchia/u)
    expect(soloDaRenderePubblica(p)).toBe(false)
    // «App Android» come ultima (lo sbaglio da evitare): va rimessa Latest la v…
    expect(esamina({ ...buona(), ultima: 'app-android' })[0]?.tipo).toBe('ultima')
  })

  it('il caso del 25/11: Latest ma senza installer, blockmap e latest.yml', () => {
    const solo = assetsGiusti().filter((a) => !a.name.startsWith('SierraDeck-Setup-') && a.name !== 'latest.yml')
    const p = esamina({ ...buona(), release: { isDraft: false, assets: solo }, latestRemoto: null })
    expect(p.map((x) => x.motivo)).toEqual([`manca il file ${EXE}`, `manca il file ${EXE}.blockmap`, 'manca il file latest.yml'])
    expect(p.every((x) => x.rimedio === 'node scripts/carica-programma.mjs')).toBe(true)
    expect(soloDaRenderePubblica(p)).toBe(false)
    const testo = rapporto(`v${V}`, p)
    expect(testo).toMatch(/NON è a posto/u)
    // Il comando compare una volta sola, anche con tre file mancanti.
    expect(testo.split('node scripts/carica-programma.mjs').length).toBe(2)
  })

  it('a ogni file mancante il suo rimedio', () => {
    const p = esamina({ ...buona(), release: { isDraft: false, assets: assetsGiusti().filter((a) => a.name === 'latest.yml' || a.name === EXE || a.name === `${EXE}.blockmap`) }, aiutanteRemoto: null })
    const per = Object.fromEntries(p.map((x) => [x.motivo.replace('manca il file ', ''), x.rimedio]))
    expect(per['app-android.json']).toBe('node scripts/allega-json.mjs')
    expect(per['aiutante.yml']).toBe('node scripts/allega-aiutante.mjs --senza-build')
    expect(per[EXE_A]).toBe('node scripts/allega-aiutante.mjs --senza-build')
  })

  it('installer su GitHub di un’altra dimensione da latest.yml', () => {
    const assets = assetsGiusti().map((a) => (a.name === EXE ? { ...a, size: 999 } : a))
    const p = esamina({ ...buona(), release: { isDraft: false, assets } })
    expect(p).toHaveLength(1)
    expect(p[0]?.motivo).toMatch(/pesa 999 byte, latest\.yml dice 1000/u)
  })

  it('latest.yml su GitHub diverso da quello di dist (sha512)', () => {
    const p = esamina({ ...buona(), latestLocale: yml(V, EXE, 1000, 'altro==') })
    expect(p).toHaveLength(1)
    expect(p[0]?.motivo).toMatch(/sha512/u)
    expect(esamina({ ...buona(), latestLocale: null })[0]?.motivo).toMatch(/manca dist\/latest\.yml/u)
    // dist di un'altra versione: lo dice, invece di un falso «sha512 diversa».
    const altra = esamina({ ...buona(), latestLocale: yml('9.9.0', 'SierraDeck-Setup-9.9.0.exe', 1) })
    expect(altra[0]?.motivo).toMatch(/dist\/latest\.yml è della 9\.9\.0/u)
    expect(altra[0]?.rimedio).toMatch(/--vecchia/u)
  })

  it('latest.yml di un’altra versione o che punta a un altro file', () => {
    expect(esamina({ ...buona(), latestRemoto: yml('9.8.6', EXE, 1000), latestLocale: yml('9.8.6', EXE, 1000) }).map((x) => x.motivo).join('\n')).toMatch(/della 9\.8\.6/u)
    const spazi = yml(V, `SierraDeck Setup ${V}.exe`, 1000)
    expect(esamina({ ...buona(), latestRemoto: spazi, latestLocale: spazi }).map((x) => x.motivo).join('\n')).toMatch(/non punta a/u)
  })

  it('l’Aiutante: aiutante.yml della versione giusta e installer della sua dimensione', () => {
    const assets = assetsGiusti().map((a) => (a.name === EXE_A ? { ...a, size: 1 } : a))
    expect(esamina({ ...buona(), release: { isDraft: false, assets } })[0]?.motivo).toMatch(/aiutante\.yml dice 500/u)
    expect(esamina({ ...buona(), aiutanteRemoto: yml('1.2.2', EXE_A, 500) })[0]?.motivo).toMatch(/della 1\.2\.2/u)
  })

  it('release che non c’è; release passata senza Latest né dist', () => {
    expect(esamina({ ...buona(), release: null })[0]?.motivo).toMatch(/non c'è/u)
    expect(esamina({ ...buona(), ultima: 'v9.9.0', latestLocale: null, controllaUltima: false, controllaLocale: false })).toEqual([])
  })

  it('mai le release fisse: solo i tag v<n>.<n>.<n>', () => {
    expect(tagDelProgramma('v0.119.0')).toBe(true)
    for (const t of ['app-android', 'aiutante', 'v1.2', '0.119.0', 'v1.2.3-beta']) expect(tagDelProgramma(t)).toBe(false)
  })

  it('legge latest.yml come lo scrive electron-builder', () => {
    const y = leggiYml(LATEST.replace(/\n/g, '\r\n'))
    expect(y.version).toBe(V)
    expect(y.path).toBe(EXE)
    expect(y.files).toEqual([{ url: EXE, sha512: 'abc==', size: 1000 }])
  })
})

describe('carica-programma: i file del programma anche su una release già pubblica', () => {
  it('trova in dist il file a spazi per il nome a trattini di latest.yml', () => {
    const dist = [`SierraDeck Setup ${V}.exe`, `SierraDeck Setup ${V}.exe.blockmap`, 'latest.yml']
    expect(nomeLocale(EXE, dist)).toBe(`SierraDeck Setup ${V}.exe`)
    expect(nomeLocale(`${EXE}.blockmap`, dist)).toBe(`SierraDeck Setup ${V}.exe.blockmap`)
    expect(nomeLocale('latest.yml', dist)).toBe('latest.yml')
    expect(nomeLocale(EXE, [EXE])).toBe(EXE)
    expect(nomeLocale(EXE, ['altro.exe'])).toBeNull()
  })

  it('carica solo quello che manca o è diverso, nell’ordine dato', () => {
    const attesi = [
      { nome: EXE, byte: 1000, sha256: 'aa' },
      { nome: `${EXE}.blockmap`, byte: 10, sha256: 'bb' },
      { nome: 'latest.yml', byte: 300, sha256: 'cc' }
    ]
    expect(daCaricare(attesi, [])).toEqual([EXE, `${EXE}.blockmap`, 'latest.yml'])
    expect(daCaricare(attesi, [{ name: EXE, size: 1000, digest: 'sha256:aa' }, { name: `${EXE}.blockmap`, size: 10, digest: null }, { name: 'latest.yml', size: 300, digest: 'sha256:cc' }])).toEqual([])
    expect(daCaricare(attesi, [{ name: EXE, size: 999 }, { name: `${EXE}.blockmap`, size: 10 }, { name: 'latest.yml', size: 300, digest: 'sha256:dd' }])).toEqual([EXE, 'latest.yml'])
  })
})

describe('npm run pubblica', () => {
  const p = (JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> }).scripts.pubblica ?? ''
  it('carica i file del programma dopo electron-builder e finisce col controllo della release', () => {
    const builder = p.indexOf('electron-builder --win --publish always')
    const carica = p.indexOf('node scripts/carica-programma.mjs')
    const json = p.indexOf('node scripts/allega-json.mjs')
    expect(builder).toBeGreaterThan(0)
    expect(carica).toBeGreaterThan(builder)
    expect(json).toBeGreaterThan(carica)
    expect(p.trimEnd().endsWith('node scripts/controlla-release.mjs --sistema')).toBe(true)
  })
  it('rende pubblica e Latest solo la release del programma, mai «App Android» né «aiutante»', () => {
    const s = readFileSync('scripts/controlla-release.mjs', 'utf8')
    expect(s).toMatch(/'release', 'edit', tag, '--draft=false', '--latest'/u)
    expect(s).toMatch(/!tagDelProgramma\(tag\)/u)
    expect(s).not.toMatch(/'app-android'|'aiutante'/u)
  })
})
