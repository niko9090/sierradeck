import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { elencaFileProgetto, ramoDiLavoroGiovane, RAMO_DI_LAVORO_SALE_DOPO_MS, transitorioDiGit } from '../../src/main/progetti/file'

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

  it('11/11: i file di .git che durano il tempo di un’operazione restano a casa; la storia e i rami vengono', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sd-progetto-'))
    const scrivi = (rel: string, testo = 'x'): void => {
      const p = join(dir, ...rel.split('/'))
      mkdirSync(join(p, '..'), { recursive: true })
      writeFileSync(p, testo)
    }
    const restano = [
      '.git/MERGE_HEAD', '.git/MERGE_MSG', '.git/MERGE_MODE', '.git/AUTO_MERGE', '.git/sierradeck-prova.json',
      '.git/index.lock', '.git/HEAD.lock', '.git/refs/heads/main.lock', 'sotto/.git/MERGE_HEAD', 'sotto/.git/index.lock',
      // 25/11: i segni del momento e il diario dei rami delle copie di lavoro.
      '.git/ORIG_HEAD', '.git/FETCH_HEAD', '.git/logs/refs/heads/worktree-agent-a1b2', 'sotto/.git/logs/refs/heads/worktree-prova'
    ]
    const vengono = [
      '.git/HEAD', '.git/index', '.git/packed-refs', '.git/config', '.git/logs/HEAD', '.git/logs/refs/heads/main',
      '.git/refs/tags/v1.0.0', '.git/refs/remotes/origin/main', '.git/refs/heads/ap/c-1',
      // Il ramo di uno specialista sale (11/11) se non si sa quando è nato: qui il suo diario non c'è.
      '.git/refs/heads/main', '.git/refs/heads/worktree-agent-a1b2', '.git/objects/ab/cdef',
      // Fuori da .git un nome uguale è un file come gli altri.
      'src/MERGE_HEAD', 'pacchetto.lock', 'src/sierradeck-prova.json', 'sotto/.git/HEAD'
    ]
    for (const rel of [...restano, ...vengono]) scrivi(rel)
    const { file } = await elencaFileProgetto(dir)
    expect(file.sort()).toEqual([...vengono].sort())
    for (const rel of restano) expect(transitorioDiGit(rel), rel).toBe(true)
    for (const rel of vengono) expect(transitorioDiGit(rel), rel).toBe(false)
  })

  it('25/11: il ramo di uno specialista nato da poco non sale; uno vecchio sì, anche dopo un commit nuovo', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sd-progetto-'))
    const scrivi = (rel: string, testo = 'x'): void => {
      const p = join(dir, ...rel.split('/'))
      mkdirSync(join(p, '..'), { recursive: true })
      writeFileSync(p, testo)
    }
    const adesso = Date.UTC(2026, 10, 25, 12, 0, 0)
    const riga = (msFa: number, msg: string): string =>
      `${'0'.repeat(40)} ${'a'.repeat(40)} Persona <persona@esempio.invalid> ${Math.floor((adesso - msFa) / 1000)} +0100\t${msg}\n`
    scrivi('.git/HEAD', 'ref: refs/heads/main')
    scrivi('.git/refs/heads/main', 'a'.repeat(40))
    scrivi('.git/logs/refs/heads/main', riga(5_000, 'commit: nuovo'))
    // Nato 2 minuti fa: si unisce e si toglie prima di salire.
    scrivi('.git/refs/heads/worktree-agent-giovane', 'b'.repeat(40))
    scrivi('.git/logs/refs/heads/worktree-agent-giovane', riga(2 * 60_000, 'branch: Created from HEAD'))
    // Nato 2 ore fa, commit un minuto fa: conta la nascita, resta sul Drive.
    scrivi('.git/refs/heads/worktree-agent-vecchio', 'c'.repeat(40))
    scrivi('.git/logs/refs/heads/worktree-agent-vecchio', riga(2 * 60 * 60_000, 'branch: Created from HEAD') + riga(60_000, 'commit: ancora'))
    // Un worktree con nome, in una sotto-cartella del ramo.
    scrivi('.git/refs/heads/worktree-nuovo/parte', 'd'.repeat(40))
    scrivi('.git/logs/refs/heads/worktree-nuovo/parte', riga(1_000, 'branch: Created from HEAD'))
    const { file } = await elencaFileProgetto(dir, undefined, adesso)
    expect(file.sort()).toEqual(['.git/HEAD', '.git/logs/refs/heads/main', '.git/refs/heads/main', '.git/refs/heads/worktree-agent-vecchio'])
    // Il confine: appena oltre la mezz'ora sale.
    expect(await ramoDiLavoroGiovane(dir, '.git/refs/heads/worktree-agent-giovane', adesso - 2 * 60_000 + RAMO_DI_LAVORO_SALE_DOPO_MS + 1_000)).toBe(false)
    // Solo i rami delle copie di lavoro: `main` non e' mai «giovane».
    expect(await ramoDiLavoroGiovane(dir, '.git/refs/heads/main', adesso)).toBe(false)
  })
})
