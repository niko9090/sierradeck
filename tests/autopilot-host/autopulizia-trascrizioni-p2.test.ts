import { describe, it, expect } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nuovoAutopilota, type Autopilota, type ChatGovernata } from '@shared/autopilota'
import { apriArchivio } from '../../src/autopilot-host/archivio'
import { autopulizia, decidiTrascrizione, trascrizioneDiCopia } from '../../src/autopilot-host/autopulizia'
import { cartellaWorktreeDi, comeAsincrono, gitReale } from '../../src/autopilot-host/worktree'

/**
 * P2 (30/10): le cartelle di `~/.claude/projects` delle copie delle chat finite
 * (90 il 30/10). Via solo se la copia non c'è più, il ramo è unito o non c'è,
 * nessuna chat dell'archivio le usa, non è un collegamento e non è appena
 * toccata. Mai quella di un progetto vero.
 */

const ID = 'ap-0123abcd-0000-0000-0000-000000000000'
const slug = (p: string): string => p.replace(/[^a-zA-Z0-9]/g, '-')

describe('la parte pura', () => {
  it('riconosce solo le cartelle delle copie, con copia e ramo', () => {
    const copie = 'E:\\Prog.sierradeck-wt'
    expect(trascrizioneDiCopia('E--Prog-sierradeck-wt-ap-0123abcd-c-12', copie)).toEqual({ nome: 'E--Prog-sierradeck-wt-ap-0123abcd-c-12', copia: 'ap-0123abcd-c-12', ramo: 'ap/ap-0123abcd/c-12' })
    expect(trascrizioneDiCopia('E--Prog-sierradeck-wt-ap-0123abcd-c-12-app', copie)?.copia).toBe('ap-0123abcd-c-12')
    expect(trascrizioneDiCopia('E--Prog', copie)).toBeUndefined()
    expect(trascrizioneDiCopia('E--Altro-sierradeck-wt-ap-0123abcd-c-1', copie)).toBeUndefined()
    expect(trascrizioneDiCopia('E--Prog-sierradeck-wt-mia-cartella', copie)).toBeUndefined()
  })

  it('nel dubbio si tiene', () => {
    const via = { copiaEsiste: false, ramo: 'unito' as const, diUnaChat: false, collegamento: false, giovane: false }
    expect(decidiTrascrizione(via).togli).toBe(true)
    expect(decidiTrascrizione({ ...via, ramo: 'mancante' }).togli).toBe(true)
    expect(decidiTrascrizione({ ...via, ramo: 'non-unito' })).toEqual({ togli: false, perche: 'ramo con commit non uniti' })
    expect(decidiTrascrizione({ ...via, copiaEsiste: true }).togli).toBe(false)
    expect(decidiTrascrizione({ ...via, diUnaChat: true }).togli).toBe(false)
    expect(decidiTrascrizione({ ...via, collegamento: true }).togli).toBe(false)
    expect(decidiTrascrizione({ ...via, giovane: true }).togli).toBe(false)
  })
})

