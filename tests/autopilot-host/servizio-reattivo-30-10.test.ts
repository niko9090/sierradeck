import { describe, it, expect, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import {
  creaWorktreeAsincrono, gitGiaChiesto, memoriaAsincrona, statoCopiaInMemoria, type EsitoGit, type GitAsincrono
} from '../../src/autopilot-host/worktree'
import { creaSpiaRitardo } from '../../src/autopilot-host/ritardo-ciclo'
import { autopulizia, rigaRiepilogo, togliCopiePrima, esitoVuoto } from '../../src/autopilot-host/autopulizia'
import { ATTESA_IN_UN_HOOK_MS } from '../../src/autopilot-host/guardia-pc'
import { TETTO_RISPOSTA_STOP_MS, TIMEOUT_HOOK_S } from '@shared/hook-autopilota'
import { nuovoAutopilota, type Autopilota, type ChatGovernata } from '@shared/autopilota'
import { unicoFinto } from '../setup/unico-finto'

/**
 * 30/10 — il servizio che non risponde all'app (git sincrono, salute, spia
 * del ritardo), i tetti dell'hook, l'archivio che non riscrive lo stesso
 * file, le copie «.prima-» dimenticate.
 */

const ORA = '2026-10-30T12:00:00.000Z'
const GIORNO = 24 * 60 * 60_000

const chat = (id: string, over: Partial<ChatGovernata> = {}): ChatGovernata =>
  ({ id, compito: `compito di ${id}`, stato: 'lavoro', cicli: 5, sessionId: `s-${id}`, dal: '2026-10-30T09:00:00.000Z', ...over })

function flotta(cwd: string, chats: ChatGovernata[], over: Partial<Autopilota> = {}): Autopilota {
  return {
    ...nuovoAutopilota({ id: 'ap-30', nome: 'Servizio reattivo', obiettivo: 'Rispondere sempre', cwd, iniziatoIl: '2026-10-30T08:00:00.000Z' }),
    stato: 'lavoro',
    chats,
    ...over
  }
}

async function attendi(cond: () => boolean, ms = 5000): Promise<void> {
  const fine = Date.now() + ms
  while (!cond()) {
    if (Date.now() > fine) throw new Error('condizione non raggiunta in tempo')
    await new Promise((r) => setTimeout(r, 10))
  }
}

/** Un git asincrono finto: registra e risponde quando gli si dice. */
function gitInAttesa(risposta: (args: string[]) => EsitoGit): GitAsincrono & { chiamate: string[][]; rispondi: () => void } {
  const sospese: Array<() => void> = []
  const g = ((args: string[]) => {
    g.chiamate.push(args)
    return new Promise<EsitoGit>((ris) => { sospese.push(() => { ris(risposta(args)) }) })
  }) as unknown as GitAsincrono & { chiamate: string[][]; rispondi: () => void }
  g.chiamate = []
  g.rispondi = () => { while (sospese.length > 0) sospese.shift()!() }
  return g
}

// ── 1. Il servizio risponde ──

describe('1. git fuori dal filo del servizio', () => {
  it('statoCopiaInMemoria: la cartella che manca si vede subito; il resto lo dice git in sottofondo, e fino ad allora vale «ok»', async () => {
    const c = mkdtempSync(join(tmpdir(), 'copia-'))
    const git = gitInAttesa(() => ({ codice: 128, uscita: 'fatal: not a git repository' }))
    const copia = statoCopiaInMemoria(git)
    expect(copia(join(c, 'non-c-e'))).toBe('mancante')
    expect(git.chiamate).toEqual([])
    // La prima volta git non ha ancora risposto: niente attesa, «ok».
    expect(copia(c)).toBe('ok')
    expect(git.chiamate).toEqual([['rev-parse', '--show-toplevel']])
    // Una seconda domanda mentre la prima è in corso non ne fa partire un'altra.
    expect(copia(c)).toBe('ok')
    expect(git.chiamate).toHaveLength(1)
    git.rispondi()
    await copia.aggiornate()
    expect(copia(c)).toBe('non-git')
  })

  it('creaWorktreeAsincrono: prune, ramo che non c’è, worktree add -b, tutto con git asincrono', async () => {
    const radice = mkdtempSync(join(tmpdir(), 'radice-'))
    const visti: string[][] = []
    const git: GitAsincrono = (args) => {
      visti.push(args)
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return Promise.resolve({ codice: 0, uscita: radice })
      if (args[0] === 'rev-parse' && args[1] === '--verify') return Promise.resolve({ codice: 1, uscita: '' })
      return Promise.resolve({ codice: 0, uscita: '' })
    }
    const r = await creaWorktreeAsincrono(git, { cwd: radice, autopilota: 'ap-12345678-aaaa-bbbb-cccc-1234567890ab', chat: 'c-3', base: 'main' })
    expect(r).toMatchObject({ ok: true, ramo: 'ap/ap-12345678/c-3' })
    expect(visti.map((a) => a.slice(0, 2).join(' '))).toEqual(['rev-parse --show-toplevel', 'worktree prune', 'rev-parse --verify', 'worktree add'])
    expect(visti.at(-1)).toEqual(['worktree', 'add', '-b', 'ap/ap-12345678/c-3', `${radice}.sierradeck-wt${join('/', 'ap-12345678-c-3').replace(/\//g, process.platform === 'win32' ? '\\' : '/')}`, 'main'])
  })

  it('creaWorktreeAsincrono: un add che fallisce dice perché', async () => {
    const radice = mkdtempSync(join(tmpdir(), 'radice-'))
    const git: GitAsincrono = (args) => Promise.resolve(
      args[1] === '--show-toplevel' ? { codice: 0, uscita: radice } : args[0] === 'worktree' && args[1] === 'add' ? { codice: 128, uscita: 'fatal: disco pieno' } : { codice: 1, uscita: '' }
    )
    expect(await creaWorktreeAsincrono(git, { cwd: radice, autopilota: 'ap-1', chat: 'c-1', base: 'main' })).toEqual({ ok: false, motivo: 'git worktree add non riuscito: fatal: disco pieno' })
  })

  it('memoriaAsincrona: la prima volta «non si sa», poi l’ultima risposta, rinnovata in sottofondo quando è vecchia', async () => {
    let ora = 0
    let n = 0
    const m = memoriaAsincrona<number>(1000, () => ora)
    const chiedi = (): Promise<number> => { n += 1; return Promise.resolve(n) }
    expect(m.leggi('k', chiedi)).toEqual({ saputo: false })
    await m.aggiornate()
    expect(m.leggi('k', chiedi)).toEqual({ saputo: true, valore: 1 })
    expect(n).toBe(1)
    ora = 1500
    expect(m.leggi('k', chiedi)).toEqual({ saputo: true, valore: 1 })
    await m.aggiornate()
    expect(m.leggi('k', chiedi)).toEqual({ saputo: true, valore: 2 })
    // Un errore lascia la risposta di prima.
    ora = 3000
    m.leggi('k', () => Promise.reject(new Error('git morto')))
    await m.aggiornate()
    expect(m.leggi('k', chiedi)).toEqual({ saputo: true, valore: 2 })
  })

  it('gitGiaChiesto: le risposte si chiedono prima con git asincrono, poi un git sincrono le ridà; il resto è «no»', async () => {
    const visti: string[] = []
    const g = await gitGiaChiesto((args, cwd) => { visti.push(`${cwd}:${args.join(' ')}`); return Promise.resolve({ codice: 0, uscita: args[0] === 'status' ? ' M a.ts' : 'abc fix' }) }, [['status', '--porcelain'], ['log', '-5', '--oneline']], 'C:/p')
    expect(visti).toEqual(['C:/p:status --porcelain', 'C:/p:log -5 --oneline'])
    expect(g(['status', '--porcelain'], 'C:/p')).toEqual({ codice: 0, uscita: ' M a.ts' })
    expect(g(['log', '-5', '--oneline'], 'C:/p').uscita).toBe('abc fix')
    expect(g(['rev-parse', 'HEAD'], 'C:/p')).toEqual({ codice: 1, uscita: '' })
    expect(visti).toHaveLength(2)
  })

  it('la spia del ritardo: una riga solo oltre 1 s, al più una al minuto, col ritardo peggiore', () => {
    const righe: string[] = []
    const spia = creaSpiaRitardo({ scrivi: (r) => { righe.push(r) }, ogniMs: 500 })
    let t = 0
    spia.battito(t)
    t += 500; spia.battito(t)
    t += 1400; spia.battito(t) // 0,9 s di ritardo: niente
    expect(righe).toEqual([])
    t += 3500; spia.battito(t) // 3 s
    expect(righe).toHaveLength(1)
    expect(righe[0]).toContain('fermo 3.0 s')
    t += 10_500; spia.battito(t) // 10 s, ma dentro il minuto
    t += 500; spia.battito(t)
    expect(righe).toHaveLength(1)
    t += 60_000; spia.battito(t) // 59,5 s: passato il minuto, una riga col peggiore
    expect(righe).toHaveLength(2)
    expect(righe[1]).toContain('fermo 59.5 s')
    expect(righe[1]).toContain('2 volte')
  })
})

// ── Il servizio vero, con il suo archivio ──

let server: ServerAutopiloti | undefined
let porta = 0
afterEach(() => { server?.close(); server = undefined })

function avvia(s: ServerAutopiloti): Promise<void> {
  return new Promise((ris) => { s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }) })
}

