import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, utimesSync, writeFileSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToSlug } from '../indexer/project-scanner'
import { ErroreRemoto } from '../pc-remoto'
import { MOTIVI_VERSO_POSTA } from './manda-a-chat'
import { elencaFileProgetto } from './file'
import {
  cambiaProprietario, normalizzaPercorso, percorsoNuovo, prefissoProgetto, staDentro,
  type ProgettoDrive, type RegistroProgetti, type RegistroProgettiStore
} from './registro'
import type { ComandoPosta } from '@shared/posta'
import type { FaseSposta, VistaSposta } from '@shared/sposta'

/**
 * «Sposta su questo PC» (0.88.0): l'unico modo in cui un progetto cambia
 * proprietario. Gira sul PC che lo **riceve**, a passi, con un giornale su
 * disco (`sposta-in-corso.json`): dopo un riavvio riprende dal passo dov'era.
 *
 * 1. **controlli** — Drive e cassaforte pronti, il progetto è di un altro PC,
 *    la cartella di arrivo qui non c'è (o è vuota).
 * 2. **chiesta** — al proprietario, dal vivo (`/api/sposta/prepara`) o, se è
 *    spento, per posta: lui ferma le chat del progetto (mai una che lavora),
 *    carica tutto sul Drive, controlla che il Drive abbia i suoi file uguali,
 *    e risponde con l'**impronta** del manifesto del progetto.
 * 3. **scarico** — file del progetto e chat, dal Drive, nella cartella di qui.
 * 4. **verifica** — il manifesto del Drive è ancora quello confermato dal
 *    proprietario, e ogni file scaricato ha la sua impronta. Una sola
 *    differenza ferma tutto: il proprietario **non cambia**, e la copia
 *    scaricata va nel recupero.
 * 5. **cambio** — solo adesso il registro condiviso dice che il progetto è di
 *    questo PC.
 * 6. **vecchia copia** — il PC di prima sposta la sua cartella nel recupero
 *    (30 giorni), mai cancellata; e solo se è pulita (vedi `pulisciCopia`).
 */

export type { FaseSposta } from '@shared/sposta'
export { PASSI_SPOSTA } from '@shared/sposta'

export type GiornaleSposta = {
  id: string
  progetto: string
  nome: string
  /** Il proprietario di prima. */
  da: string
  daNome: string
  /** La cartella sul proprietario di prima. */
  percorsoDa: string
  /** La cartella di arrivo su questo PC. */
  percorso: string
  fase: FaseSposta
  iniziataIl: string
  aggiornataIl: string
  /** L'impronta del manifesto del progetto confermata dal proprietario di prima. */
  impronta?: string
  /** La richiesta nella posta, se il proprietario era spento. */
  voce?: string
  /** La cartella di arrivo l'ha creata questa procedura. */
  cartellaCreata?: boolean
  file?: number
  chat?: number
  /** Cosa non arriva (file ignorati da .gitignore, oltre il tetto) o resta da fare. */
  avvisi?: string[]
  /** Il messaggio per chi guarda: cosa succede adesso, o perché si è fermata. */
  messaggio: string
  errore?: string
  vecchiaCopia?: 'nel-recupero' | 'tenuta' | 'in-attesa'
  /** Finita e tolta dalla vista. */
  chiusa?: boolean
}

export const FILE_GIORNALE_SPOSTA = 'sposta-in-corso.json'

/** Quello che serve alla finestra, alla pagina e all'app. */
export function vistaSposta(g: GiornaleSposta | undefined): VistaSposta | undefined {
  if (g === undefined) return undefined
  return {
    progetto: g.progetto, nome: g.nome, daNome: g.daNome, fase: g.fase, messaggio: g.messaggio, percorso: g.percorso,
    ...(g.errore !== undefined ? { errore: g.errore } : {}), ...(g.avvisi !== undefined ? { avvisi: g.avvisi } : {})
  }
}

/** Il giornale su disco: scritto prima di ogni passo. */
export function giornaleSuDisco(dati: string): { leggi: () => GiornaleSposta | undefined; scrivi: (g: GiornaleSposta) => void } {
  const file = join(dati, FILE_GIORNALE_SPOSTA)
  return {
    leggi: () => { try { return JSON.parse(readFileSync(file, 'utf8')) as GiornaleSposta } catch { return undefined } },
    scrivi: (g) => {
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(`${file}.tmp`, JSON.stringify(g, null, 2))
      renameSync(`${file}.tmp`, file)
    }
  }
}

export type VoceManifestoSposta = { nome: string; size: number; mtime: number; sha?: string }
export type ManifestoSposta = { file: Record<string, VoceManifestoSposta> }

/** Gli slug delle chat di un progetto: la sua cartella e le sottocartelle. */
export function slugDelleChat(percorso: string, slug: string): boolean {
  const base = pathToSlug(percorso).toLowerCase()
  const s = slug.toLowerCase()
  return s === base || s.startsWith(`${base}-`)
}

