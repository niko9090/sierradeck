import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import { aggiungiPaneA, type Archivio, type LayoutSalvato, type WorkspaceSalvato } from '@shared/workspace'
import { dentroCartella, workspaceDelGruppo } from '@shared/progetti-unificati'
import {
  eNota, esclusaDallUnione, nomeCartellaCopia, pianoUnione, scegliDestinazione, testoRiassunto,
  type CopiaDaUnire, type OpFile, type PianoUnione, type RiassuntoResidenza, type StatoResidenza
} from '@shared/residenza'
import { RECUPERO_GIORNI, type VoceFile } from '@shared/rimozione-sicura'
import { elencaFile, FILE_MAX, ripristinaDaRecupero, spostaCartellaInRecupero } from './rimozione-sicura'
import type { Manifesto } from './cassaforte/incrementale'
import type { ProgettoDrive, RegistroProgettiStore } from './progetti/registro'

/**
 * «Rendi residente» con analisi e unione (0.60.0). Le regole in
 * `@shared/residenza`; qui il disco, il Drive, le chat e i workspace.
 *
 * `avvia` non tocca niente: raccoglie e confronta, e lascia un riassunto.
 * `conferma` unisce: file nella cartella che resta (le versioni scartate nei
 * recuperati), trascrizioni delle chat sotto la cartella che resta, workspace
 * doppi fusi in uno, doppioni del registro uniti al principale, casa di tutte
 * le chat su questo PC, cartelle doppie nella cartella di recupero (30 giorni).
 * Ogni passo va nel registro con `[residente]`. `annullaUnione` rimette tutto
 * com'era (le case no: si sceglie di nuovo). Niente si cancella, mai.
 */

export type GruppoPerResidenza = {
  id: string
  nome: string
  chiave: string
  ids: string[]
  /** Le cartelle di qui: registrate per uno dei suoi id, o trovate per nome. */
  candidati: { percorso: string; registrata: boolean }[]
  /** Dove crearlo se qui non c'è nessuna cartella. */
  nuova: string
  /** Gli id i cui file sul Drive sono copie di altri PC (non quella di una cartella di qui). */
  drive: { id: string; etichetta: string }[]
}

export type ChatDiCartella = { sessione: string; jsonl: string; cwd: string; mtime?: number }

/** Il passo dell'analisi in corso, per la schermata del trasloco: «Confronto i file di … 2/5». */
export type AvanzaAnalisi = (testo: string, fatto: number, totale: number) => void

export type Residenza = {
  avvia: (progetto: string, avanza?: AvanzaAnalisi) => Promise<StatoResidenza>
  conferma: (progetto: string) => Promise<StatoResidenza>
  annulla: (progetto: string) => StatoResidenza
  stati: () => StatoResidenza[]
  /** Le unioni degli ultimi 30 giorni, annullabili. */
  unioni: () => { id: string; progetto: string; nome: string; quando: string; destinazione: string; scadeIl: string }[]
  annullaUnione: (id: string) => Promise<{ ok: boolean; messaggio: string }>
}

type Analisi = {
  gruppo: GruppoPerResidenza
  destinazione: string
  nuova: boolean
  git: boolean
  copie: (CopiaDaUnire & { percorso?: string; driveId?: string })[]
  piano: PianoUnione
  manifesto?: Manifesto
  workspace: { tiene: string; uniti: string[] }
  chatDelProgetto: string[]
  riassunto: RiassuntoResidenza
}

/** Quello che serve per «Annulla l'unione», salvato in `<dati>/unioni/<id>.json`. */
type RegistroUnione = {
  id: string
  progetto: string
  nome: string
  quando: string
  destinazione: string
  creata: boolean
  recuperati: string
  aggiunti: string[]
  sostituiti: { percorso: string; vecchio: string }[]
  cartelle: { percorso: string; recupero?: string }[]
  /**
   * `copiata`: la trascrizione sotto la cartella che resta l'ha scritta
   * l'unione; `primaIn`: dov'è finita quella che c'era prima (più corta).
   */
  trascrizioni: { sessione: string; da: string; a: string; vecchiaIn?: string; copiata?: boolean; primaIn?: string }[]
  /** I workspace toccati, com'erano prima; `nuovo` = non c'era. */
  workspacePrima: { nome: string; prima?: WorkspaceSalvato }[]
  registroPrima: ProgettoDrive[]
  annullataIl?: string
}

const sha256 = (b: Buffer): string => createHash('sha256').update(b).digest('hex')

