import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { idChatNuova, nuovoAutopilota, parseAutopilota, type Autopilota, type ChatGovernata, type FineChat } from '@shared/autopilota'
import {
  avanzaFine, eSlugDiCopia, esitoFine, inizioFine, radiceDellaCopia, slugDi,
  RAMO_TENUTO_MS, RECUPERO_ABBANDONATA_MS, type DipendenzeFine
} from '../../src/autopilot-host/fine-chat'
import { comeAsincrono, creaWorktree, gitReale, togliWorktreeAsincrono } from '../../src/autopilot-host/worktree'
import type { ChatNota } from '../../src/autopilot-host/autopulizia'

/**
 * P2 (30/10): la fine di una chat finita. **La sicurezza prima del pulito**:
 * mai una copia con modifiche, mai commit che non stanno né nel principale né
 * su un ramo tenuto, mai attraverso un collegamento, mai la cartella di un
 * progetto vero fra le trascrizioni, mai l'ultima chat fuori da `chats`.
 */

const ORA = Date.parse('2026-10-30T12:00:00.000Z')
const ID = 'ap-0123abcd-0000-0000-0000-000000000000'

function autopilota(over: Partial<Autopilota> & { cwd: string }): Autopilota {
  return {
    ...nuovoAutopilota({ id: ID, nome: 'x', obiettivo: 'o', cwd: over.cwd, criteri: [{ descrizione: 'c', soddisfatto: false }], iniziatoIl: '2026-10-01T00:00:00.000Z' }),
    ramoBase: 'main',
    ...over
  }
}
const chat = (id: string, extra: Partial<ChatGovernata> = {}): ChatGovernata => ({ id, compito: 'c', stato: 'finita', cicli: 1, ...extra })
const fine = (over: Partial<FineChat> = {}): FineChat => ({ esito: 'unita', il: new Date(ORA).toISOString(), passo: 'worktree', ...over })

