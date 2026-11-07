import { describe, expect, it } from 'vitest'
import { criteriPerLaProva } from '../../src/autopilot-host/criteri-prova'
import { ePesante } from '../../src/autopilot-host/criteri-veloci'
import type { Criterio } from '../../src/shared/autopilota'

const c = (comando: string, descrizione = comando): Criterio => ({ descrizione, comando, soddisfatto: true })

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

  it('un vitest con opzioni resta com’è; uno senza percorsi vale per tutti', () => {
    const r = criteriPerLaProva([c('npx vitest run tests/main'), c('npx vitest run --reporter=dot tests/x.test.ts'), c('npx vitest run')])
    expect(r.map((x) => x.comando)).toEqual(['npx vitest run', 'npx vitest run --reporter=dot tests/x.test.ts'])
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
