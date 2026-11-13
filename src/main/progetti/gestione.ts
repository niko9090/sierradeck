import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import {
  collega, collegaPerNome, nomeCartellaDi, nomeComune, pianoNomiWorkspace, pianoTornaComePrima, progettoDelWorkspace, rinominaInCollegamenti, scollega, stessoProgetto,
  type CollisioneNome
} from '@shared/progetti-identita'
import {
  controllaNomeNuovo, costruisciGestione,
  type LocaliGestione, type PcGestione, type RichiestaVista, type StatoMigrazioneNomi, type TipoRichiesta, type VistaGestione
} from '@shared/gestione-progetti'
import type { ComandoPosta } from '@shared/posta'
import { impostaProprietario, rimuoviProgetto, rinominaProgetto, unisciProgetti, type ProgettoDrive, type RegistroProgettiStore } from './registro'
import type { CollegamentiStore } from './collegamenti'
import type { EsitoRinomina } from './rinomina-progetto'
import type { EsitoPulizia } from './sposta'

/**
 * **Gestione progetti** (13/11): il lato del main. Costruisce la vista (le
 * regole pure stanno in `@shared/gestione-progetti`), esegue le scelte di
 * Nicholas su questo PC e manda per posta quelle che spettano a un altro PC
 * (rinomina, elimina, pulisci copia, sposta), seguendone l'esito. Tiene anche
 * la regola «il workspace si chiama come la cartella»: la sistemazione di una
 * volta all'avvio (con copia e «Torna come prima») e il seguito nel tempo.
 *
 * Niente si cancella mai: le cartelle vanno nel recupero di 30 giorni, i
 * workspace cambiano solo nome, e i file sul Drive escono solo con «Togli dal
 * Drive» o alla fine di «Elimina ovunque».
 */

export type Esito = { ok: boolean; messaggio: string }

export type Richiesta = RichiestaVista & { voce?: string }

/** Un «Elimina ovunque» in corso: i file sul Drive escono quando ogni PC ha messo nel recupero la sua cartella. */
export type Eliminazione = { progetto: string; nome: string; quando: string; richieste: string[]; driveTolto?: string; driveErrore?: string }

export type StatoGestione = {
  richieste: Richiesta[]
  eliminazioni: Eliminazione[]
  migrazione?: StatoMigrazioneNomi
}

export type StatoGestioneStore = { leggi: () => StatoGestione; scrivi: (s: StatoGestione) => void }

export const FILE_STATO_GESTIONE = 'gestione-progetti.json'

export function apriStatoGestione(dati: string): StatoGestioneStore {
  const file = join(dati, FILE_STATO_GESTIONE)
  const vuoto = (): StatoGestione => ({ richieste: [], eliminazioni: [] })
  return {
    leggi() {
      if (!existsSync(file)) return vuoto()
      try {
        const o = JSON.parse(readFileSync(file, 'utf8')) as Partial<StatoGestione>
        return { richieste: Array.isArray(o.richieste) ? o.richieste : [], eliminazioni: Array.isArray(o.eliminazioni) ? o.eliminazioni : [], ...(o.migrazione !== undefined ? { migrazione: o.migrazione } : {}) }
      } catch { return vuoto() }
    },
    scrivi(s) { scriviJsonAtomico(file, s, 'gestione-progetti') }
  }
}

/** Oltre questi giorni una richiesta finita esce dall'elenco. */
const GIORNI_RICHIESTE = 14

export type DepsGestione = {
  io: () => { id: string; nome: string }
  registro: RegistroProgettiStore
  collegamenti: CollegamentiStore
  stato: StatoGestioneStore
  /** I nomi dei workspace di questo PC. */
  workspace: () => string[]
  pc: () => PcGestione[]
  locali: () => Record<string, LocaliGestione | undefined>
  copieQui: () => { id: string; percorso: string }[]
  esiste: (p: string) => boolean
  ultimoUso?: () => Record<string, string>
  spazioDrive?: () => Record<string, { file: number; byte: number }> | undefined
  /** Perché la cartella (o uno di questi workspace) non si può toccare adesso: chat al lavoro, autopilota, workspace a schermo. */
  occupato: (cartella: string | undefined, workspace: string[]) => Promise<string | undefined>
  /** I workspace che non si rinominano da soli (la casa di un autopilota), con il motivo; `undefined` = non si sa adesso. */
  fermi: () => Promise<Record<string, string> | undefined>
  /** Rinomina un workspace come fa il pannello (solleva se non si può). */
  rinominaWorkspace: (vecchio: string, nuovo: string) => void
  /** Le chat salvate nei workspace che lavoravano nella cartella di prima passano a quella nuova. */
  spostaCwdWorkspace: (mappa: (cwd: string) => string, dentro: string[]) => void
  rinominaCartella: (percorso: string, nuovoNome: string) => EsitoRinomina
  annullaCartella: (da: string, a: string) => void
  /** Dopo una rinomina della cartella: git, indice delle chat. */
  dopoRinominaCartella?: (nuovo: string, mappa: (vecchio: string) => string) => Promise<string | undefined>
  togliDalDrive: (id: string) => Promise<{ ok: boolean; tolti?: number; messaggio?: string }>
  inRecupero: (cartella: string, motivo: string, progetto: { id: string; nome: string }) => { ok: boolean; messaggio?: string }
  /** Una cartella che non si deve mai togliere: la radice di un disco, la cartella utente, Documenti. */
  vietata: (cartella: string) => boolean
  pulisciCopia: (p: { progetto: { id: string; nome: string }; percorso: string }) => Promise<EsitoPulizia>
  posta: {
    manda: (pcId: string, comando: ComandoPosta, testo: string) => Promise<string | undefined>
    esito: (pcId: string, voce: string) => Promise<{ stato: 'attesa' | 'consegnata' | 'fallita'; esito?: string } | undefined>
  }
  spostaQui: (progetto: string) => Promise<Esito>
  apri: (cartella: string) => void
  apriRemoto: (pc: string, cartella: string) => Promise<Esito>
  scegliCartella?: () => Promise<string | undefined>
  /** Dopo un cambio del registro: salva sul Drive appena può. */
  salvaRegistro?: () => void
  /** Copia di sicurezza dell'archivio dei workspace prima di cambiare i nomi. */
  copiaWorkspace?: (nome: string) => void
  avvisa?: () => void
  log: (m: string) => void
  adesso?: () => number
}