function servizio(archivio: Archivio, extra: Partial<Parameters<typeof creaServer>[0]> = {}): ServerAutopiloti {
  return creaServer({
    ...unicoFinto(archivio),
    archivio,
    esegui: () => Promise.resolve({ codice: 1, uscita: '1 test rosso' }),
    avviaLavoro: () => Promise.resolve(),
    avvisa: () => Promise.resolve(),
    domande: creaRegistroDomande({ adesso: () => Date.parse(ORA) }),
    scadenzaDomandaMs: 5000,
    adesso: () => ORA,
    ...extra
  })
}

describe('1. la salute senza disco', () => {
  it('GET /salute risponde senza toccare l’archivio', async () => {
    const vero = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-salute-')))
    let letture = 0
    const contato: Archivio = { ...vero, leggi: (id) => { letture += 1; return vero.leggi(id) }, elenca: () => { letture += 1; return vero.elenca() } }
    server = servizio(contato, { versione: '0.87.0', consegne: { inAttesa: () => 2 } as never })
    await avvia(server)
    letture = 0
    const r = await fetch(`http://127.0.0.1:${porta}/salute`)
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ vivo: true, consegneInAttesa: 2, versione: '0.87.0' })
    expect(letture).toBe(0)
  })
})

describe('4. i tetti dell’hook', () => {
  it('i tetti: hook di 15 minuti, risposta un minuto prima, l’attesa della guardia ben dentro', () => {
    expect(TIMEOUT_HOOK_S).toBe(900)
    expect(TETTO_RISPOSTA_STOP_MS).toBe(840_000)
    expect(ATTESA_IN_UN_HOOK_MS).toBeLessThan(TETTO_RISPOSTA_STOP_MS / 2)
  })
})

