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

  it('le copie di lavoro degli agenti (.claude/worktrees) restano a casa, il resto di .claude va (0.88.5)', async () => {
    const dir = progetto()
    for (const rel of ['.claude/worktrees/agent-1/src/a.ts', '.claude/settings.json', '.git/worktrees/agent-1/gitdir', '.git/HEAD']) {
      mkdirSync(join(dir, ...rel.split('/'), '..'), { recursive: true })
      writeFileSync(join(dir, ...rel.split('/')), 'x')
    }
    const rel = (await elencaFileProgetto(dir, 1000)).file
    expect(rel).toContain('.claude/settings.json')
    expect(rel.some((r) => r.startsWith('.claude/worktrees'))).toBe(false)
    // 0.94.0: nemmeno i segni di git per quelle copie; il resto di .git va.
    expect(rel).toContain('.git/HEAD')
    expect(rel.some((r) => r.startsWith('.git/worktrees'))).toBe(false)
  })

  it('rispetta i gitignore a ogni livello, porta .git, salta node_modules', async () => {
    const { file, troppoGrandi } = await elencaFileProgetto(progetto(), 1000)
    expect(file.sort()).toEqual([
      '.git/HEAD', '.git/objects/ab/cdef', '.gitignore',
      'android/.gitignore', 'android/app/src/Main.kt',
      // Dalla 0.69.0 «out» (uscita di build) resta a casa a ogni livello: «pacchetti/out/y.txt» non sale più.
      'src/a.ts', 'tieni.log'
    ])
    expect(troppoGrandi).toEqual(['grande.bin'])
  })

  it('uscite di build, file ricevuti e binari restano a casa (0.95.6); .git non cambia', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sd-progetto-'))
    const scrivi = (rel: string, testo = 'x'): void => {
      const p = join(dir, ...rel.split('/'))
      mkdirSync(join(p, '..'), { recursive: true })
      writeFileSync(p, testo)
    }
    for (const rel of ['src/a.ts', 'release/setup.txt', 'dist-electron/main.js', '.sierradeck/allegati/f.txt',
      '.sierradeck/consegne/f.txt', '.sierradeck/errori-arrivati/f.txt', '.sierradeck/note.md',
      'app.apk', 'a.aab', 'x/setup.EXE', 'a.msi', 'a.dmg', 'a.zip', 'a.7z', 'a.iso', 'a.mp4', 'a.mov',
      '.git/pack.zip']) scrivi(rel)
    const { file } = await elencaFileProgetto(dir)
    expect(file.sort()).toEqual(['.git/pack.zip', '.sierradeck/note.md', 'src/a.ts'])
  })

  it('il tetto e 20 MB fuori da .git, 50 MB dentro', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sd-progetto-'))
    mkdirSync(join(dir, '.git'))
    writeFileSync(join(dir, 'grosso.dat'), Buffer.alloc(21 * 1024 * 1024))
    writeFileSync(join(dir, 'ok.dat'), Buffer.alloc(19 * 1024 * 1024))
    writeFileSync(join(dir, '.git', 'pack'), Buffer.alloc(30 * 1024 * 1024))
    const { file, troppoGrandi } = await elencaFileProgetto(dir)
    expect(file.sort()).toEqual(['.git/pack', 'ok.dat'])
    expect(troppoGrandi).toEqual(['grosso.dat'])
  })

  it('una cartella che non c e da un elenco vuoto, non un errore', async () => {
    const { file } = await elencaFileProgetto(join(tmpdir(), 'sd-non-esiste-' + Date.now()))
    expect(file).toEqual([])
  })
})
