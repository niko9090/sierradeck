import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, unlinkSync, utimesSync, writeFileSync, openSync, readSync, closeSync, lstatSync, rmdirSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import {
  commitValido, idLavoroValido, LAVORO_MAX_MS, modelloAiuto, nomeProgettoSicuro, PEZZO_BYTE, PACCHETTO_MAX_BYTE,
  quantiPezzi, ramoDiRitorno, ramoValido, STRUMENTI_AIUTO, strumentiAmmessi, VIETATI_AIUTO, type LavoroOspitato, type StatoAiuto, type VistaLavoroAiutato
} from '@shared/aiuto-rete'
import type { AvviaProcesso } from './orchestratore'
import { cancellaSicuraAsincrona } from '@shared/cancella-sicura'
import { CARTELLA_PROVE } from '@shared/disco-prove'
import { staccaCollegamenti } from './autopulizia'

/**
 * **Il PC che aiuta** (0.103.0): riceve il progetto di un altro PC, lo apre in
 * una copia sua e lancia lo specialista che gli è stato affidato, con lo
 * stesso ruolo, lo stesso messaggio e lo stesso modello. Alla fine prepara il
 * pacchetto del ramo (solo i commit nuovi) che l'altro PC ritira.
 *
 * Le cartelle stanno tutte sotto `<dati del servizio>/aiuto`:
 * - `arrivi/<id>.bundle`: il progetto che arriva, pezzo dopo pezzo;
 * - `progetti/<nome>/repo`: una copia del progetto per ogni progetto aiutato
 *   (la prima volta un clone, poi solo i commit nuovi);
 * - `progetti/<nome>/copie/<id>`: la copia di lavoro dello specialista;
 * - `progetti/<nome>/moduli/<impronta>`: `node_modules`, installato una volta
 *   per ogni `package-lock.json` diverso;
 * - `uscite/<id>.bundle`: il ramo da ritirare.
 *
 * 12/11: se il disco della Temp è quasi pieno, queste cartelle stanno sul
 * disco delle prove (`radiceLavoroAiuto`, opzione `lavoro`); `lavori.json`
 * resta in `<dati>/aiuto`, e ogni lavoro si ricorda la sua radice. Ogni prova
 * conclusa lascia pulito: le copie, i rami e i pacchetti dei lavori finiti
 * se ne vanno, e un giro ogni 10 minuti (e all'avvio) toglie quello che
 * Windows aveva tenuto bloccato.
 */

export type RichiestaAvvio = {
  lavoro: string
  progetto: string
  ramoBase: string
  base: string
  prompt: string
  sistema: string
  modello: string
  strumenti: string[]
  ruolo: string
  descrizione: string
}

type Lavoro = VistaLavoroAiutato & {
  progetto: string
  /** 12/11: per l'elenco di questo PC: chi lo fa, cosa, e per quale PC. */
  ruolo?: string
  descrizione?: string
  perPc?: string
  base?: string
  ricevuti: number
  totale?: number
  inizio: number
  copia?: string
  repo?: string
  /** 12/11: dove stanno copia, pacchetti e moduli di questo lavoro (percorso assoluto). */
  radice?: string
  /** 12/11: la cartella dei `node_modules` che usa la sua copia: non si pota finché lavora. */
  moduli?: string
  /** 12/11: quando è arrivato l'ultimo pezzo (una ricezione ferma da 30 minuti non riprende più). */
  ultimoPezzo?: number
  /** 12/11: quando è finito (finito, fallito o fermato): dopo 2 giorni il lavoro si dimentica. */
  fine?: number
  ferma?: () => void
}

/** Una ricezione senza pezzi nuovi da tanto non riprende: il PC che spediva ha lasciato perdere. */
export const RICEZIONE_FERMA_MS = 30 * 60_000
/** Un lavoro finito da tanto, mai chiuso dal PC che l'aveva chiesto, si dimentica con le sue cartelle. */
export const LAVORO_FINITO_DURA_MS = 2 * 24 * 60 * 60_000
/** I `node_modules` tenuti per progetto (i più recenti): gli altri occupano giga per niente. */
export const MODULI_DA_TENERE = 2
/** Ogni quanto si riprova a togliere quello che Windows aveva tenuto bloccato. */
export const PULIZIA_OGNI_MS = 10 * 60_000

const terminato = (l: Pick<Lavoro, 'stato'>): boolean => l.stato === 'finito' || l.stato === 'fallito' || l.stato === 'fermato'
const attivo = (l: Pick<Lavoro, 'stato'>): boolean => l.stato === 'ricevo' || l.stato === 'preparo' || l.stato === 'lavoro'
const chiave = (p: string): string => resolve(p).toLowerCase()

