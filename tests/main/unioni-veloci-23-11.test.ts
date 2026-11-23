import { describe, expect, it } from 'vitest'
import { criteriPerLaProva, senzaSolaVersione, soloVersione } from '../../src/autopilot-host/criteri-prova'
import { formaLotto, formaLottoSenzaConflitti, type VoceLotto } from '../../src/autopilot-host/unioni-a-lotti'
import { PROVA_MAX_MS, scadenzaAdattiva } from '../../src/autopilot-host/tempi-unione'
import { conTurni, creaTurni } from '../../src/autopilot-host/turni-criteri'
import type { Criterio } from '../../src/shared/autopilota'

const c = (comando: string): Criterio => ({ descrizione: comando, comando, soddisfatto: true })
const GRADLE = 'cd android && gradlew testDebugUnitTest --rerun --no-daemon'

describe('k-191e — la prova non rimisura ciò che il ramo non può rompere', () => {
  it('novita-app.txt in android/ conta come nota: niente gradle', () => {
    const r = criteriPerLaProva([c(GRADLE), c('grep -q x android/novita-app.txt')], ['android/novita-app.txt', 'package.json'])
    expect(r.some((x) => /gradle/i.test(x.comando ?? ''))).toBe(false)
    const conCodice = criteriPerLaProva([c(GRADLE)], ['android/app/src/main/Foo.kt'])
    expect(conCodice.some((x) => /gradle/i.test(x.comando ?? ''))).toBe(true)
  })

  it('gradle unito perde --rerun, anche se scritto in altro modo', () => {
    const [uno] = criteriPerLaProva([c(GRADLE)], ['android/app/Foo.kt'])
    expect(uno?.comando).not.toMatch(/--rerun/)
    expect(uno?.comando).toMatch(/testDebugUnitTest/)
    const [due] = criteriPerLaProva([c('gradle -p android testDebugUnitTest --rerun --offline')], ['android/app/Foo.kt'])
    expect(due?.comando).not.toMatch(/--rerun/)
  })

  it('soloVersione: solo la riga "version" cambia', () => {
    const solo = '--- a/package.json\n+++ b/package.json\n@@ -3 +3 @@\n-  "version": "1.2.3",\n+  "version": "1.2.4",\n'
    expect(soloVersione(solo)).toBe(true)
    expect(soloVersione(`${solo}+  "nuova": "x",\n`)).toBe(false)
    expect(soloVersione('')).toBe(false)
    expect(soloVersione('-  "version": "1.0.0",\n')).toBe(false)
    const tre = '-  "version": "1",\n-  "version": "2",\n-  "version": "3",\n+  "version": "4",\n'
    expect(soloVersione(tre)).toBe(false)
  })

  it('un cambio di sola versione non manda in prova la suite intera; il resto sì', () => {
    const tutti = [c('npx vitest run tests/main/a.test.ts')]
    const cambiati = ['package.json', 'package-lock.json', 'src/shared/novita.ts']
    const senza = senzaSolaVersione(cambiati, new Set(['package.json', 'package-lock.json']))
    expect(senza).toEqual(['src/shared/novita.ts'])
    const veloce = criteriPerLaProva(tutti, senza)
    expect(veloce[0]?.comando).toMatch(/vitest related --run src\/shared\/novita\.ts/)
    // Solo versione e note: nessuna prova vitest.
    expect(criteriPerLaProva(tutti, senzaSolaVersione(['package.json'], new Set(['package.json'])))).toEqual([])
    // package.json con altro dentro: tutta la suite, come prima.
    expect(criteriPerLaProva(tutti, ['package.json'])[0]?.comando).not.toMatch(/vitest related/)
    expect(criteriPerLaProva(tutti, ['package.json'])[0]?.comando).toMatch(/^npx vitest run/)
  })
})

