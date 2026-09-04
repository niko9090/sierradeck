import { describe, it, expect } from 'vitest'
import { compilaRegole, giudizio } from '../../src/shared/gitignore'

/**
 * Le regole di un `.gitignore` che si incontrano davvero, e cosa devono fare.
 * Un progetto sul Drive porta con se' quello che git terrebbe, e lascia a casa
 * quello che git ignorerebbe.
 */
describe('gitignore', () => {
  const ignora = (testo: string, rel: string, cartella = false): boolean | undefined =>
    giudizio(compilaRegole(testo), rel, cartella)

  it('un nome semplice combacia a qualunque livello', () => {
    expect(ignora('node_modules', 'node_modules', true)).toBe(true)
    expect(ignora('node_modules', 'android/app/node_modules', true)).toBe(true)
    expect(ignora('*.log', 'a/b/c.log')).toBe(true)
    expect(ignora('*.log', 'a/b/c.txt')).toBeUndefined()
  })

  it('una barra in testa ancora alla cartella del gitignore', () => {
    expect(ignora('/dist', 'dist', true)).toBe(true)
    expect(ignora('/dist', 'pacchetti/dist', true)).toBeUndefined()
    // Anche una barra in mezzo ancora.
    expect(ignora('out/*.exe', 'out/a.exe')).toBe(true)
    expect(ignora('out/*.exe', 'x/out/a.exe')).toBeUndefined()
  })

  it('una barra in coda vuol dire solo cartelle', () => {
    expect(ignora('build/', 'build', true)).toBe(true)
    expect(ignora('build/', 'build', false)).toBeUndefined()
  })

  it('il punto esclamativo riammette, e vince l ultima regola', () => {
    const testo = '*.log\n!importante.log'
    expect(ignora(testo, 'a.log')).toBe(true)
    expect(ignora(testo, 'importante.log')).toBe(false)
    expect(ignora('!x\nx', 'x')).toBe(true)
  })

  it('doppio asterisco, punto interrogativo e classi', () => {
    expect(ignora('**/temp', 'a/b/temp', true)).toBe(true)
    expect(ignora('docs/**', 'docs/a/b.md')).toBe(true)
    expect(ignora('a/**/z', 'a/z')).toBe(true)
    expect(ignora('a/**/z', 'a/b/c/z')).toBe(true)
    expect(ignora('file?.txt', 'file1.txt')).toBe(true)
    expect(ignora('file?.txt', 'file12.txt')).toBeUndefined()
    expect(ignora('*.[oa]', 'x.o')).toBe(true)
  })

  it('commenti, righe vuote e spazi in coda non contano; i punti sono letterali', () => {
    const testo = '# commento\n\n  \n*.tmp   \n'
    expect(compilaRegole(testo)).toHaveLength(1)
    expect(ignora(testo, 'a.tmp')).toBe(true)
    expect(ignora('a.b', 'aXb')).toBeUndefined()
  })

  it('una cartella ignorata copre anche quello che ha dentro', () => {
    expect(ignora('dist', 'dist/a/b.js')).toBe(true)
  })
})
