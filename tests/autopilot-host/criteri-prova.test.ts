import { describe, expect, it } from 'vitest'
import { criteriPerLaProva, fileLetti, fissaLaVersione, misuraIlRemoto, nonDipendeDalRamo, partiDelComposto } from '../../src/autopilot-host/criteri-prova'
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
    expect(criteriPerLaProva([c(g)], ['android/app/A.kt']).map((x) => x.comando)).toEqual([g.replace(' --rerun', '')])
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

// 25/11: il 24/11 ogni unione di prova rimisurava ~236 comandi (10-18 minuti): composti, typecheck ripetuti, controlli da poco.
describe('25/11: unioni veloci (prova: true)', () => {
  const P = { prova: true }
  const comandi = (cr: Criterio[]): (string | undefined)[] => cr.map((x) => x.comando)

  it('spezza i composti con && solo se fatti di comandi semplici', () => {
    expect(partiDelComposto('npm run typecheck && npx vitest run tests/shared')).toEqual(['npm run typecheck', 'npx vitest run tests/shared'])
    expect(partiDelComposto(`node -e "a();b()" && npm run typecheck`)).toEqual([`node -e "a();b()"`, 'npm run typecheck'])
    expect(partiDelComposto('npm run typecheck && cd android && gradle test && gradle lint')).toEqual(['npm run typecheck', 'cd android && gradle test && gradle lint'])
    expect(partiDelComposto('a && b || c')).toBeUndefined()
    expect(partiDelComposto('a && b | grep x')).toBeUndefined()
    expect(partiDelComposto('a; b && c')).toBeUndefined()
    expect(partiDelComposto('(a && b)')).toBeUndefined()
    expect(partiDelComposto('a && $(b)')).toBeUndefined()
    expect(partiDelComposto('a & b')).toBeUndefined()
    expect(partiDelComposto('npm run typecheck')).toBeUndefined()
  })

  it('i controlli che un ramo non cambia', () => {
    for (const x of ['git tag --list v0.97.0', 'git tag --list', 'git rev-parse -q --verify HEAD', '! git rev-parse --verify --quiet worktree-agent-abc', 'wsl --list --quiet', 'git status --short', 'gh auth status', 'git tag --list | grep -q v0.97.0']) {
      expect(nonDipendeDalRamo(x), x).toBe(true)
    }
    for (const x of ['git log -1', 'git tag v1 && rm x', 'git status --short || exit 1', 'git tag --list | node x.js', 'grep -q x a.txt']) {
      expect(nonDipendeDalRamo(x), x).toBe(false)
    }
  })

  it('i file letti da un controllo, solo quando si sa dirlo', () => {
    expect(fileLetti('grep -q "3.1.1" android/novita-app.txt')).toEqual(['android/novita-app.txt'])
    expect(fileLetti('git grep -n "abc" -- src/shared/novita.ts')).toEqual(['src/shared/novita.ts'])
    expect(fileLetti(`node -e "const s=require('fs').readFileSync('src/shared/novita.ts','utf8');if(!s.includes('x'))process.exit(1)"`)).toEqual(['src/shared/novita.ts'])
    expect(fileLetti(`node -e "console.log(require('./package.json').version)"`)).toEqual(['package.json'])
    expect(fileLetti('grep -rq foo src/main')).toEqual(['src/main'])
    expect(fileLetti('test -s .sierradeck/quaderno/x.md')).toEqual(['.sierradeck/quaderno/x.md'])
    // Non si sa: resta.
    expect(fileLetti('grep -q foo')).toBeUndefined()
    expect(fileLetti('git grep -n foo')).toBeUndefined()
    expect(fileLetti('grep -rq foo .')).toBeUndefined()
    expect(fileLetti(`node -e "require('fs').readFileSync(p)"`)).toBeUndefined()
    expect(fileLetti(`node -e "require('child_process').execSync('git status')"`)).toBeUndefined()
    expect(fileLetti(`node -e "require('fs')"`)).toBeUndefined()
    expect(fileLetti('node scripts/controlla.js')).toBeUndefined()
    expect(fileLetti('grep -q x ../fuori.txt')).toBeUndefined()
  })

  it('un controllo su file resta solo se il ramo tocca quel file (o non si sanno i file del ramo)', () => {
    const g = c('grep -q "3.1.1" android/novita-app.txt')
    const n = c(`node -e "if(!require('fs').readFileSync('src/shared/novita.ts','utf8').includes('x'))process.exit(1)"`)
    expect(comandi(criteriPerLaProva([g, n], ['src/main/a.ts'], P))).toEqual([])
    expect(comandi(criteriPerLaProva([g, n], ['src/shared/novita.ts'], P))).toEqual([n.comando])
    expect(comandi(criteriPerLaProva([g, n], undefined, P))).toEqual([g.comando, n.comando])
    // Un comando che non si sa cosa legga resta.
    expect(comandi(criteriPerLaProva([c('node scripts/controlla.js')], ['src/main/a.ts'], P))).toEqual(['node scripts/controlla.js'])
  })

  it('typecheck e tsc diventano uno; saltato senza codice nel ramo, fatto con file non noti', () => {
    const tc = [c('npm run typecheck'), c('npx tsc --noEmit'), c('tsc --noEmit')]
    expect(comandi(criteriPerLaProva(tc, ['src/main/a.ts'], P))).toEqual(['npm run typecheck'])
    expect(comandi(criteriPerLaProva(tc, undefined, P))).toEqual(['npm run typecheck'])
    expect(comandi(criteriPerLaProva(tc, ['src/shared/dati.json'], P))).toEqual(['npm run typecheck'])
    expect(comandi(criteriPerLaProva(tc, ['.sierradeck/quaderno/x.md'], P))).toEqual([])
    expect(comandi(criteriPerLaProva(tc, ['scripts/a.sh'], P))).toEqual([])
  })

  it('senza `prova` (il criterio di un compito) tutto come prima', () => {
    const composto = 'npm run typecheck && npx vitest run tests/shared'
    expect(comandi(criteriPerLaProva([c(composto)]))).toEqual([composto])
    expect(comandi(criteriPerLaProva([c('git tag --list v0.97.0')]))).toEqual(['git tag --list v0.97.0'])
  })

  it('le parti di un composto hanno ciascuna la sua descrizione', () => {
    const r = criteriPerLaProva([c('npm run build && node scripts/a.js', 'il compito')], undefined, P)
    expect(r.map((x) => x.descrizione)).toEqual(['il compito — npm run build', 'il compito — node scripts/a.js'])
  })

  describe('la lista vera del 24/11', () => {
    const composti = [
      'npm run typecheck && npx vitest run --maxWorkers=2 tests/shared tests/main',
      'npm run typecheck && npx vitest run --maxWorkers=2 tests/autopilot-host tests/shared',
      'npm run typecheck && npx vitest run tests/main',
      'npm run typecheck && npx vitest run --maxWorkers=2 tests/renderer',
      'npx tsc --noEmit && npx vitest run tests/autopilot-host',
      'npm run typecheck && npx vitest run --maxWorkers=2 tests/main/a.test.ts tests/shared/b.test.ts',
      'npm run typecheck && npx vitest run --maxWorkers=2',
      'tsc --noEmit && npx vitest run --maxWorkers=2 tests/shared'
    ]
    const da_poco = [
      'git tag --list v0.97.0',
      'git tag --list',
      'git rev-parse -q --verify HEAD',
      '! git rev-parse --verify --quiet worktree-agent-abc123',
      'wsl --list --quiet',
      'git status --short',
      `node -e "const p=require('./package.json');if(!/^\\d+\\.\\d+\\.\\d+$/.test(p.version))process.exit(1)"`,
      'grep -q "3.1.1" android/novita-app.txt',
      'git grep -n "Unioni veloci" -- src/shared/novita.ts',
      `node -e "const s=require('fs').readFileSync('src/shared/novita.ts','utf8');if(!s.includes('0.118'))process.exit(1)"`
    ]
    const tutti = [...composti, 'npm run typecheck', 'npx tsc --noEmit', ...da_poco, 'npx vitest run tests/shared'].map((x) => c(x))

    it('ramo con codice: un typecheck e un vitest related, niente gradle', () => {
      const r = comandi(criteriPerLaProva(tutti, ['src/autopilot-host/criteri-prova.ts', 'tests/autopilot-host/criteri-prova.test.ts'], P))
      expect(r).toEqual(['npm run typecheck', 'npx vitest related --run src/autopilot-host/criteri-prova.ts tests/autopilot-host/criteri-prova.test.ts'])
    })
    it('ramo con Android: anche gradle, una volta', () => {
      const conGradle = [...tutti, c('npm run typecheck && cd android && gradle clean testDebugUnitTest --no-daemon')]
      const r = comandi(criteriPerLaProva(conGradle, ['src/main/a.ts', 'android/app/A.kt'], P))
      expect(r).toEqual(['npm run typecheck', 'npx vitest related --run src/main/a.ts', 'cd android && gradle testDebugUnitTest --no-daemon'])
    })
    it('ramo con solo una nota del quaderno: niente di pesante', () => {
      expect(comandi(criteriPerLaProva(tutti, ['.sierradeck/quaderno/x.md'], P))).toEqual([])
    })
    it('file non noti: suite intera e typecheck, come prima; i controlli su file restano', () => {
      const r = comandi(criteriPerLaProva(tutti, undefined, P))
      expect(r.slice(0, 2)).toEqual(['npm run typecheck', 'npx vitest run'])
      expect(r.filter((x) => /typecheck|tsc|vitest/.test(x ?? '')).length).toBe(2)
      expect(r).toContain('grep -q "3.1.1" android/novita-app.txt')
      expect(r).not.toContain('git tag --list')
    })
    it('un file che cambia tutto: suite intera', () => {
      const r = comandi(criteriPerLaProva(tutti, ['vitest.config.ts', 'src/main/a.ts'], P))
      expect(r.slice(0, 2)).toEqual(['npm run typecheck', 'npx vitest run'])
    })
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

describe('25/11: le prove Android scritte in tre modi girano una volta', () => {
  const P = { prova: true }
  const tre = [
    c('cd android && gradle testDebugUnitTest assembleDebug :app:compileReleaseKotlin --no-daemon --offline'),
    c('/e/Programs/Gradle/gradle-8.11.1/bin/gradle -p android testDebugUnitTest --offline'),
    c('gradle -p android :app:compileReleaseKotlin --no-daemon')
  ]
  it('un ramo Android: un solo comando gradle con tutti i compiti', () => {
    const r = criteriPerLaProva(tre, ['android/app/src/main/java/A.kt'], P).map((x) => x.comando)
    expect(r).toEqual(['cd android && gradle testDebugUnitTest assembleDebug :app:compileReleaseKotlin --no-daemon --offline'])
  })
  it('senza file in android/ nessuna delle tre gira', () => {
    expect(criteriPerLaProva(tre, ['src/main/a.ts'], P).filter((x) => /gradle/.test(x.comando ?? ''))).toEqual([])
  })
  it('solo con il percorso: si usa quello assoluto, dentro android/', () => {
    const r = criteriPerLaProva([tre[1]!], ['android/app/A.kt'], P).map((x) => x.comando)
    expect(r).toEqual(['cd android && /e/Programs/Gradle/gradle-8.11.1/bin/gradle testDebugUnitTest --offline'])
  })
  it('fuori dalla prova non cambia niente', () => {
    expect(criteriPerLaProva([tre[2]!], ['android/app/A.kt']).map((x) => x.comando)).toEqual(['gradle -p android :app:compileReleaseKotlin --no-daemon'])
  })
})