describe('7. l’archivio non riscrive lo stesso contenuto e tiene la cache calda', () => {
  it('stesso contenuto: il file non si riscrive; contenuto nuovo: sì', () => {
    const cartella = mkdtempSync(join(tmpdir(), 'ap-archivio-hash-'))
    const archivio = apriArchivio(cartella)
    const a = flotta('C:/p', [chat('c-1')])
    archivio.scrivi(a)
    const file = join(cartella, 'ap-30.json')
    const prima = statSync(file)
    archivio.scrivi({ ...a })
    const dopo = statSync(file)
    expect(dopo.ino).toBe(prima.ino)
    expect(dopo.mtimeMs).toBe(prima.mtimeMs)
    archivio.scrivi({ ...a, obiettivo: 'un altro' })
    expect(statSync(file).mtimeMs !== prima.mtimeMs || statSync(file).ino !== prima.ino).toBe(true)
    expect(archivio.leggi('ap-30')!.obiettivo).toBe('un altro')
  })
})

describe('8. l’autopulizia toglie le copie «.prima-» vecchie', () => {
  it('solo i file *.prima-* più vecchi di 7 giorni; mai un autopilota né un .illeggibile', async () => {
    const cartella = mkdtempSync(join(tmpdir(), 'ap-prima-'))
    const ora = Date.parse(ORA)
    const vecchio = new Date(ora - 8 * GIORNO)
    const nuovo = new Date(ora - 2 * GIORNO)
    const scrivi = (nome: string, quando: Date): void => { writeFileSync(join(cartella, nome), 'x'.repeat(10)); utimesSync(join(cartella, nome), quando, quando) }
    scrivi('ap-335600d4.json.prima-correzione-criterio', vecchio)
    scrivi('ap-2.json.prima-riparazione', nuovo)
    scrivi('ap-3.json', vecchio)
    scrivi('ap-4.json.illeggibile-1', vecchio)
    mkdirSync(join(cartella, 'cartella.prima-x'))
    const r = togliCopiePrima(cartella, ora)
    expect(r).toEqual({ tolte: 1, byte: 10, errori: [] })
    expect(existsSync(join(cartella, 'ap-335600d4.json.prima-correzione-criterio'))).toBe(false)
    for (const resta of ['ap-2.json.prima-riparazione', 'ap-3.json', 'ap-4.json.illeggibile-1', 'cartella.prima-x']) expect(existsSync(join(cartella, resta))).toBe(true)
  })

  it('nel giro dell’autopulizia, con la riga nel registro', async () => {
    const cartella = mkdtempSync(join(tmpdir(), 'ap-prima-giro-'))
    const archivio = apriArchivio(cartella)
    const ora = Date.parse(ORA)
    const f = join(cartella, 'ap-9.json.prima-correzione-criterio')
    writeFileSync(f, '{}')
    utimesSync(f, new Date(ora - 30 * GIORNO), new Date(ora - 30 * GIORNO))
    const e = await autopulizia({ archivio, git: () => Promise.resolve({ codice: 1, uscita: '' }), ora: () => ora })
    expect(e.copiePrimaTolte).toBe(1)
    expect(existsSync(f)).toBe(false)
    expect(rigaRiepilogo(e)).toContain('1 copie di scorta «.prima-» tolte')
    expect(rigaRiepilogo(esitoVuoto())).not.toContain('.prima-')
  })
})
