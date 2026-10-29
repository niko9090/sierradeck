import { describe, it, expect } from 'vitest'
import { execFile, execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  leggiNameStatus, leggiStatusPorcelain, leggiNumstat, unisciFile, cartelleDaGuardare, leggiDiff, percorsoSicuro
} from '@shared/file-autopilota'
import { fileDellAutopilota, diffDellAutopilota } from '../../src/main/file-autopilota'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import { ambienteGitFinto, usaGitFinto } from '../setup/git-finto'

/** La linguetta «File» (0.38.0): lettura di git e raggruppamento per chat. */
describe('lettura di git', () => {
  it('git status --porcelain: nuovi, modificati, cancellati, rinominati, con le virgolette di git', () => {
    const m = leggiStatusPorcelain(' M src/a.ts\n?? nuovo.txt\n D vecchio.ts\nR  prima.ts -> dopo.ts\n?? "con spazio.md"\nA  aggiunto.ts\n')
    expect(Object.fromEntries(m)).toEqual({
      'src/a.ts': { stato: 'modificato' },
      'nuovo.txt': { stato: 'nuovo' },
      'vecchio.ts': { stato: 'cancellato' },
      'dopo.ts': { stato: 'rinominato', vecchio: 'prima.ts' },
      'con spazio.md': { stato: 'nuovo' },
      'aggiunto.ts': { stato: 'nuovo' }
    })
  })
  it('git diff --numstat: righe, binari e rinominati con le graffe', () => {
    const m = leggiNumstat('10\t2\tsrc/a.ts\n-\t-\tlogo.png\n3\t1\tsrc/{vecchio => nuovo}/b.ts\n1\t0\tx.ts => y.ts\n')
    expect(m.get('src/a.ts')).toEqual({ piu: 10, meno: 2, binario: false })
    expect(m.get('logo.png')).toEqual({ piu: 0, meno: 0, binario: true })
    expect(m.get('src/nuovo/b.ts')).toEqual({ piu: 3, meno: 1, binario: false })
    expect(m.get('y.ts')?.piu).toBe(1)
  })
  it('git diff --name-status', () => {
    expect(Object.fromEntries(leggiNameStatus('A\tn.ts\nM\tm.ts\nD\td.ts\nR087\tp.ts\tq.ts\n'))).toEqual({
      'n.ts': { stato: 'nuovo' }, 'm.ts': { stato: 'modificato' }, 'd.ts': { stato: 'cancellato' }, 'q.ts': { stato: 'rinominato', vecchio: 'p.ts' }
    })
  })
  it('già in commit e ancora da salvare si uniscono; da salvare prima', () => {
    const f = unisciFile({
      salvati: new Map([['a.ts', { stato: 'nuovo' as const }], ['b.ts', { stato: 'modificato' as const }]]),
      righeSalvati: new Map([['a.ts', { piu: 5, meno: 0, binario: false }], ['b.ts', { piu: 1, meno: 1, binario: false }]]),
      daSalvare: new Map([['a.ts', { stato: 'modificato' as const }]]),
      righeDaSalvare: new Map([['a.ts', { piu: 2, meno: 1, binario: false }]])
    })
    expect(f).toEqual([
      { percorso: 'a.ts', stato: 'nuovo', piu: 7, meno: 1, salvato: false },
      { percorso: 'b.ts', stato: 'modificato', piu: 1, meno: 1, salvato: true }
    ])
  })
  it('le cartelle per chat: il progetto e i worktree; la base detta per esteso', () => {
    const c = cartelleDaGuardare({
      cwd: 'E:/p', commitBase: 'abcdef1234', chats: [
        { id: 'c-1', compito: 'pagina', cartella: 'E:/p.sierradeck-wt/ap-c-1', ramo: 'ap/ap/c-1' },
        { id: 'c-2', compito: 'stessa cartella' }
      ]
    })
    expect(c.map((x) => x.chiave)).toEqual(['principale', 'c-1'])
    expect(c[1]).toMatchObject({ ramo: 'ap/ap/c-1', base: 'abcdef1234' })
    expect(c[0]?.spiegaBase).toContain('dal commit da cui è partito')
    expect(cartelleDaGuardare({ cwd: 'E:/p', chats: [] })[0]?.base).toBe('HEAD')
  })
  it('il diff in righe colorate, e i percorsi pericolosi rifiutati', () => {
    const d = leggiDiff('diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-vecchia\n+nuova\n contesto')
    expect(d.righe.map((r) => r.tipo)).toEqual(['testa', 'testa', 'testa', 'blocco', 'meno', 'piu', 'contesto'])
    expect(percorsoSicuro('src/a.ts')).toBe(true)
    expect(percorsoSicuro('../fuori')).toBe(false)
    expect(percorsoSicuro('C:/Windows/x')).toBe(false)
  })
})

