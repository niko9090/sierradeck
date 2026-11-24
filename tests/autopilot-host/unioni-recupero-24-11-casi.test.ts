import { describe, it, expect, beforeEach } from 'vitest'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chiudiProvaAsincrono, comeAsincrono, creaWorktree, iniziaProvaAsincrono, ripulisciProvaAsincrono, salvaLavoro, type EsitoRecupero, type GitAsincrono } from '../../src/autopilot-host/worktree'
import { esegui, git, repositoryDiPartenza } from './worktree-comune'

/**
 * 24/11 (k-unf2): i casi limite di k-unf1, ognuno con git vero in una cartella temporanea.
 * Regola: nessun contenuto di Nicholas si perde, né la versione nello stash né quella salvata a prova aperta.
 */
const repo = repositoryDiPartenza()
let progetto = ''
const ga = comeAsincrono(git)
const RIGHE = ['uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove'].map((r) => `${r}\n`)
const testo = (cambia: Record<number, string> = {}): string => RIGHE.map((r, i) => cambia[i] ?? r).join('')
const leggi = (f: string): string => readFileSync(join(progetto, f), 'utf8')
const stashTutti = (): string[] => esegui(['stash', 'list', '--format=%H %gs'], progetto).split(/\r?\n/).filter((r) => r !== '')
const stashDelProgramma = (): string[] => stashTutti().filter((r) => r.includes('sierradeck-recupero-'))
const recuperi = (): string[] => (existsSync(join(progetto, '.sierradeck', 'recupero')) ? readdirSync(join(progetto, '.sierradeck', 'recupero')) : [])
const unito = (ramo: string): boolean => git(['merge-base', '--is-ancestor', ramo, 'main'], progetto).codice === 0
const nelloStash = (sha: string, f: string): string => esegui(['show', `${sha}:${f}`], progetto).replace(/\r/g, '')
const senzaA = (s: string): string => s.replace(/\r/g, '').trimEnd()

beforeEach(() => {
  progetto = repo.copia()
  mkdirSync(join(progetto, 'cartella con spazi'))
  writeFileSync(join(progetto, 'doc.txt'), testo())
  writeFileSync(join(progetto, 'altro.txt'), 'altro\n')
  writeFileSync(join(progetto, 'cartella con spazi', 'Mio file è.txt'), testo())
  esegui(['add', '-A'], progetto)
  esegui(['commit', '-q', '-m', 'file di prova'], progetto)
})

let n = 0
function ramoCon(file: Record<string, string>): string {
  const wt = creaWorktree(git, { cwd: progetto, autopilota: 'ap1', chat: `c-${++n}`, base: 'main' })
  if (!wt.ok) throw new Error('worktree non creato')
  for (const [f, c] of Object.entries(file)) { mkdirSync(join(wt.cartella, f, '..'), { recursive: true }); writeFileSync(join(wt.cartella, f), c) }
  salvaLavoro(git, wt.cartella, 'pezzo')
  return wt.ramo
}

