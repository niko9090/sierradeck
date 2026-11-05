import { describe, it, expect } from 'vitest'
import { separaAvvisiNode, soloAvvisiNode } from '../../src/shared/avvisi-node'
import { consoleNelRegistro } from '../../src/main/console-nel-registro'
import { leggiStderrAtteso } from '../../src/main/pty-host-client'

const AVVISO = '(node:27872) [DEP0180] DeprecationWarning: fs.Stats constructor is deprecated.'
const SUGGERIMENTO = '(Use `SierraDeck --trace-deprecation ...` to show where the warning was created)'

/** Lotto 20261105223912: un avviso di Node finiva negli errori arrivati. */
describe('avvisi di Node (0.94.4)', () => {
  it('riconosce gli avvisi e la riga di seguito, lascia il resto', () => {
    expect(soloAvvisiNode(`${AVVISO}\n${SUGGERIMENTO}`)).toBe(true)
    expect(soloAvvisiNode('(node:1) ExperimentalWarning: SQLite is an experimental feature')).toBe(true)
    const r = separaAvvisiNode(`${AVVISO}\n${SUGGERIMENTO}\nError: ENOENT boom`)
    expect(r.avvisi).toHaveLength(2)
    expect(r.resto).toBe('Error: ENOENT boom')
    expect(soloAvvisiNode(`${AVVISO}\nError: ENOENT boom`)).toBe(false)
    expect(soloAvvisiNode('Error: ENOENT boom')).toBe(false)
  })

  it('console.error con un avviso va nel registro come info; un errore vero resta ERRORE', () => {
    const righe: string[] = []
    const c = { warn: () => undefined, error: () => undefined } as Pick<Console, 'warn' | 'error'>
    consoleNelRegistro({ info: (m) => righe.push(`info ${m}`), errore: (m) => righe.push(`ERRORE ${m}`) }, c)
    c.error(`${AVVISO}\n${SUGGERIMENTO}`)
    c.error('[workspace] salvataggio fallito: EBUSY')
    expect(righe[0]).toMatch(/^info \(node:27872\)/)
    expect(righe[1]).toMatch(/^ERRORE \[workspace\]/)
  })

  it('lo stderr del PTY host: l avviso e raccontato, un errore vero resta errore', () => {
    const a = leggiStderrAtteso(`${AVVISO}\n${SUGGERIMENTO}\n`)
    expect(a.errore).toBe('')
    expect(a.raccontate).toHaveLength(2)
    const b = leggiStderrAtteso(`${AVVISO}\nTypeError: x is not a function\n`)
    expect(b.errore).toBe('TypeError: x is not a function')
  })
})
