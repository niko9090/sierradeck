import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nuovoAutopilota, type Autopilota, type ChatGovernata } from '@shared/autopilota'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import {
  accorciaRegistro, autopulizia, chatNote, compatta, creaAutopulizia, decidiCopia, decidiRamo, leggiWorktreeList,
  rigaRiepilogo, staccaCollegamenti, tagliaCoda, togliCartellaCopia, esitoVuoto, type CopiaSuDisco
} from '../../src/autopilot-host/autopulizia'
import { comeAsincrono, creaWorktree, gitReale, type Git } from '../../src/autopilot-host/worktree'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'

const ORA = Date.parse('2026-10-30T12:00:00.000Z')
/** Sette ore dopo adesso: le cartelle create dal test non sono più «appena nate». */
const DOPO = (): number => Date.now() + 7 * 60 * 60_000

function autopilota(over: Partial<Autopilota> & { id: string; cwd: string }): Autopilota {
  return {
    ...nuovoAutopilota({ id: over.id, nome: 'x', obiettivo: 'o', cwd: over.cwd, criteri: [{ descrizione: 'c', soddisfatto: false }], iniziatoIl: '2026-10-01T00:00:00.000Z' }),
    ramoBase: 'main',
    ...over
  }
}
function chat(id: string, stato: ChatGovernata['stato'], extra: Partial<ChatGovernata> = {}): ChatGovernata {
  return { id, compito: 'c', stato, cicli: 1, ...extra }
}
const copia = (over: Partial<CopiaSuDisco> = {}): CopiaSuDisco => ({ cartella: 'E:/p.sierradeck-wt/ap-1-c-1', registrata: true, ramo: 'ap/ap-1/c-1', giovane: false, repositoryASe: false, ...over })