describe('k-unf2: Nicholas salva durante la prova', () => {
  it('prova annullata dopo un suo salvataggio: la sua versione nuova resta nel file e la vecchia nello stash', async () => {
    const ramo = ramoCon({ 'doc.txt': testo({ 0: 'UNO dal ramo\n' }) })
    const vecchia = testo({ 8: 'NOVE vecchio\n' })
    const nuova = testo({ 0: 'UNO dal ramo\n', 3: 'QUATTRO nuovo\n' })
    writeFileSync(join(progetto, 'doc.txt'), vecchia)
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo, base: 'main' })).toEqual({ ok: true })
    writeFileSync(join(progetto, 'doc.txt'), nuova)
    const dette: EsitoRecupero[] = []
    await chiudiProvaAsincrono(ga, { cwd: progetto, tieni: false, alRecupero: (e) => dette.push(e) })
    // L'annullamento non resta a metà: nessuna unione aperta (la fila non si incastra) e nessuna copia «durante» rimasta.
    expect(existsSync(join(progetto, '.git', 'MERGE_HEAD'))).toBe(false)
    expect(recuperi().filter((r) => r.startsWith('durante-'))).toEqual([])
    expect(leggi('doc.txt')).toBe(nuova)
    expect(stashDelProgramma()).toHaveLength(1)
    expect(nelloStash(stashDelProgramma()[0]!.split(' ')[0]!, 'doc.txt')).toBe(senzaA(vecchia))
    expect(dette[0]).toMatchObject({ rimessi: false })
    expect(recuperi()).toHaveLength(1)
  })

  it('salva un contenuto identico a HEAD (ramo che cambia lo stesso file), prova tenuta: niente si perde', async () => {
    const ramo = ramoCon({ 'doc.txt': testo({ 0: 'UNO dal ramo\n' }) })
    const vecchia = testo({ 8: 'NOVE vecchio\n' })
    writeFileSync(join(progetto, 'doc.txt'), vecchia)
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo, base: 'main' })).toEqual({ ok: true })
    writeFileSync(join(progetto, 'doc.txt'), testo())
    await chiudiProvaAsincrono(ga, { cwd: progetto, tieni: true })
    const nelFile = leggi('doc.txt')
    const alSicuro = stashDelProgramma().some((r) => nelloStash(r.split(' ')[0]!, 'doc.txt') === senzaA(vecchia))
    // O la versione vecchia è tornata nel file, o è ancora nello stash: mai persa.
    expect(nelFile.includes('NOVE vecchio') || alSicuro).toBe(true)
  })

  it('salva un contenuto identico a HEAD, prova annullata: la versione vecchia non va persa', async () => {
    const ramo = ramoCon({ 'doc.txt': testo({ 0: 'UNO dal ramo\n' }) })
    const vecchia = testo({ 8: 'NOVE vecchio\n' })
    writeFileSync(join(progetto, 'doc.txt'), vecchia)
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo, base: 'main' })).toEqual({ ok: true })
    writeFileSync(join(progetto, 'doc.txt'), testo())
    await chiudiProvaAsincrono(ga, { cwd: progetto, tieni: false })
    const alSicuro = stashDelProgramma().some((r) => nelloStash(r.split(' ')[0]!, 'doc.txt') === senzaA(vecchia))
    expect(leggi('doc.txt').includes('NOVE vecchio') || alSicuro).toBe(true)
  })

  it('file con modifica salvata a prova aperta su un file che il ramo NON tocca: resta com’è', async () => {
    const ramo = ramoCon({ 'doc.txt': testo({ 0: 'UNO dal ramo\n' }) })
    writeFileSync(join(progetto, 'doc.txt'), testo({ 8: 'NOVE vecchio\n' }))
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo, base: 'main' })).toEqual({ ok: true })
    writeFileSync(join(progetto, 'altro.txt'), 'altro nuovo di Nicholas\n')
    expect(await chiudiProvaAsincrono(ga, { cwd: progetto, tieni: true })).toBe(true)
    expect(leggi('altro.txt')).toBe('altro nuovo di Nicholas\n')
    expect(leggi('doc.txt')).toBe(testo({ 0: 'UNO dal ramo\n', 8: 'NOVE vecchio\n' }))
  })
})

describe('k-unf2: file non tracciato con lo stesso nome di uno che il ramo aggiunge', () => {
  it('senza altri file a metà: l’unione si ferma e il file non tracciato resta intero', async () => {
    const ramo = ramoCon({ 'nuovo.txt': 'dal ramo\n' })
    writeFileSync(join(progetto, 'nuovo.txt'), 'mio, non tracciato\n')
    const r = await iniziaProvaAsincrono(ga, { cwd: progetto, ramo, base: 'main' })
    expect(r.ok).toBe(false)
    expect(leggi('nuovo.txt')).toBe('mio, non tracciato\n')
    expect(unito(ramo)).toBe(false)
    expect(stashTutti()).toEqual([])
    // La fila non resta incastrata: tolto il file, la prova riparte.
    expect(existsSync(join(progetto, '.git', 'MERGE_HEAD'))).toBe(false)
  })

  it('con anche un file a metà che il ramo tocca: stessa cosa, e il file a metà torna com’era', async () => {
    const ramo = ramoCon({ 'nuovo.txt': 'dal ramo\n', 'doc.txt': testo({ 0: 'UNO dal ramo\n' }) })
    const suo = testo({ 8: 'NOVE di Nicholas\n' })
    writeFileSync(join(progetto, 'doc.txt'), suo)
    writeFileSync(join(progetto, 'nuovo.txt'), 'mio, non tracciato\n')
    const r = await iniziaProvaAsincrono(ga, { cwd: progetto, ramo, base: 'main' })
    expect(r.ok).toBe(false)
    expect(leggi('nuovo.txt')).toBe('mio, non tracciato\n')
    expect(leggi('doc.txt')).toBe(suo)
    expect(stashDelProgramma()).toEqual([])
    expect(unito(ramo)).toBe(false)
  })
})

