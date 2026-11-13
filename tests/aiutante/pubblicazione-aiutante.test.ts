import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { CANALE_AIUTANTE, FEED_AIUTANTE } from '../../src/aiutante/regole'
// @ts-expect-error script .mjs senza tipi
import { fileAiutante, fileRelease, noteConAiutante, problemaYml, SEGNO_NOTE } from '../../scripts/allega-aiutante.mjs'

/**
 * 13/11, regola di Nicholas: «l'Aiutante deve SEMPRE essere allegato alla
 * release del programma completo, non separato». `npm run pubblica` lo
 * costruisce e lo allega alla stessa release v<versione>, con il suo file
 * `aiutante.yml`; il programma completo continua a leggere solo `latest.yml`.
 * L'installer dell'Aiutante non deve mai prendere il posto di quello del
 * programma completo.
 */
const script = readFileSync('scripts/allega-aiutante.mjs', 'utf8')
const vecchio = readFileSync('scripts/pubblica-aiutante.mjs', 'utf8')
const pacchetto = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> }
const config = readFileSync('electron-builder-aiutante.yml', 'utf8')
const configPieno = readFileSync('electron-builder.yml', 'utf8')
const campo = (yml: string, re: RegExp): string | undefined => re.exec(yml)?.[1]?.trim()

describe('npm run pubblica allega l’Aiutante alla release del programma completo', () => {
  it('dopo allega-json: build dell’Aiutante e allega-aiutante, nella stessa catena', () => {
    const p = pacchetto.scripts.pubblica ?? ''
    const json = p.indexOf('node scripts/allega-json.mjs')
    const build = p.indexOf('npm run build-aiutante')
    const allega = p.indexOf('node scripts/allega-aiutante.mjs')
    expect(json).toBeGreaterThan(0)
    expect(build).toBeGreaterThan(json)
    expect(allega).toBeGreaterThan(build)
  })
  it('il vecchio «pubblica-aiutante» è ritirato: rimanda a npm run pubblica, non carica niente', () => {
    expect(pacchetto.scripts['pubblica-aiutante']).toBe('node scripts/pubblica-aiutante.mjs')
    expect(vecchio).toContain('npm run pubblica')
    expect(vecchio).toContain('process.exit(1)')
    expect(vecchio).not.toMatch(/spawnSync|'release'/u)
  })
  it('sulla release v<versione del programma>, mai sulla pubblicazione fissa «aiutante»', () => {
    expect(script).toMatch(/const tag = `v\$\{programma\}`/u)
    expect(script).not.toMatch(/TAG_AIUTANTE/u)
    expect(script).not.toMatch(/'release', 'create'/u)
    expect(script).not.toMatch(/--latest=/u)
  })
  it('installer e blockmap prima, aiutante.yml per ultimo; mai latest.yml', () => {
    const installer = script.indexOf('copia(exe), copia(mappa)')
    const yml = script.indexOf('copia(yml)')
    expect(installer).toBeGreaterThan(0)
    expect(yml).toBeGreaterThan(installer)
    expect(fileAiutante('1.0.1')).toEqual(['SierraDeck-Aiutante-Setup-1.0.1.exe', 'SierraDeck-Aiutante-Setup-1.0.1.exe.blockmap', 'aiutante.yml'])
    expect(script).not.toMatch(/copia\('latest\.yml'\)/u)
  })
  it('alla fine controlla i sette file, la bozza, e che l’ultima resti una v…', () => {
    expect(fileRelease('0.106.0', '1.0.1')).toEqual([
      'SierraDeck-Setup-0.106.0.exe', 'SierraDeck-Setup-0.106.0.exe.blockmap', 'latest.yml', 'app-android.json',
      'SierraDeck-Aiutante-Setup-1.0.1.exe', 'SierraDeck-Aiutante-Setup-1.0.1.exe.blockmap', 'aiutante.yml'
    ])
    expect(script).toMatch(/isDraft === true/u)
    expect(script).toMatch(/--draft=false --latest/u)
    expect(script).toMatch(/releases\/latest/u)
    expect(script).toMatch(/ultima\.startsWith\('v'\)/u)
  })
  it('aiutante.yml: della versione giusta e con l’installer giusto', () => {
    const buono = "version: 1.0.1\nfiles:\n  - url: SierraDeck-Aiutante-Setup-1.0.1.exe\n    sha512: x\n    size: 1\npath: SierraDeck-Aiutante-Setup-1.0.1.exe\nsha512: x\nreleaseDate: '2026-11-13'\n"
    expect(problemaYml(buono, '1.0.1')).toBeNull()
    expect(problemaYml(buono.replace('version: 1.0.1', 'version: 1.0.0'), '1.0.1')).toMatch(/non è della 1\.0\.1/u)
    expect(problemaYml(buono.replace('version: 1.0.1', 'version: 1.0.10'), '1.0.1')).not.toBeNull()
    expect(problemaYml(buono.replace('path: SierraDeck-Aiutante-Setup-1.0.1.exe', 'path: SierraDeck-Setup-1.0.1.exe'), '1.0.1')).toMatch(/path/u)
  })
  it('le note della release nominano l’Aiutante allegato, una volta sola', () => {
    const una = noteConAiutante('## SierraDeck 0.106.0\n\n- novità\n', '1.0.0', ['prima'])
    expect(una).toContain('## SierraDeck 0.106.0')
    expect(una).toContain('`SierraDeck-Aiutante-Setup-1.0.0.exe`')
    expect(una).toContain('- prima')
    const due = noteConAiutante(una, '1.0.1')
    expect(due.split(SEGNO_NOTE)).toHaveLength(2)
    expect(due).toContain('SierraDeck Aiutante 1.0.1')
    expect(due).not.toContain('1.0.0')
    expect(noteConAiutante('', '1.0.1').startsWith(SEGNO_NOTE)).toBe(true)
  })
  it('le novità dell’Aiutante sono obbligatorie, e la cartella temporanea la toglie la guardia', () => {
    expect(script).toContain("'novita-aiutante.txt'")
    expect(script).toMatch(/cancellaSicura\(cartella, \{ dentro: \[tmpdir\(\)\] \}\)/u)
  })
})