export type CorpoGestione = {
  azione?: unknown; id?: unknown; ids?: unknown; tieni?: unknown; pc?: unknown; percorso?: unknown; nome?: unknown; ws?: unknown
}

export type GestioneProgetti = {
  vista: () => Promise<VistaGestione>
  azione: (corpo: unknown) => Promise<Esito>
  /** Un comando arrivato per posta da un altro PC. */
  comando: (c: ComandoPosta, daPc: string) => Promise<{ ok: boolean; esito: string; riprova?: boolean } | undefined>
  /** La sistemazione dei nomi di una volta, all'avvio. */
  migraNomi: () => Promise<StatoMigrazioneNomi | undefined>
  /** Il seguito nel tempo: collegamenti nuovi e nomi che seguono i progetti rinominati. */
  segui: () => Promise<void>
  /** Il workspace appena creato: si collega, e prende il nome della cartella se il progetto c'era già. */
  dopoCreato: (nome: string) => Promise<string | undefined>
  /** Il workspace rinominato o eliminato dal pannello: i collegamenti lo seguono. */
  dopoNome: (vecchio: string, nuovo: string | undefined) => void
  /** Prima di rinominare un workspace dal pannello: la cartella del suo progetto con lui. `undefined` = si può. */
  primaDiRinominareWorkspace: (vecchio: string, nuovo: string) => Promise<string | undefined>
  /** Le richieste in viaggio: si rilegge l'esito e, alla fine di un «Elimina ovunque», si tolgono i file dal Drive. */
  avanza: () => Promise<void>
}

const testo = (x: unknown): string => (typeof x === 'string' ? x : '')