/**
 * Ogni avvio di git, col PC carico, costa da 0,5 a 4 s (20/10: il test faceva
 * circa 36 avvii e arrivava a 40-60 s). Per questo autore e configurazione
 * passano dall'ambiente invece che da tre `git config`, e le chiamate al diff,
 * che ricalcolano tutto l'elenco, passano da un git vero che ricorda le
 * risposte: il repository non cambia fra una chiamata e l'altra, quindi la
 * stessa domanda ha la stessa risposta. Date e configurazione sempre uguali
 * (`git-finto.ts`): ogni comando un secondo dopo il precedente.
 */
usaGitFinto()
const ambienteGit = (): NodeJS.ProcessEnv => ({
  ...process.env,
  GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t',
  ...ambienteGitFinto([['core.autocrlf', 'false']])
})

type Risposta = { codice: number; uscita: string }
function gitCheRicorda(): (args: string[], cwd: string) => Promise<Risposta> {
  const viste = new Map<string, Promise<Risposta>>()
  return (args, cwd) => {
    const chiave = cwd + '|' + args.join('|')
    let r = viste.get(chiave)
    if (r === undefined) {
      r = new Promise((ok) => {
        execFile('git', ['-c', 'core.quotepath=false', ...args], { cwd, encoding: 'utf8', windowsHide: true, env: ambienteGit() }, (err, stdout) => {
          ok({ codice: err === null ? 0 : typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : 1, uscita: stdout ?? '' })
        })
      })
      viste.set(chiave, r)
    }
    return r
  }
}

describe('con un repository git vero', () => {
  it('file in commit dalla partenza e file da salvare, con il diff', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sd-file-'))
    try {
      const g = (...a: string[]): string => execFileSync('git', a, { cwd: dir, encoding: 'utf8', env: ambienteGit() })
      g('init', '-q')
      writeFileSync(join(dir, 'a.txt'), 'uno\ndue\n'); g('add', '.'); g('commit', '-qm', 'base')
      const base = g('rev-parse', 'HEAD').trim()
      writeFileSync(join(dir, 'b.txt'), 'nuovo\n'); g('add', '.'); g('commit', '-qm', 'lavoro')
      writeFileSync(join(dir, 'a.txt'), 'uno\nDUE\n')
      mkdirSync(join(dir, 'sub')); writeFileSync(join(dir, 'sub', 'c.txt'), 'x\ny\n')
      const a: Autopilota = { ...nuovoAutopilota({ id: 'ap-1', nome: 'x', obiettivo: 'o', cwd: dir, criteri: [], iniziatoIl: '2026-10-01T10:00:00.000Z' }), commitBase: base }
      const [gr] = await fileDellAutopilota(a)
      expect(gr?.file).toEqual([
        { percorso: 'a.txt', stato: 'modificato', piu: 1, meno: 1, salvato: false },
        { percorso: 'sub/c.txt', stato: 'nuovo', piu: 2, meno: 0, salvato: false },
        { percorso: 'b.txt', stato: 'nuovo', piu: 1, meno: 0, salvato: true }
      ])
      const git = gitCheRicorda()
      const d = await diffDellAutopilota(a, 'principale', 'a.txt', git)
      expect(leggiDiff(d).righe.filter((r) => r.tipo === 'piu').map((r) => r.testo)).toEqual(['DUE'])
      expect(await diffDellAutopilota(a, 'principale', 'sub/c.txt', git)).toContain('+x')
      await expect(diffDellAutopilota(a, 'principale', '../fuori.txt', git)).rejects.toThrow()
      await expect(diffDellAutopilota(a, 'principale', 'non-cambiato.txt', git)).rejects.toThrow()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