describe('la parte pura', () => {
  it('abbandonata: sostituita, lasciata fuori, ramo tolto senza approvazione, autopilota fallito; altrimenti unita', () => {
    expect(esitoFine({ stato: 'lavoro' as const }, chat('c-1'))).toBe('unita')
    expect(esitoFine({ stato: 'lavoro' as const }, chat('c-1', { sostituitaDa: 'c-2' }))).toBe('abbandonata')
    expect(esitoFine({ stato: 'fallito' as const }, chat('c-1'))).toBe('abbandonata')
  })

  it('una chat già nel recupero (prima della P2) comincia dal worktree, il riquadro è già chiuso', () => {
    expect(inizioFine({ stato: 'lavoro' as const }, chat('c-1'), 'X').passo).toBe('chiudi')
    expect(inizioFine({ stato: 'lavoro' as const }, chat('c-1', { nelRecupero: '2026-10-29T00:00:00.000Z' }), 'X'))
      .toMatchObject({ passo: 'worktree', chiusaIl: '2026-10-29T00:00:00.000Z' })
  })

  it('lo slug di Claude Code; solo quelli delle copie sono trascrizioni da togliere', () => {
    expect(slugDi('E:\\Users\\x\\Prog.sierradeck-wt\\ap-1-c-2')).toBe('E--Users-x-Prog-sierradeck-wt-ap-1-c-2')
    expect(eSlugDiCopia(slugDi('E:\\Users\\x\\Prog.sierradeck-wt\\ap-1-c-2'))).toBe(true)
    expect(eSlugDiCopia(slugDi('E:\\Users\\x\\Prog'))).toBe(false)
  })

  it('la radice della copia: il primo pezzo sotto le copie, mai fuori', () => {
    expect(radiceDellaCopia(join('/p.sierradeck-wt', 'ap-1-c-1', 'app'), '/p.sierradeck-wt')).toBe(join('/p.sierradeck-wt', 'ap-1-c-1'))
    expect(radiceDellaCopia('/altro/x', '/p.sierradeck-wt')).toBeUndefined()
    expect(radiceDellaCopia('/p.sierradeck-wt', '/p.sierradeck-wt')).toBeUndefined()
  })

  it('idChatNuova non riusa mai il numero di una chat tolta', () => {
    expect(idChatNuova({ chats: [chat('c-1'), chat('c-2')] })).toBe('c-3')
    expect(idChatNuova({ chats: [chat('c-5')], chatTolte: 4 })).toBe('c-6')
    expect(idChatNuova({ chats: [chat('c-1'), chat('c-3')] })).toBe('c-4')
    expect(idChatNuova({ chats: [chat('c-2')], chatTolte: 3 })).toBe('c-5')
    expect(idChatNuova({ chats: [chat('c-2')], chatTolte: 3 }, 1)).toBe('c-6')
    expect(idChatNuova({ chats: [chat('c-1'), chat('c-3')] }, 1)).toBe('c-5')
  })

  it('fine e chatTolte sopravvivono al salvataggio', () => {
    const a = autopilota({ cwd: '/p', chatTolte: 3, chats: [chat('c-4', { fine: fine({ ramoFinoA: '2026-11-06T12:00:00.000Z' }) })] })
    const p = parseAutopilota({ ...JSON.parse(JSON.stringify(a)), versione: 1 })
    expect(p.scartati).toEqual([])
    const letto = p.autopilota
    expect(letto?.chatTolte).toBe(3)
    expect(letto?.chats[0]?.fine).toMatchObject({ esito: 'unita', passo: 'worktree', ramoFinoA: '2026-11-06T12:00:00.000Z' })
  })

  it('il passo «chiudi» manda la consegna una volta, poi aspetta il riquadro spento', async () => {
    const chiuse: string[] = []
    let accesa: boolean | undefined = true
    const d: DipendenzeFine = {
      git: async () => ({ codice: 1, uscita: '' }), togliWorktree: async () => {}, radiceClaude: '/nessuna',
      chatAdesso: () => [], chiudi: (_a, c, e) => chiuse.push(`${c.id}:${e}`), accesa: () => accesa, ora: ORA
    }
    const a = autopilota({ cwd: '/p', chats: [chat('c-1'), chat('c-2')] })
    let c = chat('c-1', { sessionId: 's-1', fine: fine({ passo: 'chiudi' }) })
    c = (await avanzaFine(a, c, d)).chat
    expect(chiuse).toEqual(['c-1:unita'])
    c = (await avanzaFine(a, c, { ...d, ora: ORA + 60_000 })).chat
    expect(chiuse).toHaveLength(1)
    expect(c.fine?.passo).toBe('chiudi')
    accesa = false
    // Spento, ma il Gestore ha ancora un minuto per la trascrizione: si aspetta.
    c = (await avanzaFine(a, c, { ...d, ora: ORA + 60_000 })).chat
    expect(c.fine?.passo).toBe('chiudi')
  })
})

