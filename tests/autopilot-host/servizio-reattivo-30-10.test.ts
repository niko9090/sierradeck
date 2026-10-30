import { describe, it, expect, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import {
  creaWorktreeAsincrono, gitGiaChiesto, memoriaAsincrona, statoCopiaInMemoria, type EsitoGit, type GitAsincrono
} from '../../src/autopilot-host/worktree'
import { creaStatoVero, statoDellaFlottaAsincrono } from '../../src/autopilot-host/stato-vero'
import { creaSpiaRitardo } from '../../src/autopilot-host/ritardo-ciclo'
import { unisciAlSalvataggio, unisciChat } from '../../src/autopilot-host/unione-salvataggio'
import {
  azzeraContatoriSeNuovaVersione, fileVersioneContatori, leggiVersioneContatori, senzaContatoriSupervisore
} from '../../src/autopilot-host/contatori-versione'
import { autopulizia, rigaRiepilogo, togliCopiePrima, esitoVuoto } from '../../src/autopilot-host/autopulizia'
import { ATTESA_IN_UN_HOOK_MS } from '../../src/autopilot-host/guardia-pc'
import { TETTO_RISPOSTA_STOP_MS, TIMEOUT_HOOK_S } from '@shared/hook-autopilota'
import { nuovoAutopilota, type Autopilota, type ChatGovernata } from '@shared/autopilota'
import type { Interrogazione } from '../../src/autopilot-host/supervisore'

/**
 * 30/10 — il servizio che non risponde all'app (git sincrono, salute, spia
 * del ritardo), il supervisore senza sessione e senza scrivere, l'hook che
 * non trattiene una chat per un'ora, lo Stop che non perde quello delle
 * sorelle, i conti dei guasti dopo un aggiornamento, l'archivio che non
 * riscrive lo stesso file, le copie «.prima-» dimenticate.
 */

const ORA = '2026-10-30T12:00:00.000Z'
const GIORNO = 24 * 60 * 60_000

const chat = (id: string, over: Partial<ChatGovernata> = {}): ChatGovernata =>
  ({ id, compito: `compito di ${id}`, stato: 'lavoro', cicli: 5, sessionId: `s-${id}`, dal: '2026-10-30T09:00:00.000Z', ...over })

function flotta(cwd: string, chats: ChatGovernata[], over: Partial<Autopilota> = {}): Autopilota {
  return {
    ...nuovoAutopilota({ id: 'ap-30', nome: 'Servizio reattivo', obiettivo: 'Rispondere sempre', cwd, criteri: [{ descrizione: 'i test passano', comando: 'npm test', soddisfatto: false }], iniziatoIl: '2026-10-30T08:00:00.000Z' }),
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

  it('stato vero con git asincrono: i rami delle chat si guardano prima, ramoUnito resta sincrono', async () => {
    const a = flotta('C:/p', [chat('c-1', { ramo: 'ap/x/c-1' }), chat('c-2', { ramo: 'ap/x/c-2' }), chat('c-3', { ramo: 'ap/x/c-3', approvata: true }), chat('c-4', { ramo: 'ap/x/c-4' })], { ramoBase: 'main' })
    const visti: string[] = []
    const git: GitAsincrono = (args) => {
      visti.push(args.join(' '))
      if (args[0] === 'merge-base') return Promise.resolve({ codice: args[2] === 'ap/x/c-1' ? 0 : args[2] === 'ap/x/c-2' ? 1 : 128, uscita: '' })
      return Promise.resolve({ codice: 1, uscita: '' }) // rev-parse --verify: il ramo c-4 non c'è più
    }
    const s = await statoDellaFlottaAsincrono(a, git)
    const chiamate = visti.length
    const unito = s.ramoUnito!
    expect(unito('ap/x/c-1')).toBe(true)
    expect(unito('ap/x/c-2')).toBe(false)
    expect(unito('ap/x/c-3')).toBe(true)
    expect(unito('ap/x/c-4')).toBe(true)
    expect(unito('ap/x/altro')).toBeUndefined()
    // Leggere non chiama più git: la risposta c'era già.
    expect(visti).toHaveLength(chiamate)
    expect(visti.some((v) => v.includes('ap/x/c-3'))).toBe(false)
    const conRelease = await creaStatoVero({ gitAsincrono: git, release: () => Promise.resolve(['0.86.1']) })(a)
    expect(conRelease.releasePubblicate).toEqual(['0.86.1'])
    expect(conRelease.ramoUnito!('ap/x/c-1')).toBe(true)
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

function servizio(archivio: Archivio, interroga: Interrogazione, extra: Partial<Parameters<typeof creaServer>[0]> = {}): ServerAutopiloti {
  return creaServer({
    archivio,
    esegui: () => Promise.resolve({ codice: 1, uscita: '1 test rosso' }),
    interroga,
    avviaLavoro: () => Promise.resolve(),
    fermaLavoro: () => {},
    avvisa: () => Promise.resolve(),
    domande: creaRegistroDomande({ adesso: () => Date.parse(ORA) }),
    scadenzaDomandaMs: 5000,
    scadenzaInterviataMs: 5000,
    adesso: () => ORA,
    ...extra
  })
}

async function fermata(ap: string, chatId: string, testo: string): Promise<any> {
  const r = await fetch(`http://127.0.0.1:${porta}/hook/stop?ap=${ap}&chat=${chatId}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: `s-${chatId}`, stop_hook_active: false, last_assistant_message: testo, hook_event_name: 'Stop' })
  })
  const t = await r.text()
  return t === '' ? undefined : JSON.parse(t)
}

describe('1. la salute senza disco', () => {
  it('GET /salute risponde senza toccare l’archivio', async () => {
    const vero = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-salute-')))
    let letture = 0
    const contato: Archivio = { ...vero, leggi: (id) => { letture += 1; return vero.leggi(id) }, elenca: () => { letture += 1; return vero.elenca() } }
    server = servizio(contato, () => Promise.resolve({ testo: '{}' }), { versione: '0.87.0', consegne: { inAttesa: () => 2 } as never })
    await avvia(server)
    letture = 0
    const r = await fetch(`http://127.0.0.1:${porta}/salute`)
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ vivo: true, consegneInAttesa: 2, versione: '0.87.0' })
    expect(letture).toBe(0)
  })
})

describe('4. lo Stop non trattiene una chat oltre il tetto dell’hook', () => {
  it('i tetti: hook di 15 minuti, risposta un minuto prima, l’attesa della guardia ben dentro', () => {
    expect(TIMEOUT_HOOK_S).toBe(900)
    expect(TETTO_RISPOSTA_STOP_MS).toBe(840_000)
    expect(ATTESA_IN_UN_HOOK_MS).toBeLessThan(TETTO_RISPOSTA_STOP_MS / 2)
  })

  it('un giudizio che non arriva: allo scadere la risposta è «fermati pure», la fermata resta in corso finché non finisce', async () => {
    const archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-tetto-stop-')))
    const cwd = mkdtempSync(join(tmpdir(), 'ap-tetto-cwd-'))
    let sblocca: () => void = () => {}
    const bloccato = new Promise<void>((r) => { sblocca = r })
    let chiamate = 0
    server = servizio(archivio, async () => { chiamate += 1; await bloccato; return { testo: '{"azione": "prosegui", "istruzioni": "continua"}' } }, { tettoRispostaStopMs: 150 })
    await avvia(server)
    archivio.scrivi(flotta(cwd, [chat('c-1')]))
    const inizio = Date.now()
    const r = await fermata('ap-30', 'c-1', 'Ho fatto un giro.')
    expect(r).toEqual({})
    expect(Date.now() - inizio).toBeLessThan(4000)
    expect(chiamate).toBe(1)
    sblocca()
    // Il giudizio finisce dopo e salva lo stesso: il giro è contato.
    await attendi(() => archivio.leggi('ap-30')!.chats[0]!.cicli === 6)
  })
})

describe('5. due Stop insieme non si cancellano a vicenda', () => {
  it('unisciAlSalvataggio: vince solo quello che si è cambiato; chat una per una; diario a sole aggiunte', () => {
    const base = flotta('C:/p', [chat('c-1'), chat('c-2')], { decisioni: [{ quando: ORA, cosa: 'uno' }] })
    const nostro: Autopilota = {
      ...base,
      chats: [chat('c-1', { cicli: 6, ultimaAzione: 'mia' }), chat('c-2'), chat('c-3', { compito: 'nuovo' })],
      decisioni: [...base.decisioni, { quando: ORA, cosa: 'mia' }],
      motivoSospensione: 'io'
    }
    const disco: Autopilota = {
      ...base,
      chats: [chat('c-1'), chat('c-2', { cicli: 9, ultimaAzione: 'sua' })],
      decisioni: [...base.decisioni, { quando: ORA, cosa: 'sua' }],
      obiettivo: 'cambiato da Nicholas'
    }
    const u = unisciAlSalvataggio(base, nostro, disco)
    expect(u.chats.map((c) => `${c.id}:${c.cicli}:${c.ultimaAzione ?? '-'}`)).toEqual(['c-1:6:mia', 'c-2:9:sua', 'c-3:5:-'])
    expect(u.decisioni.map((d) => d.cosa)).toEqual(['uno', 'sua', 'mia'])
    expect(u.obiettivo).toBe('cambiato da Nicholas')
    expect(u.motivoSospensione).toBe('io')
    // Una chat tolta da noi resta tolta; una nata sul disco resta.
    expect(unisciChat([chat('c-1'), chat('c-2')], [chat('c-1')], [chat('c-1'), chat('c-2'), chat('c-4')]).map((c) => c.id)).toEqual(['c-1', 'c-4'])
  })

  it('c-1 aspetta (lo stato vero per la sua domanda), intanto c-2 si ferma e salva: il salvataggio di c-1 non riporta indietro c-2', async () => {
    const archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-due-stop-')))
    const cwd = mkdtempSync(join(tmpdir(), 'ap-due-stop-cwd-'))
    let sblocca: () => void = () => {}
    const bloccato = new Promise<void>((r) => { sblocca = r })
    let chiamate = 0
    let statiChiesti = 0
    // c-1 (la prima a chiedere) vuole una cosa da Nicholas; le altre proseguono.
    const interroga: Interrogazione = () => {
      chiamate += 1
      return Promise.resolve({ testo: chiamate === 1
        ? '{"azione": "chiedi", "domanda": "Pubblico la 0.87.0 adesso o aspetto domani?"}'
        : '{"azione": "prosegui", "istruzioni": "continua con il prossimo pezzo"}' })
    }
    server = servizio(archivio, interroga, {
      scadenzaDomandaMs: 100,
      // La fermata di c-1 resta qui, dopo aver già riletto le chat dal disco.
      statoVero: async () => { statiChiesti += 1; if (statiChiesti === 1) await bloccato; return { chat: [], ramoUnito: () => undefined } }
    })
    await avvia(server)
    archivio.scrivi(flotta(cwd, [chat('c-1'), chat('c-2')]))

    const primo = fermata('ap-30', 'c-1', 'Ho sistemato il parser.')
    await attendi(() => statiChiesti === 1)
    const r2 = await fermata('ap-30', 'c-2', 'Ho scritto i test della coda.')
    expect(r2.decision).toBe('block')
    const dopoC2 = archivio.leggi('ap-30')!.chats.find((c) => c.id === 'c-2')!
    expect(dopoC2.cicli).toBe(6)
    expect(dopoC2.ultimaAzione).toContain('Ho scritto i test della coda')

    sblocca()
    await primo
    const fine = archivio.leggi('ap-30')!
    const c1 = fine.chats.find((c) => c.id === 'c-1')!
    const c2 = fine.chats.find((c) => c.id === 'c-2')!
    expect(c1.cicli).toBe(6)
    expect(c1.ultimaAzione).toContain('Ho sistemato il parser')
    // Prima del 30/10 qui c-2 tornava a 5 cicli (verificato: senza l'unione il test fallisce).
    expect(c2.cicli).toBe(6)
    expect(c2.ultimaAzione).toContain('Ho scritto i test della coda')
    expect(fine.cicli).toBeGreaterThanOrEqual(1)
  })
})

describe('6. i conti dei guasti del supervisore ripartono con la versione nuova', () => {
  it('senzaContatoriSupervisore toglie i conti (autopilota e chat), le ultime istruzioni restano', () => {
    const a = flotta('C:/p', [chat('c-1', { supervisoreMancato: 518, ultimeIstruzioni: 'vai' }), chat('c-2')], { supervisoreMancato: 3 })
    const p = senzaContatoriSupervisore(a)!
    expect(p.supervisoreMancato).toBeUndefined()
    expect(p.chats[0]!.supervisoreMancato).toBeUndefined()
    expect(p.chats[0]!.ultimeIstruzioni).toBe('vai')
    expect(p.chats[1]).toBe(a.chats[1])
    expect(senzaContatoriSupervisore(flotta('C:/p', [chat('c-1')]))).toBeUndefined()
  })

  it('una volta per versione; senza versione mai', () => {
    const cartella = mkdtempSync(join(tmpdir(), 'ap-conti-'))
    const file = fileVersioneContatori(cartella)
    const salvati: Autopilota[] = []
    const a = flotta('C:/p', [chat('c-1', { supervisoreMancato: 518 })])
    expect(azzeraContatoriSeNuovaVersione({ versione: undefined, file, autopiloti: [a], salva: (x) => { salvati.push(x) } })).toBe(0)
    expect(azzeraContatoriSeNuovaVersione({ versione: '0.87.0', file, autopiloti: [a], salva: (x) => { salvati.push(x) } })).toBe(1)
    expect(leggiVersioneContatori(file)).toBe('0.87.0')
    expect(azzeraContatoriSeNuovaVersione({ versione: '0.87.0', file, autopiloti: [a], salva: (x) => { salvati.push(x) } })).toBe(0)
    expect(azzeraContatoriSeNuovaVersione({ versione: '0.87.1', file, autopiloti: [a], salva: (x) => { salvati.push(x) } })).toBe(1)
    expect(salvati).toHaveLength(2)
  })

  it('nel servizio: alla partenza con una versione nuova «518 di fila» torna a zero', async () => {
    const archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-conti-servizio-')))
    archivio.scrivi(flotta(mkdtempSync(join(tmpdir(), 'ap-conti-cwd-')), [chat('c-1', { supervisoreMancato: 518, ultimeIstruzioni: 'vai' })], { stato: 'pronto' }))
    server = servizio(archivio, () => Promise.resolve({ testo: '{}' }), { versione: '0.87.0' })
    await avvia(server)
    server.riprendiLavori({ servizioAppenaPartito: true })
    const c = archivio.leggi('ap-30')!.chats[0]!
    expect(c.supervisoreMancato).toBeUndefined()
    expect(c.ultimeIstruzioni).toBe('vai')
    expect(leggiVersioneContatori(fileVersioneContatori(archivio.cartella))).toBe('0.87.0')
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