/** Un percorso relativo che resta dentro la sua radice. */
function dentro(radice: string, rel: string): string | undefined {
  const r = rel.replace(/\\/g, '/')
  if (r === '' || r.startsWith('/') || /^[A-Za-z]:/.test(r) || r.split('/').some((x) => x === '..' || x === '')) return undefined
  return join(radice, ...r.split('/'))
}

/** Un nome libero: mai sopra un file che c'è già («nome (2).ext»). */
function libero(p: string): string {
  if (!existsSync(p)) return p
  const i = p.lastIndexOf('.')
  const slash = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'))
  const [base, ext] = i > slash ? [p.slice(0, i), p.slice(i)] : [p, '']
  for (let n = 2; n < 1000; n += 1) if (!existsSync(`${base} (${n})${ext}`)) return `${base} (${n})${ext}`
  return `${base} (${Date.now()})${ext}`
}

function scriviFile(p: string, contenuto: Buffer, mtime?: number): void {
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, contenuto, { flag: 'wx' })
  if (mtime !== undefined && mtime > 0) { try { utimesSync(p, new Date(mtime), new Date(mtime)) } catch { /* l'ora non è essenziale */ } }
}

function sposta(da: string, a: string): void {
  mkdirSync(dirname(a), { recursive: true })
  renameSync(da, a)
}

