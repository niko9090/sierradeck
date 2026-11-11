import { describe, it, expect, vi, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eCopiaDiSpecialista, salvaLavoro, salvaLavoroConFile } from '../../src/autopilot-host/worktree'
import { gitFinto, usaGitFinto } from '../setup/git-finto'

// git vero, con date e configurazione sempre uguali (vedi `git-finto.ts`).
usaGitFinto()

/**
 * 13/10, prova dal vero: un worktree mancato dentro un altro repository fece
 * risalire git al repository che lo conteneva, e salvaLavoro committò lì tutto
 * il lavoro in corso. Adesso si committa solo su un ramo dell'autopilota (ap/…).
 */
describe('salvaLavoro solo sul ramo dell’autopilota', () => {
  it('una cartella dentro un repository sul ramo principale: niente commit', () => {
    const repo = mkdtempSync(join(tmpdir(), 'sd-salva-'))
    gitFinto(['init', '-q', '-b', 'main'], repo)
    gitFinto(['-c', 'user.email=p@esempio.it', '-c', 'user.name=prova', 'commit', '-q', '--allow-empty', '-m', 'primo'], repo)
    const finto = join(repo, 'note', 'progetto.sierradeck-wt', 'ap-1-c-1')
    mkdirSync(finto, { recursive: true })
    writeFileSync(join(finto, 'x.txt'), 'x')
    expect(salvaLavoro(gitFinto, finto, 'autopilota: non deve finire qui')).toBe(false)
    expect(gitFinto(['log', '--oneline'], repo).uscita.split('\n')).toHaveLength(1)
  })

  it('anche se il repository che la contiene è a sua volta sul ramo di un autopilota (c-241, 20/10)', () => {
    // Nella copia di prova la cartella di una chat chiusa era rimasta senza
    // `.git`, dentro la cartella di lavoro di un'altra chat (ramo ap/…): git è
    // risalito lì e salvaLavoro ha committato le modifiche in corso di quella chat.
    const repo = mkdtempSync(join(tmpdir(), 'sd-salva-'))
    gitFinto(['init', '-q', '-b', 'ap/ap-esempio/c-9'], repo)
    gitFinto(['-c', 'user.email=p@esempio.it', '-c', 'user.name=prova', 'commit', '-q', '--allow-empty', '-m', 'primo'], repo)
    writeFileSync(join(repo, 'in-corso.txt'), 'lavoro di un altro')
    const finto = join(repo, 'note', 'progetto.sierradeck-wt', 'ap-1-c-3')
    mkdirSync(finto, { recursive: true })
    expect(salvaLavoro(gitFinto, finto, 'autopilota: non deve finire qui')).toBe(false)
    expect(gitFinto(['log', '--oneline'], repo).uscita.split('\n')).toHaveLength(1)
    expect(gitFinto(['status', '--porcelain'], repo).uscita).toContain('in-corso.txt')
  })

  it('salva invece in una sottocartella del progetto, se il ramo la contiene (Revisione, 20/10)', () => {
    // Un autopilota su `repo/app` lavora in `<worktree>/App`: git risale al
    // worktree, che è il suo. Il controllo di c-241 la scartava e il lavoro restava fuori dai commit.
    // «App» con la maiuscola: `git ls-tree` distingue le maiuscole (c-289).
    const repo = mkdtempSync(join(tmpdir(), 'sd-salva-'))
    gitFinto(['init', '-q', '-b', 'ap/ap-esempio/c-1'], repo)
    mkdirSync(join(repo, 'App'))
    writeFileSync(join(repo, 'App', 'a.txt'), 'a')
    gitFinto(['add', '-A'], repo)
    gitFinto(['-c', 'user.email=p@esempio.it', '-c', 'user.name=prova', 'commit', '-q', '-m', 'primo'], repo)
    writeFileSync(join(repo, 'App', 'nuovo.txt'), 'lavoro della chat')
    expect(salvaLavoro(gitFinto, join(repo, 'App'), 'autopilota: lavoro in app')).toBe(true)
    expect(gitFinto(['log', '--oneline'], repo).uscita.split('\n')).toHaveLength(2)
  }) // git vero: i 60 s del progetto «lenti» (vitest.config.ts)
})

/**
 * 11/11: il «salva prima di unire» valeva solo per i rami `ap/…` delle chat.
 * Gli specialisti lavorano in `<progetto>/.claude/worktrees/agent-<id>` sul
 * ramo `worktree-agent-<id>`: per loro era sempre rifiutato (2.000 righe «non
 * salvo in…» in due giorni), e quello che non avevano messo in un commit
 * restava fuori dall'unione.
 */