describe('l’impacchettamento dell’Aiutante', () => {
  it('un programma suo: appId, nome, cartella d’uscita', () => {
    expect(campo(config, /^appId:\s*(.+)$/mu)).toBe('it.ferrariconsulenze.sierradeck.aiutante')
    expect(campo(config, /^productName:\s*(.+)$/mu)).toBe('SierraDeck Aiutante')
    expect(config).toMatch(/output:\s*dist-aiutante/u)
  })
  it('una chiave d’installazione FISSA e diversa da quella del programma completo', () => {
    const mia = campo(config, /^\s+guid:\s*(\S+)/mu)
    const piena = campo(configPieno, /^\s+guid:\s*(\S+)/mu)
    expect(mia).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u)
    expect(mia).not.toBe(piena)
  })
  it('gli aggiornamenti dall’ultima release, canale «aiutante»: lo stesso indirizzo che legge il programma', () => {
    expect(config).toContain(`url: ${FEED_AIUTANTE}`)
    expect(config).toContain(`channel: ${CANALE_AIUTANTE}`)
    expect(config).not.toMatch(/provider:\s*github/u)
  })
  it('il programma cerca gli aggiornamenti lì (generic, FEED_AIUTANTE, canale suo), mai in latest.yml', () => {
    const agg = readFileSync('src/aiutante/aggiornamento.ts', 'utf8')
    expect(agg).toContain("autoUpdater.setFeedURL({ provider: 'generic', url: FEED_AIUTANTE, channel: CANALE_AIUTANTE, useMultipleRangeRequest: false })")
    expect(agg).not.toMatch(/provider: 'github'/u)
    // `autoUpdater.channel = …` accenderebbe anche allowDowngrade.
    expect(agg).not.toMatch(/^\s*autoUpdater\.channel\s*=/mu)
  })
  it('il programma completo resta sul canale di serie (latest.yml): niente channel nella sua configurazione', () => {
    expect(configPieno).not.toMatch(/^\s*channel:/mu)
    expect(configPieno).not.toMatch(/generateUpdatesFilesForAllChannels/u)
  })
  it('senza node_modules (electron-updater è nel file principale), e solo con la sua build', () => {
    expect(config).toContain("'!node_modules/**'")
    expect(readFileSync('electron.vite.aiutante.config.ts', 'utf8')).toContain(
      "externalizeDepsPlugin({ exclude: ['electron-updater'] })"
    )
    expect(config).toContain('out-aiutante/**/*')
    expect(config).toContain('main: out-aiutante/main/index.js')
  })
  it('la regola del firewall con un nome suo', () => {
    expect(config).toContain('include: build/installer-aiutante.nsh')
    expect(readFileSync('build/installer-aiutante.nsh', 'utf8')).toContain('SierraDeck Aiutante (rete locale)')
  })
  it('l’installer del programma completo non prende la build dell’Aiutante', () => {
    expect(configPieno).toMatch(/- out\/\*\*\/\*/u)
    expect(configPieno).not.toContain('out-aiutante')
  })
})