export function creaGestioneProgetti(d: DepsGestione): GestioneProgetti {
  const adesso = d.adesso ?? (() => Date.now())
  const iso = (): string => new Date(adesso()).toISOString()
  const progetti = (): ProgettoDrive[] => d.registro.leggi().progetti
  const progetto = (id: string): ProgettoDrive | undefined => progetti().find((x) => x.id === id)
  const nomePc = (id: string): string => (id === d.io().id ? d.io().nome : d.pc().find((x) => x.id === id)?.nome ?? `PC ${id.slice(0, 6)}`)
  const cambiato = (): void => { d.salvaRegistro?.(); d.avvisa?.() }

  /** I workspace di qui del progetto `id` (per collegamento o per nome). */
  const wsDi = (ids: string[]): string[] => {
    const c = d.collegamenti.leggi()
    return d.workspace().filter((w) => {
      const e = progettoDelWorkspace(w, c, progetti())
      return (e.tipo === 'collegato' || e.tipo === 'nome') && ids.includes(e.progetto.id)
    })
  }

  const mettiRichiesta = (r: Richiesta): void => {
    const s = d.stato.leggi()
    d.stato.scrivi({ ...s, richieste: [...s.richieste, r] })
  }

  /** Manda un comando a un PC e ricorda la richiesta, per mostrarne l'esito. */
  const manda = async (pc: string, tipo: TipoRichiesta, comando: ComandoPosta, p: { id: string; nome: string }, testoVoce: string): Promise<Richiesta | undefined> => {
    const voce = await d.posta.manda(pc, comando, testoVoce)
    if (voce === undefined) return undefined
    const r: Richiesta = { id: voce, voce, tipo, progetto: p.id, nome: p.nome, pc, pcNome: nomePc(pc), stato: 'attesa', quando: iso() }
    mettiRichiesta(r)
    d.log(`[gestione] «${p.nome}»: ${tipo} chiesto a ${nomePc(pc)} per posta (${voce})`)
    return r
  }

  /* ---------------- Rinomina (sul proprietario) ---------------- */

  /**
   * Rinomina cartella e progetto su questo PC (il proprietario). `rinominaWs`:
   * rinomina anche il workspace collegato (da Gestione progetti e per posta;
   * dal pannello dei workspace lo rinomina il pannello stesso).
   */
  const rinominaQui = async (id: string, chiesto: string, opz: { rinominaWs: boolean; wsEscluso?: string }): Promise<Esito & { nome?: string }> => {
    const p = progetto(id)
    if (p === undefined) return { ok: false, messaggio: 'Il progetto non c’è più nell’elenco.' }
    if (p.proprietario !== d.io().id) return { ok: false, messaggio: `«${p.nome}» non è di questo PC.` }
    if (p.percorso === undefined || !d.esiste(p.percorso)) return { ok: false, messaggio: `La cartella di «${p.nome}» non c’è su questo PC: prima rimettila o imposta la cartella giusta.` }
    const n = nomeComune(chiesto)
    if (!n.ok) return { ok: false, messaggio: n.motivo }
    const nome = n.nome
    const ws = wsDi([id])
    const no = controllaNomeNuovo(nome, { ids: [id], chiave: '' }, progetti(), d.workspace(), [...ws, ...(opz.wsEscluso !== undefined ? [opz.wsEscluso] : [])])
    if (no !== undefined) return { ok: false, messaggio: no }
    const occ = await d.occupato(p.percorso, ws)
    if (occ !== undefined) return { ok: false, messaggio: `Non rinomino «${p.nome}» adesso: ${occ}` }
    const vecchio = p.percorso
    const e = d.rinominaCartella(vecchio, nome)
    if (!e.ok) return { ok: false, messaggio: e.messaggio }
    d.registro.scrivi(rinominaProgetto(d.registro.leggi(), id, nome, e.nuovoPercorso, iso()))
    try { d.spostaCwdWorkspace(e.mappa, [vecchio]) } catch (err) { d.log(`[gestione] «${nome}»: chat dei workspace non aggiornate (${String(err)})`) }
    const avvisi = [...e.avvisi]
    // Il workspace collegato prende lo stesso nome (uno solo: due con lo stesso nome non possono esserci).
    let c = d.collegamenti.leggi()
    const primo = ws.find((w) => w === p.nome) ?? ws[0]
    if (opz.rinominaWs && primo !== undefined && primo !== nome) {
      try {
        d.rinominaWorkspace(primo, nome)
        c = rinominaInCollegamenti(d.collegamenti.leggi(), primo, nome)
      } catch (err) { avvisi.push(`il workspace «${primo}» non ha cambiato nome (${err instanceof Error ? err.message : String(err)})`) }
    }
    for (const w of ws) {
      const dove = opz.rinominaWs && w === primo ? nome : w
      if (c.collegati[dove] !== undefined || dove === nome) c = collega(c, dove, { id, nome })
    }
    d.collegamenti.scrivi(c)
    const dopo = await d.dopoRinominaCartella?.(e.nuovoPercorso, e.mappa).catch((err: unknown) => String(err))
    if (dopo !== undefined) avvisi.push(dopo)
    d.log(`[gestione] «${p.nome}» → «${nome}»: ${vecchio} → ${e.nuovoPercorso}, ${e.chatSpostate} cartelle di conversazioni spostate${avvisi.length > 0 ? `; ${avvisi.join('; ')}` : ''}`)
    cambiato()
    return { ok: true, nome, messaggio: `Rinominato in «${nome}»${n.cambiato ? ` (il nome «${chiesto.trim()}» non va bene per una cartella: uso «${nome}» per tutti e due)` : ''}.${avvisi.length > 0 ? ` Nota: ${avvisi.join('; ')}.` : ''}` }
  }

  /* ---------------- Elimina (le cartelle di questo PC) ---------------- */

  const eliminaQui = async (id: string, nome: string, percorsi: string[]): Promise<{ ok: boolean; esito: string; riprova?: boolean }> => {
    const fatti: string[] = []
    for (const c of percorsi) {
      if (!d.esiste(c)) continue
      if (d.vietata(c)) { fatti.push(`${c} non la tocco (cartella di sistema)`); continue }
      const occ = await d.occupato(c, [])
      if (occ !== undefined) return { ok: false, riprova: true, esito: `${c}: ${occ}` }
      const r = d.inRecupero(c, `«${nome}» eliminato ovunque da Gestione progetti`, { id, nome })
      if (!r.ok) return { ok: false, riprova: true, esito: `${c}: ${r.messaggio ?? 'non spostata'}` }
      fatti.push(`${c} nel recupero (30 giorni)`)
    }
    return { ok: true, esito: fatti.length === 0 ? 'nessuna cartella qui' : fatti.join('; ') }
  }

  /** Le cartelle di un progetto su un PC: la sua come proprietario e le copie che il suo battito dice. */
  const cartelleSu = (pc: string, ids: string[], vista: VistaGestione): string[] => {
    const r = vista.righe.find((x) => x.ids.some((i) => ids.includes(i)))
    if (r === undefined) return []
    const fuori = new Set<string>()
    for (const m of r.membri) if (m.proprietario === pc && m.percorso !== undefined) fuori.add(m.percorso)
    for (const c of r.copie) if (c.pc === pc) fuori.add(c.percorso)
    return [...fuori]
  }

  const vista = async (): Promise<VistaGestione> => {
    const s = d.stato.leggi()
    return costruisciGestione({
      io: d.io(), pc: d.pc(), progetti: progetti(), locali: d.locali(), copieQui: d.copieQui(), esisteQui: d.esiste,
      workspaceQui: d.workspace(), collegamenti: d.collegamenti.leggi(),
      ...(d.ultimoUso !== undefined ? { ultimoUso: d.ultimoUso() } : {}),
      ...(d.spazioDrive?.() !== undefined ? { spazioDrive: d.spazioDrive() as Record<string, { file: number; byte: number }> } : {}),
      richieste: s.richieste.map(({ voce: _v, ...r }) => r),
      ...(s.migrazione !== undefined ? { migrazione: s.migrazione } : {}),
      adesso: adesso()
    })
  }

  const applicaRinomineWs = (rinomine: { da: string; a: string }[], perche: string): { da: string; a: string }[] => {
    const fatte: { da: string; a: string }[] = []
    for (const r of rinomine) {
      try {
        d.rinominaWorkspace(r.da, r.a)
        fatte.push({ da: r.da, a: r.a })
        d.log(`[gestione] workspace «${r.da}» → «${r.a}» (${perche})`)
      } catch (err) { d.log(`[gestione] workspace «${r.da}» non rinominato in «${r.a}»: ${err instanceof Error ? err.message : String(err)}`) }
    }
    return fatte
  }

  const g: GestioneProgetti = {
    vista,

    async azione(corpo) {
      const c = (typeof corpo === 'object' && corpo !== null ? corpo : {}) as CorpoGestione
      const azione = testo(c.azione)
      const id = testo(c.id)
      const io = d.io()
      const p = id !== '' ? progetto(id) : undefined
      const serve = (): Esito | undefined => (p === undefined ? { ok: false, messaggio: 'Il progetto non c’è più nell’elenco: aggiorna.' } : undefined)

      if (azione === 'apri') {
        if (serve()) return serve() as Esito
        const q = p as ProgettoDrive
        if (q.proprietario !== io.id || q.percorso === undefined || !d.esiste(q.percorso)) return { ok: false, messaggio: 'Su questo PC il progetto non ha la sua cartella.' }
        d.apri(q.percorso)
        return { ok: true, messaggio: `Apro una chat in ${q.percorso}.` }
      }
      if (azione === 'apri-remoto') {
        if (serve()) return serve() as Esito
        const q = p as ProgettoDrive
        if (q.proprietario === undefined || q.proprietario === io.id || q.percorso === undefined) return { ok: false, messaggio: 'Il progetto non vive su un altro PC.' }
        return d.apriRemoto(q.proprietario, q.percorso)
      }
      if (azione === 'sposta') {
        if (serve()) return serve() as Esito
        const q = p as ProgettoDrive
        const verso = testo(c.pc)
        if (verso === '' || verso === q.proprietario) return { ok: false, messaggio: 'Scegli un PC diverso dal proprietario.' }
        if (verso === io.id) return d.spostaQui(q.id)
        const r = await manda(verso, 'progetto-sposta-qui', { tipo: 'progetto-sposta-qui', progetto: q.id }, q, `Sposta «${q.nome}» su questo PC (chiesto da ${io.nome})`)
        return r === undefined ? { ok: false, messaggio: 'Non riesco a scrivere nella posta: Drive o cassaforte non pronti.' } : { ok: true, messaggio: `Chiesto a ${r.pcNome}: «Sposta su questo PC» parte appena legge la posta.` }
      }
      if (azione === 'imposta-proprietario') {
        if (serve()) return serve() as Esito
        const q = p as ProgettoDrive
        const pc = testo(c.pc)
        let percorso = testo(c.percorso)
        if (pc === '') return { ok: false, messaggio: 'Scegli il PC.' }
        if (pc === io.id && percorso === '') percorso = (await d.scegliCartella?.()) ?? ''
        if (percorso === '') return { ok: false, messaggio: 'Manca la cartella su quel PC.' }
        if (pc === io.id && !d.esiste(percorso)) return { ok: false, messaggio: `La cartella ${percorso} non c’è su questo PC.` }
        if (pc !== io.id && !(await vista()).righe.some((r) => r.ids.includes(q.id) && r.candidatiProprietario.some((x) => x.pc === pc && x.percorso.toLowerCase() === percorso.toLowerCase()))) {
          return { ok: false, messaggio: `${nomePc(pc)} non dice di avere ${percorso}: deve essere acceso e aggiornato perché si sappia.` }
        }
        d.registro.scrivi(impostaProprietario(d.registro.leggi(), q.id, pc, percorso, iso()))
        d.log(`[gestione] «${q.nome}»: proprietario ${nomePc(pc)} in ${percorso} (era ${q.proprietario !== undefined ? nomePc(q.proprietario) : 'nessuno'})`)
        cambiato()
        return { ok: true, messaggio: `«${q.nome}» adesso è di ${nomePc(pc)} (${percorso}). Niente è stato spostato.` }
      }
      if (azione === 'unisci') {
        const tieni = testo(c.tieni)
        const ids = Array.isArray(c.ids) ? c.ids.filter((x): x is string => typeof x === 'string') : []
        const t = progetto(tieni)
        if (t === undefined || ids.length < 2 || !ids.includes(tieni)) return { ok: false, messaggio: 'Scegli quale voce tenere.' }
        const togli = ids.filter((x) => x !== tieni && progetto(x) !== undefined)
        d.registro.scrivi(unisciProgetti(d.registro.leggi(), tieni, togli, iso()))
        // I workspace collegati alle voci tolte passano a quella che resta.
        let col = d.collegamenti.leggi()
        for (const [ws, l] of Object.entries(col.collegati)) if (togli.includes(l.id)) col = collega(col, ws, { id: tieni, nome: l.nome })
        d.collegamenti.scrivi(col)
        d.log(`[gestione] «${t.nome}»: uniti ${togli.length} doppioni in ${tieni} (${togli.join(', ')})`)
        cambiato()
        return { ok: true, messaggio: `Unito: resta «${t.nome}» di ${t.proprietario !== undefined ? nomePc(t.proprietario) : 'nessuno'}. Le cartelle delle altre voci, se ci sono, restano come copie.` }
      }
      if (azione === 'rinomina') {
        if (serve()) return serve() as Esito
        const q = p as ProgettoDrive
        const nome = testo(c.nome)
        if (q.proprietario === undefined) return { ok: false, messaggio: 'Prima imposta il proprietario.' }
        if (q.proprietario === io.id) return rinominaQui(q.id, nome, { rinominaWs: true })
        const n = nomeComune(nome)
        if (!n.ok) return { ok: false, messaggio: n.motivo }
        const wsQui = wsDi([q.id])
        const no = controllaNomeNuovo(n.nome, { ids: [q.id], chiave: '' }, progetti(), d.workspace(), wsQui)
        if (no !== undefined) return { ok: false, messaggio: no }
        // I workspace di qui legati per id prima che il nome cambi: quando arriva il registro nuovo lo seguono.
        let colQui = d.collegamenti.leggi()
        for (const w of wsQui) if (colQui.collegati[w] === undefined) colQui = collega(colQui, w, { id: q.id, nome: nomeCartellaDi(q) })
        if (colQui !== d.collegamenti.leggi()) d.collegamenti.scrivi(colQui)
        const r = await manda(q.proprietario, 'progetto-rinomina', { tipo: 'progetto-rinomina', progetto: q.id, nome: n.nome }, q, `Rinomina «${q.nome}» in «${n.nome}» (chiesto da ${io.nome})`)
        return r === undefined ? { ok: false, messaggio: 'Non riesco a scrivere nella posta: Drive o cassaforte non pronti.' } : { ok: true, messaggio: `Chiesto a ${r.pcNome}: rinomina la cartella in «${n.nome}» appena legge la posta. Il workspace di qui seguirà.` }
      }
      if (azione === 'collega' || azione === 'scollega') {
        const ws = testo(c.ws)
        if (!d.workspace().includes(ws)) return { ok: false, messaggio: `Il workspace «${ws}» non c’è su questo PC.` }
        if (azione === 'scollega') {
          d.collegamenti.scrivi(scollega(d.collegamenti.leggi(), ws))
          d.log(`[gestione] workspace «${ws}» scollegato`)
          d.avvisa?.()
          return { ok: true, messaggio: `«${ws}» scollegato. Niente è stato cancellato.` }
        }
        if (serve()) return serve() as Esito
        const q = p as ProgettoDrive
        d.collegamenti.scrivi(collega(d.collegamenti.leggi(), ws, { id: q.id, nome: nomeCartellaDi(q) }))
        d.log(`[gestione] workspace «${ws}» collegato a «${q.nome}» (${q.id})`)
        d.avvisa?.()
        return { ok: true, messaggio: `«${ws}» collegato a «${q.nome}».${ws !== nomeCartellaDi(q) ? ` Il nome è diverso dalla cartella «${nomeCartellaDi(q)}»: usa «Rinomina» per renderli uguali.` : ''}` }
      }
      if (azione === 'togli-drive') {
        if (serve()) return serve() as Esito
        const q = p as ProgettoDrive
        const e = await d.togliDalDrive(q.id)
        if (!e.ok) return { ok: false, messaggio: `Non ho tolto «${q.nome}»: ${e.messaggio ?? 'il Drive non risponde'}.` }
        d.registro.scrivi(rimuoviProgetto(d.registro.leggi(), q.id, iso()))
        d.log(`[gestione] «${q.nome}» tolto dal Drive: ${e.tolti ?? 0} file; le cartelle sui PC restano`)
        cambiato()
        return { ok: true, messaggio: `«${q.nome}» tolto dal Drive (${e.tolti ?? 0} file). Le cartelle sui PC restano.` }
      }
      if (azione === 'elimina-ovunque') {
        const ids = Array.isArray(c.ids) ? c.ids.filter((x): x is string => typeof x === 'string' && progetto(x) !== undefined) : (p !== undefined ? [p.id] : [])
        const capo = progetto(ids[0] ?? '')
        if (capo === undefined) return { ok: false, messaggio: 'Il progetto non c’è più nell’elenco: aggiorna.' }
        const v = await vista()
        const riga = v.righe.find((r) => r.ids.includes(capo.id))
        const tutti = riga?.ids ?? ids
        const nome = riga?.nome ?? capo.nome
        // Mai mentre ci si lavora qui.
        const qui = cartelleSu(io.id, tutti, v)
        for (const cart of qui) {
          const occ = await d.occupato(cart, wsDi(tutti))
          if (occ !== undefined) return { ok: false, messaggio: `Non elimino «${nome}» adesso: ${occ}` }
        }
        const eQui = await eliminaQui(capo.id, nome, qui)
        if (!eQui.ok) return { ok: false, messaggio: `Non elimino «${nome}»: ${eQui.esito}` }
        // Gli altri PC con una cartella: per posta, anche spenti.
        const altri = [...new Set([...(riga?.membri ?? []).map((m) => m.proprietario), ...(riga?.copie ?? []).map((x) => x.pc)].filter((x): x is string => x !== undefined && x !== io.id))]
        const richieste: string[] = []
        const nonScritti: string[] = []
        for (const pc of altri) {
          const percorsi = cartelleSu(pc, tutti, v)
          const r = await manda(pc, 'progetto-elimina', { tipo: 'progetto-elimina', progetto: capo.id, nome, percorsi }, { id: capo.id, nome }, `Elimina «${nome}» (chiesto da ${io.nome}): la cartella va nel recupero`)
          if (r === undefined) nonScritti.push(nomePc(pc)); else richieste.push(r.id)
        }
        if (nonScritti.length > 0) return { ok: false, messaggio: `Non riesco a scrivere nella posta di ${nonScritti.join(', ')}: Drive o cassaforte non pronti. ${eQui.esito !== 'nessuna cartella qui' ? `Qui: ${eQui.esito}.` : ''}` }
        let reg = d.registro.leggi()
        const quando = iso()
        for (const x of tutti) reg = rimuoviProgetto(reg, x, quando)
        d.registro.scrivi(reg)
        const s = d.stato.leggi()
        d.stato.scrivi({ ...s, eliminazioni: [...s.eliminazioni, { progetto: capo.id, nome, quando, richieste }] })
        d.log(`[gestione] «${nome}» eliminato ovunque: qui ${eQui.esito}; chiesto a ${altri.map(nomePc).join(', ') || 'nessun altro PC'}`)
        cambiato()
        await g.avanza()
        return { ok: true, messaggio: `«${nome}» eliminato. Qui: ${eQui.esito}.${altri.length > 0 ? ` Chiesto a ${altri.map(nomePc).join(', ')}: lo fanno appena leggono la posta (anche dopo, se spenti). I file sul Drive escono quando tutti hanno finito.` : ' I file sul Drive escono adesso.'}` }
      }
      if (azione === 'pulisci-copia') {
        if (serve()) return serve() as Esito
        const q = p as ProgettoDrive
        const pc = testo(c.pc)
        const percorso = testo(c.percorso)
        if (pc === '' || percorso === '') return { ok: false, messaggio: 'Quale copia?' }
        if (pc === q.proprietario && q.percorso !== undefined && q.percorso.toLowerCase() === percorso.toLowerCase()) return { ok: false, messaggio: 'Questa è la cartella del proprietario, non una copia.' }
        if (pc === io.id) {
          const e = await d.pulisciCopia({ progetto: { id: q.id, nome: q.nome }, percorso })
          d.log(`[gestione] copia di «${q.nome}» in ${percorso}: ${e.messaggio}`)
          d.avvisa?.()
          return { ok: e.tipo === 'nel-recupero', messaggio: e.messaggio }
        }
        const r = await manda(pc, 'progetto-pulisci-copia', { tipo: 'progetto-pulisci-copia', progetto: q.id, percorso }, q, `Pulisci la copia di «${q.nome}» in ${percorso} (chiesto da ${io.nome})`)
        return r === undefined ? { ok: false, messaggio: 'Non riesco a scrivere nella posta: Drive o cassaforte non pronti.' } : { ok: true, messaggio: `Chiesto a ${r.pcNome}: la copia va nel recupero solo se è uguale al Drive. L’esito arriva qui.` }
      }
      if (azione === 'torna-nomi') {
        const s = d.stato.leggi()
        if (s.migrazione === undefined || s.migrazione.rinominati.length === 0) return { ok: false, messaggio: 'Nessun nome da rimettere.' }
        d.copiaWorkspace?.('workspaces.prima-di-torna-nomi.json')
        const piano = pianoTornaComePrima(s.migrazione.rinominati, d.workspace())
        const fatte = applicaRinomineWs(piano, 'Torna come prima')
        let col = d.collegamenti.leggi()
        for (const f of fatte) col = rinominaInCollegamenti(col, f.da, f.a)
        d.collegamenti.scrivi(col)
        d.stato.scrivi({ ...d.stato.leggi(), migrazione: { ...s.migrazione, tornataIl: iso() } })
        d.avvisa?.()
        return { ok: fatte.length > 0, messaggio: fatte.length > 0 ? `${fatte.length} workspace con il nome di prima.` : 'Nessun workspace da rimettere (i nomi di prima sono già usati).' }
      }
      if (azione === 'ritira') {
        // Una richiesta finita o fallita esce dall'elenco.
        const s = d.stato.leggi()
        d.stato.scrivi({ ...s, richieste: s.richieste.filter((r) => r.id !== id) })
        d.avvisa?.()
        return { ok: true, messaggio: 'Tolta dall’elenco.' }
      }
      return { ok: false, messaggio: `Azione sconosciuta: ${azione}` }
    },

    async comando(c, daPc) {
      if (c.tipo === 'progetto-rinomina') {
        const r = await rinominaQui(c.progetto, c.nome, { rinominaWs: true })
        d.log(`[gestione] rinomina chiesta da ${nomePc(daPc)}: ${r.messaggio}`)
        return { ok: r.ok, esito: r.messaggio }
      }
      if (c.tipo === 'progetto-elimina') {
        // Le cartelle di qui: quelle che il comando dice (il registro di qui può averlo già
        // tolto, con l'unione del Drive), quella del proprietario e le copie che si vedono.
        // Mai una cartella con un nome che non è quello del progetto.
        const reg = d.registro.leggi()
        const io = d.io()
        const cartelle = new Set<string>(Array.isArray(c.percorsi) ? c.percorsi.filter((x) => typeof x === 'string' && x !== '') : [])
        const p = reg.progetti.find((x) => x.id === c.progetto)
        if (p?.proprietario === io.id && p.percorso !== undefined) cartelle.add(p.percorso)
        for (const x of d.copieQui()) if (x.id === c.progetto) cartelle.add(x.percorso)
        const stesse = [...cartelle].filter((x) => stessoProgetto(nomeCartellaDi({ nome: '', percorso: x }), c.nome) || (p !== undefined && stessoProgetto(nomeCartellaDi({ nome: '', percorso: x }), p.nome)))
        const scartate = [...cartelle].filter((x) => !stesse.includes(x))
        if (scartate.length > 0) d.log(`[gestione] eliminazione di «${c.nome}»: non tocco ${scartate.join(', ')} (il nome della cartella non è quello del progetto)`)
        const r = await eliminaQui(c.progetto, c.nome, stesse)
        if (r.ok) {
          let nuovo = d.registro.leggi()
          if (nuovo.progetti.some((x) => x.id === c.progetto)) { nuovo = rimuoviProgetto(nuovo, c.progetto, iso()); d.registro.scrivi(nuovo) }
          cambiato()
        }
        d.log(`[gestione] eliminazione di «${c.nome}» chiesta da ${nomePc(daPc)}: ${r.esito}`)
        return r
      }
      if (c.tipo === 'progetto-pulisci-copia') {
        const p = progetto(c.progetto)
        const copia = d.copieQui().find((x) => x.id === c.progetto && x.percorso.toLowerCase() === c.percorso.toLowerCase())
        if (p === undefined || copia === undefined) return { ok: false, esito: `qui non c’è una copia di quel progetto in ${c.percorso}` }
        const e = await d.pulisciCopia({ progetto: { id: p.id, nome: p.nome }, percorso: copia.percorso })
        d.avvisa?.()
        return { ok: e.tipo === 'nel-recupero', esito: e.messaggio }
      }
      if (c.tipo === 'progetto-sposta-qui') {
        const e = await d.spostaQui(c.progetto)
        return { ok: e.ok, esito: e.messaggio }
      }
      return undefined
    },

    async migraNomi() {
      const s = d.stato.leggi()
      if (s.migrazione !== undefined) return s.migrazione
      const fermi = await d.fermi()
      if (fermi === undefined) { d.log('[gestione] sistemazione dei nomi rimandata: non so ancora quali workspace sono la casa di un autopilota'); return undefined }
      const ws = d.workspace()
      const { collegamenti } = collegaPerNome(d.collegamenti.leggi(), ws, progetti())
      d.collegamenti.scrivi(collegamenti)
      const piano = pianoNomiWorkspace({ workspace: ws, collegamenti, progetti: progetti(), fermi })
      if (piano.rinomine.length > 0) d.copiaWorkspace?.('workspaces.prima-dei-nomi.json')
      const fatte = applicaRinomineWs(piano.rinomine, 'il workspace prende il nome della cartella')
      // I collegamenti: quelli del piano per le rinomine riuscite, gli altri come prima.
      let col = d.collegamenti.leggi()
      for (const f of fatte) {
        const l = col.collegati[f.da]
        col = rinominaInCollegamenti(col, f.da, f.a)
        if (l !== undefined) col = collega(col, f.a, { id: l.id, nome: f.a })
      }
      d.collegamenti.scrivi(col)
      const nonFatte: CollisioneNome[] = piano.rinomine.filter((r) => !fatte.some((f) => f.da === r.da)).map((r) => ({ nome: r.a, workspace: [r.da], perche: 'la rinomina non è riuscita (vedi il registro)' }))
      const migrazione: StatoMigrazioneNomi = { fattaIl: iso(), rinominati: fatte, collisioni: [...piano.collisioni, ...nonFatte] }
      d.stato.scrivi({ ...d.stato.leggi(), migrazione })
      d.log(`[gestione] sistemazione dei nomi: ${fatte.length} workspace rinominati come la loro cartella, ${migrazione.collisioni.length} lasciati com’erano`)
      d.avvisa?.()
      return migrazione
    },

    async segui() {
      const ws = d.workspace()
      const { collegamenti, nuovi } = collegaPerNome(d.collegamenti.leggi(), ws, progetti())
      const fermi = await d.fermi()
      const piano = pianoNomiWorkspace({ workspace: ws, collegamenti, progetti: progetti(), soloCambiati: true, ...(fermi !== undefined ? { fermi } : {}) })
      if (fermi === undefined && piano.rinomine.length > 0) { if (nuovi.length > 0) d.collegamenti.scrivi(collegamenti); return }
      const fatte = applicaRinomineWs(piano.rinomine, 'il progetto ha cambiato nome')
      let col = piano.collegamenti
      // Una rinomina non riuscita: il collegamento resta col nome di prima, si riprova al giro dopo.
      for (const r of piano.rinomine.filter((x) => !fatte.some((f) => f.da === x.da))) {
        const l = col.collegati[r.a]
        col = rinominaInCollegamenti(col, r.a, r.da)
        if (l !== undefined) col = collega(col, r.da, { id: l.id, nome: r.da })
      }
      if (nuovi.length > 0 || fatte.length > 0 || JSON.stringify(col) !== JSON.stringify(d.collegamenti.leggi())) d.collegamenti.scrivi(col)
      if (fatte.length > 0) d.avvisa?.()
    },

    async dopoCreato(nome) {
      const c = d.collegamenti.leggi()
      const e = progettoDelWorkspace(nome, c, progetti())
      if (e.tipo !== 'collegato' && e.tipo !== 'nome') return undefined
      const cartella = nomeCartellaDi(e.progetto)
      let finale = nome
      if (cartella !== nome && nomeComune(cartella).ok && !d.workspace().some((w) => w !== nome && w.toLowerCase() === cartella.toLowerCase())) {
        try { d.rinominaWorkspace(nome, cartella); finale = cartella; d.log(`[gestione] workspace nuovo «${nome}» → «${cartella}»: il progetto c’era già con quel nome`) } catch (err) { d.log(`[gestione] workspace nuovo «${nome}» non rinominato: ${String(err)}`) }
      }
      d.collegamenti.scrivi(collega(rinominaInCollegamenti(d.collegamenti.leggi(), nome, finale), finale, { id: e.progetto.id, nome: cartella }))
      return finale
    },

    dopoNome(vecchio, nuovo) {
      const c = d.collegamenti.leggi()
      const dopo = rinominaInCollegamenti(c, vecchio, nuovo)
      if (dopo !== c) d.collegamenti.scrivi(dopo)
    },

    async primaDiRinominareWorkspace(vecchio, nuovo) {
      const e = progettoDelWorkspace(vecchio, d.collegamenti.leggi(), progetti())
      if (e.tipo !== 'collegato' && e.tipo !== 'nome') return undefined
      const p = e.progetto
      const io = d.io()
      if (p.proprietario !== undefined && p.proprietario !== io.id) return `«${vecchio}» è il workspace di un progetto che vive su ${nomePc(p.proprietario)}: il nome deve restare uguale alla cartella. Rinominalo da «Gestione progetti» (lo fa ${nomePc(p.proprietario)}).`
      if (p.proprietario === undefined || p.percorso === undefined || !d.esiste(p.percorso)) return undefined
      const n = nomeComune(nuovo)
      if (!n.ok) return n.motivo
      if (n.nome !== nuovo.trim()) return `Il nome vale anche per la cartella del progetto: usa «${n.nome}».`
      if (nomeCartellaDi(p) === n.nome) return undefined
      const r = await rinominaQui(p.id, n.nome, { rinominaWs: false, wsEscluso: vecchio })
      return r.ok ? undefined : r.messaggio
    },

    async avanza() {
      const s = d.stato.leggi()
      let cambiatoQui = false
      const limite = adesso() - GIORNI_RICHIESTE * 86_400_000
      const richieste: Richiesta[] = []
      for (const r of s.richieste) {
        if (r.stato !== 'attesa') { if (Date.parse(r.quando) > limite) richieste.push(r); else cambiatoQui = true; continue }
        const e = r.voce !== undefined ? await d.posta.esito(r.pc, r.voce).catch(() => undefined) : undefined
        if (e === undefined || e.stato === 'attesa') { richieste.push(r); continue }
        cambiatoQui = true
        richieste.push({ ...r, stato: e.stato === 'consegnata' ? 'fatta' : 'fallita', ...(e.esito !== undefined ? { esito: e.esito } : {}) })
        d.log(`[gestione] ${r.tipo} di «${r.nome}» su ${r.pcNome}: ${e.stato === 'consegnata' ? 'fatto' : 'non riuscito'}${e.esito !== undefined ? ` (${e.esito})` : ''}`)
      }
      // Alla fine di un «Elimina ovunque»: i file sul Drive.
      const eliminazioni: Eliminazione[] = []
      for (const el of s.eliminazioni) {
        if (el.driveTolto !== undefined) { eliminazioni.push(el); continue }
        const sue = richieste.filter((r) => el.richieste.includes(r.id))
        const tutte = sue.length === el.richieste.length && sue.every((r) => r.stato === 'fatta')
        if (!tutte) { eliminazioni.push(el); continue }
        const e = await d.togliDalDrive(el.progetto)
        cambiatoQui = true
        if (e.ok) { eliminazioni.push({ ...el, driveTolto: iso() }); d.log(`[gestione] «${el.nome}»: ${e.tolti ?? 0} file tolti dal Drive, eliminazione finita`) } else eliminazioni.push({ ...el, driveErrore: e.messaggio ?? 'il Drive non risponde' })
      }
      if (cambiatoQui) { d.stato.scrivi({ ...d.stato.leggi(), richieste, eliminazioni }); d.avvisa?.() }
    }
  }
  return g
}