export function creaResidenza(deps: {
  dati: string
  io: () => { id: string; nome: string }
  gruppo: (progetto: string) => GruppoPerResidenza | undefined
  manifesto: () => Promise<Manifesto | undefined>
  leggiFileDrive: (percorso: string, manifesto: Manifesto) => Promise<Buffer | undefined>
  /** Le chat di questo PC con la cartella dentro quella data. */
  chatDi: (cartella: string) => ChatDiCartella[]
  /** Tutte le sessioni del progetto (qui, sugli altri PC, sul Drive) e quante solo altrove. */
  chatDelProgetto: (progetto: string) => { tutte: string[]; altrove: number }
  /** La cartella di Claude Code dove vanno le trascrizioni di una cartella di lavoro. */
  cartellaTrascrizioni: (cwd: string) => string
  workspace: { leggi: () => Archivio; scrivi: (a: Archivio) => boolean; aperti: () => string[] }
  inUso: (cartella: string) => string | undefined
  /** La casa di queste chat (e dei `progetto:<id>`) diventa questo PC: la strada di «Ospitata da». */
  scegliCasa: (sessioni: string[]) => Promise<{ ok: boolean; messaggio: string }>
  registro: RegistroProgettiStore
  togliWorkspaceDalDrive?: (nome: string) => Promise<unknown>
  log?: (m: string) => void
  avvisa?: () => void
  adesso?: () => number
}): Residenza {
  const adesso = deps.adesso ?? (() => Date.now())
  const iso = (): string => new Date(adesso()).toISOString()
  const log = (m: string): void => deps.log?.(`[residente] ${m}`)
  const stati = new Map<string, StatoResidenza>()
  const analisi = new Map<string, Analisi>()
  const cartellaUnioni = join(deps.dati, 'unioni')
  const metti = (s: StatoResidenza): StatoResidenza => { stati.set(s.progetto, s); deps.avvisa?.(); return s }
  const scartaGit = (r: string): boolean => esclusaDallUnione(r)

  const leggiUnione = (id: string): RegistroUnione | undefined => {
    try { return JSON.parse(readFileSync(join(cartellaUnioni, `${id.replace(/[^A-Za-z0-9_-]/g, '')}.json`), 'utf8')) as RegistroUnione } catch { return undefined }
  }
  const scriviUnione = (u: RegistroUnione): void => {
    mkdirSync(cartellaUnioni, { recursive: true })
    scriviJsonAtomico(join(cartellaUnioni, `${u.id}.json`), u, 'residente')
  }

  const avvia = async (progetto: string, avanza?: AvanzaAnalisi): Promise<StatoResidenza> => {
    const g = deps.gruppo(progetto)
    const base = { progetto, nome: g?.nome ?? progetto, quando: iso() }
    if (g === undefined) return metti({ ...base, fase: 'errore', messaggio: 'Questo progetto non è più nel registro: aggiorna il pannello.' })
    const prima = stati.get(g.id)
    if (prima?.fase === 'unisco' || prima?.fase === 'analisi') return prima
    const io = deps.io()
    metti({ ...base, progetto: g.id, fase: 'analisi', messaggio: `Raccolgo le copie di «${g.nome}» e le confronto…` })
    log(`«${g.nome}»: analisi delle copie (${g.ids.length} id nel registro, ${g.candidati.length} cartelle di qui, ${g.drive.length} copie sul Drive)`)
    try {
      const esistenti = g.candidati.filter((c) => existsSync(c.percorso))
      const elenchi = new Map<string, VoceFile[]>()
      // L'avanzamento per la schermata del trasloco (0.65.0): una copia alla volta.
      const quanteCopie = esistenti.length + g.drive.length
      let copiaN = 0
      for (const c of esistenti) {
        copiaN += 1
        avanza?.(`Confronto i file di ${c.percorso}`, copiaN, quanteCopie)
        const e = await elencaFile(c.percorso, FILE_MAX, scartaGit)
        if (!Array.isArray(e)) return metti({ ...base, progetto: g.id, fase: 'errore', messaggio: `${c.percorso} ha più di ${FILE_MAX} file: non lo confronto e non unisco niente, per non rischiare di perdere qualcosa.` })
        elenchi.set(c.percorso, e)
      }
      const ultimaChat = (p: string): number => Math.max(0, ...deps.chatDi(p).map((x) => x.mtime ?? 0))
      const scelta = scegliDestinazione(esistenti.map((c) => ({ percorso: c.percorso, registrata: c.registrata, ultimaChat: ultimaChat(c.percorso), file: elenchi.get(c.percorso)?.length ?? 0 })))
      const destinazione = scelta?.percorso ?? g.nuova
      const nuova = scelta === undefined
      const git = existsSync(join(destinazione, '.git'))
      const copie: Analisi['copie'] = esistenti.filter((c) => c.percorso !== destinazione).map((c) => ({
        chiave: `cartella:${c.percorso}`, tipo: 'cartella', etichetta: c.percorso, percorso: c.percorso, file: elenchi.get(c.percorso) ?? []
      }))
      const manifesto = g.drive.length > 0 ? await deps.manifesto().catch(() => undefined) : undefined
      let senzaDrive = false
      if (g.drive.length > 0 && manifesto === undefined) senzaDrive = true
      for (const d of g.drive) {
        if (manifesto === undefined) break
        copiaN += 1
        avanza?.(`Confronto i file della copia ${d.etichetta}`, copiaN, quanteCopie)
        const prefisso = `progetto-${d.id}/`
        const file: VoceFile[] = []
        for (const [percorso, v] of Object.entries(manifesto.file)) {
          if (!percorso.startsWith(prefisso) || v.sha === undefined) continue
          file.push({ percorso: percorso.slice(prefisso.length), size: v.size, mtime: v.mtime, sha: v.sha })
        }
        if (file.length > 0) copie.push({ chiave: `drive:${d.id}`, tipo: 'drive', etichetta: d.etichetta, driveId: d.id, file })
      }
      const piano = pianoUnione({ file: elenchi.get(destinazione) ?? [], git }, copie)
      const tutti = deps.workspace.leggi().workspace.map((w) => w.nome)
      const ws = workspaceDelGruppo(tutti, g)
      const aperti = deps.workspace.aperti()
      const tiene = ws.find((n) => aperti.includes(n)) ?? ws[0] ?? g.nome
      const uniti = ws.filter((n) => n !== tiene && !aperti.includes(n))
      const apertiNonUniti = ws.filter((n) => n !== tiene && aperti.includes(n))
      const chatP = deps.chatDelProgetto(g.id)
      const daSpostare = copie.filter((c) => c.tipo === 'cartella').reduce((s, c) => s + deps.chatDi(c.percorso as string).length, 0)
      const inUso = [destinazione, ...copie.filter((c) => c.tipo === 'cartella').map((c) => c.percorso as string)]
        .flatMap((p) => { const u = deps.inUso(p); return u === undefined ? [] : [`${p}: ${u}`] })
      const quando = iso()
      const recuperati = `.sierradeck/recuperati/unione-${quando.slice(0, 19).replace(/[:T]/g, '-')}`
      const tuttiOp = [...piano.aggiungi, ...piano.sostituisci, ...piano.recupera]
      const corpo: Omit<RiassuntoResidenza, 'righe'> = {
        nome: g.nome, pcNome: io.nome, destinazione, nuova, git,
        copie: copie.map((c) => ({ chiave: c.chiave, tipo: c.tipo, etichetta: c.etichetta, ...(piano.perCopia[c.chiave] ?? { uguali: 0, aggiunti: 0, sostituiti: 0, recuperati: 0, esclusi: 0 }), vaInRecupero: c.tipo === 'cartella' })),
        file: { uguali: piano.uguali, aggiunti: piano.aggiungi.length, sostituiti: piano.sostituisci.length, recuperati: piano.recupera.length, note: tuttiOp.filter((o) => eNota(o.voce.percorso)).length },
        chat: { daSpostare, delProgetto: chatP.tutte.length, daAltriPc: chatP.altrove },
        workspace: { tiene, uniti, aperti: apertiNonUniti },
        registro: { principale: g.id, uniti: g.ids.filter((x) => x !== g.id) },
        recupero: copie.filter((c) => c.tipo === 'cartella').map((c) => c.percorso as string),
        inUso,
        recuperati
      }
      const righe = testoRiassunto(corpo)
      if (senzaDrive) righe.splice(1, 0, 'Il Drive adesso non si legge: unisco solo le copie di questo PC. Le copie degli altri PC restano sul Drive, e si possono unire rifacendo l’analisi quando il Drive risponde.')
      const riassunto: RiassuntoResidenza = { ...corpo, righe }
      analisi.set(g.id, { gruppo: g, destinazione, nuova, git, copie, piano, ...(manifesto !== undefined ? { manifesto } : {}), workspace: { tiene, uniti }, chatDelProgetto: chatP.tutte, riassunto })
      log(`«${g.nome}»: resta ${destinazione}${nuova ? ' (da creare)' : ''}; ${copie.length} copie; file ${piano.uguali} uguali, ${piano.aggiungi.length} da aggiungere, ${piano.sostituisci.length} da sostituire, ${piano.recupera.length} nei recuperati; workspace ${uniti.length > 0 ? `${uniti.join(', ')} in «${tiene}»` : `«${tiene}»`}; ${chatP.tutte.length} chat. Aspetto la conferma.`)
      return metti({ ...base, progetto: g.id, fase: 'attesa-conferma', messaggio: righe.join(' '), riassunto })
    } catch (err) {
      log(`«${g.nome}»: analisi non riuscita — ${String(err)}`)
      return metti({ ...base, progetto: g.id, fase: 'errore', messaggio: `L’analisi non è riuscita: ${err instanceof Error ? err.message : String(err)}. Non ho toccato niente.` })
    }
  }

  /** Il contenuto di una versione: dalla sua cartella o dal Drive, controllato con l'impronta. */
  const contenuto = async (a: Analisi, op: OpFile): Promise<Buffer> => {
    const c = a.copie.find((x) => x.chiave === op.copia)
    if (c === undefined) throw new Error('copia sconosciuta')
    let b: Buffer | undefined
    if (c.tipo === 'cartella') {
      const p = dentro(c.percorso as string, op.voce.percorso)
      if (p === undefined) throw new Error('percorso non sicuro')
      b = readFileSync(p)
    } else {
      if (a.manifesto === undefined) throw new Error('Drive non letto')
      b = await deps.leggiFileDrive(`progetto-${c.driveId as string}/${op.voce.percorso}`, a.manifesto)
      if (b === undefined) throw new Error('non scaricato dal Drive')
    }
    if (sha256(b) !== op.voce.sha) throw new Error('il contenuto è cambiato dopo l’analisi')
    return b
  }

  const conferma = async (progetto: string): Promise<StatoResidenza> => {
    const st = stati.get(progetto)
    const a = analisi.get(progetto)
    if (st === undefined || a === undefined || (st.fase !== 'attesa-conferma' && st.fase !== 'in-uso')) {
      return st ?? { progetto, nome: progetto, fase: 'errore', messaggio: 'Prima serve l’analisi: «Rendi residente qui».', quando: iso() }
    }
    const g = a.gruppo
    const io = deps.io()
    const quando = iso()
    const id = `${g.nome.replace(/[^A-Za-z0-9_-]+/g, '-')}-${quando.replace(/[:.]/g, '-')}`
    metti({ ...st, fase: 'unisco', messaggio: `Unisco le copie di «${g.nome}» in ${a.destinazione}…`, quando })
    log(`«${g.nome}»: conferma di Nicholas, unisco in ${a.destinazione}`)
    const dest = a.destinazione
    const rec = a.riassunto.recuperati
    const u: RegistroUnione = {
      id, progetto: g.id, nome: g.nome, quando, destinazione: dest, creata: a.nuova && !existsSync(dest), recuperati: rec,
      aggiunti: [], sostituiti: [], cartelle: [], trascrizioni: [], workspacePrima: [],
      registroPrima: deps.registro.leggi().progetti.filter((x) => g.ids.includes(x.id))
    }
    const errori: string[] = []
    try {
      mkdirSync(dest, { recursive: true })
      // 1. I file: le versioni che entrano, e quelle che vanno nei recuperati. Mai sopra un file.
      // Nei recuperati, una cartella per copia di provenienza, con un nome corto e leggibile.
      const etichetta = (op: OpFile): string => {
        const c = a.copie.find((x) => x.chiave === op.copia)
        if (c === undefined) return nomeCartellaCopia(op.copia)
        return nomeCartellaCopia(c.tipo === 'cartella' ? `cartella-${basename(c.percorso as string)}` : `drive-${(c.driveId ?? '').slice(0, 8)}`)
      }
      for (const op of a.piano.sostituisci) {
        try {
          const b = await contenuto(a, op)
          const qui = dentro(dest, op.voce.percorso)
          if (qui === undefined) throw new Error('percorso non sicuro')
          const vecchio = libero(dentro(join(dest, rec), `prima-dell-unione/${op.voce.percorso}`) as string)
          if (existsSync(qui)) sposta(qui, vecchio)
          scriviFile(qui, b, op.voce.mtime)
          u.sostituiti.push({ percorso: op.voce.percorso, vecchio: relative(dest, vecchio).replace(/\\/g, '/') })
        } catch (err) { errori.push(`${op.voce.percorso}: ${String(err instanceof Error ? err.message : err)}`) }
      }
      for (const op of a.piano.aggiungi) {
        try {
          const b = await contenuto(a, op)
          let qui = dentro(dest, op.voce.percorso)
          if (qui === undefined) throw new Error('percorso non sicuro')
          // Nel frattempo è comparso: la versione va nei recuperati, non sopra.
          if (existsSync(qui)) { qui = libero(dentro(join(dest, rec), `${etichetta(op)}/${op.voce.percorso}`) as string); scriviFile(qui, b, op.voce.mtime); continue }
          scriviFile(qui, b, op.voce.mtime)
          u.aggiunti.push(op.voce.percorso)
        } catch (err) { errori.push(`${op.voce.percorso}: ${String(err instanceof Error ? err.message : err)}`) }
      }
      for (const op of a.piano.recupera) {
        try {
          const b = await contenuto(a, op)
          const qui = dentro(join(dest, rec), `${etichetta(op)}/${op.voce.percorso}`)
          if (qui === undefined) throw new Error('percorso non sicuro')
          scriviFile(libero(qui), b, op.voce.mtime)
        } catch (err) { errori.push(`${op.voce.percorso}: ${String(err instanceof Error ? err.message : err)}`) }
      }
      log(`«${g.nome}»: file — ${u.aggiunti.length} aggiunti, ${u.sostituiti.length} sostituiti (i vecchi nei recuperati), ${a.piano.recupera.length} versioni nei recuperati${errori.length > 0 ? `, ${errori.length} non riusciti` : ''}`)

      // 2. Le chat delle cartelle doppie: la trascrizione va sotto la cartella che resta.
      const nuovaCwd = (copia: string, cwd: string): string => {
        const resto = cwd.replace(/\//g, '\\').slice(copia.replace(/[\\/]+$/, '').length).replace(/^\\+/, '')
        return resto === '' ? dest : join(dest, resto)
      }
      const copieCartella = a.copie.filter((c) => c.tipo === 'cartella').map((c) => c.percorso as string)
      for (const copia of copieCartella) {
        for (const c of deps.chatDi(copia)) {
          try {
            const a2 = join(deps.cartellaTrascrizioni(nuovaCwd(copia, c.cwd)), `${c.sessione}.jsonl`)
            if (a2.toLowerCase() === c.jsonl.toLowerCase()) continue
            const lunga = existsSync(a2) ? statSync(a2).size : -1
            const vecchiaIn = libero(join(copia, '.sierradeck', 'trascrizioni-spostate', `${c.sessione}.jsonl`))
            if (lunga >= 0 && lunga >= statSync(c.jsonl).size) {
              // Quella che resta è già la più lunga: la vecchia va con la sua cartella nel recupero.
              sposta(c.jsonl, vecchiaIn)
              u.trascrizioni.push({ sessione: c.sessione, da: c.jsonl, a: a2, vecchiaIn })
            } else {
              const primaIn = lunga >= 0 ? libero(join(dest, rec, 'trascrizioni', `${c.sessione}.jsonl`)) : undefined
              if (primaIn !== undefined) sposta(a2, primaIn)
              mkdirSync(dirname(a2), { recursive: true })
              copyFileSync(c.jsonl, a2)
              sposta(c.jsonl, vecchiaIn)
              u.trascrizioni.push({ sessione: c.sessione, da: c.jsonl, a: a2, vecchiaIn, copiata: true, ...(primaIn !== undefined ? { primaIn } : {}) })
            }
          } catch (err) { errori.push(`chat ${c.sessione.slice(0, 8)}: ${String(err instanceof Error ? err.message : err)}`) }
        }
      }

      // 3. I workspace: i doppi entrano in quello che resta; le chat delle cartelle doppie puntano a quella che resta.
      const arch = deps.workspace.leggi()
      const toccati = new Map<string, WorkspaceSalvato | undefined>()
      const rimappa = (l: LayoutSalvato): LayoutSalvato => {
        let cambiato = false
        const panes = l.panes.map((p) => {
          const copia = copieCartella.find((c) => dentroCartella(p.cwd, c))
          if (copia === undefined) return p
          cambiato = true
          return { ...p, cwd: nuovaCwd(copia, p.cwd) }
        })
        return cambiato ? { ...l, panes } : l
      }
      let workspace = arch.workspace.map((w) => {
        const perSlot: Record<string, LayoutSalvato> = {}
        let cambiato = false
        for (const [slot, l] of Object.entries(w.perSlot)) { const r = rimappa(l); if (r !== l) cambiato = true; perSlot[slot] = r }
        if (!cambiato) return w
        toccati.set(w.nome, w)
        return { ...w, perSlot }
      })
      const tieneNome = a.workspace.tiene
      let tiene = workspace.find((w) => w.nome === tieneNome)
      if (tiene === undefined) { tiene = { nome: tieneNome, perSlot: {} }; workspace = [...workspace, tiene]; toccati.set(tieneNome, undefined) }
      else if (!toccati.has(tieneNome)) toccati.set(tieneNome, arch.workspace.find((w) => w.nome === tieneNome))
      for (const nome of a.workspace.uniti) {
        const w = workspace.find((x) => x.nome === nome)
        if (w === undefined) continue
        if (!toccati.has(nome)) toccati.set(nome, arch.workspace.find((x) => x.nome === nome))
        const perSlot: Record<string, LayoutSalvato> = { ...(tiene as WorkspaceSalvato).perSlot }
        for (const [slot, l] of Object.entries(w.perSlot)) {
          let unito: LayoutSalvato = perSlot[slot] ?? { root: undefined, panes: [] }
          for (const pane of l.panes) unito = aggiungiPaneA(unito, pane)
          perSlot[slot] = unito
        }
        tiene = { ...tiene, perSlot }
        workspace = workspace.filter((x) => x.nome !== nome)
      }
      workspace = workspace.map((w) => (w.nome === tieneNome ? tiene as WorkspaceSalvato : w))
      u.workspacePrima = [...toccati].map(([nome, prima]) => ({ nome, ...(prima !== undefined ? { prima } : {}) }))
      if (toccati.size > 0 && !deps.workspace.scrivi({ ...arch, workspace })) errori.push('archivio dei workspace non riscritto')
      // Sul Drive la lapide: il doppio non torna con il prossimo salvataggio di un altro PC («Rimetti» lo riporta).
      if (deps.togliWorkspaceDalDrive !== undefined) for (const nome of a.workspace.uniti) await deps.togliWorkspaceDalDrive(nome).catch(() => undefined)
      if (a.workspace.uniti.length > 0) log(`«${g.nome}»: workspace ${a.workspace.uniti.map((w) => `«${w}»`).join(', ')} uniti in «${tieneNome}»`)

      // 4. Il registro: un progetto solo, con la cartella che resta.
      const reg = deps.registro.leggi()
      deps.registro.scrivi({
        ...reg,
        progetti: reg.progetti.map((p) => {
          if (!g.ids.includes(p.id)) return p
          const percorsi = { ...p.percorsi }
          // Il principale prende il nome pulito del gruppo («Sito», non «sito (2)»).
          if (p.id === g.id) return { ...p, nome: g.nome, percorsi: { ...percorsi, [io.id]: dest } }
          delete percorsi[io.id]
          return { ...p, percorsi, unitoIn: g.id, unitoIl: quando }
        })
      })
      if (g.ids.length > 1) log(`«${g.nome}»: registro — ${g.ids.length - 1} doppioni uniti al principale`)

      // 5. La casa: tutte le chat del progetto e il progetto stesso su questo PC.
      const casa = await deps.scegliCasa([...a.chatDelProgetto, ...g.ids.map((x) => `progetto:${x}`)])
      if (!casa.ok) errori.push(`casa: ${casa.messaggio}`)

      // 6. Le cartelle doppie nella cartella di recupero (30 giorni). In uso: restano, e si dice.
      const restate: string[] = []
      for (const copia of copieCartella) {
        const uso = deps.inUso(copia)
        if (uso !== undefined) { restate.push(`${copia} (${uso})`); u.cartelle.push({ percorso: copia }); continue }
        const r = spostaCartellaInRecupero(deps.dati, copia, { progetto: g.id, nome: g.nome, quando, motivo: `unita in ${dest} da «Rendi residente» (${io.nome})` })
        if (r.ok) u.cartelle.push({ percorso: copia, recupero: r.id })
        else { restate.push(`${copia} (${r.messaggio})`); u.cartelle.push({ percorso: copia }) }
      }
      scriviUnione(u)
      const n = (x: number, uno: string, tanti: string): string => `${x} ${x === 1 ? uno : tanti}`
      const inRecupero = u.cartelle.filter((c) => c.recupero !== undefined).length
      const fatto = [
        `«${g.nome}» è unito in ${dest} e vive su questo PC (${io.nome}).`,
        `${n(u.aggiunti.length, 'file aggiunto', 'file aggiunti')}, ${n(u.sostituiti.length, 'sostituito', 'sostituiti')}, ${n(a.piano.recupera.length + u.sostituiti.length, 'versione', 'versioni')} in ${rec}.`,
        inRecupero > 0 ? `${n(inRecupero, 'cartella doppia', 'cartelle doppie')} nella cartella di recupero per ${RECUPERO_GIORNI} giorni.` : '',
        restate.length > 0 ? `Non spostate (in uso): ${restate.join('; ')} — riprova «Unisci qui le copie» quando sono libere.` : '',
        errori.length > 0 ? `Non riuscito: ${errori.slice(0, 6).join('; ')}${errori.length > 6 ? ` e altri ${errori.length - 6}` : ''}.` : '',
        '«Annulla l’unione» rimette tutto com’era per 30 giorni.'
      ].filter((x) => x !== '')
      log(`«${g.nome}»: unione fatta (${id})${restate.length > 0 ? `; restano ${restate.length} cartelle in uso` : ''}${errori.length > 0 ? `; ${errori.length} errori: ${errori.slice(0, 3).join('; ')}` : ''}`)
      analisi.delete(g.id)
      return metti({ progetto: g.id, nome: g.nome, fase: 'fatta', messaggio: fatto.join(' '), quando: iso(), unione: id })
    } catch (err) {
      try { scriviUnione(u) } catch { /* il registro dell'unione è il meglio che si può */ }
      log(`«${g.nome}»: unione interrotta — ${String(err)}`)
      return metti({ progetto: g.id, nome: g.nome, fase: 'errore', messaggio: `L’unione si è fermata: ${err instanceof Error ? err.message : String(err)}. Quello che è già stato fatto si rimette com’era con «Annulla l’unione».`, quando: iso(), unione: id })
    }
  }

  return {
    avvia,
    conferma,
    annulla(progetto) {
      const st = stati.get(progetto)
      analisi.delete(progetto)
      log(`«${st?.nome ?? progetto}»: annullato da Nicholas, niente toccato`)
      return metti({ progetto, nome: st?.nome ?? progetto, fase: 'annullata', messaggio: 'Annullato: niente è stato toccato. Il residente resta quello di prima.', quando: iso() })
    },
    stati: () => [...stati.values()],
    unioni() {
      if (!existsSync(cartellaUnioni)) return []
      const limite = adesso() - RECUPERO_GIORNI * 86_400_000
      return readdirSync(cartellaUnioni).filter((n) => n.endsWith('.json')).flatMap((n) => {
        const u = leggiUnione(n.slice(0, -5))
        if (u === undefined || u.annullataIl !== undefined || Date.parse(u.quando) < limite) return []
        return [{ id: u.id, progetto: u.progetto, nome: u.nome, quando: u.quando, destinazione: u.destinazione, scadeIl: new Date(Date.parse(u.quando) + RECUPERO_GIORNI * 86_400_000).toISOString() }]
      }).sort((a, b) => b.quando.localeCompare(a.quando))
    },
    async annullaUnione(idUnione) {
      const u = leggiUnione(idUnione)
      if (u === undefined || u.annullataIl !== undefined) return { ok: false, messaggio: 'Questa unione non c’è più, o è già stata annullata.' }
      const quando = iso()
      const via = join(u.destinazione, `.sierradeck/recuperati/annullato-${quando.slice(0, 19).replace(/[:T]/g, '-')}`)
      const problemi: string[] = []
      // Le cartelle doppie tornano al loro posto.
      for (const c of u.cartelle) {
        if (c.recupero === undefined) continue
        const r = ripristinaDaRecupero(deps.dati, c.recupero, quando)
        if (!r.ok) problemi.push(`${c.percorso}: ${r.messaggio}`)
      }
      // I file: gli aggiunti escono (nei recuperati, non cancellati), i sostituiti tornano.
      for (const p of u.aggiunti) {
        const qui = dentro(u.destinazione, p)
        if (qui !== undefined && existsSync(qui)) { try { sposta(qui, libero(join(via, ...p.split('/')))) } catch (err) { problemi.push(`${p}: ${String(err)}`) } }
      }
      for (const s of u.sostituiti) {
        const qui = dentro(u.destinazione, s.percorso)
        const vecchio = dentro(u.destinazione, s.vecchio)
        if (qui === undefined || vecchio === undefined || !existsSync(vecchio)) { problemi.push(`${s.percorso}: la versione di prima non c’è più`); continue }
        try { if (existsSync(qui)) sposta(qui, libero(join(via, ...s.percorso.split('/')))); sposta(vecchio, qui) } catch (err) { problemi.push(`${s.percorso}: ${String(err)}`) }
      }
      // Le trascrizioni tornano dov'erano; la copia nuova esce.
      for (const t of u.trascrizioni) {
        try {
          // La cartella è tornata: la trascrizione vecchia è dentro di lei.
          if (t.vecchiaIn !== undefined && existsSync(t.vecchiaIn) && !existsSync(t.da)) sposta(t.vecchiaIn, t.da)
          // Solo quella scritta dall'unione esce; quella che c'era prima torna.
          if (t.copiata === true && existsSync(t.a) && existsSync(t.da)) sposta(t.a, libero(join(via, 'trascrizioni', `${t.sessione}.jsonl`)))
          if (t.primaIn !== undefined && existsSync(t.primaIn) && !existsSync(t.a)) sposta(t.primaIn, t.a)
        } catch (err) { problemi.push(`chat ${t.sessione.slice(0, 8)}: ${String(err)}`) }
      }
      // I workspace com'erano.
      if (u.workspacePrima.length > 0) {
        const arch = deps.workspace.leggi()
        let workspace = [...arch.workspace]
        for (const w of u.workspacePrima) {
          workspace = workspace.filter((x) => x.nome !== w.nome)
          if (w.prima !== undefined) workspace.push(w.prima)
        }
        if (!deps.workspace.scrivi({ ...arch, workspace })) problemi.push('archivio dei workspace non riscritto')
      }
      // Il registro com'era (i doppioni separati di nuovo, con la data: vince sugli altri PC).
      const reg = deps.registro.leggi()
      deps.registro.scrivi({
        ...reg,
        progetti: reg.progetti.map((p) => {
          const prima = u.registroPrima.find((x) => x.id === p.id)
          if (prima === undefined) return p
          return { ...prima, unitoIn: prima.unitoIn ?? '', unitoIl: quando }
        })
      })
      scriviUnione({ ...u, annullataIl: quando })
      // Il pannello non dice più «Unito».
      if (stati.get(u.progetto)?.unione === u.id) metti({ progetto: u.progetto, nome: u.nome, fase: 'annullata', messaggio: 'Unione annullata.', quando })
      log(`«${u.nome}»: unione ${u.id} annullata${problemi.length > 0 ? `; problemi: ${problemi.slice(0, 4).join('; ')}` : ''}`)
      deps.avvisa?.()
      return {
        ok: problemi.length === 0,
        messaggio: `Unione di «${u.nome}» annullata: cartelle, file e workspace sono tornati com’erano${existsSync(via) ? ` (quello che era entrato è in ${via})` : ''}. La casa delle chat resta questo PC: se vuoi, scegline un’altra.${problemi.length > 0 ? ` Non riuscito: ${problemi.slice(0, 6).join('; ')}.` : ''}`
      }
    }
  }
}