describe('k-191e — lotti con file in comune ma senza conflitto', () => {
  const v = (id: string, file: string[]): VoceLotto => ({ id, ramo: `r-${id}`, file, dopo: [] })
  it('formaLotto lascia fuori chi tocca lo stesso file, la nuova funzione lo tiene se il merge è libero', async () => {
    const voci = [v('a', ['package.json', 'a.ts']), v('b', ['package.json', 'b.ts']), v('c', ['c.ts'])]
    expect(formaLotto(voci).map((x) => x.id)).toEqual(['a', 'c'])
    expect((await formaLottoSenzaConflitti(voci, async () => true)).map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })
  it('un conflitto vero, o un errore di git, tiene il ramo fuori', async () => {
    const voci = [v('a', ['x.ts']), v('b', ['x.ts']), v('c', ['x.ts', 'y.ts'])]
    const chiesti: string[] = []
    const r = await formaLottoSenzaConflitti(voci, async (u, w) => { chiesti.push(`${u.id}${w.id}`); if (w.id === 'b') return false; return true })
    expect(r.map((x) => x.id)).toEqual(['a', 'c'])
    expect(chiesti).toEqual(['ab', 'ac'])
    const errore = await formaLottoSenzaConflitti(voci, async () => { throw new Error('git vecchio') })
    expect(errore.map((x) => x.id)).toEqual(['a'])
  })
  it('non guarda il merge se i file sono diversi, e rispetta dipendenze e tetto', async () => {
    let chiamate = 0
    const voci = [v('a', ['a.ts']), v('b', ['b.ts']), { ...v('c', ['c.ts']), dopo: ['a'] }, v('d', [])]
    const r = await formaLottoSenzaConflitti(voci, async () => { chiamate += 1; return true })
    expect(r.map((x) => x.id)).toEqual(['a', 'b'])
    expect(chiamate).toBe(0)
    const molti = Array.from({ length: 12 }, (_, i) => v(`m${i}`, [`f${i}.ts`]))
    expect((await formaLottoSenzaConflitti(molti, async () => true, 3))).toHaveLength(3)
  })
})

describe('k-191e — scadenza adattiva', () => {
  const min = 60_000
  it('con poche prove vale il tetto', () => {
    expect(scadenzaAdattiva([], PROVA_MAX_MS)).toBe(PROVA_MAX_MS)
    expect(scadenzaAdattiva([1000, 2000], PROVA_MAX_MS)).toBe(PROVA_MAX_MS)
  })
  it('è 4 volte la mediana, mai sotto 5 minuti né sopra il tetto', () => {
    expect(scadenzaAdattiva([3 * min, 4 * min, 3.5 * min], PROVA_MAX_MS)).toBe(14 * min)
    expect(scadenzaAdattiva([10_000, 20_000, 30_000], PROVA_MAX_MS)).toBe(5 * min)
    expect(scadenzaAdattiva([30 * min, 30 * min, 30 * min], PROVA_MAX_MS)).toBe(PROVA_MAX_MS)
    expect(scadenzaAdattiva([3 * min, 3 * min, 3 * min], 10 * min)).toBe(10 * min)
  })
  it('ogni scadenza dà più tempo (k-191a), fino al tetto; guarda solo le ultime 10', () => {
    const d = [3 * min, 3 * min, 3 * min]
    expect(scadenzaAdattiva(d, PROVA_MAX_MS, 2)).toBe(24 * min)
    expect(scadenzaAdattiva(d, PROVA_MAX_MS, 3)).toBe(36 * min)
    expect(scadenzaAdattiva(d, 30 * min, 3)).toBe(30 * min)
    const vecchie = [...Array(20).fill(40 * min), ...Array(10).fill(1 * min)]
    expect(scadenzaAdattiva(vecchie, PROVA_MAX_MS)).toBe(5 * min)
  })
})

describe('k-191e — le misure pesanti di workspace diversi passano dal turno del PC', () => {
  it('due suite in cartelle diverse non girano insieme', async () => {
    const turni = creaTurni()
    let insieme = 0
    let massimo = 0
    const esegui = async (): Promise<{ codice: number; uscita: string }> => {
      insieme += 1
      massimo = Math.max(massimo, insieme)
      await new Promise((r) => setTimeout(r, 15))
      insieme -= 1
      return { codice: 0, uscita: '' }
    }
    const e = conTurni(esegui, turni)
    await Promise.all([e('npx vitest run', 'C:/ws/uno'), e('npx vitest run', 'C:/ws/due'), e('npx vitest run', 'C:/ws/tre')])
    expect(massimo).toBe(1)
  })
})