export type LavoratoreAiuto = {
  /** Quanti lavori di altri PC sono al lavoro qui adesso: contano nei posti. */
  inCorso: () => number
  /** 12/11: i lavori degli altri PC al lavoro qui, per l'elenco «Al lavoro adesso». */
  ospitati: () => LavoroOspitato[]
  pezzo: (p: { lavoro: unknown; n: unknown; totale: unknown; dati: unknown }) => { ok: true; ricevuti: number } | { ok: false; motivo: string }
  avvia: (p: Record<string, unknown>) => { ok: true } | { ok: false; motivo: string }
  stato: (id: unknown) => VistaLavoroAiutato | undefined
  ritira: (p: { lavoro: unknown; n: unknown }) => { ok: true; dati: string; totale: number } | { ok: false; motivo: string }
  chiudi: (id: unknown) => boolean
  ferma: (id: unknown) => boolean
  /** 12/11: il giro di pulizia (all'avvio, ogni 10 minuti); torna quando è finito. */
  pulizia: () => Promise<void>
}

const corto = (s: string, n = 160): string => s.replace(/\s+/gu, ' ').trim().slice(0, n)

function git(args: string[], cwd: string, tempoMs = 10 * 60_000): Promise<string> {
  return new Promise((ok, no) => {
    execFile('git', args, { cwd, windowsHide: true, maxBuffer: 32 * 1024 * 1024, timeout: tempoMs }, (err, out, errOut) => {
      if (err !== null) no(new Error(`git ${args[0]}: ${corto(String(errOut) || err.message, 300)}`))
      else ok(String(out))
    })
  })
}

