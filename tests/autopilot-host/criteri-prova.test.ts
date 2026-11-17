import { describe, expect, it } from 'vitest'
import { criteriPerLaProva, fissaLaVersione, misuraIlRemoto } from '../../src/autopilot-host/criteri-prova'
import { ePesante } from '../../src/autopilot-host/criteri-veloci'
import type { Criterio } from '../../src/shared/autopilota'

const c = (comando: string, descrizione = comando): Criterio => ({ descrizione, comando, soddisfatto: true })

describe('la versione fissa nei criteri', () => {
  const fissa = `node -e "if(require('./package.json').version!=='0.107.3')process.exit(1)"`
  const almeno = `node -e "if(require('./package.json').version<'0.107.3')process.exit(1)"`
  const almenoGte = `node -e "const [a,b]=require('./package.json').version.split('.');if(!(+b>=107))process.exit(1)"`

  it('il confronto con un valore fisso è escluso, anche con solo quel criterio', () => {
    expect(fissaLaVersione(fissa)).toBe(true)
    expect(criteriPerLaProva([c(fissa), c('npx tsc --noEmit')]).map((x) => x.comando)).toEqual(['npx tsc --noEmit'])
    expect(criteriPerLaProva([c(fissa)])[0]?.comando).toBeUndefined()
  })
  it('versionName di gradle e gli altri operatori di uguaglianza sono esclusi', () => {
    expect(fissaLaVersione(`node -e "if(versionName==='2.1.0'&&require('fs').readFileSync('android/app/build.gradle.kts'))process.exit(1)"`)).toBe(true)
    expect(fissaLaVersione(`node -e "if(require('./package.json').version=='1.2.3')process.exit(1)"`)).toBe(true)
    expect(fissaLaVersione(`node -e "if('1.2.3'===require('./package.json').version)process.exit(1)"`)).toBe(true)
  })
  it('la ricerca di testo di una versione fissa è esclusa', () => {
    expect(fissaLaVersione(`grep -q '"version": "0.109.1"' package.json`)).toBe(true)
    expect(fissaLaVersione(`grep -q "\\"version\\": \\"0.109.1\\"" package.json`)).toBe(true)
    expect(fissaLaVersione(`grep -qF '"version":"0.109.1"' package.json`)).toBe(true)
    expect(fissaLaVersione(`grep -E -q '"version": "0\\.109\\.1"' package.json`)).toBe(true)
    expect(fissaLaVersione(`findstr /c:"\\"version\\": \\"1.2.3\\"" package.json`)).toBe(true)
    expect(fissaLaVersione(`Select-String -Quiet -Pattern '"version": "1.2.3"' package.json`)).toBe(true)
    expect(fissaLaVersione(`rg -q '"version": "1.2.3"' package.json`)).toBe(true)
    expect(fissaLaVersione(`grep -q 'versionName = "3.1.1"' android/app/build.gradle.kts`)).toBe(true)
    expect(fissaLaVersione(`grep -q 'versionCode = 311' android/app/build.gradle`)).toBe(true)
  })
  it('le ricerche che non riguardano la versione restano', () => {
    expect(fissaLaVersione('grep -q 20261117074117 .sierradeck/quaderno/errori-arrivati.md')).toBe(false)
    expect(fissaLaVersione(`grep -q '"typecheck"' package.json`)).toBe(false)
    expect(fissaLaVersione(`grep -q '"scripts"' package.json`)).toBe(false)
  })
  it('«almeno questa versione» e i criteri normali restano', () => {
    expect(fissaLaVersione(almeno)).toBe(false)
    expect(fissaLaVersione(almenoGte)).toBe(false)
    expect(criteriPerLaProva([c(almeno), c('git tag --list v0.95.*')]).map((x) => x.comando)).toEqual([almeno, 'git tag --list v0.95.*'])
  })
})

