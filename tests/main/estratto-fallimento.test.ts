import { describe, expect, it } from 'vitest'
import { motivoProveRotte } from '../../src/autopilot-host/ambiente-copia'
import { estrattoFallimento } from '../../src/autopilot-host/estratto-fallimento'

const GRADLE_TEST = `> Task :app:compileDebugKotlin UP-TO-DATE
> Task :app:testDebugUnitTest FAILED

ConversazioneVoceTest > parla quando arriva la risposta FAILED
    java.lang.AssertionError: expected:<2> but was:<1>
        at org.junit.Assert.fail(Assert.java:89)

FAILURE: Build failed with an exception.

* What went wrong:
Execution failed for task ':app:testDebugUnitTest'.
> There were failing tests. See the report at: file:///x/index.html

* Try:
> Run with --stacktrace option to get the stack trace.
> Run with --info or --debug option to get more log output.
> Run with --scan to get full insights.
> Get more help at https://help.gradle.org.

BUILD FAILED in 35s
28 actionable tasks: 3 executed, 25 up-to-date`

const GRADLE_KOTLIN = `> Task :app:compileDebugKotlin FAILED
e: file:///c/app/Tema.kt:24:13 Unresolved reference: colore
e: file:///c/app/Radice.kt:9:1 Type mismatch

FAILURE: Build failed with an exception.

* What went wrong:
Execution failed for task ':app:compileDebugKotlin'.
> Compilation error. See log for more details

* Try:
> Run with --stacktrace option to get the stack trace.
BUILD FAILED in 12s`

const VITEST = `
 FAIL  tests/main/a.test.ts > suite > fa x × y
AssertionError: expected 1 to be 2
 ❯ tests/main/a.test.ts:10:5

 FAIL  tests/main/b.test.ts
Error: boom

 Test Files  2 failed (2)
      Tests  2 failed | 10 passed (12)`

describe('estrattoFallimento', () => {
  it('Gradle: task, test caduti, motivo; niente righe di aiuto', () => {
    const r = estrattoFallimento(GRADLE_TEST)
    expect(r[0]).toBe('> Task :app:testDebugUnitTest FAILED')
    expect(r).toContain('ConversazioneVoceTest > parla quando arriva la risposta FAILED')
    expect(r).toContain('java.lang.AssertionError: expected:<2> but was:<1>')
    expect(r).toContain("Execution failed for task ':app:testDebugUnitTest'.")
    const t = r.join('\n')
    expect(t).not.toMatch(/--stacktrace|Get more help|--scan|BUILD FAILED/)
  })

  it('Gradle: errori Kotlin con file e riga', () => {
    const r = estrattoFallimento(GRADLE_KOTLIN)
    expect(r).toContain('e: file:///c/app/Tema.kt:24:13 Unresolved reference: colore')
    expect(r).toContain('e: file:///c/app/Radice.kt:9:1 Type mismatch')
    expect(r).toContain('> Compilation error. See log for more details')
  })

  it('vitest: righe FAIL con il nome del test e l’errore, non «×»', () => {
    const r = estrattoFallimento(VITEST)
    expect(r).toEqual([
      'FAIL tests/main/a.test.ts > suite > fa x × y',
      'AssertionError: expected 1 to be 2',
      'FAIL tests/main/b.test.ts',
      'Error: boom'
    ])
  })

  it('uscita qualunque: nessun estratto', () => {
    expect(estrattoFallimento('boom\nerrore')).toEqual([])
  })
})

describe('motivoProveRotte con estratto', () => {
  it('mette le righe utili e rispetta il limite di 400 caratteri per prova', () => {
    const m = motivoProveRotte(['App Android'], [{ descrizione: 'App Android', uscita: GRADLE_TEST }])
    expect(m).toContain('App Android — > Task :app:testDebugUnitTest FAILED')
    expect(m).not.toContain('actionable')
    const lunga = 'e: file:///c/x.kt:1:1 ' + 'z'.repeat(900)
    const l = motivoProveRotte(['K'], [{ descrizione: 'K', uscita: `> Task :a FAILED\n${lunga}` }])
    expect(l.length).toBeLessThan(520)
  })

  it('senza righe utili tiene la coda come prima', () => {
    const m = motivoProveRotte(['X'], [{ descrizione: 'X', uscita: 'uno\ndue' }])
    expect(m).toContain('X — uno | due')
  })
})