describe('k-unf2: stash di altri e posizioni che cambiano', () => {
  it('un altro stash messo sopra durante la prova: si rimette e si toglie il nostro, l’altro resta', async () => {
    const ramo = ramoCon({ 'doc.txt': testo({ 0: 'UNO dal ramo\n' }) })
    writeFileSync(join(progetto, 'doc.txt'), testo({ 8: 'NOVE di Nicholas\n' }))
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo, base: 'main' })).toEqual({ ok: true })
    // Annullata la prova per poter fare altro con la cartella: poi uno stash di un altro, sopra il nostro.
    await git(['merge', '--abort'], progetto)
    writeFileSync(join(progetto, 'altro.txt'), 'di un altro\n')
    esegui(['stash', 'push', '-m', 'stash-di-un-altro', '--', 'altro.txt'], progetto)
    expect(stashTutti()).toHaveLength(2)
    await ripulisciProvaAsincrono(ga, { cwd: progetto })
    expect(leggi('doc.txt')).toBe(testo({ 8: 'NOVE di Nicholas\n' }))
    expect(stashTutti()).toHaveLength(1)
    expect(stashTutti()[0]).toContain('stash-di-un-altro')
  })

  it('uno stash di un altro il cui messaggio finisce con il nostro nome: non si rimette né si toglie quello', async () => {
    const ramo = ramoCon({ 'doc.txt': testo({ 0: 'UNO dal ramo\n' }) })
    const suo = testo({ 8: 'NOVE di Nicholas\n' })
    writeFileSync(join(progetto, 'doc.txt'), suo)
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo, base: 'main' })).toEqual({ ok: true })
    const nostro = stashDelProgramma()[0]!
    const nome = nostro.slice(nostro.indexOf('sierradeck-recupero-'))
    // Un altro stash, con un altro contenuto, sopra il nostro e con il messaggio che finisce uguale.
    writeFileSync(join(progetto, 'altro.txt'), 'contenuto di un altro\n')
    esegui(['stash', 'push', '-m', `copia-di-${nome}`, '--', 'altro.txt'], progetto)
    expect(stashTutti()[0]).toContain(`copia-di-${nome}`)
    await chiudiProvaAsincrono(ga, { cwd: progetto, tieni: false })
    expect(leggi('doc.txt')).toBe(suo)
    expect(leggi('altro.txt')).toBe('altro\n')
    expect(stashTutti()).toHaveLength(1)
    expect(stashTutti()[0]).toContain(`copia-di-${nome}`)
  })
})

describe('k-unf2: rimettere i file', () => {
  it('apply rifiutato perché Nicholas ha salvato un attimo prima: il suo file non si tocca (niente checkout)', async () => {
    const ramo = ramoCon({ 'doc.txt': testo({ 0: 'UNO dal ramo\n' }) })
    const vecchia = testo({ 8: 'NOVE vecchio\n' })
    writeFileSync(join(progetto, 'doc.txt'), vecchia)
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo, base: 'main' })).toEqual({ ok: true })
    const suo = testo({ 0: 'UNO dal ramo\n', 5: 'SEI salvato all’ultimo\n' })
    const corsa: GitAsincrono = async (args, cwd) => {
      if (args[0] === 'stash' && args[1] === 'apply') writeFileSync(join(progetto, 'doc.txt'), suo)
      return ga(args, cwd)
    }
    await chiudiProvaAsincrono(corsa, { cwd: progetto, tieni: true })
    expect(leggi('doc.txt')).toBe(suo)
    expect(stashDelProgramma()).toHaveLength(1)
    expect(recuperi()).toHaveLength(1)
  })

  it('conflitto con più file: i file tornano a HEAD e tutto il lavoro è nello stash e nella copia', async () => {
    const ramo = ramoCon({ 'doc.txt': testo({ 0: 'UNO dal ramo\n' }), 'altro.txt': 'altro dal ramo\n' })
    const sueDoc = testo({ 0: 'UNO di Nicholas\n' })
    writeFileSync(join(progetto, 'doc.txt'), sueDoc)
    writeFileSync(join(progetto, 'altro.txt'), 'altro di Nicholas\n')
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo, base: 'main' })).toEqual({ ok: true })
    await chiudiProvaAsincrono(ga, { cwd: progetto, tieni: true })
    const sha = stashDelProgramma()[0]!.split(' ')[0]!
    expect(nelloStash(sha, 'doc.txt')).toBe(senzaA(sueDoc))
    expect(nelloStash(sha, 'altro.txt')).toBe('altro di Nicholas')
    const dir = join(progetto, '.sierradeck', 'recupero', recuperi()[0]!)
    expect(readFileSync(join(dir, 'doc.txt'), 'utf8')).toBe(sueDoc)
    expect(readFileSync(join(dir, 'altro.txt'), 'utf8')).toBe('altro di Nicholas\n')
    expect(esegui(['status', '--porcelain', '--untracked-files=no'], progetto)).toBe('')
  })
})

