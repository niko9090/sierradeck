import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { cpSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nuovoAutopilota, parseAutopilota, type Autopilota, type ChatGovernata, type FineChat } from '@shared/autopilota'
import { avanzaFine, ramoBaseDi, RAMO_TENUTO_MS, type DipendenzeFine } from '../../src/autopilot-host/fine-chat'
import { comeAsincrono, creaWorktree, gitReale, togliWorktreeAsincrono } from '../../src/autopilot-host/worktree'

/**
 * D2: il ramo di una chat finita si toglieva con `-D` dopo 7 giorni anche se
 * la chat era «unita», e il principale era `'main'` scritto a mano (sui
 * progetti con `master` ogni ramo sembrava non unito). Ora: scade solo il ramo
 * di una chat abbandonata, con l'etichetta `archivio/<ramo>`; il principale
 * si cerca davvero.
 */
const ORA = Date.parse('2026-10-30T12:00:00.000Z')
const ID = 'ap-0123abcd-0000-0000-0000-000000000000'

const esegui = (args: string[], cwd: string): string => {
  const r = gitReale(args, cwd)
  if (r.codice !== 0) throw new Error(`git ${args.join(' ')}: ${r.uscita}`)
  return r.uscita
}
const chat = (id: string, extra: Partial<ChatGovernata> = {}): ChatGovernata => ({ id, compito: 'c', stato: 'finita', cicli: 1, ...extra })
const fine = (over: Partial<FineChat> = {}): FineChat => ({ esito: 'unita', il: new Date(ORA).toISOString(), passo: 'worktree', ...over })