describe('con un git vero', { timeout: 120_000 }, () => {
  const esegui = (args: string[], cwd: string): string => {
    const r = gitReale(args, cwd)
    if (r.codice !== 0) throw new Error(`git ${args.join(' ')}: ${r.uscita}`)
    return r.uscita
  }

  it('toglie quelle delle copie finite e unite; tiene il resto, e non segue i collegamenti', async () => {
    const base = mkdtempSync(join(tmpdir(), 'sd-trascrizioni-'))
    const progetto = join(base, 'progetto')
    mkdirSync(progetto)
    esegui(['init', '-q', '-b', 'main'], progetto)
    esegui(['config', 'user.name', 'Prova'], progetto)
    esegui(['config', 'user.email', 'prova@example.com'], progetto)
    writeFileSync(join(progetto, 'a.txt'), 'uno\n')
    esegui(['add', '-A'], progetto)
    esegui(['commit', '-q', '-m', 'inizio'], progetto)
    esegui(['branch', 'ap/ap-0123abcd/c-1'], progetto) // unito
    esegui(['checkout', '-q', '-b', 'ap/ap-0123abcd/c-2'], progetto)
    writeFileSync(join(progetto, 'b.txt'), 'non unito\n')
    esegui(['add', '-A'], progetto)
    esegui(['commit', '-q', '-m', 'non unito'], progetto)
    esegui(['checkout', '-q', 'main'], progetto)

    const radice = gitReale(['rev-parse', '--show-toplevel'], progetto).uscita.trim()
    const copie = cartellaWorktreeDi(radice)
    const claude = join(base, 'claude')
    const projects = join(claude, 'projects')
    const cartella = (nome: string): string => {
      const d = join(projects, nome)
      mkdirSync(d, { recursive: true })
      writeFileSync(join(d, 'sessione.jsonl'), '{}\n')
      return d
    }
    const c1 = cartella(`${slug(copie)}-ap-0123abcd-c-1`) // unito, copia sparita: via
    const c1sotto = cartella(`${slug(copie)}-ap-0123abcd-c-1-app`) // anche la sottocartella
    const c2 = cartella(`${slug(copie)}-ap-0123abcd-c-2`) // ramo non unito: resta
    const c3 = cartella(`${slug(copie)}-ap-0123abcd-c-3`) // ramo mancante ma chat aperta: resta
    const c4 = cartella(`${slug(copie)}-ap-0123abcd-c-4`) // ramo mancante, nessuno: via
    const vero = cartella(slug(radice)) // il progetto vero: mai
    // Un collegamento al posto della cartella: resta, e quello a cui punta resta intero.
    const fuori = join(base, 'fuori')
    mkdirSync(fuori)
    writeFileSync(join(fuori, 'f.txt'), 'prezioso')
    const c5 = join(projects, `${slug(copie)}-ap-0123abcd-c-5`)
    symlinkSync(fuori, c5, 'junction')
    // Una giunzione dentro una cartella che va via: si stacca senza seguirla.
    symlinkSync(fuori, join(c4, 'collegamento'), 'junction')

    const archivio = apriArchivio(join(base, 'autopiloti'))
    const chat = (id: string, extra: Partial<ChatGovernata> = {}): ChatGovernata => ({ id, compito: 'c', stato: 'finita', cicli: 1, ...extra })
    const a: Autopilota = {
      ...nuovoAutopilota({ id: ID, nome: 'x', obiettivo: 'o', cwd: progetto, criteri: [{ descrizione: 'c', soddisfatto: false }], iniziatoIl: '2026-10-01T00:00:00.000Z' }),
      ramoBase: 'main',
      chats: [chat('c-3', { stato: 'lavoro', cartella: join(copie, 'ap-0123abcd-c-3') })]
    }
    archivio.scrivi(a)
    const e = await autopulizia({ archivio, git: comeAsincrono(gitReale), radiceClaude: claude, ora: () => Date.now() + 7 * 60 * 60_000 })

    expect(existsSync(c1)).toBe(false)
    expect(existsSync(c1sotto)).toBe(false)
    expect(existsSync(c4)).toBe(false)
    expect(existsSync(c2)).toBe(true)
    expect(existsSync(c3)).toBe(true)
    expect(existsSync(join(vero, 'sessione.jsonl'))).toBe(true)
    expect(existsSync(c5)).toBe(true)
    expect(readFileSync(join(fuori, 'f.txt'), 'utf8')).toBe('prezioso')
    expect(e.trascrizioniTolte).toBe(3)
    // Il ramo non unito non si tocca.
    expect(esegui(['branch', '--list', 'ap/ap-0123abcd/c-2'], progetto)).toContain('c-2')
  })

  it('senza la radice di Claude non si tocca niente', async () => {
    const base = mkdtempSync(join(tmpdir(), 'sd-trascrizioni-senza-'))
    const archivio = apriArchivio(join(base, 'autopiloti'))
    const e = await autopulizia({ archivio, git: comeAsincrono(gitReale) })
    expect(e.trascrizioniTolte ?? 0).toBe(0)
  })
})
