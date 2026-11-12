import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { FEED_AIUTANTE } from '../../src/aiutante/regole'

/**
 * 12/11: l'Aiutante si pubblica e si impacchetta PER CONTO SUO. Il programma
 * completo si aggiorna dall'«ultima» pubblicazione di GitHub: lo script
 * dell'Aiutante non deve mai renderla sua. E l'installer dell'Aiutante non
 * deve mai prendere il posto di quello del programma completo.
 */
const script = readFileSync('scripts/pubblica-aiutante.mjs', 'utf8')
const config = readFileSync('electron-builder-aiutante.yml', 'utf8')
const configPieno = readFileSync('electron-builder.yml', 'utf8')
const campo = (yml: string, re: RegExp): string | undefined => re.exec(yml)?.[1]?.trim()

describe('lo script di pubblicazione dell’Aiutante', () => {
  it('mai «--latest» se non «--latest=false»', () => {
    const tutti = [...script.matchAll(/--latest(?:=[a-z]*)?/gu)].map((m) => m[0])
    expect(tutti.length).toBeGreaterThan(0)
    expect(tutti.every((x) => x === '--latest=false')).toBe(true)
  })
  it('ogni «release create» e «release edit» porta --latest=false', () => {
    for (const riga of script.split('\n').filter((r) => /'release', '(create|edit)', TAG_AIUTANTE/u.test(r))) expect(riga).toContain("'--latest=false'")
  })
  it('la pubblicazione fissa «aiutante», creata in bozza da main', () => {
    expect(script).toMatch(/TAG_AIUTANTE = 'aiutante'/u)
    expect(script).toMatch(/'--draft', '--latest=false', '--target', 'main'/u)
  })
  it('installer e blockmap prima, latest.yml per ultimo', () => {
    const installer = script.indexOf('copia(nomeExe), copia(nomeMappa)')
    const yml = script.indexOf("copia('latest.yml')")
    expect(installer).toBeGreaterThan(0)
    expect(yml).toBeGreaterThan(installer)
  })
  it('controlla che l’ultima pubblicazione resti del programma completo (v…), e si ferma se la versione c’è già', () => {
    expect(script).toMatch(/releases\/latest/u)
    expect(script).toMatch(/ultima\.startsWith\('v'\)/u)
    expect(script).toMatch(/già pubblicato/u)
  })
  it('le note dalle novità dell’Aiutante, e la cartella temporanea tolta dalla guardia', () => {
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
  it('gli aggiornamenti dalla pubblicazione «aiutante», la stessa che legge il programma', () => {
    expect(config).toContain(`url: ${FEED_AIUTANTE}`)
    expect(config).not.toMatch(/provider:\s*github/u)
  })
  it('il programma cerca gli aggiornamenti lì (generic, FEED_AIUTANTE), mai nell’ultima pubblicazione', () => {
    const agg = readFileSync('src/aiutante/aggiornamento.ts', 'utf8')
    expect(agg).toContain("autoUpdater.setFeedURL({ provider: 'generic', url: FEED_AIUTANTE })")
    expect(agg).not.toMatch(/provider: 'github'/u)
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