/**
 * Di chi sono le chat di una cartella di trascrizioni (lo slug): del progetto
 * con la cartella che le contiene piu' da vicino (la piu' lunga), cosi'
 * «Foo-bar» non finisce dentro «Foo». `undefined` = di nessun progetto.
 */
export function progettoDelloSlug<P extends { proprietario?: string; percorso?: string }>(progetti: P[], slug: string): P | undefined {
  let meglio: { p: P; lung: number } | undefined
  for (const p of progetti) {
    if (p.percorso === undefined || p.proprietario === undefined || !slugDelleChat(p.percorso, slug)) continue
    const lung = pathToSlug(p.percorso).length
    if (meglio === undefined || lung > meglio.lung) meglio = { p, lung }
  }
  return meglio?.p
}

/**
 * Cosa sale sul Drive da questo PC (0.88.0): le chat di un progetto di un
 * altro PC no (la copia buona e' la sua); tutto il resto si'. I file dei
 * progetti salgono solo dalle radici dei progetti di questo PC.
 */
export function saleDaQuestoPc(progetti: { proprietario?: string; percorso?: string }[], io: string, percorso: string): boolean {
  const parti = percorso.split('/')
  if (parti[0] !== 'chat' || parti.length < 3) return true
  const p = progettoDelloSlug(progetti, parti[1] ?? '')
  return p === undefined || p.proprietario === io
}

/** Le voci del manifesto di un progetto: i suoi file e le chat della sua cartella. */
export function vociDelProgetto(m: ManifestoSposta, id: string, percorso: string): [string, VoceManifestoSposta][] {
  const prefisso = `${prefissoProgetto(id)}/`
  return Object.entries(m.file).filter(([k]) => {
    if (k.startsWith(prefisso)) return true
    const parti = k.split('/')
    return parti[0] === 'chat' && parti.length === 3 && slugDelleChat(percorso, parti[1] ?? '')
  }).sort(([a], [b]) => a.localeCompare(b))
}

/** L'impronta del progetto sul Drive: cambia se cambia anche un solo file o una chat. */
export function improntaProgetto(m: ManifestoSposta, id: string, percorso: string): string {
  const h = createHash('sha256')
  for (const [k, v] of vociDelProgetto(m, id, percorso)) h.update(`${k}\u0000${v.size}\u0000${v.sha ?? ''}\n`)
  return h.digest('hex')
}

const sha256 = (b: Buffer): string => createHash('sha256').update(b).digest('hex')

/** Dove va sul disco di qui una voce del manifesto: i file nella cartella, le chat sotto lo slug di qui. */
export function destinazioneDi(k: string, p: { id: string; percorsoDa: string; percorso: string; radiceChat: string }): string | undefined {
  const prefisso = `${prefissoProgetto(p.id)}/`
  if (k.startsWith(prefisso)) {
    const rel = k.slice(prefisso.length)
    if (rel === '' || rel.split('/').some((x) => x === '..' || x === '')) return undefined
    return join(p.percorso, ...rel.split('/'))
  }
  const [, slug, file] = k.split('/')
  if (slug === undefined || file === undefined || file.includes('..')) return undefined
  const base = pathToSlug(p.percorsoDa)
  const coda = slug.slice(base.length)
  return join(p.radiceChat, `${pathToSlug(p.percorso)}${coda}`, file)
}

export type DipendenzeSposta = {
  io: () => { id: string; nome: string; cartellaProgetti: string }
  registro: RegistroProgettiStore
  giornale: { leggi: () => GiornaleSposta | undefined; scrivi: (g: GiornaleSposta) => void }
  /** Perché il Drive non è pronto (scollegato, cassaforte chiusa); `undefined` se lo è. */
  driveNonPronto: () => string | undefined
  /** Una rotta del PC proprietario, dal vivo (rete di casa, Tailscale). */
  chiamaPc: (pcId: string, percorso: string, corpo?: unknown) => Promise<unknown>
  /** La posta: chiedere un comando al proprietario spento, e leggerne l'esito. */
  posta: {
    chiedi: (pcId: string, comando: ComandoPosta, cwd: string, testo: string) => Promise<string | undefined>
    esito: (pcId: string, voce: string) => Promise<{ stato: 'attesa' | 'consegnata' | 'fallita'; esito?: string } | undefined>
  }
  manifestoDrive: () => Promise<ManifestoSposta | undefined>
  leggiFileDrive: (percorso: string, m: ManifestoSposta) => Promise<Buffer | undefined>
  /** La cartella delle chat di Claude Code (`~/.claude/projects`). */
  radiceChat: () => string
  /** Il manifesto locale impara i file del progetto appena scesi: il salvataggio dopo non li ricarica. */
  imparaVoci?: (voci: [string, VoceManifestoSposta][]) => void
  /** Il registro nuovo sale sul Drive: gli altri PC lo vedono. */
  salvaRegistro: () => Promise<void>
  /** Una cartella di qui nel recupero (30 giorni). */
  inRecupero: (cartella: string, motivo: string) => { ok: boolean; messaggio?: string }
  nomeDi: (pcId: string) => string
  adesso?: () => string
  nuovoId?: () => string
  /** Ogni cambio del giornale, per la finestra. */
  avanzamento?: (g: GiornaleSposta) => void
  log?: (m: string) => void
}