describe('D2: il ramo di una chat finita', { timeout: 120_000 }, () => {
  let modello = ''
  beforeAll(() => {
    modello = join(mkdtempSync(join(tmpdir(), 'sd-d2-modello-')), 'progetto')
    mkdirSync(modello)
    // Un progetto con `master`, non `main`.
    esegui(['init', '-q', '-b', 'master'], modello)
    esegui(['config', 'user.name', 'Prova'], modello)
    esegui(['config', 'user.email', 'prova@example.com'], modello)
    esegui(['config', 'core.autocrlf', 'false'], modello)
    writeFileSync(join(modello, 'a.txt'), 'uno\n')
    esegui(['add', '-A'], modello)
    esegui(['commit', '-q', '-m', 'inizio'], modello)
  }, 120_000)

  let progetto = ''
  let claude = ''
  beforeEach(() => {
    const base = mkdtempSync(join(tmpdir(), 'sd-d2-git-'))
    progetto = join(base, 'progetto')
    cpSync(modello, progetto, { recursive: true })
    claude = join(base, 'claude')
    mkdirSync(join(claude, 'projects'), { recursive: true })
  })

  const autopilota = (over: Partial<Autopilota> = {}): Autopilota => ({
    ...nuovoAutopilota({ id: ID, nome: 'x', obiettivo: 'o', cwd: progetto, criteri: [{ descrizione: 'c', soddisfatto: false }], iniziatoIl: '2026-10-01T00:00:00.000Z' }),
    ...over
  })
  const wt = (c: string): { cartella: string; ramo: string } => {
    const r = creaWorktree(gitReale, { cwd: progetto, autopilota: ID, chat: c, base: 'master' })
    if (!r.ok) throw new Error(r.motivo)
    return r
  }
  const conCommit = (cartella: string, testo: string): void => {
    writeFileSync(join(cartella, 'b.txt'), testo)
    esegui(['add', '-A'], cartella)
    esegui(['commit', '-q', '-m', testo], cartella)
  }
  const rami = (): string[] => esegui(['for-each-ref', '--format=%(refname:short)', 'refs/heads/'], progetto).split(/\r?\n/).filter((x) => x !== '')
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

  it('il principale si trova: autopilota, poi origin/HEAD (meglio la copia locale), poi la cartella principale; mai «main» a mano', async () => {
    const git = comeAsincrono(gitReale)
    expect(await ramoBaseDi({}, git, progetto)).toBe('master')
    expect(await ramoBaseDi({ ramoBase: 'sviluppo' }, git, progetto)).toBe('sviluppo')
    esegui(['update-ref', 'refs/remotes/origin/tronco', 'HEAD'], progetto)
    esegui(['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/tronco'], progetto)
    expect(await ramoBaseDi({}, git, progetto)).toBe('origin/tronco')
    esegui(['branch', 'tronco'], progetto)
    expect(await ramoBaseDi({}, git, progetto)).toBe('tronco')
  })

  it('progetto con master e nessun ramoBase: il ramo unito si toglie (prima sembrava non unito)', async () => {
    const c1 = wt('c-1')
    conCommit(c1.cartella, 'lavoro')
    esegui(['merge', '-q', '--ff-only', c1.ramo], progetto)
    const a = autopilota({ chats: [chat('c-1', { ...c1, fine: fine() }), chat('c-2')] })
    const r = await avanzaFine(a, a.chats[0] as ChatGovernata, dip())
    expect(r.togli).toBe(true)
    expect(rami()).not.toContain(c1.ramo)
  })

  it('chat unita con il ramo non unito: il ramo non scade mai, e si dice perché', async () => {
    const c1 = wt('c-1')
    conCommit(c1.cartella, 'non unito')
    const a = autopilota({ chats: [chat('c-1', { ...c1, fine: fine() }), chat('c-2')] })
    const r = await avanzaFine(a, a.chats[0] as ChatGovernata, dip({ ora: ORA + 30 * RAMO_TENUTO_MS }))
    expect(rami()).toContain(c1.ramo)
    expect(r.chat.fine?.ramoTenuto).toContain('master')
    expect(r.chat.fine?.ramoFinoA).toBeUndefined()
    expect(r.righe.some((x) => x.includes('resta'))).toBe(true)
    expect(esegui(['tag', '--list'], progetto).trim()).toBe('')
    // Il motivo sopravvive al salvataggio.
    const p = parseAutopilota({ ...JSON.parse(JSON.stringify({ ...a, chats: [r.chat, chat('c-2')] })), versione: 1 })
    expect(p.autopilota?.chats[0]?.fine?.ramoTenuto).toBe(r.chat.fine?.ramoTenuto)
  })

  it('un ramoFinoA rimasto su una chat unita (stato vecchio) non toglie il ramo', async () => {
    const c1 = wt('c-1')
    conCommit(c1.cartella, 'non unito')
    esegui(['worktree', 'remove', '--force', c1.cartella], progetto)
    const a = autopilota({ chats: [chat('c-1', { ...c1, fine: fine({ passo: 'voci', ramoFinoA: new Date(ORA).toISOString() }) }), chat('c-2')] })
    await avanzaFine(a, a.chats[0] as ChatGovernata, dip({ ora: ORA + RAMO_TENUTO_MS + 1 }))
    expect(rami()).toContain(c1.ramo)
  })

  it('chat abbandonata: dopo 7 giorni il ramo va, ma i commit restano in archivio/<ramo>', async () => {
    const c1 = wt('c-1')
    conCommit(c1.cartella, 'abbandonato')
    const punta = esegui(['rev-parse', c1.ramo], progetto).trim()
    const a = autopilota({ chats: [chat('c-1', { ...c1, fine: fine({ esito: 'abbandonata' }) }), chat('c-2')] })
    let r = await avanzaFine(a, a.chats[0] as ChatGovernata, dip())
    expect(rami()).toContain(c1.ramo)
    expect(r.chat.fine?.ramoFinoA).toBe(new Date(ORA + RAMO_TENUTO_MS).toISOString())
    r = await avanzaFine(a, r.chat, dip({ ora: ORA + RAMO_TENUTO_MS + 1 }))
    expect(rami()).not.toContain(c1.ramo)
    expect(esegui(['rev-parse', `archivio/${c1.ramo}^{commit}`], progetto).trim()).toBe(punta)
    expect(r.righe.some((x) => x.includes(`archivio/${c1.ramo}`))).toBe(true)
    expect(existsSync(c1.cartella)).toBe(false)
  })
})
