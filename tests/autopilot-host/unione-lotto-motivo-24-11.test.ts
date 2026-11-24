import { describe, it, expect, beforeEach, vi } from 'vitest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chiudiProvaAsincrono, comeAsincrono, creaWorktree, iniziaProvaAsincrono, salvaLavoro } from '../../src/autopilot-host/worktree'
import { unisciALotti } from '../../src/autopilot-host/unioni-a-lotti'
import { esegui, git, repositoryDiPartenza } from './worktree-comune'

/**
 * 24/11 (k-rap2): un lotto di rami uniti insieme (merge a polpo) che fallisce senza file in conflitto
 * mostrava il testo grezzo di git («Trying simple merge…»). Ora il motivo è una frase in italiano e il
 * lotto si divide: i rami non segnati «non partiti» per sempre, ma riprovati a metà e poi uno alla volta.
 */
const repo = repositoryDiPartenza()
let progetto = ''
beforeEach(() => { progetto = repo.copia() })
// Molti comandi git veri: col PC carico servono più dei 20 s di base.
vi.setConfig({ testTimeout: 120_000 })
const reale = comeAsincrono(git)

function ramoCon(chat: string, file: string, testo: string): string {
  const wt = creaWorktree(git, { cwd: progetto, autopilota: 'ap1', chat, base: 'main' })
  if (!wt.ok) throw new Error('worktree non creato')
  writeFileSync(join(wt.cartella, file), testo)
  salvaLavoro(git, wt.cartella, `pezzo ${chat}`)
  return wt.ramo
}

describe('lotto fallito senza conflitti', () => {
  it('il motivo è in italiano, senza il testo di git; il lotto si divide e i rami buoni entrano', async () => {
    const b1 = ramoCon('c-1', 'x.txt', 'nuovo\n')
    const b2 = ramoCon('c-2', 'a.txt', 'uno\ndue\n')
    const b3 = ramoCon('c-3', 'a.txt', 'uno\ntre\n')
    const tentativi: string[][] = []
    // Il polpo di git che si ferma senza lasciare file in conflitto: lo simula il git finto, solo per i lotti con b2 e b3 insieme.
    const ga: typeof reale = async (args, cwd, segnale) => {
      if (args.includes('merge') && args.includes('--no-commit') && args.includes(b2) && args.includes(b3)) {
        return { codice: 2, uscita: `Trying simple merge with ${b1}
Trying simple merge with ${b2}
Simple merge did not work, trying automatic merge.
Auto-merging a.txt
Merge with strategy octopus failed.` }
      }
      return reale(args, cwd, segnale)
    }
    const prova = async (rami: string[]) => {
      tentativi.push(rami)
      const inizio = await iniziaProvaAsincrono(ga, { cwd: progetto, ramo: rami[0]!, base: 'main', ...(rami.length > 1 ? { altri: rami.slice(1) } : {}) })
      if (!inizio.ok) return { unito: false as const, motivo: inizio.motivo }
      await chiudiProvaAsincrono(ga, { cwd: progetto, tieni: false })
      return { unito: true as const }
    }
    const intero = await prova([b1, b2, b3])
    expect(intero.unito).toBe(false)
    const motivo = intero.unito ? '' : intero.motivo
    expect(motivo).toContain('i rami del lotto si scontrano fra loro: si provano uno alla volta')
    expect(motivo).not.toContain('Trying simple merge')
    expect(motivo).toContain('(file: a.txt)')
    expect(git(['status', '--porcelain'], progetto).uscita).toBe('')
    expect(esegui(['rev-parse', '--abbrev-ref', 'HEAD'], progetto).trim()).toBe('main')

    tentativi.length = 0
    const r = await unisciALotti([b1, b2, b3], prova)
    // Il ripiego scatta: più di una prova, il lotto intero non resta «non provato».
    expect(r.prove).toBeGreaterThan(1)
    expect(tentativi[0]).toEqual([b1, b2, b3])
    expect(r.esiti.get(b1)?.esito).toBe('entrato')
    expect(r.esiti.get(b2)?.esito).toBe('entrato')
    const e3 = r.esiti.get(b3)
    expect(e3?.esito).toBe('colpevole')
    const motivoB3 = e3?.esito === 'colpevole' ? e3.motivo : ''
    expect(motivoB3).not.toContain('Trying simple merge')
  })
})