describe('le regole, pure', () => {
  it('legge git worktree list --porcelain', () => {
    const w = leggiWorktreeList('worktree E:/p\nHEAD aaa\nbranch refs/heads/main\n\nworktree E:/p.sierradeck-wt/ap-1-c-1\nHEAD bbb\nbranch refs/heads/ap/ap-1/c-1\n\nworktree E:/p.sierradeck-wt/x\nHEAD ccc\ndetached\n')
    expect(w).toEqual([
      { cartella: 'E:/p', head: 'aaa', ramo: 'main' },
      { cartella: 'E:/p.sierradeck-wt/ap-1-c-1', head: 'bbb', ramo: 'ap/ap-1/c-1' },
      { cartella: 'E:/p.sierradeck-wt/x', head: 'ccc' }
    ])
  })

  it('una chat è conclusa se è finita, o se il suo autopilota è finito, fallito o archiviato', () => {
    const a = autopilota({ id: 'ap-1', cwd: 'E:/p', chats: [chat('c-1', 'lavoro'), chat('c-2', 'finita')] })
    expect(chatNote([a]).map((c) => c.aperta)).toEqual([true, false])
    expect(chatNote([{ ...a, stato: 'finito' }]).map((c) => c.aperta)).toEqual([false, false])
    expect(chatNote([{ ...a, archiviato: true }]).map((c) => c.aperta)).toEqual([false, false])
    expect(chatNote([{ ...a, stato: 'sospeso' }]).map((c) => c.aperta)).toEqual([true, false])
  })

  it('copia non registrata e senza chat aperta: via', () => {
    expect(decidiCopia(copia({ registrata: false }), [])).toMatchObject({ togli: true })
  })

  it('copia non registrata ma usata da una chat aperta (anche in una sottocartella): resta', () => {
    const chats = [{ autopilota: 'ap-1', chat: 'c-1', cartella: 'E:/p.sierradeck-wt/ap-1-c-1/app', aperta: true }]
    expect(decidiCopia(copia({ registrata: false, ramo: undefined }), chats)).toMatchObject({ togli: false, perche: 'chat aperta' })
  })

  it('copia appena nata o repository a sé: resta', () => {
    expect(decidiCopia(copia({ registrata: false, giovane: true }), [])).toMatchObject({ togli: false, perche: 'appena nata' })
    expect(decidiCopia(copia({ registrata: false, repositoryASe: true }), [])).toMatchObject({ togli: false, perche: 'repository a sé' })
  })

  it('copia registrata di chat conclusa: via solo se pulita e unita', () => {
    const chats = [{ autopilota: 'ap-1', chat: 'c-1', ramo: 'ap/ap-1/c-1', aperta: false }]
    expect(decidiCopia(copia(), chats)).toMatchObject({ togli: false, perche: 'stato non letto' })
    expect(decidiCopia(copia(), chats, { pulita: false, unita: true })).toMatchObject({ togli: false, perche: 'modifiche non salvate' })
    expect(decidiCopia(copia(), chats, { pulita: true, unita: false })).toMatchObject({ togli: false, perche: 'commit non uniti' })
    expect(decidiCopia(copia(), chats, { pulita: true, unita: true })).toMatchObject({ togli: true })
    // Chat sconosciuta: come conclusa.
    expect(decidiCopia(copia(), [], { pulita: true, unita: true })).toMatchObject({ togli: true })
  })

  it('copia registrata di chat aperta: resta anche se pulita e unita', () => {
    const chats = [{ autopilota: 'ap-1', chat: 'c-1', ramo: 'ap/ap-1/c-1', aperta: true }]
    expect(decidiCopia(copia(), chats, { pulita: true, unita: true })).toMatchObject({ togli: false, perche: 'chat aperta' })
  })

  it('rami: solo ap/*, mai il corrente, mai uno in una copia, mai di chat aperta, mai non unito', () => {
    const base = { inUso: new Set<string>(), chats: [], unito: true }
    expect(decidiRamo('main', base).togli).toBe(false)
    expect(decidiRamo('feature/x', base).togli).toBe(false)
    expect(decidiRamo('ap/ap-1/c-1', { ...base, corrente: 'ap/ap-1/c-1' }).perche).toBe('ramo corrente')
    expect(decidiRamo('ap/ap-1/c-1', { ...base, inUso: new Set(['ap/ap-1/c-1']) }).perche).toBe('aperto in una copia')
    expect(decidiRamo('ap/ap-1/c-1', { ...base, chats: [{ autopilota: 'a', chat: 'c-1', ramo: 'ap/ap-1/c-1', aperta: true }] }).perche).toBe('chat aperta')
    expect(decidiRamo('ap/ap-1/c-1', { ...base, unito: false }).perche).toBe('commit non uniti')
    expect(decidiRamo('ap/ap-1/c-1', base).togli).toBe(true)
  })

  it('tagliaCoda tiene le righe più nuove, intere, entro il tetto', () => {
    const testo = ['uno', 'due', 'tre', 'quattro', ''].join('\n')
    expect(tagliaCoda(testo, 1000)).toBe(testo)
    expect(tagliaCoda(testo, 13)).toBe('tre\nquattro\n')
    expect(tagliaCoda('una riga lunghissima senza a capo', 5)).toBe('')
  })

  it('compatta solo un autopilota concluso da più di 30 giorni, e non lo svuota', () => {
    const dialogo = Array.from({ length: 80 }, (_, i) => ({ quando: `t${i}`, da: 'lui' as const, testo: `d${i}` }))
    const decisioni = Array.from({ length: 70 }, (_, i) => ({ quando: `t${i}`, cosa: `c${i}` }))
    const vecchio = autopilota({ id: 'ap-v', cwd: 'E:/p', stato: 'finito', ultimoEvento: '2026-09-01T00:00:00.000Z', dialogo, decisioni })
    const c = compatta(vecchio, ORA)
    expect(c?.dialogo).toHaveLength(50)
    expect(c?.dialogo[49]?.testo).toBe('d79')
    expect(c?.decisioni).toHaveLength(50)
    expect(c?.obiettivo).toBe(vecchio.obiettivo)
    expect(compatta({ ...vecchio, stato: 'lavoro' }, ORA)).toBeUndefined()
    expect(compatta({ ...vecchio, ultimoEvento: '2026-10-20T00:00:00.000Z' }, ORA)).toBeUndefined()
    expect(compatta({ ...vecchio, dialogo: dialogo.slice(0, 10), decisioni: decisioni.slice(0, 10) }, ORA)).toBeUndefined()
    expect(compatta({ ...vecchio, stato: 'sospeso', archiviato: true }, ORA)?.dialogo).toHaveLength(50)
  })

  it('la riga del riepilogo', () => {
    const e = { ...esitoVuoto(), copieTolte: 3, ramiTolti: 2, byteLiberati: 5 * 1024 * 1024, tenute: [{ cosa: 'a', perche: 'modifiche non salvate' }, { cosa: 'b', perche: 'modifiche non salvate' }] }
    expect(rigaRiepilogo(e)).toBe('autopulizia: tolte 3 copie, 2 rami, liberati 5.0 MB; tenute 2 perché modifiche non salvate (2)')
    expect(rigaRiepilogo({ ...esitoVuoto(), saltata: 'PC carico (x)' })).toBe('autopulizia: rimandata — PC carico (x)')
  })
})

