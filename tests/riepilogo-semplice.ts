import type { Reporter, TestModule, TestRunEndReason } from 'vitest/node'

/**
 * Un riepilogo senza colori, in coda a quello di vitest.
 *
 * Chi legge l'esito della suite da un file (l'autopilota di SierraDeck, uno
 * script di rilascio) cerca la riga `Tests N passed (N)`. Su Windows vitest
 * colora l'uscita anche quando non e' un terminale (picocolors accende i
 * colori per il solo fatto di essere su win32), e la riga comincia con un
 * codice ANSI: `^ *Tests` non la trova, e una suite verde risulta rossa.
 * Queste due righe sono in chiaro, sempre, e dicono la stessa cosa: se non
 * e' fallito niente, la riga con «failed» non c'e'.
 */
export default class RiepilogoSemplice implements Reporter {
  onTestRunEnd(testModules: ReadonlyArray<TestModule>, unhandledErrors: ReadonlyArray<unknown>, reason: TestRunEndReason): void {
    let passati = 0
    let falliti = 0
    let altri = 0
    for (const m of testModules) {
      for (const t of m.children.allTests()) {
        const stato = t.result().state
        if (stato === 'passed') passati += 1
        else if (stato === 'failed') falliti += 1
        else altri += 1
      }
    }
    const totale = passati + falliti + altri
    const righe = [`      Tests ${passati} passed (${totale})`]
    const guai: string[] = []
    if (falliti > 0) guai.push(`${falliti} failed`)
    if (unhandledErrors.length > 0) guai.push(`${unhandledErrors.length} unhandled errors`)
    if (reason !== 'passed') guai.push(`run ${reason}`)
    if (guai.length > 0) righe.push(`      Tests ${guai.join(', ')} (${totale})`)
    process.stdout.write(`\n${righe.join('\n')}\n`)
  }
}
