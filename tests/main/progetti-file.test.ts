import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { elencaFileProgetto } from '../../src/main/progetti/file'

/**
 * Cosa di un progetto va sul Drive: quello che git terrebbe, piu' `.git`;
 * niente `node_modules`, niente di cio' che i `.gitignore` — a ogni livello —
 * dicono di lasciare a casa, niente file enormi.
 */
describe('elencaFileProgetto', () => {
  function progetto(): string {
    const dir = mkdtempSync(join(tmpdir(), 'sd-progetto-'))
    const scrivi = (rel: string, testo = 'x'): void => {
      const p = join(dir, ...rel.split('/'))
      mkdirSync(join(p, '..'), { recursive: true })
      writeFileSync(p, testo)
    }
    scrivi('.gitignore', 'dist/\n*.log\n!tieni.log\n/out\n')
    scrivi('src/a.ts')
    scrivi('src/b.log')
    scrivi('tieni.log')
    scrivi('dist/bundle.js')
    scrivi('out/x.exe')
    scrivi('pacchetti/out/y.txt')
    scrivi('node_modules/lib/index.js')
    scrivi('.git/HEAD', 'ref: refs/heads/main')
    scrivi('.git/objects/ab/cdef')
    scrivi('android/.gitignore', 'build/\n*.apk\n')
    scrivi('android/app/build/classes.dex')
    scrivi('android/app/release.apk')
    scrivi('android/app/src/Main.kt')
    scrivi('grande.bin', 'x'.repeat(2000))
    scrivi('Thumbs.db')
    return dir
  }

  it('rispetta i gitignore a ogni livello, porta .git, salta node_modules', async () => {
    const { file, troppoGrandi } = await elencaFileProgetto(progetto(), 1000)
    expect(file.sort()).toEqual([
      '.git/HEAD', '.git/objects/ab/cdef', '.gitignore',
      'android/.gitignore', 'android/app/src/Main.kt',
      'pacchetti/out/y.txt', 'src/a.ts', 'tieni.log'
    ])
    expect(troppoGrandi).toEqual(['grande.bin'])
  })

  it('una cartella che non c e da un elenco vuoto, non un errore', async () => {
    const { file } = await elencaFileProgetto(join(tmpdir(), 'sd-non-esiste-' + Date.now()))
    expect(file).toEqual([])
  })
})