export type Sposta = {
  /** Comincia (o riprende, se c'è già una procedura per lo stesso progetto). */
  avvia: (progetto: string) => Promise<GiornaleSposta>
  /** Riprende la procedura in corso dopo un riavvio, o rilegge la posta mentre si aspetta il proprietario. */
  riprendi: () => Promise<GiornaleSposta | undefined>
  /** La procedura da mostrare: quella in corso, o l'ultima finita finché non la si chiude. */
  stato: () => GiornaleSposta | undefined
  /** Una procedura finita o fallita si toglie dalla vista. Una in corso no. */
  chiudi: () => boolean
}

const finita = (g: GiornaleSposta | undefined): boolean => g === undefined || g.fase === 'fatta' || g.fase === 'fallita'

/** Una cartella vuota o assente: si può ricevere. */
function cartellaLibera(p: string): boolean {
  try { return !existsSync(p) || readdirSync(p).length === 0 } catch { return false }
}

export function creaSposta(deps: DipendenzeSposta): Sposta {
  const adesso = deps.adesso ?? ((): string => new Date().toISOString())
  const log = deps.log ?? ((): void => {})
  const nuovoId = deps.nuovoId ?? ((): string => `sp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`)
  let inCorso: Promise<GiornaleSposta> | undefined

  const segna = (g: GiornaleSposta, cambi: Partial<GiornaleSposta>): GiornaleSposta => {
    const n: GiornaleSposta = { ...g, ...cambi, aggiornataIl: adesso() }
    deps.giornale.scrivi(n)
    deps.avanzamento?.(n)
    return n
  }
  const progettoDi = (id: string): ProgettoDrive | undefined => deps.registro.leggi().progetti.find((p) => p.id === id)

  /** Si ferma prima del cambio: il proprietario resta quello di prima, la copia scaricata va nel recupero. */
  const ferma = (g: GiornaleSposta, errore: string): GiornaleSposta => {
    let messaggio = `Mi sono fermato: ${errore} Il progetto resta su ${g.daNome}, niente è cambiato là.`
    if (g.cartellaCreata === true && existsSync(g.percorso)) {
      const r = deps.inRecupero(g.percorso, `«Sposta su questo PC» di «${g.nome}» fermato: ${errore}`)
      messaggio += r.ok ? ' Quello che avevo scaricato qui è nel recupero.' : ` La copia scaricata qui (${g.percorso}) non è andata nel recupero: ${r.messaggio ?? ''}`
    }
    log(`[sposta] «${g.nome}» fermato: ${errore}`)
    return segna(g, { fase: 'fallita', errore, messaggio })
  }

  /** La risposta del proprietario: l'impronta confermata, o il perché no. */
  const leggiConferma = (x: unknown): { ok: true; impronta: string; avvisi?: string[] } | { ok: false; messaggio: string; riprova: boolean } => {
    const r = (typeof x === 'string' ? (() => { try { return JSON.parse(x) as unknown } catch { return { ok: false, messaggio: x } } })() : x) as { ok?: unknown; impronta?: unknown; messaggio?: unknown; avvisi?: unknown; riprova?: unknown }
    if (r?.ok === true && typeof r.impronta === 'string') {
      const avvisi = Array.isArray(r.avvisi) ? r.avvisi.filter((a): a is string => typeof a === 'string') : []
      return { ok: true, impronta: r.impronta, ...(avvisi.length > 0 ? { avvisi } : {}) }
    }
    return { ok: false, messaggio: typeof r?.messaggio === 'string' ? r.messaggio : 'nessun motivo', riprova: r?.riprova === true }
  }

  const passoChiedi = async (g: GiornaleSposta): Promise<GiornaleSposta> => {
    const io = deps.io()
    try {
      const r = await deps.chiamaPc(g.da, '/api/sposta/prepara', { progetto: g.progetto, verso: io.id, versoNome: io.nome, sposta: g.id })
      const c = leggiConferma(r)
      // «Una chat sta lavorando», «file non ancora uguali»: si aspetta e si richiede, non si ferma.
      if (!c.ok && c.riprova) return segna(g, { fase: 'attesa-proprietario', messaggio: `${g.daNome}: ${c.messaggio}. Richiedo fra poco.` })
      if (!c.ok) return ferma(g, `${g.daNome} non lo lascia andare: ${c.messaggio}`)
      return segna(g, { fase: 'scarico', impronta: c.impronta, ...(c.avvisi !== undefined ? { avvisi: c.avvisi } : {}), messaggio: `${g.daNome} ha caricato tutto e confermato. Scarico.` })
    } catch (err) {
      if (!(err instanceof ErroreRemoto) || !MOTIVI_VERSO_POSTA.includes(err.motivo)) {
        return ferma(g, `non riesco a chiederlo a ${g.daNome}: ${err instanceof Error ? err.message : String(err)}.`)
      }
      if (g.voce !== undefined) return segna(g, { fase: 'attesa-proprietario', messaggio: `${g.daNome} è spento: la richiesta è nella sua posta, riprendo da solo quando risponde.` })
      const voce = await deps.posta.chiedi(g.da, { tipo: 'sposta-prepara', progetto: g.progetto, verso: io.id, versoNome: io.nome, sposta: g.id }, g.percorsoDa,
        `Sposta «${g.nome}» su ${io.nome}`).catch(() => undefined)
      if (voce === undefined) return ferma(g, `${g.daNome} non risponde e la posta sul Drive non si scrive.`)
      log(`[sposta] «${g.nome}»: ${g.daNome} non risponde, richiesta nella sua posta`)
      return segna(g, { fase: 'attesa-proprietario', voce, messaggio: `${g.daNome} è spento: ho lasciato la richiesta nella sua posta. Quando si accende ferma le chat e carica tutto; poi continuo da solo.` })
    }
  }

  const passoAttesa = async (g: GiornaleSposta): Promise<GiornaleSposta> => {
    // Intanto si riprova dal vivo: se è tornato, non serve aspettare il suo postino.
    const viva = await passoChiedi({ ...g })
    if (viva.fase !== 'attesa-proprietario') return viva
    if (g.voce === undefined) return viva
    const e = await deps.posta.esito(g.da, g.voce).catch(() => undefined)
    if (e === undefined || e.stato === 'attesa') return viva
    const c = leggiConferma(e.esito ?? '')
    if (!c.ok && c.riprova) {
      // Per posta: si richiede con una voce nuova.
      return segna(g, { voce: undefined, messaggio: `${g.daNome}: ${c.messaggio}. Richiedo.` })
    }
    if (e.stato === 'fallita' || !c.ok) return ferma(g, `${g.daNome} non lo lascia andare: ${c.ok ? (e.esito ?? 'nessun motivo') : c.messaggio}`)
    return segna(g, { fase: 'scarico', impronta: c.impronta, ...(c.avvisi !== undefined ? { avvisi: c.avvisi } : {}), messaggio: `${g.daNome} ha caricato tutto e confermato (per posta). Scarico.` })
  }

  const passoScarico = async (g: GiornaleSposta): Promise<GiornaleSposta> => {
    const m = await deps.manifestoDrive()
    if (m === undefined) return segna(g, { messaggio: 'Il Drive non risponde: riprovo.' })
    if (improntaProgetto(m, g.progetto, g.percorsoDa) !== g.impronta) {
      return ferma(g, `il progetto sul Drive è cambiato dopo la conferma di ${g.daNome} (qualcuno ci lavora ancora?).`)
    }
    const voci = vociDelProgetto(m, g.progetto, g.percorsoDa)
    if (!voci.some(([k]) => k.startsWith(`${prefissoProgetto(g.progetto)}/`))) return ferma(g, 'sul Drive non c’è nessun file del progetto.')
    const radiceChat = deps.radiceChat()
    let fatti = 0
    let chat = 0
    for (const [k, v] of voci) {
      const dove = destinazioneDi(k, { id: g.progetto, percorsoDa: g.percorsoDa, percorso: g.percorso, radiceChat })
      if (dove === undefined) return ferma(g, `un percorso del manifesto non è valido (${k}).`)
      // Ripresa dopo un riavvio: un file già sceso e uguale non si riscarica.
      const gia = existsSync(dove) && v.sha !== undefined && sha256(readFileSync(dove)) === v.sha
      if (!gia) {
        const b = await deps.leggiFileDrive(k, m)
        if (b === undefined) return segna(g, { messaggio: `Non riesco a scaricare ${k}: riprovo.` })
        mkdirSync(dirname(dove), { recursive: true })
        writeFileSync(`${dove}.sposta-tmp`, b)
        renameSync(`${dove}.sposta-tmp`, dove)
        if (Number.isFinite(v.mtime) && v.mtime > 0) { try { utimesSync(dove, new Date(v.mtime), new Date(v.mtime)) } catch { /* la data non conta per la verifica */ } }
      }
      fatti += 1
      if (k.startsWith('chat/')) chat += 1
      if (fatti % 50 === 0) g = segna(g, { file: fatti, messaggio: `Scarico: ${fatti} di ${voci.length}.` })
    }
    return segna(g, { fase: 'verifica', file: fatti - chat, chat, messaggio: `Scaricati ${fatti - chat} file e ${chat} chat. Verifico.` })
  }

  const passoVerifica = async (g: GiornaleSposta): Promise<GiornaleSposta> => {
    const m = await deps.manifestoDrive()
    if (m === undefined) return segna(g, { messaggio: 'Il Drive non risponde: riprovo la verifica.' })
    if (improntaProgetto(m, g.progetto, g.percorsoDa) !== g.impronta) {
      return ferma(g, `il progetto sul Drive è cambiato dopo la conferma di ${g.daNome}.`)
    }
    const voci = vociDelProgetto(m, g.progetto, g.percorsoDa)
    const radiceChat = deps.radiceChat()
    const diverse: string[] = []
    for (const [k, v] of voci) {
      const dove = destinazioneDi(k, { id: g.progetto, percorsoDa: g.percorsoDa, percorso: g.percorso, radiceChat })
      let b: Buffer | undefined
      try { b = dove === undefined ? undefined : readFileSync(dove) } catch { b = undefined }
      if (b === undefined || b.length !== v.size || (v.sha !== undefined && sha256(b) !== v.sha)) diverse.push(k)
    }
    if (diverse.length > 0) {
      return ferma(g, `${diverse.length} file su ${voci.length} non sono arrivati uguali (${diverse.slice(0, 3).join(', ')}${diverse.length > 3 ? ' …' : ''}).`)
    }
    deps.imparaVoci?.(voci.filter(([k]) => k.startsWith(`${prefissoProgetto(g.progetto)}/`)))
    return segna(g, { fase: 'cambio', messaggio: `Tutti i ${voci.length} file e chat hanno la stessa impronta del Drive.` })
  }

  const passoCambio = async (g: GiornaleSposta): Promise<GiornaleSposta> => {
    const io = deps.io()
    const p = progettoDi(g.progetto)
    if (p === undefined) return ferma(g, 'il progetto non è più nel registro.')
    if (p.proprietario !== io.id) {
      if (p.proprietario !== g.da) return ferma(g, `nel frattempo il progetto è passato a ${deps.nomeDi(p.proprietario ?? '')}.`)
      deps.registro.scrivi(cambiaProprietario(deps.registro.leggi(), g.progetto, io.id, g.percorso, adesso()))
      log(`[sposta] «${g.nome}» adesso è di questo PC (${g.percorso}), prima era di ${g.daNome}`)
    }
    await deps.salvaRegistro().catch((err: unknown) => log(`[sposta] registro non ancora sul Drive (${String(err)}): sale al prossimo salvataggio`))
    return segna(g, { fase: 'vecchia-copia', messaggio: `«${g.nome}» adesso è di ${io.nome}. Chiedo a ${g.daNome} di mettere la sua copia nel recupero.` })
  }

  const passoVecchia = async (g: GiornaleSposta): Promise<GiornaleSposta> => {
    const p = progettoDi(g.progetto)
    const comando: ComandoPosta = { tipo: 'sposta-concludi', progetto: g.progetto, verso: deps.io().id, percorso: g.percorso, proprietarioDal: p?.proprietarioDal ?? adesso(), sposta: g.id }
    try {
      const r = await deps.chiamaPc(g.da, '/api/sposta/concludi', comando) as { ok?: unknown; messaggio?: unknown; nelRecupero?: unknown }
      const nel = r.nelRecupero === true
      return segna(g, {
        fase: 'fatta', vecchiaCopia: nel ? 'nel-recupero' : 'tenuta',
        messaggio: `Fatto: «${g.nome}» è su questo PC, in ${g.percorso}. ${typeof r.messaggio === 'string' ? r.messaggio : ''}`.trim()
      })
    } catch {
      // Spento: la copia di là va nel recupero quando si accende (posta), o
      // con la pulizia delle copie che non sono sue.
      await deps.posta.chiedi(g.da, comando, g.percorsoDa, `«${g.nome}» è passato a ${deps.io().nome}: metti la copia di qui nel recupero`).catch(() => undefined)
      return segna(g, { fase: 'fatta', vecchiaCopia: 'in-attesa', messaggio: `Fatto: «${g.nome}» è su questo PC, in ${g.percorso}. ${g.daNome} è spento: mette la sua copia nel recupero quando si accende.` })
    }
  }

  const avanza = async (g0: GiornaleSposta): Promise<GiornaleSposta> => {
    let g = g0
    for (let giri = 0; giri < 10 && !finita(g); giri += 1) {
      const prima = g.fase
      try {
        if (g.fase === 'controlli' || g.fase === 'chiesta') g = await passoChiedi(segna(g, { fase: 'chiesta', messaggio: `Chiedo a ${g.daNome} di fermare le chat di «${g.nome}» e caricare tutto sul Drive.` }))
        else if (g.fase === 'attesa-proprietario') g = await passoAttesa(g)
        else if (g.fase === 'scarico') g = await passoScarico(g)
        else if (g.fase === 'verifica') g = await passoVerifica(g)
        else if (g.fase === 'cambio') g = await passoCambio(g)
        else if (g.fase === 'vecchia-copia') g = await passoVecchia(g)
      } catch (err) {
        // Un intoppo (rete, Drive, disco) non decide niente: il giornale resta
        // al passo dov'era e si riprende al giro dopo. Solo le verifiche fermano.
        const m = err instanceof Error ? err.message : String(err)
        log(`[sposta] «${g.nome}», passo «${g.fase}»: ${m} (riprovo)`)
        return segna(g, { messaggio: `Intoppo al passo «${g.fase}»: ${m}. Riprovo da solo.` })
      }
      // Un passo che non è andato avanti (si aspetta il proprietario, o il Drive): ci si ferma qui, si riprende dopo.
      if (g.fase === prima) break
    }
    return g
  }

  const una = (f: () => Promise<GiornaleSposta>): Promise<GiornaleSposta> => {
    if (inCorso !== undefined) return inCorso
    inCorso = f().finally(() => { inCorso = undefined })
    return inCorso
  }

  return {
    avvia: (progetto) => una(async () => {
      const prima = deps.giornale.leggi()
      if (!finita(prima)) {
        if (prima?.progetto === progetto) return avanza(prima as GiornaleSposta)
        throw new Error(`c’è già uno spostamento in corso («${prima?.nome ?? ''}»): aspetta che finisca`)
      }
      const io = deps.io()
      const p = progettoDi(progetto)
      const base = {
        id: nuovoId(), progetto, nome: p?.nome ?? progetto, da: p?.proprietario ?? '', daNome: deps.nomeDi(p?.proprietario ?? ''),
        percorsoDa: p?.percorso ?? '', percorso: '', fase: 'controlli' as FaseSposta, iniziataIl: adesso(), aggiornataIl: adesso(), messaggio: 'Controlli.'
      }
      const no = (perche: string): GiornaleSposta => { const g = { ...base, fase: 'fallita' as const, errore: perche, messaggio: perche }; deps.giornale.scrivi(g); deps.avanzamento?.(g); return g }
      if (p === undefined) return no('Questo progetto non è nel registro.')
      if (p.proprietario === undefined || p.percorso === undefined) return no(`«${p.nome}» non ha ancora un proprietario con una cartella nota: non so da dove prenderlo.`)
      if (p.proprietario === io.id) return no(`«${p.nome}» è già di questo PC.`)
      const drive = deps.driveNonPronto()
      if (drive !== undefined) return no(drive)
      const percorso = percorsoNuovo(p, io.cartellaProgetti)
      if (!cartellaLibera(percorso)) return no(`Qui c’è già una cartella ${percorso} con dentro dei file: non la sovrascrivo. Spostala o rinominala, poi riprova.`)
      if (deps.registro.leggi().progetti.some((x) => x.proprietario === io.id && x.percorso !== undefined && (staDentro(percorso, x.percorso) || staDentro(x.percorso, percorso)))) {
        return no(`La cartella ${percorso} è dentro (o contiene) un altro progetto di questo PC.`)
      }
      const creata = !existsSync(percorso)
      mkdirSync(percorso, { recursive: true })
      const g: GiornaleSposta = { ...base, percorso, cartellaCreata: creata }
      deps.giornale.scrivi(g)
      log(`[sposta] «${p.nome}» da ${base.daNome} verso questo PC (${percorso})`)
      return avanza(g)
    }),
    riprendi: async () => {
      const g = deps.giornale.leggi()
      if (finita(g)) return g
      return una(() => avanza(g as GiornaleSposta))
    },
    stato: () => { const g = deps.giornale.leggi(); return g?.chiusa === true ? undefined : g },
    chiudi: () => {
      const g = deps.giornale.leggi()
      if (g === undefined || !finita(g)) return false
      deps.giornale.scrivi({ ...g, chiusa: true })
      return true
    }
  }
}

