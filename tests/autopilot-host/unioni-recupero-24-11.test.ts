import { describe, it, expect, beforeEach } from 'vitest'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chiudiProvaAsincrono, comeAsincrono, creaWorktree, iniziaProvaAsincrono, MOTIVO_CARTELLA_SPORCA, ripulisciProvaAsincrono, salvaLavoro, type EsitoRecupero } from '../../src/autopilot-host/worktree'
import { esegui, git, repositoryDiPartenza } from './worktree-comune'

/**
 * 24/11 (k-unf1): i file non salvati della cartella principale che il ramo tocca non tengono ferma l'unione:
 * si mettono al sicuro (stash nominato + copia in `.sierradeck/recupero/`), si unisce, si rimettono.
 * Git vero in cartelle temporanee: è il solo modo di sapere che il lavoro di Nicholas non si perde.
 */
const repo = repositoryDiPartenza()
let progetto = ''
const ga = comeAsincrono(git)
const RIGHE = ['uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove'].map((r) => `${r}\n`)
const testo = (cambia: Record<number, string> = {}): string => RIGHE.map((r, i) => cambia[i] ?? r).join('')
const leggi = (f: string): string => readFileSync(join(progetto, f), 'utf8')
const stashDelProgramma = (): string[] => esegui(['stash', 'list'], progetto).split(/\r?\n/).filter((r) => r.includes('sierradeck-recupero-'))
const recuperi = (): string[] => (existsSync(join(progetto, '.sierradeck', 'recupero')) ? readdirSync(join(progetto, '.sierradeck', 'recupero')) : [])
const unito = (ramo: string): boolean => git(['merge-base', '--is-ancestor', ramo, 'main'], progetto).codice === 0

beforeEach(() => {
  progetto = repo.copia()
  writeFileSync(join(progetto, 'doc.txt'), testo())
  writeFileSync(join(progetto, 'altro.txt'), 'altro\n')
  esegui(['add', '-A'], progetto)
  esegui(['commit', '-q', '-m', 'file di prova'], progetto)
})

let n = 0
function ramoCon(file: Record<string, string>): string {
  const wt = creaWorktree(git, { cwd: progetto, autopilota: 'ap1', chat: `c-${++n}`, base: 'main' })
  if (!wt.ok) throw new Error('worktree non creato')
  for (const [f, c] of Object.entries(file)) writeFileSync(join(wt.cartella, f), c)
  salvaLavoro(git, wt.cartella, 'pezzo')
  return wt.ramo
}