describe('su disco, con un git finto', () => {
  let base = ''
  let progetto = ''
  let copie = ''
  let archivio: Archivio
  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'sd-autopulizia-'))
    progetto = join(base, 'progetto')
    copie = `${progetto}.sierradeck-wt`
    mkdirSync(progetto)
    mkdirSync(copie)
    archivio = apriArchivio(join(base, 'autopiloti'))
  })

  /** Il git finto: la radice, `main` c'è, e i worktree registrati sono quelli dati. */
  const gitFinto = (p: { registrati?: Array<{ cartella: string; ramo: string }>; sporche?: string[]; nonUniti?: string[]; rami?: string[] } = {}): { git: Git; chiamate: string[] } => {
    const chiamate: string[] = []
    const git: Git = (args, cwd) => {
      const a = args.join(' ')
      chiamate.push(a)
      if (a === 'rev-parse --show-toplevel') return { codice: 0, uscita: progetto }
      if (a === 'rev-parse --verify --quiet refs/heads/main') return { codice: 0, uscita: 'x' }
      if (a === 'rev-parse --abbrev-ref HEAD') return { codice: 0, uscita: 'main' }
      if (a === 'worktree list --porcelain') {
        return { codice: 0, uscita: [`worktree ${progetto}`, 'HEAD 0', 'branch refs/heads/main', '', ...(p.registrati ?? []).flatMap((w) => [`worktree ${w.cartella}`, `HEAD h-${w.ramo}`, `branch refs/heads/${w.ramo}`, ''])].join('\n') }
      }
      if (a === 'status --porcelain') return { codice: 0, uscita: (p.sporche ?? []).includes(cwd) ? ' M a.txt' : '' }
      if (args[0] === 'merge-base') return { codice: (p.nonUniti ?? []).some((r) => args[2] === r || args[2] === `h-${r}`) ? 1 : 0, uscita: '' }
      if (args[0] === 'for-each-ref') return { codice: 0, uscita: (p.rami ?? []).join('\n') }
      return { codice: 0, uscita: '' }
    }
    return { git, chiamate }
  }

  it('toglie le cartelle rimaste (solo .claude/settings.local.json) e tiene quelle delle chat aperte', async () => {
    const rimasta = join(copie, 'ap-0123abcd-c-7')
    mkdirSync(join(rimasta, '.claude'), { recursive: true })
    writeFileSync(join(rimasta, '.claude', 'settings.local.json'), '{"env":{"ECC_HOOKS_ENABLED":"false"}}')
    const aperta = join(copie, 'ap-0123abcd-c-8')
    mkdirSync(aperta)
    writeFileSync(join(copie, 'un-file.log'), 'resta')
    archivio.scrivi(autopilota({ id: 'ap-0123abcd-0000', cwd: progetto, chats: [chat('c-8', 'lavoro', { cartella: aperta })] }))
    const { git } = gitFinto()
    const e = await autopulizia({ archivio, git: comeAsincrono(git), ora: DOPO })
    expect(existsSync(rimasta)).toBe(false)
    expect(existsSync(aperta)).toBe(true)
    expect(existsSync(join(copie, 'un-file.log'))).toBe(true)
    expect(e.copieTolte).toBe(1)
    expect(e.tenute).toEqual([{ cosa: 'ap-0123abcd-c-8', perche: 'chat aperta' }])
  })

  it('le cartelle appena nate non si toccano (il servizio potrebbe crearle adesso)', async () => {
    mkdirSync(join(copie, 'ap-1-c-1'))
    archivio.scrivi(autopilota({ id: 'ap-1', cwd: progetto }))
    const e = await autopulizia({ archivio, git: comeAsincrono(gitFinto().git) })
    expect(existsSync(join(copie, 'ap-1-c-1'))).toBe(true)
    expect(e.tenute[0]?.perche).toBe('appena nata')
  })

  it('un worktree registrato con modifiche o commit non uniti resta, e git non lo rimuove', async () => {
    const sporca = join(copie, 'ap-1-c-1')
    const avanti = join(copie, 'ap-1-c-2')
    const buona = join(copie, 'ap-1-c-3')
    for (const d of [sporca, avanti, buona]) { mkdirSync(d); writeFileSync(join(d, '.git'), 'gitdir: x\n') }
    archivio.scrivi(autopilota({ id: 'ap-1', cwd: progetto, chats: [chat('c-1', 'finita', { ramo: 'ap/ap-1/c-1' }), chat('c-2', 'finita', { ramo: 'ap/ap-1/c-2' })] }))
    const { git, chiamate } = gitFinto({
      registrati: [{ cartella: sporca, ramo: 'ap/ap-1/c-1' }, { cartella: avanti, ramo: 'ap/ap-1/c-2' }, { cartella: buona, ramo: 'ap/ap-1/c-3' }],
      sporche: [sporca],
      nonUniti: ['ap/ap-1/c-2']
    })
    const e = await autopulizia({ archivio, git: comeAsincrono(git), ora: DOPO })
    expect(chiamate.filter((c) => c.startsWith('worktree remove'))).toEqual([`worktree remove --force ${buona}`])
    expect(existsSync(sporca)).toBe(true)
    expect(existsSync(avanti)).toBe(true)
    expect(e.tenute.map((t) => t.perche).sort()).toEqual(['commit non uniti', 'modifiche non salvate'])
  })

  it('rami: via gli ap/* uniti di chat concluse o sconosciute; restano gli altri', async () => {
    archivio.scrivi(autopilota({ id: 'ap-1', cwd: progetto, chats: [chat('c-1', 'finita', { ramo: 'ap/ap-1/c-1' }), chat('c-2', 'lavoro', { ramo: 'ap/ap-1/c-2' })] }))
    const { git, chiamate } = gitFinto({
      registrati: [],
      rami: ['ap/ap-1/c-1', 'ap/ap-1/c-2', 'ap/ap-1/c-3', 'ap/ap-1/c-4'],
      nonUniti: ['ap/ap-1/c-4']
    })
    const e = await autopulizia({ archivio, git: comeAsincrono(git), ora: DOPO })
    expect(chiamate.filter((c) => c.startsWith('branch -D'))).toEqual(['branch -D ap/ap-1/c-1', 'branch -D ap/ap-1/c-3'])
    expect(e.ramiTolti).toBe(2)
  })

  it('le note oltre il tetto tengono le righe più nuove; gli autopiloti vecchi e finiti si compattano', async () => {
    const note = join(archivio.cartella, 'ap-1.decisioni.jsonl')
    const riga = `${JSON.stringify({ cosa: 'x'.repeat(1000) })}\n`
    writeFileSync(note, riga.repeat(25 * 1024))
    const dialogo = Array.from({ length: 60 }, (_, i) => ({ quando: `t${i}`, da: 'lui' as const, testo: `d${i}` }))
    archivio.scrivi(autopilota({ id: 'ap-1', cwd: join(base, 'non-c-e'), stato: 'finito', ultimoEvento: '2026-01-01T00:00:00.000Z', dialogo }))
    const e = await autopulizia({ archivio, git: comeAsincrono(gitFinto().git) })
    expect(statSync(note).size).toBeLessThanOrEqual(20 * 1024 * 1024)
    expect(readFileSync(note, 'utf8').split('\n').filter((r) => r !== '').every((r) => r === riga.trim())).toBe(true)
    expect(e.noteTagliate).toBe(1)
    expect(archivio.leggi('ap-1')?.dialogo).toHaveLength(50)
    expect(archivio.elenca().map((a) => a.id)).toEqual(['ap-1'])
    expect(e.autopilotiCompattati).toBe(1)
  })

  it('il registro oltre il tetto perde i giorni più vecchi, mai quello di oggi', () => {
    const log = join(base, 'log')
    mkdirSync(log)
    for (const g of ['2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30']) writeFileSync(join(log, `sierradeck-${g}.log`), 'x'.repeat(100))
    writeFileSync(join(log, 'altro.txt'), 'x'.repeat(1000))
    expect(accorciaRegistro(log, ORA, 250)).toBe(200)
    expect(readdirSync(log).sort()).toEqual(['altro.txt', 'sierradeck-2026-10-29.log', 'sierradeck-2026-10-30.log'])
    expect(accorciaRegistro(log, ORA, 1)).toBe(100)
    expect(readdirSync(log).sort()).toEqual(['altro.txt', 'sierradeck-2026-10-30.log'])
  })

  it('a PC carico si rimanda; «Pulisci adesso» (forza) gira lo stesso; due giri insieme sono uno', async () => {
    mkdirSync(join(copie, 'ap-1-c-1'))
    archivio.scrivi(autopilota({ id: 'ap-1', cwd: progetto }))
    const { git, chiamate } = gitFinto()
    const pulisci = creaAutopulizia({ archivio, git: comeAsincrono(git), ora: DOPO, pcCarico: () => 'processore al 95%' })
    expect((await pulisci()).saltata).toBe('PC carico (processore al 95%)')
    expect(chiamate).toEqual([])
    const [a, b] = await Promise.all([pulisci({ forza: true }), pulisci({ forza: true })])
    expect(a).toBe(b)
    expect(a.copieTolte).toBe(1)
  })
})