// git vero: copie, rami, unione. Sotto carico supera i 20 s di regola.
describe('con un git vero: cosa si toglie e cosa resta', { timeout: 120_000 }, () => {
  const esegui = (args: string[], cwd: string): string => {
    const r = gitReale(args, cwd)
    if (r.codice !== 0) throw new Error(`git ${args.join(' ')}: ${r.uscita}`)
    return r.uscita
  }
  let modello = ''
  beforeAll(() => {
    modello = join(mkdtempSync(join(tmpdir(), 'sd-fine-modello-')), 'progetto')
    mkdirSync(modello)
    esegui(['init', '-q', '-b', 'main'], modello)
    esegui(['config', 'user.name', 'Prova'], modello)
    esegui(['config', 'user.email', 'prova@example.com'], modello)
    esegui(['config', 'core.autocrlf', 'false'], modello)
    writeFileSync(join(modello, 'a.txt'), 'uno\n')
    writeFileSync(join(modello, '.gitignore'), 'node_modules\n')
    esegui(['add', '-A'], modello)
    esegui(['commit', '-q', '-m', 'inizio'], modello)
  }, 120_000)

  let progetto = ''
  let claude = ''
  beforeEach(() => {
    const base = mkdtempSync(join(tmpdir(), 'sd-fine-git-'))
    progetto = join(base, 'progetto')
    cpSync(modello, progetto, { recursive: true })
    claude = join(base, 'claude')
    mkdirSync(join(claude, 'projects'), { recursive: true })
  })

  const wt = (c: string): { cartella: string; ramo: string } => {
    const r = creaWorktree(gitReale, { cwd: progetto, autopilota: ID, chat: c, base: 'main' })
    if (!r.ok) throw new Error(r.motivo)
    return r
  }
  const rami = (): string[] => esegui(['for-each-ref', '--format=%(refname:short)', 'refs/heads/'], progetto).split(/\r?\n/).filter((x) => x !== '').sort()
  const dip = (over: Partial<DipendenzeFine> = {}): DipendenzeFine => ({
    git: comeAsincrono(gitReale),
    togliWorktree: (p) => togliWorktreeAsincrono(comeAsincrono(gitReale), p),
    radiceClaude: claude,
    chatAdesso: () => [],
    chiudi: () => {},
    accesa: () => false,
    ora: ORA,
    ...over
  })
  /** La cartella delle trascrizioni di quella copia, con una trascrizione dentro. */
  const trascrizioni = (cartella: string, conJsonl = true): string => {
    const dir = join(claude, 'projects', slugDi(cartella))
    mkdirSync(dir, { recursive: true })
    if (conJsonl) writeFileSync(join(dir, 'sessione.jsonl'), '{}\n')
    writeFileSync(join(dir, 'altro.txt'), 'x')
    return dir
  }

  it('unita e pulita: via la copia (senza seguire la giunzione), il ramo, la trascrizione e la voce', async () => {
    const c1 = wt('c-1')
    const moduli = join(progetto, 'node_modules')
    mkdirSync(join(moduli, 'p'), { recursive: true })
    writeFileSync(join(moduli, 'p', 'index.js'), 'prezioso')
    symlinkSync(moduli, join(c1.cartella, 'node_modules'), 'junction')
    const dir = trascrizioni(c1.cartella, false)
    const a = autopilota({ cwd: progetto, chats: [chat('c-1', { ...c1, fine: fine() }), chat('c-2', { stato: 'lavoro' })] })
    const tolte: string[] = []
    const r = await avanzaFine(a, a.chats[0] as ChatGovernata, dip({ togliIstruzioni: (_a, c) => tolte.push(c) }))
    expect(r.togli).toBe(true)
    expect(existsSync(c1.cartella)).toBe(false)
    expect(rami()).not.toContain(c1.ramo)
    expect(existsSync(dir)).toBe(false)
    expect(tolte).toEqual(['c-1'])
    expect(readFileSync(join(moduli, 'p', 'index.js'), 'utf8')).toBe('prezioso')
    expect(readFileSync(join(progetto, 'a.txt'), 'utf8')).toBe('uno\n')
  })

  it('modifiche non salvate: la copia resta intera, la chat resta', async () => {
    const c1 = wt('c-1')
    writeFileSync(join(c1.cartella, 'a.txt'), 'cambiato\n')
    const a = autopilota({ cwd: progetto, chats: [chat('c-1', { ...c1, fine: fine() }), chat('c-2')] })
    const r = await avanzaFine(a, a.chats[0] as ChatGovernata, dip())
    expect(r.togli).toBeUndefined()
    expect(r.chat.fine).toMatchObject({ passo: 'worktree', tenuta: 'modifiche non salvate' })
    expect(readFileSync(join(c1.cartella, 'a.txt'), 'utf8')).toBe('cambiato\n')
    expect(rami()).toContain(c1.ramo)
  })

  it('commit che non stanno né nel principale né sul ramo: la copia resta', async () => {
    const c1 = wt('c-1')
    esegui(['checkout', '-q', '--detach'], c1.cartella)
    writeFileSync(join(c1.cartella, 'b.txt'), 'solo qui\n')
    esegui(['add', '-A'], c1.cartella)
    esegui(['commit', '-q', '-m', 'staccato'], c1.cartella)
    const a = autopilota({ cwd: progetto, chats: [chat('c-1', { ...c1, fine: fine() }), chat('c-2')] })
    const r = await avanzaFine(a, a.chats[0] as ChatGovernata, dip())
    expect(r.togli).toBeUndefined()
    expect(r.chat.fine?.tenuta).toBe('commit non uniti e non salvati sul ramo')
    expect(readFileSync(join(c1.cartella, 'b.txt'), 'utf8')).toBe('solo qui\n')
  })

  it('commit non uniti sul ramo: la copia va (i commit restano sul ramo), il ramo si tiene 7 giorni, poi va', async () => {
    const c1 = wt('c-1')
    writeFileSync(join(c1.cartella, 'b.txt'), 'sul ramo\n')
    esegui(['add', '-A'], c1.cartella)
    esegui(['commit', '-q', '-m', 'non unito'], c1.cartella)
    const a = autopilota({ cwd: progetto, chats: [chat('c-1', { ...c1, fine: fine({ esito: 'abbandonata' }) }), chat('c-2')] })
    let r = await avanzaFine(a, a.chats[0] as ChatGovernata, dip())
    expect(existsSync(c1.cartella)).toBe(false)
    expect(rami()).toContain(c1.ramo)
    expect(esegui(['show', `${c1.ramo}:b.txt`], progetto).trim()).toBe('sul ramo')
    expect(r.togli).toBeUndefined()
    expect(r.chat.fine).toMatchObject({ passo: 'voci', ramoFinoA: new Date(ORA + RAMO_TENUTO_MS).toISOString() })
    // Sei giorni dopo: ancora lì.
    r = await avanzaFine(a, r.chat, dip({ ora: ORA + 6 * 24 * 3600_000 }))
    expect(rami()).toContain(c1.ramo)
    expect(r.togli).toBeUndefined()
    // Passati i 7 giorni: via il ramo, e la chat.
    r = await avanzaFine(a, r.chat, dip({ ora: ORA + RAMO_TENUTO_MS + 1 }))
    expect(rami()).not.toContain(c1.ramo)
    expect(r.togli).toBe(true)
  })

  it('un’altra chat aperta nella stessa copia: resta tutto', async () => {
    const c1 = wt('c-1')
    const altra: ChatNota = { autopilota: ID, chat: 'c-2', cartella: c1.cartella, aperta: true }
    const a = autopilota({ cwd: progetto, chats: [chat('c-1', { ...c1, fine: fine() }), chat('c-2', { stato: 'lavoro', cartella: c1.cartella })] })
    const r = await avanzaFine(a, a.chats[0] as ChatGovernata, dip({ chatAdesso: () => [altra] }))
    expect(r.chat.fine?.tenuta).toBe('chat aperta')
    expect(existsSync(c1.cartella)).toBe(true)
  })

  it('la copia che è essa stessa un collegamento non si tocca, e nemmeno quello a cui punta', async () => {
    const vera = join(progetto, '..', 'vera')
    mkdirSync(vera)
    writeFileSync(join(vera, 'f.txt'), 'prezioso')
    const copie = `${progetto}.sierradeck-wt`
    mkdirSync(copie, { recursive: true })
    const finta = join(copie, 'ap-0123abcd-c-1')
    symlinkSync(vera, finta, 'junction')
    const a = autopilota({ cwd: progetto, chats: [chat('c-1', { cartella: finta, ramo: 'ap/ap-0123abcd/c-1', fine: fine() }), chat('c-2')] })
    const r = await avanzaFine(a, a.chats[0] as ChatGovernata, dip())
    expect(r.chat.fine?.tenuta).toBe('la copia è un collegamento: non si tocca')
    expect(readFileSync(join(vera, 'f.txt'), 'utf8')).toBe('prezioso')
  })

  it('una chat che lavorava nel progetto (non in una copia): il progetto e le sue trascrizioni non si toccano', async () => {
    const dir = trascrizioni(progetto)
    const a = autopilota({ cwd: progetto, chats: [chat('c-1', { cartella: progetto, fine: fine() }), chat('c-2')] })
    const r = await avanzaFine(a, a.chats[0] as ChatGovernata, dip({ ora: ORA + 365 * 24 * 3600_000 }))
    expect(existsSync(join(progetto, 'a.txt'))).toBe(true)
    expect(existsSync(join(dir, 'sessione.jsonl'))).toBe(true)
    expect(r.togli).toBe(true)
  })

  it('abbandonata: la trascrizione resta 72 ore, poi la cartella va', async () => {
    const c1 = wt('c-1')
    const dir = trascrizioni(c1.cartella)
    const a = autopilota({ cwd: progetto, chats: [chat('c-1', { ...c1, fine: fine({ esito: 'abbandonata' }) }), chat('c-2')] })
    let r = await avanzaFine(a, a.chats[0] as ChatGovernata, dip())
    expect(existsSync(c1.cartella)).toBe(false)
    expect(r.chat.fine?.passo).toBe('trascrizione')
    expect(existsSync(join(dir, 'sessione.jsonl'))).toBe(true)
    r = await avanzaFine(a, r.chat, dip({ ora: ORA + 71 * 3600_000 }))
    expect(existsSync(dir)).toBe(true)
    r = await avanzaFine(a, r.chat, dip({ ora: ORA + RECUPERO_ABBANDONATA_MS + 1 }))
    expect(existsSync(dir)).toBe(false)
    expect(r.togli).toBe(true)
  })

  it('una giunzione dentro la cartella delle trascrizioni si stacca senza seguirla', async () => {
    const c1 = wt('c-1')
    const dir = trascrizioni(c1.cartella, false)
    const fuori = join(claude, 'fuori')
    mkdirSync(fuori)
    writeFileSync(join(fuori, 'f.txt'), 'prezioso')
    symlinkSync(fuori, join(dir, 'collegamento'), 'junction')
    const a = autopilota({ cwd: progetto, chats: [chat('c-1', { ...c1, fine: fine() }), chat('c-2')] })
    const r = await avanzaFine(a, a.chats[0] as ChatGovernata, dip())
    expect(r.togli).toBe(true)
    expect(existsSync(dir)).toBe(false)
    expect(readFileSync(join(fuori, 'f.txt'), 'utf8')).toBe('prezioso')
  })

  it('l’ultima chat dell’autopilota non esce da chats: resta, senza niente sul disco', async () => {
    const c1 = wt('c-1')
    const a = autopilota({ cwd: progetto, chats: [chat('c-1', { ...c1, fine: fine() })] })
    const r = await avanzaFine(a, a.chats[0] as ChatGovernata, dip())
    expect(existsSync(c1.cartella)).toBe(false)
    expect(r.togli).toBeUndefined()
    expect(r.chat.fine).toMatchObject({ passo: 'voci' })
    expect(r.chat.fine?.tenuta).toMatch(/ultima chat/)
  })

  it('un passo tenuto non si riguarda a ogni giro', async () => {
    const c1 = wt('c-1')
    writeFileSync(join(c1.cartella, 'a.txt'), 'cambiato\n')
    const a = autopilota({ cwd: progetto, chats: [chat('c-1', { ...c1, fine: fine() }), chat('c-2')] })
    const r1 = await avanzaFine(a, a.chats[0] as ChatGovernata, dip())
    expect(r1.righe.length).toBe(1)
    const chiamate: string[][] = []
    const r2 = await avanzaFine(a, r1.chat, dip({ ora: ORA + 60_000, git: async (args, cwd) => { chiamate.push(args); return gitReale(args, cwd) } }))
    expect(chiamate).toEqual([])
    expect(r2.righe).toEqual([])
  })
})