/* ------------------------------------------------------------------ */
/* Il lato del proprietario di prima.                                  */
/* ------------------------------------------------------------------ */

export type DipendenzeProprietario = {
  io: () => { id: string; nome: string; cartellaProgetti: string }
  registro: RegistroProgettiStore
  /** Le chat aperte qui nella cartella: la sessione, e se sta lavorando adesso. */
  chatAperte: (percorso: string) => { sessione?: string; alLavoro: boolean }[]
  /** Ferma (chiude) le chat aperte nella cartella: quante. */
  fermaChat: (percorso: string) => Promise<number>
  /** Carica tutto sul Drive, adesso (non il giro automatico). */
  salva: () => Promise<{ ok: boolean; messaggio?: string }>
  manifestoDrive: () => Promise<ManifestoSposta | undefined>
  /** Il manifesto del registro arrivato con «concludi»: si fonde con quello di qui. */
  log?: (m: string) => void
  pulisci: (p: { progetto: ProgettoDrive; percorso: string }) => Promise<EsitoPulizia>
}

/** I file della cartella che sul Drive non ci sono o sono diversi. Vuoto = la copia sul Drive è completa. */
export async function differenzeConDrive(percorso: string, id: string, m: ManifestoSposta): Promise<{ diversi: string[]; nonSalgono: string[] }> {
  const e = await elencaFileProgetto(percorso)
  const prefisso = `${prefissoProgetto(id)}/`
  const diversi: string[] = []
  for (const rel of e.file) {
    const v = m.file[`${prefisso}${rel}`]
    let b: Buffer
    try { b = readFileSync(join(percorso, ...rel.split('/'))) } catch { diversi.push(rel); continue }
    if (v === undefined || v.size !== b.length || (v.sha !== undefined && v.sha !== sha256(b))) diversi.push(rel)
  }
  return { diversi, nonSalgono: e.troppoGrandi }
}