describe('salvaLavoro nella copia di uno specialista (11/11)', () => {
  afterEach(() => { vi.restoreAllMocks() })

  /** Un progetto con un commit su `main` e la copia di uno specialista, sul ramo dato. */
  const progettoConCopia = (ramo: string, dove?: (repo: string) => string): { repo: string; copia: string } => {
    const repo = mkdtempSync(join(tmpdir(), 'sd-salva-sp-'))
    gitFinto(['init', '-q', '-b', 'main'], repo)
    writeFileSync(join(repo, 'a.txt'), 'uno\n')
    gitFinto(['add', '-A'], repo)
    gitFinto(['-c', 'user.email=p@esempio.it', '-c', 'user.name=prova', 'commit', '-q', '-m', 'primo'], repo)
    const copia = dove?.(repo) ?? join(repo, '.claude', 'worktrees', 'agent-a1b2c3d4e5f60718')
    expect(gitFinto(['worktree', 'add', '-q', '-b', ramo, copia, 'main'], repo).codice).toBe(0)
    return { repo, copia }
  }

  it('sul suo ramo worktree-agent-<id>: salva come per i rami ap/, e dice quali file ha messo nel commit', () => {
    const { repo, copia } = progettoConCopia('worktree-agent-a1b2c3d4e5f60718')
    writeFileSync(join(copia, 'a.txt'), 'uno\ndue\n')
    mkdirSync(join(copia, 'src'))
    writeFileSync(join(copia, 'src', 'nuovo.ts'), 'export const x = 1\n')
    const e = salvaLavoroConFile(gitFinto, copia, 'specialista sp-1: la barra')
    expect(e.salvato).toBe(true)
    expect([...e.file].sort()).toEqual(['a.txt', 'src/nuovo.ts'])
    expect(gitFinto(['log', '--format=%s', 'worktree-agent-a1b2c3d4e5f60718'], repo).uscita.split('\n')[0]).toBe('specialista sp-1: la barra')
    expect(gitFinto(['status', '--porcelain'], copia).uscita).toBe('')
    // Il principale non è toccato: il lavoro sta sul ramo dello specialista, e lo porta l'unione.
    expect(gitFinto(['log', '--oneline', 'main'], repo).uscita.split('\n')).toHaveLength(1)
    // Niente da salvare: nessun commit e nessun file.
    expect(salvaLavoroConFile(gitFinto, copia, 'niente')).toEqual({ salvato: false, file: [] })
    expect(salvaLavoro(gitFinto, copia, 'niente')).toBe(false)
  })

  it('nella cartella di uno specialista ma su un altro ramo: niente commit', () => {
    const { repo, copia } = progettoConCopia('k-65-unione')
    writeFileSync(join(copia, 'a.txt'), 'cambiato\n')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(salvaLavoroConFile(gitFinto, copia, 'non deve finire qui')).toEqual({ salvato: false, file: [] })
    expect(gitFinto(['log', '--oneline', 'k-65-unione'], repo).uscita.split('\n')).toHaveLength(1)
    expect(gitFinto(['status', '--porcelain'], copia).uscita).toContain('a.txt')
  })

  it('il ramo di un altro specialista, o un ramo worktree-agent-… fuori da .claude/worktrees: niente commit', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const altro = progettoConCopia('worktree-agent-ffffffffffffffff')
    writeFileSync(join(altro.copia, 'a.txt'), 'cambiato\n')
    expect(salvaLavoro(gitFinto, altro.copia, 'non deve finire qui')).toBe(false)
    const fuori = progettoConCopia('worktree-agent-a1b2c3d4e5f60718', (repo) => `${repo}-altrove`)
    writeFileSync(join(fuori.copia, 'a.txt'), 'cambiato\n')
    expect(salvaLavoro(gitFinto, fuori.copia, 'non deve finire qui')).toBe(false)
    expect(gitFinto(['log', '--oneline', 'worktree-agent-a1b2c3d4e5f60718'], fuori.repo).uscita.split('\n')).toHaveLength(1)
  })

  it('il rifiuto si scrive una volta per cartella, non a ogni tentativo', () => {
    const { copia } = progettoConCopia('k-65-unione')
    const avviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (let i = 0; i < 5; i += 1) expect(salvaLavoro(gitFinto, copia, 'no')).toBe(false)
    const righe = avviso.mock.calls.map((c) => String(c[0])).filter((r) => r.includes('non salvo in'))
    expect(righe).toHaveLength(1)
    expect(righe[0]).toContain('è sul ramo «k-65-unione», non su un ramo dell\'autopilota')
  })

  it('eCopiaDiSpecialista: la cartella e il ramo devono essere dello stesso specialista', () => {
    expect(eCopiaDiSpecialista('E:/lavoro/progetto/.claude/worktrees/agent-a1b2', 'worktree-agent-a1b2')).toBe(true)
    expect(eCopiaDiSpecialista('E:\\lavoro\\progetto\\.claude\\worktrees\\agent-a1b2\\', 'worktree-agent-a1b2')).toBe(true)
    expect(eCopiaDiSpecialista('/lavoro/progetto/.claude/worktrees/agent-A1B2', 'worktree-agent-a1b2')).toBe(true)
    expect(eCopiaDiSpecialista('E:/lavoro/progetto/.claude/worktrees/agent-a1b2', 'worktree-agent-ffff')).toBe(false)
    expect(eCopiaDiSpecialista('E:/lavoro/progetto/.claude/worktrees/agent-a1b2', 'main')).toBe(false)
    expect(eCopiaDiSpecialista('E:/lavoro/progetto/.claude/worktrees/agent-a1b2', 'ap/ap-1/c-1')).toBe(false)
    expect(eCopiaDiSpecialista('E:/lavoro/progetto', 'worktree-agent-a1b2')).toBe(false)
    expect(eCopiaDiSpecialista('E:/lavoro/altrove/agent-a1b2', 'worktree-agent-a1b2')).toBe(false)
    expect(eCopiaDiSpecialista('E:/lavoro/progetto/.claude/worktrees/agent-a1b2/sotto', 'worktree-agent-a1b2')).toBe(false)
  })
})