describe('i collegamenti dentro una copia si staccano senza seguirli', () => {
  it('una giunzione vera a node_modules: la copia se ne va, la cartella a cui puntava resta intera', async () => {
    const base = mkdtempSync(join(tmpdir(), 'sd-autopulizia-giunzione-'))
    const vera = join(base, 'progetto', 'node_modules')
    mkdirSync(join(vera, 'pacchetto'), { recursive: true })
    writeFileSync(join(vera, 'pacchetto', 'index.js'), 'prezioso')
    const copie = join(base, 'progetto.sierradeck-wt')
    const c = join(copie, 'ap-1-c-1')
    mkdirSync(join(c, 'sotto'), { recursive: true })
    writeFileSync(join(c, 'a.txt'), 'uno')
    symlinkSync(vera, join(c, 'node_modules'), 'junction')
    symlinkSync(vera, join(c, 'sotto', 'node_modules'), 'junction')
    const r = await togliCartellaCopia(c, copie)
    expect(r.ok).toBe(true)
    expect(existsSync(c)).toBe(false)
    expect(readFileSync(join(vera, 'pacchetto', 'index.js'), 'utf8')).toBe('prezioso')
  })

  it('staccaCollegamenti non entra nella giunzione e conta quelle staccate', async () => {
    const base = mkdtempSync(join(tmpdir(), 'sd-autopulizia-stacca-'))
    const vera = join(base, 'vera')
    mkdirSync(vera)
    writeFileSync(join(vera, 'f.txt'), 'x')
    const c = join(base, 'copia')
    mkdirSync(c)
    symlinkSync(vera, join(c, 'node_modules'), 'junction')
    expect(await staccaCollegamenti(c)).toEqual({ staccati: 1, falliti: [] })
    expect(existsSync(join(c, 'node_modules'))).toBe(false)
    expect(existsSync(join(vera, 'f.txt'))).toBe(true)
  })

  it('fuori dalla cartella delle copie non si toglie niente', async () => {
    const base = mkdtempSync(join(tmpdir(), 'sd-autopulizia-fuori-'))
    mkdirSync(join(base, 'altro'))
    expect((await togliCartellaCopia(join(base, 'altro'), join(base, 'copie'))).ok).toBe(false)
    expect(existsSync(join(base, 'altro'))).toBe(true)
  })
})