export function creaLatoProprietario(deps: DipendenzeProprietario): {
  prepara: (r: { progetto: string; verso: string; versoNome: string }) => Promise<{ ok: true; impronta: string; avvisi?: string[] } | { ok: false; messaggio: string; riprova?: boolean }>
  concludi: (r: { progetto: string; verso: string; percorso: string; proprietarioDal: string }) => Promise<{ ok: boolean; messaggio: string; nelRecupero?: boolean }>
} {
  const log = deps.log ?? ((): void => {})
  return {
    async prepara(r) {
      const io = deps.io()
      const p = deps.registro.leggi().progetti.find((x) => x.id === r.progetto)
      if (p === undefined) return { ok: false, messaggio: 'il progetto non è nel registro di questo PC' }
      if (p.proprietario !== io.id || p.percorso === undefined) return { ok: false, messaggio: `il progetto non è di ${io.nome}` }
      if (!existsSync(p.percorso)) return { ok: false, messaggio: `la cartella ${p.percorso} non c’è su ${io.nome}` }
      const aperte = deps.chatAperte(p.percorso)
      const alLavoro = aperte.filter((c) => c.alLavoro).length
      if (alLavoro > 0) return { ok: false, riprova: true, messaggio: `${alLavoro} ${alLavoro === 1 ? 'chat sta lavorando' : 'chat stanno lavorando'} su ${io.nome}: aspetto che finiscano il turno` }
      const ferme = aperte.length > 0 ? await deps.fermaChat(p.percorso) : 0
      log(`[sposta] «${p.nome}» verso ${r.versoNome}: ${ferme} chat fermate, carico tutto sul Drive`)
      const s = await deps.salva()
      if (!s.ok) return { ok: false, riprova: true, messaggio: `il salvataggio sul Drive non è riuscito (${s.messaggio ?? 'motivo sconosciuto'})` }
      const m = await deps.manifestoDrive()
      if (m === undefined) return { ok: false, riprova: true, messaggio: 'il manifesto del Drive non si legge' }
      const d = await differenzeConDrive(p.percorso, p.id, m)
      if (d.diversi.length > 0) return { ok: false, riprova: true, messaggio: `${d.diversi.length} file non sono ancora uguali sul Drive (${d.diversi.slice(0, 3).join(', ')})` }
      if (d.nonSalgono.length > 0) return { ok: false, messaggio: `${d.nonSalgono.length} file sono troppo grandi per il Drive e non arriverebbero (${d.nonSalgono.slice(0, 3).join(', ')})` }
      const avvisi: string[] = []
      log(`[sposta] «${p.nome}»: tutto sul Drive, confermo a ${r.versoNome}`)
      return { ok: true, impronta: improntaProgetto(m, p.id, p.percorso), ...(avvisi.length > 0 ? { avvisi } : {}) }
    },
    async concludi(r) {
      const io = deps.io()
      const reg = deps.registro.leggi()
      const p = reg.progetti.find((x) => x.id === r.progetto)
      if (p === undefined) return { ok: false, messaggio: 'il progetto non è nel registro di questo PC' }
      const percorsoQui = p.proprietario === io.id ? p.percorso : undefined
      // Il registro di qui impara il proprietario nuovo (se non l'ha già da un'unione più recente).
      if (p.proprietario === io.id && (p.proprietarioDal ?? '') <= r.proprietarioDal) {
        deps.registro.scrivi(cambiaProprietario(reg, r.progetto, r.verso, r.percorso, r.proprietarioDal))
      }
      if (percorsoQui === undefined || !existsSync(percorsoQui)) return { ok: true, messaggio: 'Qui non c’era una copia da togliere.', nelRecupero: false }
      const e = await deps.pulisci({ progetto: { ...p, proprietario: r.verso, percorso: r.percorso }, percorso: percorsoQui })
      return { ok: true, nelRecupero: e.tipo === 'nel-recupero', messaggio: e.messaggio }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Le copie che non sono di questo PC.                                 */
/* ------------------------------------------------------------------ */

export type EsitoPulizia =
  | { tipo: 'nel-recupero'; percorso: string; messaggio: string }
  | { tipo: 'tenuta'; percorso: string; perche: 'fuori-cartella-progetti' | 'chat-aperte' | 'git-da-salvare' | 'diversa-dal-drive' | 'drive' | 'in-uso'; messaggio: string; file?: string[] }

/**
 * Una copia locale di un progetto che non è di questo PC (0.88.0): va nel
 * recupero **solo** se è identica al Drive, file per file (impronta). Mai se ci
 * sono chat aperte, lavoro git non salvato, o file che sul Drive non ci sono o
 * sono diversi (si dice quali). Mai una cartella fuori dalla cartella dei
 * progetti del programma: Documenti, X:, le condivisioni di rete si
 * **segnalano** e basta. Mai una cancellazione.
 */
export async function pulisciCopia(p: {
  progetto: Pick<ProgettoDrive, 'id' | 'nome'>
  percorso: string
  cartellaProgetti: string
  chatAperte: (percorso: string) => number
  gitDaSalvare: (percorso: string) => Promise<number>
  manifestoDrive: () => Promise<ManifestoSposta | undefined>
  inRecupero: (cartella: string, motivo: string) => { ok: boolean; messaggio?: string; inUso?: boolean }
}): Promise<EsitoPulizia> {
  const { percorso } = p
  const nome = p.progetto.nome
  if (p.cartellaProgetti === '' || !staDentro(percorso, p.cartellaProgetti) || normalizzaPercorso(percorso) === normalizzaPercorso(p.cartellaProgetti)) {
    return { tipo: 'tenuta', percorso, perche: 'fuori-cartella-progetti', messaggio: `«${nome}» qui sta in ${percorso}, fuori dalla cartella dei progetti del programma: non la tocco. Se non ti serve più, spostala tu.` }
  }
  const aperte = p.chatAperte(percorso)
  if (aperte > 0) return { tipo: 'tenuta', percorso, perche: 'chat-aperte', messaggio: `«${nome}»: ${aperte} chat aperte qui nella cartella. La lascio finché sono aperte.` }
  const git = await p.gitDaSalvare(percorso).catch(() => 0)
  if (git > 0) return { tipo: 'tenuta', percorso, perche: 'git-da-salvare', messaggio: `«${nome}»: ${git} file con modifiche git non salvate (commit) qui. La lascio: fai il commit o portali sul PC proprietario.` }
  const m = await p.manifestoDrive()
  if (m === undefined) return { tipo: 'tenuta', percorso, perche: 'drive', messaggio: `«${nome}»: il Drive non risponde, non posso confrontare. Riprovo più tardi.` }
  const d = await differenzeConDrive(percorso, p.progetto.id, m)
  const fuori = [...d.diversi, ...d.nonSalgono]
  if (fuori.length > 0) {
    return { tipo: 'tenuta', percorso, perche: 'diversa-dal-drive', file: fuori.slice(0, 50), messaggio: `«${nome}»: ${fuori.length} file qui non sono uguali alla copia sul Drive (${fuori.slice(0, 3).join(', ')}${fuori.length > 3 ? ' …' : ''}). La lascio: controlla se servono al PC proprietario.` }
  }
  const r = p.inRecupero(percorso, `«${nome}» vive su un altro PC: copia di qui identica al Drive`)
  if (!r.ok) return { tipo: 'tenuta', percorso, perche: 'in-uso', messaggio: `«${nome}»: non sono riuscito a metterla nel recupero (${r.messaggio ?? ''}).` }
  return { tipo: 'nel-recupero', percorso, messaggio: `La copia di «${nome}» di questo PC è nel recupero (30 giorni), identica al Drive.` }
}

/** Le copie da guardare su questo PC: progetti di altri PC con una cartella qui (dal registro di prima o dalla cartella dei progetti). */
export function copieNonMie(
  reg: RegistroProgetti,
  io: { id: string; cartellaProgetti: string },
  esiste: (p: string) => boolean,
  /** I percorsi del modello di prima (`EsitoMigrazione.percorsiDiPrima`): id → PC → cartella. */
  percorsiDiPrima: Record<string, Record<string, string[]>> = {}
): { progetto: ProgettoDrive; percorso: string }[] {
  const fuori: { progetto: ProgettoDrive; percorso: string }[] = []
  for (const p of reg.progetti) {
    if (p.proprietario === undefined || p.proprietario === io.id) continue
    const diPrima = [...(percorsiDiPrima[p.id]?.[io.id] ?? []), ...(p.vecchio?.percorsi[io.id] !== undefined ? [p.vecchio.percorsi[io.id] as string] : [])]
    const visti = new Set<string>()
    const candidati = [...diPrima, percorsoNuovo(p, io.cartellaProgetti)].filter((c) => { const k = normalizzaPercorso(c); if (visti.has(k)) return false; visti.add(k); return true })
    for (const c of candidati) if (esiste(c) && statSafe(c)) fuori.push({ progetto: p, percorso: c })
  }
  return fuori
}

/** Quanti file con modifiche non salvate (commit) ha il repository della cartella: 0 se non lo e'. */
export function gitDaSalvare(percorso: string): Promise<number> {
  if (!existsSync(join(percorso, '.git'))) return Promise.resolve(0)
  return new Promise((ok) => {
    execFile('git', ['-c', 'core.quotepath=false', 'status', '--porcelain=v1'], { cwd: percorso, encoding: 'utf8', windowsHide: true, timeout: 20_000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      // Se non risponde: meglio tenere la copia che toglierla.
      if (err !== null) { ok(1); return }
      ok(stdout.split(/\r?\n/).filter((r) => r.trim() !== '').length)
    })
  })
}

function statSafe(p: string): boolean {
  try { return statSync(p).isDirectory() } catch { return false }
}
