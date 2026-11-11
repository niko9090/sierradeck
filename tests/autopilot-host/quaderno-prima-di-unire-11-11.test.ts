import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chiudiProvaAsincrono, comeAsincrono, creaWorktree, iniziaProvaAsincrono, salvaLavoro } from '../../src/autopilot-host/worktree'
import { esegui, git, repositoryDiPartenza } from './worktree-comune'

/**
 * k-136 (11/11): la fila delle unioni era ferma da ore perché la cartella
 * principale aveva `.sierradeck/quaderno/lezioni.md` e `decisioni.md` modificati
 * e non salvati. Qui il quaderno è davvero di un repository git: salvato una
 * volta, poi riscritto come fa il programma (una riga con «(×2)», righe in
 * coda, una riga spostata). La prova di unione deve salvarlo e andare avanti.
 */

const repo = repositoryDiPartenza()
let progetto = ''
beforeEach(() => { progetto = repo.copia() })

const QUADERNO = join('.sierradeck', 'quaderno')
const lezioni = (p: string): string => join(p, QUADERNO, 'lezioni.md')
const decisioni = (p: string): string => join(p, QUADERNO, 'decisioni.md')

function quadernoSalvato(): void {
  mkdirSync(join(progetto, QUADERNO), { recursive: true })
  writeFileSync(lezioni(progetto), '- la fila non aspetta le note\n- due\n- tre\n')
  writeFileSync(decisioni(progetto), '- scelta uno\n- scelta due\n- scelta tre\n')
  esegui(['add', '-A'], progetto)
  esegui(['commit', '-q', '-m', 'quaderno salvato'], progetto)
}

/** Un ramo di chat con un suo file, pronto per l'unione. */
function ramoDiChat(): string {
  const wt = creaWorktree(git, { cwd: progetto, autopilota: 'ap1', chat: 'c-136', base: 'main' })
  if (!wt.ok) throw new Error('worktree non creato')
  writeFileSync(join(wt.cartella, 'b.txt'), 'dalla chat\n')
  salvaLavoro(git, wt.cartella, 'pezzo')
  return wt.ramo
}

/** Le modifiche del programma al quaderno: riga riscritta, aggiunte, riga spostata. */
function quadernoRiscritto(): void {
  writeFileSync(decisioni(progetto), '- scelta tre\n- scelta uno (×2)\n- scelta due\n- scelta quattro\n')
  writeFileSync(lezioni(progetto), '- due\n- la fila non aspetta le note\n- tre\n- una nuova lezione\n')
}

const ga = comeAsincrono(git)

describe('k-136: il quaderno salvato prima di unire, anche riscritto (11/11)', () => {
  it('quaderno riscritto (×2, righe aggiunte, riga spostata) con un ramo pronto: si salva e l’unione di prova parte', async () => {
    quadernoSalvato()
    const ramo = ramoDiChat()
    quadernoRiscritto()
    const prima = esegui(['rev-parse', 'HEAD'], progetto)

    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo, base: 'main' })).toEqual({ ok: true })

    // Il quaderno è stato salvato con un commit del programma, e la prova è partita.
    expect(esegui(['rev-parse', 'HEAD'], progetto)).not.toBe(prima)
    expect(esegui(['log', '-1', '--format=%s', 'HEAD'], progetto)).toBe('quaderno: le note del programma, prima di unire')
    expect(readFileSync(decisioni(progetto), 'utf8')).toBe('- scelta tre\n- scelta uno (×2)\n- scelta due\n- scelta quattro\n')
    expect(readFileSync(lezioni(progetto), 'utf8')).toBe('- due\n- la fila non aspetta le note\n- tre\n- una nuova lezione\n')
    expect(readFileSync(join(progetto, 'b.txt'), 'utf8')).toBe('dalla chat\n')

    // Confermata, il ramo entra nel principale.
    expect(await chiudiProvaAsincrono(ga, { cwd: progetto, tieni: true })).toBe(true)
    expect(git(['merge-base', '--is-ancestor', ramo, 'main'], progetto).codice).toBe(0)
  })

  // 11/11 (voce 3): prima «l'unione si ferma ancora» per qualunque file del codice modificato.
  // Adesso la ferma solo un file che il ramo tocca; il quaderno si salva comunque, e solo lui.
  it('stesso quaderno riscritto, con anche un file del codice modificato che il ramo non tocca: il quaderno si salva, l’unione parte, il file resta com’è', async () => {
    quadernoSalvato()
    const ramo = ramoDiChat()
    quadernoRiscritto()
    writeFileSync(join(progetto, 'a.txt'), 'a metà di Nicholas\n')

    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo, base: 'main' })).toEqual({ ok: true })

    // Il commit del programma porta solo il quaderno; il file di Nicholas non è toccato né salvato.
    expect(esegui(['log', '-1', '--format=%s', 'HEAD'], progetto)).toBe('quaderno: le note del programma, prima di unire')
    expect(esegui(['show', '--stat', '--format=', 'HEAD'], progetto)).not.toContain('a.txt')
    expect(readFileSync(join(progetto, 'a.txt'), 'utf8')).toBe('a metà di Nicholas\n')
    expect(readFileSync(decisioni(progetto), 'utf8')).toBe('- scelta tre\n- scelta uno (×2)\n- scelta due\n- scelta quattro\n')
    expect(await chiudiProvaAsincrono(ga, { cwd: progetto, tieni: true })).toBe(true)
    expect(git(['merge-base', '--is-ancestor', ramo, 'main'], progetto).codice).toBe(0)
    expect(readFileSync(join(progetto, 'a.txt'), 'utf8')).toBe('a metà di Nicholas\n')
    expect(git(['status', '--porcelain', '--untracked-files=no'], progetto).uscita).toMatch(/^M a\.txt$/)
  })

  it('se invece il ramo tocca quel file del codice, l’unione si ferma e lo dice: il file di Nicholas non è toccato', async () => {
    quadernoSalvato()
    const wt = creaWorktree(git, { cwd: progetto, autopilota: 'ap1', chat: 'c-137', base: 'main' })
    if (!wt.ok) throw new Error('worktree non creato')
    writeFileSync(join(wt.cartella, 'a.txt'), 'uno\ndalla chat\n')
    salvaLavoro(git, wt.cartella, 'tocca a.txt')
    quadernoRiscritto()
    writeFileSync(join(progetto, 'a.txt'), 'a metà di Nicholas\n')

    const r = await iniziaProvaAsincrono(ga, { cwd: progetto, ramo: wt.ramo, base: 'main' })
    expect(r).toEqual({ ok: false, motivo: 'la cartella di lavoro ha modifiche non salvate', file: ['a.txt'] })

    expect(readFileSync(join(progetto, 'a.txt'), 'utf8')).toBe('a metà di Nicholas\n')
    expect(readFileSync(decisioni(progetto), 'utf8')).toBe('- scelta tre\n- scelta uno (×2)\n- scelta due\n- scelta quattro\n')
    expect(git(['status', '--porcelain', '--untracked-files=no'], progetto).uscita).toMatch(/^M a\.txt$/)
  })
})