describe('file non salvati e unione di prova: niente si perde, la fila va avanti', () => {
  it('nessuna sovrapposizione: l’unione va avanti e il file di Nicholas resta identico, senza stash né recupero', async () => {
    const ramo = ramoCon({ 'doc.txt': testo({ 0: 'UNO dal ramo\n' }) })
    writeFileSync(join(progetto, 'altro.txt'), 'a metà, di Nicholas\n')
    const dette: EsitoRecupero[] = []
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo, base: 'main', alRecupero: (e) => dette.push(e) })).toEqual({ ok: true })
    expect(leggi('altro.txt')).toBe('a metà, di Nicholas\n')
    expect(stashDelProgramma()).toEqual([])
    expect(await chiudiProvaAsincrono(ga, { cwd: progetto, tieni: true })).toBe(true)
    expect(unito(ramo)).toBe(true)
    expect(leggi('altro.txt')).toBe('a metà, di Nicholas\n')
    expect(esegui(['status', '--porcelain', '--untracked-files=no'], progetto)).toMatch(/M altro\.txt/)
    expect(dette).toEqual([])
    expect(recuperi()).toEqual([])
  })

  it('sovrapposizione, si rimette senza conflitto: unito, e il file ha insieme il ramo e le righe di Nicholas', async () => {
    const ramo = ramoCon({ 'doc.txt': testo({ 0: 'UNO dal ramo\n' }) })
    writeFileSync(join(progetto, 'doc.txt'), testo({ 8: 'NOVE di Nicholas\n' }))
    const dette: EsitoRecupero[] = []
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo, base: 'main', alRecupero: (e) => dette.push(e) })).toEqual({ ok: true })
    // Durante la prova il file è quello del ramo, e quello di Nicholas è al sicuro in due posti.
    expect(leggi('doc.txt')).toBe(testo({ 0: 'UNO dal ramo\n' }))
    expect(stashDelProgramma()).toHaveLength(1)
    expect(recuperi()).toHaveLength(1)
    const copia = join(progetto, '.sierradeck', 'recupero', recuperi()[0]!, 'doc.txt')
    expect(readFileSync(copia, 'utf8')).toBe(testo({ 8: 'NOVE di Nicholas\n' }))
    expect(recuperi()[0]).toMatch(/-[0-9a-f]{10}$/)
    expect(await chiudiProvaAsincrono(ga, { cwd: progetto, tieni: true, alRecupero: (e) => dette.push(e) })).toBe(true)
    expect(unito(ramo)).toBe(true)
    expect(leggi('doc.txt')).toBe(testo({ 0: 'UNO dal ramo\n', 8: 'NOVE di Nicholas\n' }))
    expect(dette).toHaveLength(1)
    expect(dette[0]).toMatchObject({ rimessi: true, file: ['doc.txt'] })
    expect(stashDelProgramma()).toEqual([])
    expect(recuperi()).toEqual([])
  })

  it('prova annullata: il file di Nicholas torna esattamente com’era, ramo non unito', async () => {
    const ramo = ramoCon({ 'doc.txt': testo({ 0: 'UNO dal ramo\n' }) })
    const suo = testo({ 0: 'UNO di Nicholas\n' })
    writeFileSync(join(progetto, 'doc.txt'), suo)
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo, base: 'main' })).toEqual({ ok: true })
    expect(await chiudiProvaAsincrono(ga, { cwd: progetto, tieni: false })).toBe(false)
    expect(unito(ramo)).toBe(false)
    expect(leggi('doc.txt')).toBe(suo)
    expect(stashDelProgramma()).toEqual([])
    expect(recuperi()).toEqual([])
  })

  it('sovrapposizione, rimetterli dà conflitto: restano nello stash e nel recupero, l’unione c’è, e lo dice una volta sola', async () => {
    const ramo = ramoCon({ 'doc.txt': testo({ 0: 'UNO dal ramo\n' }) })
    const suo = testo({ 0: 'UNO di Nicholas\n' })
    writeFileSync(join(progetto, 'doc.txt'), suo)
    const dette: EsitoRecupero[] = []
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo, base: 'main', alRecupero: (e) => dette.push(e) })).toEqual({ ok: true })
    expect(await chiudiProvaAsincrono(ga, { cwd: progetto, tieni: true, alRecupero: (e) => dette.push(e) })).toBe(true)
    expect(unito(ramo)).toBe(true)
    expect(dette).toHaveLength(1)
    expect(dette[0]).toMatchObject({ rimessi: false, file: ['doc.txt'] })
    // La cartella è com'è nel ramo, senza segni di conflitto; il lavoro di Nicholas c'è, intero, in due posti.
    expect(leggi('doc.txt')).toBe(testo({ 0: 'UNO dal ramo\n' }))
    expect(esegui(['status', '--porcelain', '--untracked-files=no'], progetto)).toBe('')
    expect(stashDelProgramma()).toHaveLength(1)
    expect(esegui(['show', `${esegui(['stash', 'list', '--format=%H'], progetto).split(/\r?\n/)[0]}:doc.txt`], progetto).replace(/\r/g, '')).toBe(suo.trimEnd())
    expect(recuperi()).toHaveLength(1)
    expect(readFileSync(join(progetto, '.sierradeck', 'recupero', recuperi()[0]!, 'doc.txt'), 'utf8')).toBe(suo)
  })

  it('file già nell’indice (finirebbero nel commit dell’unione): non si tocca niente e l’unione aspetta', async () => {
    const ramo = ramoCon({ 'doc.txt': testo({ 0: 'UNO dal ramo\n' }) })
    const suo = testo({ 0: 'UNO di Nicholas, già in indice\n' })
    writeFileSync(join(progetto, 'doc.txt'), suo)
    esegui(['add', 'doc.txt'], progetto)
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo, base: 'main' })).toEqual({ ok: false, motivo: MOTIVO_CARTELLA_SPORCA, file: ['doc.txt'] })
    expect(stashDelProgramma()).toEqual([])
    expect(recuperi()).toEqual([])
    expect(leggi('doc.txt')).toBe(suo)
    expect(esegui(['diff', '--cached', '--name-only'], progetto)).toBe('doc.txt')
  })

  it('fila che non si ferma: un ramo in conflitto con il principale viene respinto, l’altro passa, e il file di Nicholas torna intatto', async () => {
    const primo = ramoCon({ 'doc.txt': testo({ 0: 'UNO dal primo ramo\n' }) })
    const inConflitto = ramoCon({ 'doc.txt': testo({ 0: 'UNO dal ramo in conflitto\n' }) })
    const libero = ramoCon({ 'altro.txt': 'altro dal ramo\n' })
    const suo = testo({ 8: 'NOVE di Nicholas\n' })
    writeFileSync(join(progetto, 'doc.txt'), suo)
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo: primo, base: 'main' })).toEqual({ ok: true })
    expect(await chiudiProvaAsincrono(ga, { cwd: progetto, tieni: true })).toBe(true)
    const rifiutato = await iniziaProvaAsincrono(ga, { cwd: progetto, ramo: inConflitto, base: 'main' })
    expect(rifiutato).toMatchObject({ ok: false, motivo: expect.stringContaining('conflitto su doc.txt') })
    // Il rifiuto ha rimesso a posto il file di Nicholas: la fila non resta incastrata.
    expect(leggi('doc.txt')).toBe(testo({ 0: 'UNO dal primo ramo\n', 8: 'NOVE di Nicholas\n' }))
    expect(stashDelProgramma()).toEqual([])
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo: libero, base: 'main' })).toEqual({ ok: true })
    expect(await chiudiProvaAsincrono(ga, { cwd: progetto, tieni: true })).toBe(true)
    expect(unito(libero)).toBe(true)
    expect(unito(inConflitto)).toBe(false)
    expect(leggi('doc.txt')).toBe(testo({ 0: 'UNO dal primo ramo\n', 8: 'NOVE di Nicholas\n' }))
  })

  it('fila con più rami: uno sovrapposto e uno no, entrambi si uniscono uno dopo l’altro e i file tornano', async () => {
    const primo = ramoCon({ 'doc.txt': testo({ 0: 'UNO dal ramo\n' }) })
    const secondo = ramoCon({ 'altro.txt': 'altro dal ramo\n' })
    writeFileSync(join(progetto, 'doc.txt'), testo({ 8: 'NOVE di Nicholas\n' }))
    for (const ramo of [primo, secondo]) {
      expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo, base: 'main' })).toEqual({ ok: true })
      expect(await chiudiProvaAsincrono(ga, { cwd: progetto, tieni: true })).toBe(true)
    }
    expect(unito(primo) && unito(secondo)).toBe(true)
    expect(leggi('doc.txt')).toBe(testo({ 0: 'UNO dal ramo\n', 8: 'NOVE di Nicholas\n' }))
    expect(stashDelProgramma()).toEqual([])
  })

  it('processo morto a prova aperta: la prova dopo la ripulisce e i file di Nicholas tornano com’erano', async () => {
    const ramo = ramoCon({ 'doc.txt': testo({ 0: 'UNO dal ramo\n' }) })
    const suo = testo({ 8: 'NOVE di Nicholas\n' })
    writeFileSync(join(progetto, 'doc.txt'), suo)
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo, base: 'main' })).toEqual({ ok: true })
    expect(await ripulisciProvaAsincrono(ga, { cwd: progetto })).toBe('ripulita')
    expect(leggi('doc.txt')).toBe(suo)
    expect(unito(ramo)).toBe(false)
    expect(stashDelProgramma()).toEqual([])
    expect(recuperi()).toEqual([])
  })

  it('se Nicholas cambia di nuovo il file durante la prova, non si sovrascrive niente: resta tutto al sicuro', async () => {
    const ramo = ramoCon({ 'doc.txt': testo({ 0: 'UNO dal ramo\n' }) })
    writeFileSync(join(progetto, 'doc.txt'), testo({ 8: 'NOVE di Nicholas\n' }))
    const dette: EsitoRecupero[] = []
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo, base: 'main' })).toEqual({ ok: true })
    writeFileSync(join(progetto, 'doc.txt'), testo({ 0: 'UNO dal ramo\n', 4: 'CINQUE scritto adesso\n' }))
    expect(await chiudiProvaAsincrono(ga, { cwd: progetto, tieni: true, alRecupero: (e) => dette.push(e) })).toBe(true)
    expect(dette[0]).toMatchObject({ rimessi: false })
    expect(leggi('doc.txt')).toBe(testo({ 0: 'UNO dal ramo\n', 4: 'CINQUE scritto adesso\n' }))
    expect(stashDelProgramma()).toHaveLength(1)
    expect(recuperi()).toHaveLength(1)
  })
})