// 0.96.1 (Nicholas, 07/11: «si ferma a caso»): ogni unione rimisurava una trentina di criteri, due volte.
describe('i criteri dell’unione di prova', () => {
  const tutti = [
    c('npx vitest run tests/main'),
    c('npx vitest run tests/main tests/shared'),
    c('npx vitest run tests/main/pty-host-client.test.ts tests/autopilot-host/consegne.test.ts'),
    c('npx vitest run tests/renderer'),
    c('cd android && gradle clean testDebugUnitTest assembleDebug --no-daemon'),
    c('cd android && gradle testDebugUnitTest assembleDebug --no-daemon'),
    c('npx tsc --noEmit'),
    c('npx tsc --noEmit', 'un altro compito'),
    c('git tag --list v0.95.*')
  ]

  it('i vitest diventano uno, gradle uno senza clean, i doppioni spariscono', () => {
    const r = criteriPerLaProva(tutti)
    expect(r.map((x) => x.comando)).toEqual([
      'npx vitest run tests/autopilot-host/consegne.test.ts tests/main tests/renderer tests/shared',
      'cd android && gradle testDebugUnitTest assembleDebug --no-daemon',
      'npx tsc --noEmit',
      'git tag --list v0.95.*'
    ])
  })

  it('un ramo senza file in android/ non rilancia gradle; uno con soli file Android non rilancia vitest e tsc', () => {
    expect(criteriPerLaProva(tutti, ['src/main/index.ts']).some((x) => /gradle/.test(x.comando ?? ''))).toBe(false)
    const soloAndroid = criteriPerLaProva(tutti, ['android/app/src/main/java/A.kt', '.sierradeck/quaderno/lezioni.md'])
    expect(soloAndroid.map((x) => x.comando)).toEqual(['cd android && gradle testDebugUnitTest assembleDebug --no-daemon', 'git tag --list v0.95.*'])
  })

  it('16/11: le opzioni di vitest non contano; uno senza percorsi vale per tutti', () => {
    const r = criteriPerLaProva([c('npx vitest run tests/main'), c('npx vitest run --reporter=dot tests/x.test.ts'), c('npx vitest run --maxWorkers=2')])
    expect(r.map((x) => x.comando)).toEqual(['npx vitest run'])
  })

  it('16/11: con i file del ramo noti, solo le prove legate a quei file (vitest related)', () => {
    const tutti = [c('npx vitest run --maxWorkers=2'), c('npx vitest run tests/main'), c('npx tsc --noEmit')]
    const r = criteriPerLaProva(tutti, ['src/main/a.ts', 'tests/main/a.test.ts', 'src/main/a.ts', 'README.md'])
    expect(r.map((x) => x.comando)).toEqual(['npx vitest related --run src/main/a.ts tests/main/a.test.ts', 'npx tsc --noEmit'])
  })

  it('16/11: configurazione cambiata: tutta la suite', () => {
    const r = criteriPerLaProva([c('npx vitest run tests/main')], ['package.json', 'src/main/a.ts'])
    expect(r.map((x) => x.comando)).toEqual(['npx vitest run tests/main'])
  })

  it('16/11: una guida o una nota: nessuna prova', () => {
    const tutti = [c('npx vitest run --maxWorkers=2'), c('npx tsc --noEmit'), c('E:/Programs/Gradle/gradle-8.11.1/bin/gradle -p android testDebugUnitTest --rerun --offline')]
    expect(criteriPerLaProva(tutti, ['docs/rete/guida-chiave-cloudflare.html', '.sierradeck/quaderno/errori-arrivati.md'])).toEqual([])
  })

  it('16/11: gradle col percorso (-p android) si salta senza file in android/', () => {
    const g = 'E:/Programs/Gradle/gradle-8.11.1/bin/gradle -p android testDebugUnitTest --rerun --offline'
    expect(criteriPerLaProva([c(g)], ['src/main/a.ts']).map((x) => x.comando)).toEqual([])
    expect(criteriPerLaProva([c(g)], ['android/app/A.kt']).map((x) => x.comando)).toEqual([g])
  })
})

describe('la prova prima/dopo non misura il remoto', () => {
  const gh = `node -e "const v=require('./package.json').version;require('child_process').execSync('gh release view v'+v,{stdio:'ignore'})"`
  it('esclude pubblicazioni e stato del remoto, tiene i criteri normali', () => {
    const r = criteriPerLaProva([
      c(gh),
      c('git ls-remote --tags origin v0.107.2 | grep -q v0.107.2'),
      c('gh release view v0.107.1'),
      c('gh api repos/o/r/releases/latest'),
      c('git push origin main'),
      c('npm view sierradeck version'),
      c('npx tsc --noEmit'),
      c('git tag --list v0.95.*')
    ])
    expect(r.map((x) => x.comando)).toEqual(['npx tsc --noEmit', 'git tag --list v0.95.*'])
  })
  it('misuraIlRemoto non scambia codice per remoto', () => {
    expect(misuraIlRemoto(gh)).toBe(true)
    expect(misuraIlRemoto('node -e "console.log(require(\'./package.json\').version)"')).toBe(false)
    expect(misuraIlRemoto('npx vitest run tests/main')).toBe(false)
  })
})

describe('pesante è il comando, non una parola dentro', () => {
  it('leggere non è pesante', () => {
    expect(ePesante('grep -rn "gradle" src')).toBe(false)
    expect(ePesante('cat android/build.gradle.kts')).toBe(false)
    expect(ePesante('Get-Process java | findstr gradle')).toBe(false)
    expect(ePesante('git log --grep vitest')).toBe(false)
  })
  it('lanciare resta pesante', () => {
    expect(ePesante('timeout 590 gradle testDebugUnitTest --no-daemon')).toBe(true)
    expect(ePesante('SD_TEST_WORKERS=4 npm run test:veloci')).toBe(true)
    expect(ePesante('& .\\gradlew.bat assembleDebug')).toBe(true)
    expect(ePesante('npx vitest run tests/main | tail -5')).toBe(true)
  })
})