// git vero: worktree, rami, unione. Sotto carico supera i 20 s di regola.
describe('con un git vero', { timeout: 120_000 }, () => {
  const esegui = (args: string[], cwd: string): string => {
    const r = gitReale(args, cwd)
    if (r.codice !== 0) throw new Error(`git ${args.join(' ')}: ${r.uscita}`)
    return r.uscita
  }
  let modello = ''
  beforeAll(() => {
    modello = join(mkdtempSync(join(tmpdir(), 'sd-autopulizia-modello-')), 'progetto')
    mkdirSync(modello)
    esegui(['init', '-q', '-b', 'main'], modello)
    esegui(['config', 'user.name', 'Prova'], modello)
    esegui(['config', 'user.email', 'prova@example.com'], modello)
    esegui(['config', 'core.autocrlf', 'false'], modello)
    writeFileSync(join(modello, 'a.txt'), 'uno\n')
    // Come nei progetti veri: la giunzione a node_modules non è una modifica.
    writeFileSync(join(modello, '.gitignore'), 'node_modules\n')
    esegui(['add', '-A'], modello)
    esegui(['commit', '-q', '-m', 'inizio'], modello)
  }, 120_000)

  let progetto = ''
  beforeEach(() => {
    progetto = join(mkdtempSync(join(tmpdir(), 'sd-autopulizia-git-')), 'progetto')
    cpSync(modello, progetto, { recursive: true })
  })
  afterEach(() => { /* le cartelle temporanee le toglie la guardia dei test */ })

  it('toglie copie e rami delle chat concluse e già unite; tiene il resto, e la giunzione non porta via node_modules', async () => {
    const id = 'ap-0123abcd-0000-0000-0000-000000000000'
    const wt = (c: string): { cartella: string; ramo: string } => {
      const r = creaWorktree(gitReale, { cwd: progetto, autopilota: id, chat: c, base: 'main' })
      if (!r.ok) throw new Error(r.motivo)
      return r
    }
    const c1 = wt('c-1') // finita, pulita, unita → via
    const c2 = wt('c-2') // aperta → resta
    const c3 = wt('c-3') // finita ma con una modifica → resta
    const c4 = wt('c-4') // finita con un commit non unito → resta
    writeFileSync(join(c3.cartella, 'a.txt'), 'cambiato\n')
    writeFileSync(join(c4.cartella, 'b.txt'), 'nuovo\n')
    esegui(['add', '-A'], c4.cartella)
    esegui(['commit', '-q', '-m', 'solo sul ramo'], c4.cartella)
    // Un ramo già unito senza copia, uno non unito, uno non ap/.
    esegui(['branch', 'ap/ap-0123abcd/c-5'], progetto)
    esegui(['branch', 'ap/ap-0123abcd/c-6', c4.ramo], progetto)
    esegui(['branch', 'altro'], progetto)
    // La giunzione a node_modules nella copia che se ne va.
    const moduli = join(progetto, 'node_modules')
    mkdirSync(join(moduli, 'p'), { recursive: true })
    writeFileSync(join(moduli, 'p', 'index.js'), 'prezioso')
    symlinkSync(moduli, join(c1.cartella, 'node_modules'), 'junction')
    // La cartella rimasta da un test: solo `.claude/settings.local.json`.
    const rimasta = join(`${progetto}.sierradeck-wt`, 'ap-0123abcd-c-99')
    mkdirSync(join(rimasta, '.claude'), { recursive: true })
    writeFileSync(join(rimasta, '.claude', 'settings.local.json'), '{}')

    const archivio = apriArchivio(join(progetto, '..', 'autopiloti'))
    archivio.scrivi(autopilota({
      id, cwd: progetto,
      chats: [
        chat('c-1', 'finita', c1), chat('c-2', 'lavoro', c2), chat('c-3', 'finita', c3), chat('c-4', 'finita', c4),
        chat('c-5', 'finita', { ramo: 'ap/ap-0123abcd/c-5' })
      ]
    }))
    const e = await autopulizia({ archivio, git: comeAsincrono(gitReale), ora: DOPO })

    expect(e.errori).toEqual([])
    expect(existsSync(c1.cartella)).toBe(false)
    expect(existsSync(rimasta)).toBe(false)
    for (const c of [c2, c3, c4]) expect(existsSync(c.cartella)).toBe(true)
    expect(readFileSync(join(c3.cartella, 'a.txt'), 'utf8')).toBe('cambiato\n')
    expect(readFileSync(join(moduli, 'p', 'index.js'), 'utf8')).toBe('prezioso')
    const rami = esegui(['for-each-ref', '--format=%(refname:short)', 'refs/heads/'], progetto).split(/\r?\n/).sort()
    expect(rami).toEqual(['altro', 'ap/ap-0123abcd/c-2', 'ap/ap-0123abcd/c-3', 'ap/ap-0123abcd/c-4', 'ap/ap-0123abcd/c-6', 'main'])
    expect(e.copieTolte).toBe(2)
    expect(e.ramiTolti).toBe(2)
    expect(e.tenute.map((t) => t.perche)).toEqual(expect.arrayContaining(['chat aperta', 'modifiche non salvate', 'commit non uniti']))
    expect(esegui(['worktree', 'list', '--porcelain'], progetto)).not.toMatch(/c-1/)
  })
})

