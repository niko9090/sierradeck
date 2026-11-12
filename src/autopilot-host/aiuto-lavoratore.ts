import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync, openSync, readSync, closeSync, lstatSync, rmdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  commitValido, idLavoroValido, LAVORO_MAX_MS, modelloAiuto, nomeProgettoSicuro, PEZZO_BYTE, PACCHETTO_MAX_BYTE,
  quantiPezzi, ramoDiRitorno, ramoValido, STRUMENTI_AIUTO, strumentiAmmessi, VIETATI_AIUTO, type StatoAiuto, type VistaLavoroAiutato
} from '@shared/aiuto-rete'
import type { AvviaProcesso } from './orchestratore'
import { cancellaSicuraAsincrona } from '@shared/cancella-sicura'

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
  base?: string
  ricevuti: number
  totale?: number
  inizio: number
  copia?: string
  repo?: string
  ferma?: () => void
}

export type LavoratoreAiuto = {
  /** Quanti lavori di altri PC sono al lavoro qui adesso: contano nei posti. */
  inCorso: () => number
  pezzo: (p: { lavoro: unknown; n: unknown; totale: unknown; dati: unknown }) => { ok: true; ricevuti: number } | { ok: false; motivo: string }
  avvia: (p: Record<string, unknown>) => { ok: true } | { ok: false; motivo: string }
  stato: (id: unknown) => VistaLavoroAiutato | undefined
  ritira: (p: { lavoro: unknown; n: unknown }) => { ok: true; dati: string; totale: number } | { ok: false; motivo: string }
  chiudi: (id: unknown) => boolean
  ferma: (id: unknown) => boolean
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
  cartella: string
  avvia: AvviaProcesso
  adesso?: () => number
  log?: (r: string) => void
}): LavoratoreAiuto {
  const adesso = x.adesso ?? Date.now
  const log = x.log ?? ((r: string) => console.info(`[aiuto] ${r}`))
  const arrivi = join(x.cartella, 'arrivi')
  const uscite = join(x.cartella, 'uscite')
  const fileStato = join(x.cartella, 'lavori.json')
  const lavori = new Map<string, Lavoro>()
  /** Un solo `npm ci` alla volta per la stessa impronta, e un solo giro di git per progetto. */
  const moduliInCorso = new Map<string, Promise<string | undefined>>()
  const codaProgetto = new Map<string, Promise<unknown>>()

  // I lavori che c'erano prima di un riavvio: chi era a metà non può riprendere (il processo non c'è più).
  try {
    const prima = existsSync(fileStato) ? JSON.parse(readFileSync(fileStato, 'utf8')) as Lavoro[] : []
    for (const l of Array.isArray(prima) ? prima : []) {
      if (!idLavoroValido(l.id)) continue
      const finito = l.stato === 'finito' || l.stato === 'fallito' || l.stato === 'fermato'
      lavori.set(l.id, finito ? l : { ...l, stato: 'fallito', motivo: 'il servizio del PC che aiutava si è riavviato a metà lavoro' })
    }
  } catch (err) { log(`stato di prima illeggibile: ${String(err)}`) }

  const salva = (): void => {
    try {
      mkdirSync(x.cartella, { recursive: true })
      const da = [...lavori.values()].map(({ ferma: _f, ...resto }) => resto)
      writeFileSync(fileStato, JSON.stringify(da, null, 1), 'utf8')
    } catch (err) { log(`stato non salvato: ${String(err)}`) }
  }
  const cambia = (l: Lavoro, p: Partial<Lavoro>): void => { Object.assign(l, p); salva() }

  const inProgetto = <T>(progetto: string, f: () => Promise<T>): Promise<T> => {
    const prima = codaProgetto.get(progetto) ?? Promise.resolve()
    const dopo = prima.catch(() => undefined).then(f)
    codaProgetto.set(progetto, dopo.catch(() => undefined))
    return dopo
  }

  /** `node_modules` per quel `package-lock.json`: installato una volta, poi collegato a ogni copia. */
  const moduliPer = (progetto: string, copia: string): Promise<string | undefined> => {
    const lock = join(copia, 'package-lock.json')
    if (!existsSync(join(copia, 'package.json')) || !existsSync(lock)) return Promise.resolve(undefined)
    const impronta = createHash('sha256').update(readFileSync(lock)).digest('hex').slice(0, 16)
    const dove = join(x.cartella, 'progetti', progetto, 'moduli', impronta)
    const gia = moduliInCorso.get(dove)
    if (gia !== undefined) return gia
    const p = (async (): Promise<string | undefined> => {
      if (existsSync(join(dove, 'node_modules', '.package-lock.json'))) return join(dove, 'node_modules')
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
    p.catch(() => moduliInCorso.delete(dove))
    return p
  }

  const pulisciCopia = async (l: Lavoro): Promise<void> => {
    if (l.copia !== undefined) {
      const mod = join(l.copia, 'node_modules')
      if (eCollegamento(mod)) { try { unlinkSync(mod) } catch { try { rmdirSync(mod) } catch { /* resta */ } } }
      if (l.repo !== undefined && !eCollegamento(mod)) {
        await git(['worktree', 'remove', '--force', l.copia], l.repo).catch(() => undefined)
        await git(['branch', '-D', ramoDiRitorno(l.id)], l.repo).catch(() => undefined)
      }
    }
    for (const f of [join(arrivi, `${l.id}.bundle`), join(uscite, `${l.id}.bundle`)]) { try { rmSync(f, { force: true }) } catch { /* resta */ } }
  }

  const lancia = async (l: Lavoro, r: RichiestaAvvio): Promise<void> => {
    const progetto = nomeProgettoSicuro(r.progetto)
    const base = join(x.cartella, 'progetti', progetto)
    const repo = join(base, 'repo')
    const copia = join(base, 'copie', l.id)
    const pacchetto = join(arrivi, `${l.id}.bundle`)
    const ramo = ramoDiRitorno(l.id)
    cambia(l, { stato: 'preparo', attivita: 'apro il progetto arrivato', repo })
    // Il repo del progetto: la prima volta un clone dal pacchetto, poi i commit nuovi. Una cosa alla volta per progetto.
    await inProgetto(progetto, async () => {
      mkdirSync(join(base, 'copie'), { recursive: true })
      if (!existsSync(join(repo, '.git'))) {
        // Una cartella rimasta a metà (un clone interrotto): via, ma solo dentro la cartella dell'aiuto, dalla guardia.
        await cancellaSicuraAsincrona(repo, { dentro: [x.cartella] })
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
      const moduli = await moduliPer(progetto, copia)
      if (moduli !== undefined && !existsSync(join(copia, 'node_modules'))) symlinkSync(moduli, join(copia, 'node_modules'), 'junction')
    } catch (err) {
      notaModuli = ` Attenzione: su questo PC node_modules non si è installato (${corto(String(err), 200)}): se un comando ne ha bisogno, dillo nel riepilogo invece di installarlo tu.`
      log(`${progetto}: node_modules mancante per ${l.id}: ${String(err).slice(0, 200)}`)
    }
    if (l.stato === 'fermato') return
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
      mkdirSync(uscite, { recursive: true })
      const out = join(uscite, `${l.id}.bundle`)
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
    const mod = join(copia, 'node_modules')
    if (eCollegamento(mod)) { try { unlinkSync(mod) } catch { try { rmdirSync(mod) } catch { /* resta */ } } }
    if (!eCollegamento(mod)) await git(['worktree', 'remove', '--force', copia], repo).catch(() => undefined)
  }

  return {
    inCorso: () => [...lavori.values()].filter((l) => l.stato === 'ricevo' || l.stato === 'preparo' || l.stato === 'lavoro').length,
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
        l = { id: p.lavoro, stato: 'ricevo', progetto: '', ricevuti: 0, totale, inizio: adesso(), attivita: 'ricevo il progetto' }
        lavori.set(l.id, l)
        mkdirSync(arrivi, { recursive: true })
        writeFileSync(join(arrivi, `${l.id}.bundle`), buf)
      } else {
        if (l === undefined || l.ricevuti !== n || l.totale !== totale) return { ok: false, motivo: `aspettavo il pezzo ${l?.ricevuti ?? 0}` }
        appendFileSync(join(arrivi, `${l.id}.bundle`), buf)
      }
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
      cambia(l, { progetto: nomeProgettoSicuro(r.progetto), base: r.base })
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
      const file = join(uscite, `${l.id}.bundle`)
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
    }
  }
}
