import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * **Il controllo automatico** (0.72.0): nel programma, nel servizio e negli
 * script ogni cancellazione ricorsiva passa da `cancellaSicura` (o, per il
 * Cestino, da `cestinoSicuro`). Fallisce se ne compare una che la aggira.
 */
const RADICE = join(__dirname, '..', '..')

function file(dir: string): string[] {
  const out: string[] = []
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) out.push(...file(p))
    else if (/\.(ts|tsx|js|mjs|cjs|ps1|sh|cmd|bat)$/.test(n)) out.push(p)
  }
  return out
}

const VIETATI: Array<[string, RegExp]> = [
  ['rmSync ricorsivo', /rmSync\([^)]*recursive/],
  ['rm ricorsivo di fs/promises', /\brm\([^)]*recursive/],
  ['rmdir ricorsivo', /rmdir(Sync)?\([^)]*recursive/],
  ['emptyDir', /emptyDir(Sync)?\(/],
  ['rimraf', /rimraf/],
  ['Remove-Item -Recurse', /Remove-Item[^\n]*-Recurse|-Recurse[^\n]*Remove-Item/i],
  ['rd/rmdir /s di cmd', /\b(rd|rmdir)\s+\/s\b/i],
  ['rm -r della shell', /(^|[\s'"`;&|(])rm\s+-[a-zA-Z]*[rR]/]
]

describe('ogni cancellazione ricorsiva passa dalla guardia', () => {
  const tutti = [...file(join(RADICE, 'src')), ...file(join(RADICE, 'scripts'))]
    .filter((p) => !/cancella-sicura/.test(p))

  it('ci sono file da controllare', () => {
    expect(tutti.length).toBeGreaterThan(100)
  })

  for (const [nome, re] of VIETATI) {
    it(`nessun ${nome} fuori da cancella-sicura`, () => {
      const trovati: string[] = []
      for (const p of tutti) {
        // I divieti dei comandi parlano di questi comandi per riconoscerli: si guardano solo le righe di codice.
        readFileSync(p, 'utf8').split(/\r?\n/).forEach((riga, i) => {
          const t = riga.trim()
          if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('#')) return
          if (re.test(riga)) trovati.push(`${relative(RADICE, p)}:${i + 1}: ${t.slice(0, 120)}`)
        })
      }
      expect(trovati).toEqual([])
    })
  }

  it('ogni Cestino (shell.trashItem) passa da cestinoSicuro', () => {
    const trovati: string[] = []
    for (const p of tutti) {
      readFileSync(p, 'utf8').split(/\r?\n/).forEach((riga, i) => {
        if (/trashItem\(/.test(riga) && !/cestinoSicuro\(/.test(riga) && !riga.trim().startsWith('//') && !riga.trim().startsWith('*')) {
          trovati.push(`${relative(RADICE, p)}:${i + 1}`)
        }
      })
    }
    expect(trovati).toEqual([])
  })

  it('il controllo trova davvero quello che cerca', () => {
    expect(VIETATI.find(([n]) => n === 'rmSync ricorsivo')![1].test("rmSync(x, { recursive: true, force: true })")).toBe(true)
    expect(VIETATI.find(([n]) => n === 'rm -r della shell')![1].test('bash -c "rm -rf $d"')).toBe(true)
    expect(VIETATI.find(([n]) => n === 'Remove-Item -Recurse')![1].test('Remove-Item $env:LOCALAPPDATA -Recurse -Force')).toBe(true)
  })
})