describe('«Pulisci adesso»: POST /autopulizia', () => {
  let server: ServerAutopiloti
  afterEach(() => { server.close() })

  it('chiama l autopulizia forzata e risponde con la riga del riepilogo', async () => {
    const chieste: Array<{ forza?: boolean } | undefined> = []
    server = creaServer({
      archivio: apriArchivio(mkdtempSync(join(tmpdir(), 'sd-autopulizia-srv-'))),
      esegui: () => Promise.resolve({ codice: 0, uscita: 'ok' }),
      interroga: () => Promise.resolve({ testo: '{"azione": "finito"}' }),
      avviaLavoro: () => Promise.resolve(),
      fermaLavoro: () => {},
      avvisa: () => Promise.resolve(),
      domande: creaRegistroDomande({ adesso: () => Date.now() }),
      scadenzaDomandaMs: 5000,
      scadenzaInterviataMs: 5000,
      adesso: () => new Date().toISOString(),
      autopulizia: (opz) => { chieste.push(opz); return Promise.resolve({ ...esitoVuoto(), copieTolte: 4 }) }
    })
    const porta = await new Promise<number>((ris) => { server.listen(0, '127.0.0.1', () => { ris((server.address() as { port: number }).port) }) })
    const r = await fetch(`http://127.0.0.1:${porta}/autopulizia`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    const corpo = await r.json() as { riga: string; copieTolte: number }
    expect(r.status).toBe(200)
    expect(corpo.copieTolte).toBe(4)
    expect(corpo.riga).toBe('autopulizia: tolte 4 copie, 0 rami, liberati 0.0 MB')
    expect(chieste).toEqual([{ forza: true }])
  })
})
