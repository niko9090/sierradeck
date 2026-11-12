import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nuovoAutopilota, type Autopilota, type ChatGovernata } from '@shared/autopilota'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import {
  accorciaRegistro, autopulizia, chatNote, compatta, creaAutopulizia, decidiCopia, decidiRamo, decidiRamoAgente, leggiWorktreeList, pesoCartella,
  rigaRiepilogo, staccaCollegamenti, tagliaCoda, togliCartellaCopia, esitoVuoto, TENUTA_FILE_IN_USO, type CopiaSuDisco,
  copiatoNelPrincipale, RAMO_COPIATO
} from '../../src/autopilot-host/autopulizia'
import { comeAsincrono, creaWorktree, gitReale, type Git } from '../../src/autopilot-host/worktree'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { unicoFinto } from '../setup/unico-finto'
import { finche, programmaVivoIn } from '../setup/programma-vivo'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'

const ORA = Date.parse('2026-10-30T12:00:00.000Z')
/** Sette ore dopo adesso: le cartelle create dal test non sono più «appena nate». */
const DOPO = (): number => Date.now() + 7 * 60 * 60_000

function autopilota(over: Partial<Autopilota> & { id: string; cwd: string }): Autopilota {
  return {
    ...nuovoAutopilota({ id: over.id, nome: 'x', obiettivo: 'o', cwd: over.cwd, iniziatoIl: '2026-10-01T00:00:00.000Z' }),
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
  const gitFinto = (p: {
    registrati?: Array<{ cartella: string; ramo: string }>; sporche?: string[]; nonUniti?: string[]; rami?: string[]
    /** L'HEAD che `rev-parse HEAD` dà in una cartella (le copie che git non conosce). */
    headDi?: Record<string, string>
    /** Chiamato a ogni `git status` (per cambiare l'archivio durante il giro). */
    suStatus?: (cwd: string) => void
    /** 12/11: i rami (o gli HEAD) le cui modifiche sono già nel principale con rebase o cherry-pick. */
    copiati?: string[]
    /** 12/11: le cartelle dove `git status` non riesce (il worktree a cui puntavano non c'è più). */
    statusRotto?: string[]
  } = {}): { git: Git; chiamate: string[] } => {
    const chiamate: string[] = []
    const git: Git = (args, cwd) => {
      const a = args.join(' ')
      chiamate.push(a)
      if (a === 'status --porcelain') p.suStatus?.(cwd)
      if (a === 'status --porcelain' && (p.statusRotto ?? []).includes(cwd)) return { codice: 128, uscita: 'fatal: not a git repository' }
      if (args[0] === 'rev-list' && args[1] === '--count') return { codice: 0, uscita: '1\n' }
      if (args[0] === 'cherry') return { codice: 0, uscita: (p.copiati ?? []).includes(args[2]!) ? '- abc123\n' : '+ abc123\n' }
      if (a === 'rev-parse --verify --quiet HEAD') {
        const h = p.headDi?.[cwd]
        return h !== undefined ? { codice: 0, uscita: h } : { codice: 1, uscita: '' }
      }
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

  describe('0.86.1: una cartella che git non riconosce ma ha un .git è un worktree', () => {
    const conGit = (n: string): string => { const d = join(copie, n); mkdirSync(d); writeFileSync(join(d, '.git'), 'gitdir: x\n'); return d }

    it('con modifiche: resta, e niente si cancella', async () => {
      const d = conGit('ap-1-c-1')
      writeFileSync(join(d, 'lavoro.txt'), 'non salvato')
      archivio.scrivi(autopilota({ id: 'ap-1', cwd: progetto }))
      const { git } = gitFinto({ sporche: [d], headDi: { [d]: 'h1' } })
      const e = await autopulizia({ archivio, git: comeAsincrono(git), ora: DOPO })
      expect(existsSync(join(d, 'lavoro.txt'))).toBe(true)
      expect(e.copieTolte).toBe(0)
      expect(e.tenute).toEqual([{ cosa: 'ap-1-c-1', perche: 'modifiche non salvate' }])
    })

    it('pulita ma con commit non uniti: resta; senza HEAD leggibile: resta', async () => {
      const avanti = conGit('ap-1-c-1')
      const cieca = conGit('ap-1-c-2')
      archivio.scrivi(autopilota({ id: 'ap-1', cwd: progetto }))
      const { git } = gitFinto({ headDi: { [avanti]: 'h-avanti' }, nonUniti: ['h-avanti'] })
      const e = await autopulizia({ archivio, git: comeAsincrono(git), ora: DOPO })
      expect(existsSync(avanti)).toBe(true)
      expect(existsSync(cieca)).toBe(true)
      expect(e.tenute.map((t) => t.perche).sort()).toEqual(['commit non uniti', 'commit non uniti'])
    })

    it('pulita e già unita: via (senza `worktree remove`: git non la conosce)', async () => {
      const d = conGit('ap-1-c-1')
      archivio.scrivi(autopilota({ id: 'ap-1', cwd: progetto }))
      const { git, chiamate } = gitFinto({ headDi: { [d]: 'h1' } })
      const e = await autopulizia({ archivio, git: comeAsincrono(git), ora: DOPO })
      expect(existsSync(d)).toBe(false)
      expect(e.copieTolte).toBe(1)
      expect(chiamate.filter((c) => c.startsWith('worktree remove'))).toEqual([])
    })
  })

  describe('0.89.0: le copie degli specialisti in .claude/worktrees', () => {
    const agente = (n: string): string => { const d = join(progetto, '.claude', 'worktrees', n); mkdirSync(d, { recursive: true }); writeFileSync(join(d, '.git'), 'gitdir: x\n'); return d }

    it('nessuno specialista al lavoro: la copia pulita e unita va via, quella con modifiche resta', async () => {
      const buona = agente('agent-1')
      const sporca = agente('agent-2')
      archivio.scrivi(autopilota({ id: 'ap-1', cwd: progetto }))
      const { git } = gitFinto({ headDi: { [buona]: 'h1', [sporca]: 'h2' }, sporche: [sporca] })
      const e = await autopulizia({ archivio, git: comeAsincrono(git), ora: DOPO, agentiAlLavoro: () => false })
      expect(existsSync(buona)).toBe(false)
      expect(existsSync(sporca)).toBe(true)
      expect(existsSync(join(progetto, '.claude', 'worktrees'))).toBe(true)
      expect(e.tenute).toEqual([{ cosa: 'agent-2', perche: 'modifiche non salvate' }])
    })

    it('uno specialista al lavoro, o nessuno che lo sappia dire: non se ne tocca nessuna', async () => {
      const d = agente('agent-1')
      archivio.scrivi(autopilota({ id: 'ap-1', cwd: progetto }))
      const { git } = gitFinto({ headDi: { [d]: 'h1' } })
      await autopulizia({ archivio, git: comeAsincrono(git), ora: DOPO, agentiAlLavoro: () => true })
      expect(existsSync(d)).toBe(true)
      await autopulizia({ archivio, git: comeAsincrono(git), ora: DOPO })
      expect(existsSync(d)).toBe(true)
    })

    it('uno specialista che parte durante il giro: le copie dopo restano', async () => {
      const d = agente('agent-1')
      archivio.scrivi(autopilota({ id: 'ap-1', cwd: progetto }))
      let volte = 0
      const { git } = gitFinto({ headDi: { [d]: 'h1' } })
      const e = await autopulizia({ archivio, git: comeAsincrono(git), ora: DOPO, agentiAlLavoro: () => { volte += 1; return volte > 1 } })
      expect(existsSync(d)).toBe(true)
      expect(e.tenute).toEqual([{ cosa: 'agent-1', perche: 'specialisti al lavoro' }])
    })
  })

  describe('0.86.1: i percorsi si confrontano veri (giunzioni, subst, 8.3)', () => {
    it('la cartella di una chat aperta scritta attraverso una giunzione è la stessa copia', async () => {
      const d = join(copie, 'ap-1-c-1')
      mkdirSync(d)
      const alias = join(base, 'alias')
      symlinkSync(copie, alias, 'junction')
      archivio.scrivi(autopilota({ id: 'ap-1', cwd: progetto, chats: [chat('c-1', 'lavoro', { cartella: join(alias, 'ap-1-c-1') })] }))
      const e = await autopulizia({ archivio, git: comeAsincrono(gitFinto().git), ora: DOPO })
      expect(existsSync(d)).toBe(true)
      expect(e.tenute).toEqual([{ cosa: 'ap-1-c-1', perche: 'chat aperta' }])
    })

    it('un worktree che git scrive attraverso una giunzione è registrato: con modifiche resta', async () => {
      const d = join(copie, 'ap-1-c-1')
      mkdirSync(d)
      writeFileSync(join(d, '.git'), 'gitdir: x\n')
      const alias = join(base, 'alias')
      symlinkSync(copie, alias, 'junction')
      archivio.scrivi(autopilota({ id: 'ap-1', cwd: progetto, chats: [chat('c-1', 'finita', { ramo: 'ap/ap-1/c-1' })] }))
      const { git, chiamate } = gitFinto({ registrati: [{ cartella: join(alias, 'ap-1-c-1'), ramo: 'ap/ap-1/c-1' }], sporche: [d] })
      const e = await autopulizia({ archivio, git: comeAsincrono(git), ora: DOPO })
      expect(existsSync(d)).toBe(true)
      expect(chiamate.filter((c) => c.startsWith('worktree remove'))).toEqual([])
      expect(e.tenute).toEqual([{ cosa: 'ap-1-c-1', perche: 'modifiche non salvate' }])
    })
  })

  it('0.86.1: una chat aperta durante il giro salva la sua copia (si rilegge prima di `worktree remove`)', async () => {
    const d = join(copie, 'ap-1-c-1')
    mkdirSync(d)
    writeFileSync(join(d, '.git'), 'gitdir: x\n')
    archivio.scrivi(autopilota({ id: 'ap-1', cwd: progetto, chats: [chat('c-1', 'finita', { ramo: 'ap/ap-1/c-1' })] }))
    const { git, chiamate } = gitFinto({
      registrati: [{ cartella: d, ramo: 'ap/ap-1/c-1' }],
      // Mentre si guarda la copia, un altro autopilota apre una chat proprio lì.
      suStatus: () => { archivio.scrivi(autopilota({ id: 'ap-2', cwd: progetto, chats: [chat('c-1', 'lavoro', { cartella: d })] })) }
    })
    const e = await autopulizia({ archivio, git: comeAsincrono(git), ora: DOPO })
    expect(existsSync(d)).toBe(true)
    expect(chiamate.filter((c) => c.startsWith('worktree remove'))).toEqual([])
    expect(e.tenute).toEqual([{ cosa: 'ap-1-c-1', perche: 'chat aperta' }])
  })

  it('0.86.1: un ramo di una chat aperta durante il giro non si toglie', async () => {
    archivio.scrivi(autopilota({ id: 'ap-1', cwd: progetto, chats: [chat('c-1', 'finita', { ramo: 'ap/ap-1/c-1' })] }))
    const { git, chiamate } = gitFinto({ rami: ['ap/ap-1/c-1'] })
    const gitCheRiapre: Git = (args, cwd) => {
      if (args[0] === 'merge-base') archivio.scrivi(autopilota({ id: 'ap-1', cwd: progetto, chats: [chat('c-1', 'lavoro', { ramo: 'ap/ap-1/c-1' })] }))
      return git(args, cwd)
    }
    const e = await autopulizia({ archivio, git: comeAsincrono(gitCheRiapre), ora: DOPO })
    expect(chiamate.filter((c) => c.startsWith('branch -D'))).toEqual([])
    expect(e.ramiTolti).toBe(0)
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

  describe('11/11: i rami e le copie degli specialisti', () => {
    const agente = (n: string): string => { const d = join(progetto, '.claude', 'worktrees', n); mkdirSync(d, { recursive: true }); writeFileSync(join(d, '.git'), 'gitdir: x\n'); return d }

    it('la regola, pura: solo un ramo di specialista già unito, non in uso, non di chi lavora, non citato da un compito aperto', () => {
      const base = { corrente: 'main', inUso: new Set<string>(), vive: new Set<string>(), citati: new Set<string>(), unito: true }
      expect(decidiRamoAgente('worktree-agent-a1', base)).toEqual({ ramo: 'worktree-agent-a1', togli: true, perche: 'già unito' })
      expect(decidiRamoAgente('worktree-agent-a1', { ...base, unito: false }).perche).toBe('commit non uniti')
      expect(decidiRamoAgente('worktree-agent-a1', { ...base, inUso: new Set(['worktree-agent-a1']) }).perche).toBe('aperto in una copia')
      expect(decidiRamoAgente('worktree-agent-a1', { ...base, vive: new Set(['agent-a1']) }).perche).toBe('specialista al lavoro')
      expect(decidiRamoAgente('worktree-agent-a1', { ...base, citati: new Set(['worktree-agent-a1']) }).perche).toBe('citato da un compito aperto')
      expect(decidiRamoAgente('worktree-agent-a1', { ...base, corrente: 'worktree-agent-a1' }).perche).toBe('ramo corrente')
      expect(decidiRamoAgente('rilascio-1.2.3', base).togli).toBe(false)
      expect(decidiRamoAgente('ap/ap-1/c-1', base).togli).toBe(false)
    })

    it('rami: via i worktree-agent-* già uniti, con `branch -d` e mai `-D`; restano i non uniti, i citati, quelli di chi lavora e gli altri', async () => {
      archivio.scrivi(autopilota({ id: 'ap-1', cwd: progetto }))
      const { git, chiamate } = gitFinto({
        rami: ['worktree-agent-a1', 'worktree-agent-a2', 'worktree-agent-a3', 'worktree-agent-a4', 'rilascio-1.2.3'],
        nonUniti: ['worktree-agent-a2']
      })
      const e = await autopulizia({
        archivio, git: comeAsincrono(git), ora: DOPO,
        copieVive: () => new Set(['agent-a4']),
        ramiCitati: () => new Set(['worktree-agent-a3'])
      })
      expect(chiamate.filter((c) => c.startsWith('branch '))).toEqual(['branch -d worktree-agent-a1'])
      expect(e.ramiTolti).toBe(1)
      expect(e.errori).toEqual([])
    })

    it('senza sapere quali rami servono ancora, o chi lavora: nessun ramo di specialista si toglie', async () => {
      archivio.scrivi(autopilota({ id: 'ap-1', cwd: progetto }))
      const { git, chiamate } = gitFinto({ rami: ['worktree-agent-a1'] })
      await autopulizia({ archivio, git: comeAsincrono(git), ora: DOPO })
      await autopulizia({ archivio, git: comeAsincrono(git), ora: DOPO, copieVive: () => new Set(), ramiCitati: () => undefined })
      await autopulizia({ archivio, git: comeAsincrono(git), ora: DOPO, copieVive: () => undefined, ramiCitati: () => new Set() })
      expect(chiamate.filter((c) => c.startsWith('branch '))).toEqual([])
    })

    it('se git non lo dà per unito (`branch -d` rifiuta) il ramo resta, e non è un errore', async () => {
      archivio.scrivi(autopilota({ id: 'ap-1', cwd: progetto }))
      const { git } = gitFinto({ rami: ['worktree-agent-a1'] })
      const gitCheRifiuta: Git = (args, cwd) => (args[0] === 'branch' ? { codice: 1, uscita: 'error: the branch is not fully merged' } : git(args, cwd))
      const e = await autopulizia({ archivio, git: comeAsincrono(gitCheRifiuta), ora: DOPO, copieVive: () => new Set(), ramiCitati: () => new Set() })
      expect(e.ramiTolti).toBe(0)
      expect(e.errori).toEqual([])
      expect(e.tenute).toEqual([{ cosa: 'worktree-agent-a1', perche: 'git non lo dà per unito' }])
    })

    it('copie: con uno specialista al lavoro si salta solo la sua, le altre finite e unite vanno via', async () => {
      const finita = agente('agent-1')
      const viva = agente('agent-2')
      const sporca = agente('agent-3')
      archivio.scrivi(autopilota({ id: 'ap-1', cwd: progetto }))
      const { git } = gitFinto({ headDi: { [finita]: 'h1', [viva]: 'h2', [sporca]: 'h3' }, sporche: [sporca] })
      // Come prima (tutto o niente) non se ne sarebbe toccata nessuna: uno specialista lavora.
      const e = await autopulizia({ archivio, git: comeAsincrono(git), ora: DOPO, agentiAlLavoro: () => true, copieVive: () => new Set(['agent-2']) })
      expect(existsSync(finita)).toBe(false)
      expect(existsSync(viva)).toBe(true)
      expect(existsSync(sporca)).toBe(true)
      expect(e.tenute).toEqual(expect.arrayContaining([{ cosa: 'agent-2', perche: 'specialisti al lavoro' }, { cosa: 'agent-3', perche: 'modifiche non salvate' }]))
    })

    it('copie: se non si sa chi lavora (il servizio non è pronto) non se ne tocca nessuna', async () => {
      const d = agente('agent-1')
      archivio.scrivi(autopilota({ id: 'ap-1', cwd: progetto }))
      const { git } = gitFinto({ headDi: { [d]: 'h1' } })
      await autopulizia({ archivio, git: comeAsincrono(git), ora: DOPO, agentiAlLavoro: () => false, copieVive: () => undefined })
      expect(existsSync(d)).toBe(true)
    })

    it('12/11, la regola: un ramo arrivato nel principale con rebase o cherry-pick si toglie, con le stesse cautele', () => {
      const base = { corrente: 'main', inUso: new Set<string>(), vive: new Set<string>(), citati: new Set<string>(), unito: false }
      expect(decidiRamoAgente('worktree-agent-a1', { ...base, copiato: true })).toEqual({ ramo: 'worktree-agent-a1', togli: true, perche: RAMO_COPIATO })
      expect(decidiRamoAgente('worktree-agent-a1', { ...base, copiato: false }).perche).toBe('commit non uniti')
      expect(decidiRamoAgente('worktree-agent-a1', { ...base, copiato: true, inUso: new Set(['worktree-agent-a1']) }).togli).toBe(false)
      expect(decidiRamoAgente('worktree-agent-a1', { ...base, copiato: true, vive: new Set(['agent-a1']) }).togli).toBe(false)
      expect(decidiRamoAgente('worktree-agent-a1', { ...base, copiato: true, citati: new Set(['worktree-agent-a1']) }).togli).toBe(false)
      expect(decidiRamoAgente('ap/ap-1/c-1', { ...base, copiato: true }).togli).toBe(false)
    })

    it('12/11, rami: quello copiato nel principale va via (con -D, solo lui); quello con modifiche sue resta', async () => {
      archivio.scrivi(autopilota({ id: 'ap-1', cwd: progetto }))
      const { git, chiamate } = gitFinto({
        rami: ['worktree-agent-a1', 'worktree-agent-a2', 'worktree-agent-a3'],
        nonUniti: ['worktree-agent-a1', 'worktree-agent-a2'],
        copiati: ['worktree-agent-a1']
      })
      const e = await autopulizia({ archivio, git: comeAsincrono(git), ora: DOPO, copieVive: () => new Set(), ramiCitati: () => new Set() })
      expect(chiamate.filter((c) => c.startsWith('branch '))).toEqual(['branch -D worktree-agent-a1', 'branch -d worktree-agent-a3'])
      expect(e.ramiTolti).toBe(2)
    })

    it('12/11, copie: quella di uno specialista unita con cherry-pick va via; quella con modifiche non salvate resta', async () => {
      const copiata = agente('agent-5')
      const sporca = agente('agent-6')
      archivio.scrivi(autopilota({ id: 'ap-1', cwd: progetto }))
      const { git } = gitFinto({ headDi: { [copiata]: 'h5', [sporca]: 'h6' }, nonUniti: ['h5', 'h6'], copiati: ['h5', 'h6'], sporche: [sporca] })
      await autopulizia({ archivio, git: comeAsincrono(git), ora: DOPO, copieVive: () => new Set() })
      expect(existsSync(copiata)).toBe(false)
      expect(existsSync(sporca)).toBe(true)
    })

    it('12/11, copie orfane: non registrata, solo il file .git e git non la legge → via; con altro dentro resta', async () => {
      const orfana = agente('agent-7')
      const conLavoro = agente('agent-8')
      writeFileSync(join(conLavoro, 'lavoro.txt'), 'non salvato')
      archivio.scrivi(autopilota({ id: 'ap-1', cwd: progetto }))
      const { git } = gitFinto({ statusRotto: [orfana, conLavoro] })
      const e = await autopulizia({ archivio, git: comeAsincrono(git), ora: DOPO, copieVive: () => new Set() })
      expect(existsSync(orfana)).toBe(false)
      expect(existsSync(conLavoro)).toBe(true)
      expect(e.tenute).toEqual(expect.arrayContaining([{ cosa: 'agent-8', perche: 'stato non letto' }]))
    })

    it('12/11, git vero: `git cherry` riconosce il ramo copiato con cherry-pick, e non quello con un commit suo', async () => {
      const repo = mkdtempSync(join(tmpdir(), 'cherry-'))
      const g = (...args: string[]): void => { const r = gitReale(['-c', 'user.name=Prova', '-c', 'user.email=prova@example.invalid', ...args], repo); if (r.codice !== 0) throw new Error(r.uscita) }
      g('init', '-b', 'main')
      writeFileSync(join(repo, 'a.txt'), 'a\n'); g('add', '.'); g('commit', '-m', 'inizio')
      g('checkout', '-b', 'worktree-agent-x1')
      writeFileSync(join(repo, 'b.txt'), 'b\n'); g('add', '.'); g('commit', '-m', 'b')
      g('checkout', 'main')
      g('checkout', '-b', 'worktree-agent-x2')
      writeFileSync(join(repo, 'c.txt'), 'c\n'); g('add', '.'); g('commit', '-m', 'c')
      g('checkout', 'main')
      writeFileSync(join(repo, 'd.txt'), 'd\n'); g('add', '.'); g('commit', '-m', 'd')
      g('cherry-pick', 'worktree-agent-x1')
      const ga = comeAsincrono(gitReale)
      expect(await copiatoNelPrincipale(ga, repo, 'main', 'worktree-agent-x1')).toBe(true)
      expect(await copiatoNelPrincipale(ga, repo, 'main', 'worktree-agent-x2')).toBe(false)
      // Già antenato del principale: niente da copiare (lo dice già `merge-base`), quindi no.
      expect(await copiatoNelPrincipale(ga, repo, 'main', 'main')).toBe(false)
      expect(await copiatoNelPrincipale(ga, repo, 'main', 'non-esiste')).toBe(false)
    })
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

  it('0.86.1: accorciato il jsonl delle decisioni, l archivio rifà il conto (decisioniArchiviate non resta gonfio)', async () => {
    const note = join(archivio.cartella, 'ap-1.decisioni.jsonl')
    const riga = `${JSON.stringify({ quando: '2026-01-01T00:00:00.000Z', cosa: 'x'.repeat(1000) })}\n`
    writeFileSync(note, riga.repeat(25 * 1024))
    archivio.scrivi(autopilota({ id: 'ap-1', cwd: join(base, 'non-c-e') }))
    // Prima: l'archivio conta tutte le righe del file.
    expect(archivio.leggi('ap-1')?.decisioniArchiviate).toBe(25 * 1024)
    const e = await autopulizia({ archivio, git: comeAsincrono(gitFinto().git) })
    expect(e.noteTagliate).toBe(1)
    const righe = readFileSync(note, 'utf8').split('\n').filter((r) => r !== '').length
    expect(righe).toBeLessThan(25 * 1024)
    expect(archivio.leggi('ap-1')?.decisioniArchiviate).toBe(righe)
    expect(archivio.decisioniVecchie?.('ap-1')).toHaveLength(righe)
  })

  it('0.86.1: compattando, le decisioni tolte vanno prima in coda al jsonl', async () => {
    const decisioni = Array.from({ length: 70 }, (_, i) => ({ quando: `2026-01-01T00:00:${String(i).padStart(2, '0')}.000Z`, cosa: `c${i}` }))
    archivio.scrivi(autopilota({ id: 'ap-1', cwd: join(base, 'non-c-e'), stato: 'finito', ultimoEvento: '2026-01-01T00:00:00.000Z', decisioni }))
    const e = await autopulizia({ archivio, git: comeAsincrono(gitFinto().git) })
    expect(e.autopilotiCompattati).toBe(1)
    const a = archivio.leggi('ap-1')
    expect(a?.decisioni.map((d) => d.cosa)).toEqual(decisioni.slice(20).map((d) => d.cosa))
    expect(a?.decisioniArchiviate).toBe(20)
    expect(archivio.decisioniVecchie?.('ap-1').map((d) => d.cosa)).toEqual(decisioni.slice(0, 20).map((d) => d.cosa))
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

  it('11/11: «tengo …» si scrive una volta per copia e motivo, non a ogni giro; il riepilogo le conta sempre', async () => {
    const sporca = join(copie, 'ap-1-c-1')
    mkdirSync(sporca)
    writeFileSync(join(sporca, '.git'), 'gitdir: x\n')
    archivio.scrivi(autopilota({ id: 'ap-1', cwd: progetto, chats: [chat('c-1', 'finita', { ramo: 'ap/ap-1/c-1' })] }))
    const { git } = gitFinto({ registrati: [{ cartella: sporca, ramo: 'ap/ap-1/c-1' }], sporche: [sporca] })
    const dette: string[] = []
    const prima = console.info
    console.info = (...a: unknown[]): void => { dette.push(String(a[0])) }
    try {
      for (let i = 0; i < 3; i += 1) {
        const e = await autopulizia({ archivio, git: comeAsincrono(git), ora: DOPO })
        expect(e.tenute).toEqual([{ cosa: 'ap-1-c-1', perche: 'modifiche non salvate' }])
        expect(rigaRiepilogo(e)).toContain('modifiche non salvate (1)')
      }
    } finally {
      console.info = prima
    }
    expect(dette.filter((r) => r.startsWith('[autopulizia] tengo') && r.includes('ap-1-c-1'))).toEqual([`[autopulizia] tengo ${sporca}: modifiche non salvate`])
  })

  it('11/11: una copia con dentro un archivio .asar (una build dello specialista) se ne va come le altre', async () => {
    const d = join(copie, 'ap-0123abcd-c-7')
    mkdirSync(join(d, 'dist', 'win-unpacked', 'resources'), { recursive: true })
    writeFileSync(join(d, 'dist', 'win-unpacked', 'resources', 'app.asar'), 'archivio')
    writeFileSync(join(d, 'dist', 'altro.txt'), 'x')
    archivio.scrivi(autopilota({ id: 'ap-0123abcd-0000', cwd: progetto }))
    const e = await autopulizia({ archivio, git: comeAsincrono(gitFinto().git), ora: DOPO })
    expect(existsSync(d)).toBe(false)
    expect(e.copieTolte).toBe(1)
    expect(e.errori).toEqual([])
  })

  it.runIf(process.platform === 'win32')('k-165: una copia con un file in uso non è un errore: resta fra le tenute e al giro dopo se ne va', async () => {
    const d = join(copie, 'ap-0123abcd-c-7')
    mkdirSync(d)
    writeFileSync(join(d, 'a.txt'), 'x')
    archivio.scrivi(autopilota({ id: 'ap-0123abcd-0000', cwd: progetto }))
    const { git } = gitFinto()
    // Un programma che lavora ancora in quella cartella: Windows non la lascia togliere finché vive.
    const vivo = await programmaVivoIn(d)
    try {
      const e = await autopulizia({ archivio, git: comeAsincrono(git), ora: DOPO })
      expect(existsSync(d)).toBe(true)
      expect(e.errori).toEqual([])
      expect(e.copieTolte).toBe(0)
      expect(e.tenute).toEqual([{ cosa: 'ap-0123abcd-c-7', perche: TENUTA_FILE_IN_USO }])
      expect(rigaRiepilogo(e)).toContain('file in uso, riprovo al prossimo giro (1)')
    } finally {
      await vivo.ferma()
    }
    // Al giro dopo, finito il programma, se ne va (Windows la lascia un attimo dopo: si riprova).
    const dopo = await finche(() => autopulizia({ archivio, git: comeAsincrono(git), ora: DOPO }), (e) => e.copieTolte === 1)
    expect(existsSync(d)).toBe(false)
    expect(dopo.copieTolte).toBe(1)
    expect(dopo.tenute).toEqual([])
  })
})

describe('11/11: gli archivi .asar non si guardano con lstat', () => {
  it('pesoCartella: un .asar conta zero, il resto si pesa, i collegamenti non si seguono', async () => {
    const base = mkdtempSync(join(tmpdir(), 'sd-autopulizia-peso-'))
    const vera = join(base, 'vera')
    mkdirSync(vera)
    writeFileSync(join(vera, 'grosso.bin'), 'x'.repeat(1000))
    const c = join(base, 'copia')
    mkdirSync(join(c, 'dist', 'resources'), { recursive: true })
    writeFileSync(join(c, 'a.txt'), 'abc')
    writeFileSync(join(c, 'dist', 'b.txt'), 'de')
    writeFileSync(join(c, 'dist', 'resources', 'app.asar'), 'x'.repeat(500))
    writeFileSync(join(c, 'dist', 'resources', 'ALTRO.ASAR'), 'x'.repeat(500))
    symlinkSync(vera, join(c, 'node_modules'), 'junction')
    expect(await pesoCartella(c)).toBe(5)
  })

  it('staccaCollegamenti: accanto a un .asar la giunzione si stacca lo stesso, e il file resta al suo posto', async () => {
    const base = mkdtempSync(join(tmpdir(), 'sd-autopulizia-asar-'))
    const vera = join(base, 'vera')
    mkdirSync(vera)
    writeFileSync(join(vera, 'f.txt'), 'x')
    const c = join(base, 'copia')
    mkdirSync(join(c, 'resources'), { recursive: true })
    writeFileSync(join(c, 'resources', 'app.asar'), 'archivio')
    symlinkSync(vera, join(c, 'resources', 'node_modules'), 'junction')
    expect(await staccaCollegamenti(c)).toEqual({ staccati: 1, falliti: [] })
    expect(existsSync(join(c, 'resources', 'app.asar'))).toBe(true)
    expect(existsSync(join(vera, 'f.txt'))).toBe(true)
  })

  it('togliCartellaCopia: il rifiuto della guardia non è un blocco che passa', async () => {
    const base = mkdtempSync(join(tmpdir(), 'sd-autopulizia-fuori-'))
    mkdirSync(join(base, 'altro'))
    const t = await togliCartellaCopia(join(base, 'altro'), join(base, 'copie'))
    expect(t.ok).toBe(false)
    expect(t.temporaneo).toBeUndefined()
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

  it('11/11, con git vero: il ramo di uno specialista già unito si toglie; quello con un commit non unito resta, col suo lavoro', async () => {
    const commit = (file: string, messaggio: string): void => { writeFileSync(join(progetto, file), `${messaggio}\n`); esegui(['add', '-A'], progetto); esegui(['commit', '-q', '-m', messaggio], progetto) }
    // Unito con un'unione, e il principale poi è andato avanti.
    esegui(['checkout', '-q', '-b', 'worktree-agent-unito'], progetto)
    commit('b.txt', 'k-1: il lavoro')
    esegui(['checkout', '-q', 'main'], progetto)
    esegui(['merge', '-q', '--no-ff', '--no-edit', 'worktree-agent-unito'], progetto)
    // Con un commit che il principale non ha.
    esegui(['checkout', '-q', '-b', 'worktree-agent-fuori'], progetto)
    commit('c.txt', 'k-2: mai unito')
    esegui(['checkout', '-q', 'main'], progetto)
    // Già unito, ma serve ancora a un compito aperto; e uno già unito con un altro nome.
    esegui(['branch', 'worktree-agent-citato'], progetto)
    esegui(['branch', 'rilascio-1.2.3'], progetto)
    const archivio = apriArchivio(join(progetto, '..', 'autopiloti'))
    archivio.scrivi(autopilota({ id: 'ap-0123abcd-0000-0000-0000-000000000000', cwd: progetto }))
    const e = await autopulizia({ archivio, git: comeAsincrono(gitReale), ora: DOPO, copieVive: () => new Set(), ramiCitati: () => new Set(['worktree-agent-citato']) })
    expect(e.errori).toEqual([])
    expect(e.ramiTolti).toBe(1)
    const rami = esegui(['for-each-ref', '--format=%(refname:short)', 'refs/heads/'], progetto).split(/\r?\n/).sort()
    expect(rami).toEqual(['main', 'rilascio-1.2.3', 'worktree-agent-citato', 'worktree-agent-fuori'])
    expect(esegui(['log', '-1', '--format=%s', 'worktree-agent-fuori'], progetto)).toBe('k-2: mai unito')
  })
})

describe('«Pulisci adesso»: POST /autopulizia', () => {
  let server: ServerAutopiloti
  afterEach(() => { server.close() })

  it('chiama l autopulizia forzata e risponde con la riga del riepilogo', async () => {
    const chieste: Array<{ forza?: boolean } | undefined> = []
    server = creaServer({
    ...unicoFinto(),
      archivio: apriArchivio(mkdtempSync(join(tmpdir(), 'sd-autopulizia-srv-'))),
      esegui: () => Promise.resolve({ codice: 0, uscita: 'ok' }),
      avviaLavoro: () => Promise.resolve(),
      avvisa: () => Promise.resolve(),
      domande: creaRegistroDomande({ adesso: () => Date.now() }),
      scadenzaDomandaMs: 5000,
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