function npmCi(cartella: string, extra: string[]): Promise<void> {
  return new Promise((ok, no) => {
    const figlio = spawn('npm', ['ci', '--no-audit', '--no-fund', ...extra], { cwd: cartella, shell: true, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
    let errOut = ''
    figlio.stderr.on('data', (b: Buffer) => { errOut = (errOut + b.toString('utf8')).slice(-2000) })
    const timer = setTimeout(() => { figlio.kill() }, 25 * 60_000)
    figlio.on('error', (e) => { clearTimeout(timer); no(e) })
    figlio.on('close', (c) => { clearTimeout(timer); if (c === 0) ok(); else no(new Error(`npm ci uscito con ${String(c)}: ${corto(errOut, 300)}`)) })
  })
}

const eCollegamento = (p: string): boolean => { try { return lstatSync(p).isSymbolicLink() } catch { return false } }

export function creaLavoratoreAiuto(x: {
  /** Dove sta `lavori.json` (`<dati>/aiuto`); senza `lavoro`, anche copie, moduli e pacchetti. */
  cartella: string
  /** 12/11: dove stanno copie, moduli e pacchetti, se non in `cartella` (il disco delle prove). */
  lavoro?: string
  avvia: AvviaProcesso
  adesso?: () => number
  log?: (r: string) => void
  /** Ogni quanto il giro di pulizia; 0 = solo all'avvio e a richiesta (prove). */
  pulisciOgniMs?: number
}): LavoratoreAiuto {
  const adesso = x.adesso ?? Date.now
  const log = x.log ?? ((r: string) => console.info(`[aiuto] ${r}`))
  const radice = x.lavoro ?? x.cartella
  const arrivi = join(radice, 'arrivi')
  const fileStato = join(x.cartella, 'lavori.json')
  const fileRadici = join(x.cartella, 'radici.json')
  const lavori = new Map<string, Lavoro>()
  /** Un solo `npm ci` alla volta per la stessa impronta, e un solo giro di git per progetto. */
  const moduliInCorso = new Map<string, Promise<string | undefined>>()
  const codaProgetto = new Map<string, Promise<unknown>>()
  /**
   * 12/11: ogni radice usata qui (quella di adesso, `<dati>/aiuto`, e quelle di prima, se il disco
   * delle prove è cambiato fra un avvio e l'altro): il giro di pulizia le guarda tutte.
   */
  const radici = new Set<string>([x.cartella, radice])
  /** I lavori trovati a metà dopo un riavvio: le loro cartelle si tolgono al primo giro. */
  const daPulire: Lavoro[] = []
  /**
   * Una radice letta dal disco vale solo se è una di quelle che questo codice crea: `cartella`,
   * quella di adesso, o `<disco>\SierraDeck-prove\aiuto-<impronta>` (`radiceLavoroAiuto`). Un file
   * rovinato non porta il giro di pulizia in un'altra cartella.
   */
  const radiceAccettabile = (r: unknown): r is string =>
    typeof r === 'string' && isAbsolute(r) &&
    (chiave(r) === chiave(x.cartella) || chiave(r) === chiave(radice) || (/^aiuto-[0-9a-f]{8}$/u.test(basename(r)) && basename(dirname(r)).toLowerCase() === CARTELLA_PROVE.toLowerCase()))
  const radiceDi = (l: Lavoro): string => (radiceAccettabile(l.radice) ? l.radice : radice)
  const pacchettiDi = (l: Lavoro): string[] => [join(radiceDi(l), 'arrivi', `${l.id}.bundle`), join(radiceDi(l), 'uscite', `${l.id}.bundle`)]

  try {
    const prima = existsSync(fileRadici) ? JSON.parse(readFileSync(fileRadici, 'utf8')) as unknown : []
    for (const r of Array.isArray(prima) ? prima : []) if (radiceAccettabile(r)) radici.add(r)
  } catch { /* illeggibile: solo quelle di adesso */ }
  if (radice !== x.cartella) {
    try { mkdirSync(x.cartella, { recursive: true }); writeFileSync(fileRadici, JSON.stringify([...radici], null, 1), 'utf8') } catch { /* al prossimo avvio */ }
  }

  // I lavori che c'erano prima di un riavvio: chi era a metà non può riprendere (il processo non c'è più).
  // 12/11: e la sua copia, la giunzione, il ramo e i pacchetti non servono più: via al primo giro di pulizia.
  try {
    const prima = existsSync(fileStato) ? JSON.parse(readFileSync(fileStato, 'utf8')) as Lavoro[] : []
    for (const l of Array.isArray(prima) ? prima : []) {
      if (!idLavoroValido(l.id)) continue
      if (radiceAccettabile(l.radice)) radici.add(l.radice)
      if (terminato(l)) { lavori.set(l.id, l); continue }
      const fallito: Lavoro = { ...l, stato: 'fallito', motivo: 'il servizio del PC che aiutava si è riavviato a metà lavoro', attivita: 'non riuscito', fine: adesso() }
      lavori.set(l.id, fallito)
      daPulire.push(fallito)
    }
  } catch (err) { log(`stato di prima illeggibile: ${String(err)}`) }

  const salva = (): void => {
    try {
      mkdirSync(x.cartella, { recursive: true })
      const da = [...lavori.values()].map(({ ferma: _f, ...resto }) => resto)
      writeFileSync(fileStato, JSON.stringify(da, null, 1), 'utf8')
    } catch (err) { log(`stato non salvato: ${String(err)}`) }
  }
  const cambia = (l: Lavoro, p: Partial<Lavoro>): void => {
    Object.assign(l, p)
    if (terminato(l) && l.fine === undefined) l.fine = adesso()
    salva()
  }
  if (daPulire.length > 0) salva()

  const inProgetto = <T>(progetto: string, f: () => Promise<T>): Promise<T> => {
    const prima = codaProgetto.get(progetto) ?? Promise.resolve()
    const dopo = prima.catch(() => undefined).then(f)
    codaProgetto.set(progetto, dopo.catch(() => undefined))
    return dopo
  }

  /** `node_modules` per quel `package-lock.json`: installato una volta, poi collegato a ogni copia. */
  const moduliPer = (l: Lavoro, progetto: string, copia: string): Promise<string | undefined> => {
    const lock = join(copia, 'package-lock.json')
    if (!existsSync(join(copia, 'package.json')) || !existsSync(lock)) return Promise.resolve(undefined)
    const impronta = createHash('sha256').update(readFileSync(lock)).digest('hex').slice(0, 16)
    const dove = join(radiceDi(l), 'progetti', progetto, 'moduli', impronta)
    // 12/11: segnata subito, prima di ogni attesa: il giro di pulizia non pota quella che questo lavoro sta per usare.
    l.moduli = dove
    const gia = moduliInCorso.get(dove)
    if (gia !== undefined) return gia
    const p = (async (): Promise<string | undefined> => {
      if (existsSync(join(dove, 'node_modules', '.package-lock.json'))) {
        // Usata adesso: conta fra le più recenti, quelle che la pulizia tiene.
        try { const ora = new Date(adesso()); utimesSync(dove, ora, ora) } catch { /* resta la data di prima */ }
        return join(dove, 'node_modules')
      }
      mkdirSync(dove, { recursive: true })
      copyFileSync(join(copia, 'package.json'), join(dove, 'package.json'))
      copyFileSync(lock, join(dove, 'package-lock.json'))
      log(`${progetto}: installo node_modules (la prima volta ci vuole qualche minuto)`)
      try { await npmCi(dove, []) } catch (err) {
        log(`${progetto}: npm ci non riuscito (${String(err).slice(0, 200)}), riprovo senza gli script`)
        await npmCi(dove, ['--ignore-scripts'])
      }
      return join(dove, 'node_modules')
    })()
    moduliInCorso.set(dove, p)
    // 12/11: tolta anche quando riesce: finché resta qui la pulizia non la pota mai (vale `l.moduli`).
    void p.then(() => { moduliInCorso.delete(dove) }, () => { moduliInCorso.delete(dove) })
    return p
  }

  /**
   * Via una copia di lavoro: prima la giunzione a `node_modules` (mai entrarci), poi
   * `git worktree remove`; se Windows lascia la cartella (file bloccati, percorsi lunghi), la
   * toglie la guardia, solo dentro `dentro`, dopo aver staccato ogni altro collegamento.
   * Torna se la copia non c'è più.
   */
  const togliCopia = async (copia: string, repo: string | undefined, dentro: string): Promise<boolean> => {
    const mod = join(copia, 'node_modules')
    if (eCollegamento(mod)) { try { unlinkSync(mod) } catch { try { rmdirSync(mod) } catch { /* resta */ } } }
    if (eCollegamento(mod)) return false
    if (repo !== undefined && existsSync(join(repo, '.git'))) await git(['worktree', 'remove', '--force', copia], repo).catch(() => undefined)
    if (!existsSync(copia)) return true
    const { falliti } = await staccaCollegamenti(copia)
    if (falliti.length > 0) return false
    try { await cancellaSicuraAsincrona(copia, { dentro: [dentro] }) } catch { return false }
    return !existsSync(copia)
  }

  /** Tutto quello che un lavoro lascia: la copia, il ramo, i pacchetti. Anche per un lavoro rimasto a metà (senza `copia`). */
  const pulisciCopia = async (l: Lavoro): Promise<void> => {
    const r = radiceDi(l)
    const base = l.progetto !== '' ? join(r, 'progetti', l.progetto) : undefined
    const repo = l.repo ?? (base !== undefined ? join(base, 'repo') : undefined)
    const copia = l.copia ?? (base !== undefined ? join(base, 'copie', l.id) : undefined)
    const via = async (): Promise<void> => {
      if (copia !== undefined) await togliCopia(copia, repo, r)
      if (repo !== undefined && existsSync(join(repo, '.git'))) await git(['branch', '-D', ramoDiRitorno(l.id)], repo).catch(() => undefined)
    }
    if (l.progetto !== '') await inProgetto(l.progetto, via)
    else await via()
    for (const f of pacchettiDi(l)) { try { rmSync(f, { force: true }) } catch { /* resta */ } }
  }

  /** I `node_modules` di un progetto oltre i più recenti `MODULI_DA_TENERE`, e quelli rimasti a metà: via, se nessuna copia al lavoro li usa. */
  const potaModuli = async (base: string, r: string): Promise<void> => {
    const dir = join(base, 'moduli')
    let voci: Array<{ p: string; quando: number; completa: boolean }>
    try {
      voci = readdirSync(dir).map((n) => {
        const p = join(dir, n)
        return { p, quando: statSync(p).mtimeMs, completa: existsSync(join(p, 'node_modules', '.package-lock.json')) }
      })
    } catch { return }
    const usate = new Set([...lavori.values()].filter((l) => attivo(l) || l.ferma !== undefined).flatMap((l) => (l.moduli !== undefined ? [chiave(l.moduli)] : [])))
    const complete = voci.filter((v) => v.completa).sort((a, b) => b.quando - a.quando)
    const daTogliere = [...complete.slice(MODULI_DA_TENERE), ...voci.filter((v) => !v.completa)]
    for (const v of daTogliere) {
      if (usate.has(chiave(v.p)) || moduliInCorso.has(v.p)) continue
      const { falliti } = await staccaCollegamenti(v.p)
      if (falliti.length > 0) continue
      try { await cancellaSicuraAsincrona(v.p, { dentro: [r] }); log(`tolti i node_modules vecchi ${v.p}`) } catch { /* in uso: al prossimo giro */ }
    }
  }

  /** Una radice: pacchetti che non servono più, copie di lavori non al lavoro, rami di lavori chiusi, moduli vecchi. */
  const spazzaRadice = async (r: string): Promise<void> => {
    const serve: Array<[string, (l: Lavoro) => boolean]> = [
      [join(r, 'arrivi'), (l) => l.stato === 'ricevo' || l.stato === 'preparo'],
      [join(r, 'uscite'), () => true]
    ]
    for (const [cartella, tieni] of serve) {
      let nomi: string[] = []
      try { nomi = readdirSync(cartella) } catch { /* non c'è */ }
      for (const n of nomi) {
        const id = /^(r[0-9a-f]{12})\.bundle$/u.exec(n)?.[1]
        if (id === undefined) continue
        const l = lavori.get(id)
        if (l !== undefined && chiave(radiceDi(l)) === chiave(r) && tieni(l)) continue
        try { rmSync(join(cartella, n), { force: true }) } catch { /* resta */ }
      }
    }
    let progetti: string[] = []
    try { progetti = readdirSync(join(r, 'progetti')) } catch { /* non c'è */ }
    for (const progetto of progetti) {
      const base = join(r, 'progetti', progetto)
      const repo = join(base, 'repo')
      const copie = join(base, 'copie')
      await inProgetto(progetto, async () => {
        let ids: string[] = []
        try { ids = readdirSync(copie) } catch { /* non c'è */ }
        for (const id of ids) {
          const l = lavori.get(id)
          // Al lavoro (o fermato con lo specialista non ancora uscito): non si tocca.
          if (l !== undefined && (attivo(l) || l.ferma !== undefined)) continue
          if (!await togliCopia(join(copie, id), repo, copie)) log(`la copia ${join(copie, id)} non si toglie ancora (file in uso?): riprovo al prossimo giro`)
        }
        if (!existsSync(join(repo, '.git'))) return
        await git(['worktree', 'prune'], repo).catch(() => undefined)
        // I rami dei lavori che qui non ci sono più (chiusi o dimenticati): il ramo è già tornato, o non torna più.
        const rami = await git(['for-each-ref', '--format=%(refname:short)', `refs/heads/${ramoDiRitorno('')}*`], repo).catch(() => '')
        for (const ramo of rami.split(/\r?\n/u).map((s) => s.trim())) {
          const id = ramo.slice(ramoDiRitorno('').length)
          if (ramo.startsWith(ramoDiRitorno('')) && idLavoroValido(id) && !lavori.has(id)) await git(['branch', '-D', ramo], repo).catch(() => undefined)
        }
      })
      await potaModuli(base, r)
    }
  }

  const spazza = async (): Promise<void> => {
    for (const l of daPulire.splice(0)) await pulisciCopia(l).catch(() => undefined)
    const ora = adesso()
    for (const l of lavori.values()) {
      if (l.stato !== 'ricevo' || ora - (l.ultimoPezzo ?? l.inizio) < RICEZIONE_FERMA_MS) continue
      cambia(l, { stato: 'fallito', motivo: 'il progetto ha smesso di arrivare (nessun pezzo da 30 minuti)', attivita: 'non riuscito' })
      for (const f of pacchettiDi(l)) { try { rmSync(f, { force: true }) } catch { /* resta */ } }
      log(`${l.id}: ricezione ferma da 30 minuti, lavoro non riuscito`)
    }
    for (const l of [...lavori.values()]) {
      if (!terminato(l) || l.ferma !== undefined || ora - (l.fine ?? l.inizio) < LAVORO_FINITO_DURA_MS) continue
      lavori.delete(l.id)
      salva()
      log(`${l.id}: finito da più di 2 giorni e mai chiuso, lo dimentico con le sue cartelle`)
      await pulisciCopia(l).catch(() => undefined)
    }
    for (const r of radici) await spazzaRadice(r)
  }
  let catena: Promise<void> = Promise.resolve()
  const pulizia = (): Promise<void> => {
    catena = catena.then(spazza).catch((err: unknown) => { log(`pulizia non riuscita: ${String(err).slice(0, 200)}`) })
    return catena
  }

  const lancia = async (l: Lavoro, r: RichiestaAvvio): Promise<void> => {
    const progetto = nomeProgettoSicuro(r.progetto)
    const base = join(radiceDi(l), 'progetti', progetto)
    const repo = join(base, 'repo')
    const copia = join(base, 'copie', l.id)
    const pacchetto = pacchettiDi(l)[0]!
    const ramo = ramoDiRitorno(l.id)
    cambia(l, { stato: 'preparo', attivita: 'apro il progetto arrivato', repo })
    // Il repo del progetto: la prima volta un clone dal pacchetto, poi i commit nuovi. Una cosa alla volta per progetto.
    await inProgetto(progetto, async () => {
      mkdirSync(join(base, 'copie'), { recursive: true })
      if (!existsSync(join(repo, '.git'))) {
        // Una cartella rimasta a metà (un clone interrotto): via, ma solo dentro la cartella dell'aiuto, dalla guardia.
        await cancellaSicuraAsincrona(repo, { dentro: [radiceDi(l)] })
        await git(['clone', '--no-checkout', pacchetto, repo], base)
      }
      await git(['fetch', '--no-tags', pacchetto, `+refs/heads/${r.ramoBase}:refs/remotes/arrivo/${r.ramoBase}`], repo)
      await git(['worktree', 'prune'], repo).catch(() => undefined)
      await git(['worktree', 'add', '-f', '-B', ramo, copia, r.base], repo)
      // Il ramo principale come ramo locale della copia, perché le regole dicono `git merge --ff-only <base>` e `git diff main...HEAD`.
      await git(['branch', '-f', r.ramoBase, r.base], repo).catch(() => undefined)
    })
    try { rmSync(pacchetto, { force: true }) } catch { /* resta */ }
    cambia(l, { copia, attivita: 'preparo node_modules' })
    let notaModuli = ''
    try {
      const moduli = await moduliPer(l, progetto, copia)
      if (moduli !== undefined && !existsSync(join(copia, 'node_modules'))) symlinkSync(moduli, join(copia, 'node_modules'), 'junction')
    } catch (err) {
      notaModuli = ` Attenzione: su questo PC node_modules non si è installato (${corto(String(err), 200)}): se un comando ne ha bisogno, dillo nel riepilogo invece di installarlo tu.`
      log(`${progetto}: node_modules mancante per ${l.id}: ${String(err).slice(0, 200)}`)
    }
    // 12/11: fermato mentre si preparava: la copia appena fatta non serve, via subito (prima restava lì).
    if (l.stato === 'fermato') { await pulisciCopia(l); return }
    cambia(l, { stato: 'lavoro', attivita: `${r.ruolo} al lavoro` })
    const sistema = `${r.sistema}\n\nLavori su un altro PC della rete di Nicholas («Aiuta la rete»): la tua copia è ${copia}, sul ramo ${ramo}. Il ramo principale del progetto è ${r.ramoBase}. Niente push: il ramo lo rimanda il programma al PC che ha chiesto, che lo prova e lo unisce.${notaModuli}`
    const args = [
      '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
      '--model', modelloAiuto(r.modello),
      '--append-system-prompt', sistema,
      '--permission-mode', 'acceptEdits',
      '--allowedTools', strumentiAmmessi(r.strumenti).join(','),
      // Anche gli strumenti non concessi, per nome: senza, la CLI li prova e in -p resta senza risposta (12/11: PowerShell per un `git add`).
      '--disallowedTools', [...VIETATI_AIUTO, ...STRUMENTI_AIUTO.filter((t) => !strumentiAmmessi(r.strumenti).includes(t))].join(','),
      '--strict-mcp-config'
    ]
    const env: Record<string, string> = {}
    for (const [k, v] of Object.entries(process.env)) if (typeof v === 'string' && !k.startsWith('SIERRADECK_HOOK')) env[k] = v
    const proc = x.avvia({ args, cwd: copia, env })
    let finale: { testo: string; errore: boolean } | undefined
    const scadenza = setTimeout(() => { if (finale === undefined) { cambia(l, { motivo: 'ha superato le 3 ore' }); proc.uccidi() } }, LAVORO_MAX_MS)
    scadenza.unref?.()
    l.ferma = () => proc.uccidi()
    proc.suRiga((riga) => {
      let o: Record<string, unknown>
      try { o = JSON.parse(riga) as Record<string, unknown> } catch { return }
      if (o.type === 'assistant') {
        const m = o.message as { content?: unknown } | undefined
        const pezzi = Array.isArray(m?.content) ? m!.content as Record<string, unknown>[] : []
        for (const c of pezzi) {
          if (c.type === 'tool_use' && typeof c.name === 'string') {
            const inp = (c.input ?? {}) as Record<string, unknown>
            const cosa = typeof inp.file_path === 'string' ? inp.file_path.split(/[\\/]/u).pop() : typeof inp.command === 'string' ? corto(inp.command, 80) : typeof inp.pattern === 'string' ? inp.pattern : ''
            l.attivita = `${c.name}${cosa !== '' && cosa !== undefined ? `: ${cosa}` : ''}`
          } else if (c.type === 'text' && typeof c.text === 'string' && c.text.trim() !== '') l.attivita = corto(c.text, 140)
        }
      } else if (o.type === 'result') {
        finale = { testo: typeof o.result === 'string' ? o.result : '', errore: o.is_error === true || o.subtype !== 'success' }
        proc.uccidi()
      }
    })
    proc.scrivi(`${JSON.stringify({ type: 'user', message: { role: 'user', content: r.prompt } })}\n`)
    const uscita = await new Promise<{ codice: number | null; e: string }>((ok) => proc.suUscita((codice, e) => ok({ codice, e })))
    clearTimeout(scadenza)
    l.ferma = undefined
    if ((l.stato as StatoAiuto) === 'fermato') { await pulisciCopia(l); return }
    // Il ramo: solo i commit nuovi rispetto alla base, che l'altro PC ha già.
    let commit = 0
    try { commit = Number((await git(['rev-list', '--count', `${r.base}..${ramo}`], copia)).trim()) || 0 } catch { commit = 0 }
    let byte = 0
    if (commit > 0) {
      const out = pacchettiDi(l)[1]!
      mkdirSync(join(out, '..'), { recursive: true })
      await git(['bundle', 'create', out, ramo, `^${r.base}`], copia)
      byte = statSync(out).size
    }
    const riuscito = finale !== undefined && !finale.errore
    cambia(l, {
      stato: riuscito ? 'finito' : 'fallito',
      riepilogo: finale?.testo ?? '',
      ramo,
      byte,
      commit,
      ...(riuscito ? {} : { motivo: l.motivo ?? (finale === undefined ? `lo specialista si è chiuso senza finire (${corto(uscita.e, 200) || `uscita ${String(uscita.codice)}`})` : 'lo specialista ha chiuso con un errore') }),
      attivita: riuscito ? `finito, ${commit} commit` : 'non riuscito'
    })
    log(`${l.id} (${progetto}): ${l.stato}, ${commit} commit, ${byte} byte da ritirare`)
    // La copia non serve più: il ramo è nel pacchetto (o non c'è niente da rimandare).
    // 12/11: se Windows la tiene bloccata, la riprende il giro di pulizia ogni 10 minuti.
    const tolta = await inProgetto(progetto, () => togliCopia(copia, repo, join(base, 'copie')))
    if (!tolta) log(`${l.id}: la copia ${copia} non si toglie ancora (file in uso?): riprovo al prossimo giro`)
  }

  const lavoratore: LavoratoreAiuto = {
    inCorso: () => [...lavori.values()].filter((l) => l.stato === 'ricevo' || l.stato === 'preparo' || l.stato === 'lavoro').length,
    ospitati: () => [...lavori.values()]
      .filter((l) => l.stato === 'ricevo' || l.stato === 'preparo' || l.stato === 'lavoro')
      .map((l) => ({ id: l.id, stato: l.stato, ruolo: l.ruolo ?? 'sviluppatore', descrizione: l.descrizione ?? l.progetto, perPc: l.perPc ?? 'un altro PC', inizio: new Date(l.inizio).toISOString(), ...(l.attivita !== undefined ? { attivita: l.attivita } : {}) })),
    pezzo(p) {
      if (!idLavoroValido(p.lavoro)) return { ok: false, motivo: 'lavoro non valido' }
      const n = typeof p.n === 'number' && Number.isInteger(p.n) ? p.n : -1
      const totale = typeof p.totale === 'number' && Number.isInteger(p.totale) ? p.totale : -1
      if (n < 0 || totale < 1 || n >= totale || totale > quantiPezzi(PACCHETTO_MAX_BYTE) || typeof p.dati !== 'string') return { ok: false, motivo: 'pezzo non valido' }
      const buf = Buffer.from(p.dati, 'base64')
      if (buf.length === 0 || buf.length > PEZZO_BYTE) return { ok: false, motivo: 'pezzo di misura sbagliata' }
      let l = lavori.get(p.lavoro)
      if (l !== undefined && l.stato !== 'ricevo') return { ok: false, motivo: 'questo lavoro è già partito' }
      if (n === 0) {
        l = { id: p.lavoro, stato: 'ricevo', progetto: '', ricevuti: 0, totale, inizio: adesso(), attivita: 'ricevo il progetto', radice }
        lavori.set(l.id, l)
        mkdirSync(arrivi, { recursive: true })
        writeFileSync(pacchettiDi(l)[0]!, buf)
      } else {
        if (l === undefined || l.ricevuti !== n || l.totale !== totale) return { ok: false, motivo: `aspettavo il pezzo ${l?.ricevuti ?? 0}` }
        appendFileSync(pacchettiDi(l)[0]!, buf)
      }
      // 12/11: l'ora dell'ultimo pezzo: una ricezione ferma da 30 minuti la chiude il giro di pulizia.
      l.ultimoPezzo = adesso()
      l.ricevuti = n + 1
      l.attivita = `ricevo il progetto (${l.ricevuti}/${totale})`
      return { ok: true, ricevuti: l.ricevuti }
    },
    avvia(p) {
      const l = idLavoroValido(p.lavoro) ? lavori.get(p.lavoro) : undefined
      if (l === undefined || l.stato !== 'ricevo') return { ok: false, motivo: 'il progetto di questo lavoro non è arrivato' }
      if (l.ricevuti !== l.totale) return { ok: false, motivo: `mancano pezzi (${l.ricevuti}/${String(l.totale)})` }
      if (!ramoValido(p.ramoBase) || !commitValido(p.base)) return { ok: false, motivo: 'ramo o commit di partenza non validi' }
      if (typeof p.prompt !== 'string' || p.prompt.trim() === '' || p.prompt.length > 200_000) return { ok: false, motivo: 'manca il messaggio per lo specialista' }
      const r: RichiestaAvvio = {
        lavoro: l.id,
        progetto: typeof p.progetto === 'string' ? p.progetto : 'progetto',
        ramoBase: p.ramoBase,
        base: p.base,
        prompt: p.prompt,
        sistema: typeof p.sistema === 'string' ? p.sistema.slice(0, 40_000) : '',
        modello: modelloAiuto(p.modello),
        strumenti: strumentiAmmessi(p.strumenti),
        ruolo: typeof p.ruolo === 'string' ? corto(p.ruolo, 40) : 'sviluppatore',
        descrizione: typeof p.descrizione === 'string' ? corto(p.descrizione, 300) : ''
      }
      cambia(l, { progetto: nomeProgettoSicuro(r.progetto), base: r.base, ruolo: r.ruolo, descrizione: r.descrizione, ...(typeof p.daNome === 'string' && p.daNome.trim() !== '' ? { perPc: corto(p.daNome, 60) } : {}) })
      log(`${l.id}: parte ${r.ruolo} per ${r.progetto} — ${r.descrizione.slice(0, 120)}`)
      void lancia(l, r).catch(async (err: unknown) => {
        log(`${l.id}: non riuscito: ${String(err).slice(0, 300)}`)
        if (l.stato !== 'fermato') cambia(l, { stato: 'fallito', motivo: corto(err instanceof Error ? err.message : String(err), 300), attivita: 'non riuscito' })
        await pulisciCopia(l).catch(() => undefined)
      })
      return { ok: true }
    },
    stato(id) {
      const l = idLavoroValido(id) ? lavori.get(id) : undefined
      if (l === undefined) return undefined
      return {
        id: l.id, stato: l.stato as StatoAiuto,
        ...(l.attivita !== undefined ? { attivita: l.attivita } : {}),
        ...(l.riepilogo !== undefined ? { riepilogo: l.riepilogo } : {}),
        ...(l.motivo !== undefined ? { motivo: l.motivo } : {}),
        ...(l.ramo !== undefined ? { ramo: l.ramo } : {}),
        ...(l.byte !== undefined ? { byte: l.byte } : {}),
        ...(l.commit !== undefined ? { commit: l.commit } : {})
      }
    },
    ritira(p) {
      const l = idLavoroValido(p.lavoro) ? lavori.get(p.lavoro) : undefined
      if (l === undefined || (l.stato !== 'finito' && l.stato !== 'fallito') || (l.byte ?? 0) === 0) return { ok: false, motivo: 'niente da ritirare' }
      const n = typeof p.n === 'number' && Number.isInteger(p.n) ? p.n : -1
      const totale = quantiPezzi(l.byte!)
      if (n < 0 || n >= totale) return { ok: false, motivo: 'pezzo non valido' }
      const file = pacchettiDi(l)[1]!
      const buf = Buffer.alloc(Math.min(PEZZO_BYTE, l.byte! - n * PEZZO_BYTE))
      const fd = openSync(file, 'r')
      try { readSync(fd, buf, 0, buf.length, n * PEZZO_BYTE) } finally { closeSync(fd) }
      return { ok: true, dati: buf.toString('base64'), totale }
    },
    chiudi(id) {
      const l = idLavoroValido(id) ? lavori.get(id) : undefined
      if (l === undefined) return false
      l.ferma?.()
      lavori.delete(l.id)
      salva()
      void pulisciCopia(l).catch(() => undefined)
      return true
    },
    ferma(id) {
      const l = idLavoroValido(id) ? lavori.get(id) : undefined
      if (l === undefined || l.stato === 'finito' || l.stato === 'fallito') return false
      cambia(l, { stato: 'fermato', motivo: 'fermato dal PC che l’aveva chiesto', attivita: 'fermato' })
      l.ferma?.()
      return true
    },
    pulizia
  }
  // 12/11: un giro subito (i lavori rimasti a metà, le copie che Windows teneva bloccate) e poi ogni 10 minuti.
  void pulizia()
  const ogni = x.pulisciOgniMs ?? PULIZIA_OGNI_MS
  if (ogni > 0) { const t = setInterval(() => { void pulizia() }, ogni); t.unref?.() }
  return lavoratore
}