describe('k-unf2: servizio che muore a metà', () => {
  it('morto subito dopo lo stash, prima del segno: la prova dopo rimette i file', async () => {
    const ramo = ramoCon({ 'doc.txt': testo({ 0: 'UNO dal ramo\n' }) })
    const suo = testo({ 8: 'NOVE di Nicholas\n' })
    writeFileSync(join(progetto, 'doc.txt'), suo)
    const muore: GitAsincrono = async (args, cwd) => {
      if (args[0] === 'merge' || (args[0] === 'rev-parse' && args.includes('--verify'))) throw new Error('processo morto')
      return ga(args, cwd)
    }
    await expect(iniziaProvaAsincrono(muore, { cwd: progetto, ramo, base: 'main' })).rejects.toThrow('processo morto')
    expect(stashDelProgramma()).toHaveLength(1)
    expect(leggi('doc.txt')).toBe(testo())
    await ripulisciProvaAsincrono(ga, { cwd: progetto })
    expect(leggi('doc.txt')).toBe(suo)
    expect(stashDelProgramma()).toEqual([])
    expect(recuperi()).toEqual([])
  })

  it('morto dopo il segno, prima del merge: la prova dopo rimette i file', async () => {
    const ramo = ramoCon({ 'doc.txt': testo({ 0: 'UNO dal ramo\n' }) })
    const suo = testo({ 8: 'NOVE di Nicholas\n' })
    writeFileSync(join(progetto, 'doc.txt'), suo)
    const muore: GitAsincrono = async (args, cwd) => {
      if (args[0] === 'merge') throw new Error('processo morto')
      return ga(args, cwd)
    }
    await expect(iniziaProvaAsincrono(muore, { cwd: progetto, ramo, base: 'main' })).rejects.toThrow('processo morto')
    await ripulisciProvaAsincrono(ga, { cwd: progetto })
    expect(leggi('doc.txt')).toBe(suo)
    expect(stashDelProgramma()).toEqual([])
  })
})

describe('k-unf2: la cartella di recupero non sporca la cartella principale', () => {
  it('dopo un conflitto di rimessa il recupero resta, ma `git status` completo è vuoto e la fila va avanti', async () => {
    const primo = ramoCon({ 'doc.txt': testo({ 0: 'UNO dal ramo\n' }) })
    const libero = ramoCon({ 'altro.txt': 'altro dal ramo\n' })
    writeFileSync(join(progetto, 'doc.txt'), testo({ 0: 'UNO di Nicholas\n' }))
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo: primo, base: 'main' })).toEqual({ ok: true })
    expect(await chiudiProvaAsincrono(ga, { cwd: progetto, tieni: true })).toBe(true)
    expect(recuperi()).toHaveLength(1)
    expect(esegui(['status', '--porcelain'], progetto)).toBe('')
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo: libero, base: 'main' })).toEqual({ ok: true })
    expect(await chiudiProvaAsincrono(ga, { cwd: progetto, tieni: true })).toBe(true)
    expect(unito(libero)).toBe(true)
  })
})

describe('k-unf2: percorsi con spazi e lettere non ascii', () => {
  it('file in una cartella con spazi e con una è nel nome: si mette al sicuro, si unisce, si rimette', async () => {
    const f = 'cartella con spazi/Mio file è.txt'
    const ramo = ramoCon({ [f]: testo({ 0: 'UNO dal ramo\n' }) })
    writeFileSync(join(progetto, f), testo({ 8: 'NOVE di Nicholas\n' }))
    const dette: EsitoRecupero[] = []
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo, base: 'main', alRecupero: (e) => dette.push(e) })).toEqual({ ok: true })
    expect(stashDelProgramma()).toHaveLength(1)
    expect(readFileSync(join(progetto, '.sierradeck', 'recupero', recuperi()[0]!, f), 'utf8')).toBe(testo({ 8: 'NOVE di Nicholas\n' }))
    expect(await chiudiProvaAsincrono(ga, { cwd: progetto, tieni: true, alRecupero: (e) => dette.push(e) })).toBe(true)
    expect(leggi(f)).toBe(testo({ 0: 'UNO dal ramo\n', 8: 'NOVE di Nicholas\n' }))
    expect(dette[0]).toMatchObject({ rimessi: true })
    expect(stashDelProgramma()).toEqual([])
  })
})
