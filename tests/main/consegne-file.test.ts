import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { scriviFileConsegna } from '../../src/main/consegne-file'
import { preparaConsegna } from '@shared/consegna-breve'

/** Il file della consegna lunga (0.38.1): dentro la cartella, fuori da git. */
describe('il file della consegna', () => {
  it('si scrive in .sierradeck/consegne con un .gitignore suo, e mai fuori dalla cartella', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sd-consegna-'))
    try {
      const c = preparaConsegna({ id: 'c-7', cosa: 'scrivi', testo: 'riga\n'.repeat(100), titolo: 'T' }, (rel, t) => scriviFileConsegna(dir, rel, t))
      expect(c.testo).toContain('.sierradeck/consegne/c-7.md')
      expect(readFileSync(join(dir, '.sierradeck/consegne/c-7.md'), 'utf8')).toContain('riga')
      expect(readFileSync(join(dir, '.sierradeck/consegne/.gitignore'), 'utf8')).toContain('*')
      expect(scriviFileConsegna(dir, '../fuori.md', 'x')).toBe(false)
      expect(scriviFileConsegna(dir, '.sierradeck/consegne/../../fuori.md', 'x')).toBe(false)
      expect(existsSync(join(dir, '..', 'fuori.md'))).toBe(false)
      expect(scriviFileConsegna(join(dir, 'non-c-e'), '.sierradeck/consegne/a.md', 'x')).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

/**
 * La prova vera (0.38.1): Claude Code in un pty, come lo apre il programma; la
 * riga corta digitata senza marcatori e Invio; la chat legge il file ed esegue.
 * Saltata se Claude Code non c'e'; parte solo con SIERRADECK_PROVA_CLAUDE=1,
 * perche' ogni giro consuma il piano.
 */
const segnoBreve = (): string => Math.floor(Math.random() * 1e6).toString(36)
const conClaude = spawnSync('claude.exe', ['--version'], { encoding: 'utf8', windowsHide: true }).status === 0
const voluta = process.env.SIERRADECK_PROVA_CLAUDE === '1'
describe.skipIf(!conClaude || !voluta)('con un Claude Code vero', () => {
  it('la riga corta parte al primo Invio e la chat esegue le istruzioni del file', async () => {
    const pty = await import('node-pty')
    // La cartella del progetto: e' gia' «fidata» per Claude Code, come le
    // cartelle delle chat del programma (una cartella nuova chiederebbe prima
    // se fidarsi). Il file sta in .sierradeck/consegne, fuori da git.
    const dir = process.cwd()
    const segno = `SEGNO${Math.floor(Math.random() * 1e6)}`
    const c = preparaConsegna(
      { id: `prova-${segnoBreve()}`, cosa: 'scrivi', testo: `Prova del programma SierraDeck.\nRispondi soltanto con la parola ${segno} e nient'altro.\n`, titolo: 'prova' },
      (rel, t) => scriviFileConsegna(dir, rel, t)
    )
    let flusso = ''
    const p = pty.spawn('claude.exe', ['--session-id', randomUUID(), '--dangerously-skip-permissions'], { name: 'xterm-256color', cols: 120, rows: 40, cwd: dir, env: process.env as Record<string, string>, useConpty: true })
    p.onData((d) => { flusso += d })
    const attendi = async (re: RegExp, ms: number): Promise<boolean> => {
      const fine = Date.now() + ms
      while (Date.now() < fine) { if (re.test(flusso)) return true; await new Promise((r) => setTimeout(r, 200)) }
      return false
    }
    try {
      // La prima volta in una cartella nuova chiede se fidarsi, con «No, exit»
      // gia' scelto: freccia giu' su «Yes, I trust this folder», poi Invio.
      if (await attendi(/trust this folder/i, 15000)) {
        p.write(String.fromCharCode(27) + '[B')
        await new Promise((r) => setTimeout(r, 300))
        p.write('\r')
      }
      expect(await attendi(/❯/, 60000)).toBe(true)
      await new Promise((r) => setTimeout(r, 1500))
      const prima = flusso.length
      p.write(c.testo)
      await new Promise((r) => setTimeout(r, 200))
      p.write('\r')
      expect(await attendi(new RegExp(segno), 90000)).toBe(true)
      expect(flusso.slice(prima)).toContain(segno)
    } finally {
      p.kill()
      rmSync(join(dir, c.testo.match(/(\.sierradeck\/consegne\/[^ ]+\.md)/)?.[1] ?? 'nessuno'), { force: true })
    }
  }, 180_000)
})
