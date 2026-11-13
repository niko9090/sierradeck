import { chiaveProgetto, nomeCartellaDi, progettoDelWorkspace, type Collegamenti, type CollisioneNome } from './progetti-identita'

/**
 * **Gestione progetti** (13/11, Nicholas: «fammi uno strumento per definire
 * una volta per tutte dove e di chi sono i progetti, e anche eliminarli»).
 *
 * Una riga per **progetto vero**: gli id del registro con la stessa chiave
 * (`chiaveProgetto`) stanno nella stessa riga, segnati come doppioni. Per
 * ogni riga: chi ne è proprietario, la cartella là, le copie rimaste sugli
 * altri PC, i workspace collegati, i nomi che non coincidono, l'ultimo uso e
 * le richieste in viaggio. Le regole stanno qui, pure; il main ci mette i
 * dati veri (registro, battiti, workspace) e la finestra le disegna.
 */

export type PcGestione = { id: string; nome: string; acceso: boolean; battito?: string }

/** Quello che il battito di un PC dice dei suoi progetti (le copie e i workspace dal 13/11). */
export type LocaliGestione = {
  progetti?: { id: string; percorso: string }[]
  copie?: { id: string; percorso: string }[]
  workspace?: { nome: string; progetto?: string }[]
}

export type ProgettoGestioneIngresso = { id: string; nome: string; proprietario?: string; percorso?: string; aggiuntoIl?: string; proprietarioDal?: string }

/** Una richiesta mandata per posta a un PC (rinomina, elimina, pulisci, sposta) e come sta andando. */
export type RichiestaVista = {
  id: string
  tipo: TipoRichiesta
  progetto: string
  nome: string
  pc: string
  pcNome: string
  stato: 'attesa' | 'fatta' | 'fallita'
  esito?: string
  quando: string
}
export type TipoRichiesta = 'progetto-rinomina' | 'progetto-elimina' | 'progetto-pulisci-copia' | 'progetto-sposta-qui'

export type StatoMigrazioneNomi = {
  fattaIl: string
  rinominati: { da: string; a: string }[]
  collisioni: CollisioneNome[]
  /** «Torna come prima» già usato. */
  tornataIl?: string
}

export type IngressoGestione = {
  io: { id: string; nome: string }
  pc: PcGestione[]
  progetti: ProgettoGestioneIngresso[]
  /** I battiti degli altri PC, con le loro copie locali. */
  locali: Record<string, LocaliGestione | undefined>
  /** Le copie di qui dei progetti di altri PC (stesse regole del battito). */
  copieQui: { id: string; percorso: string }[]
  /** La cartella c'è su questo PC? (Solo per quelle di cui questo PC è proprietario.) */
  esisteQui: (percorso: string) => boolean
  workspaceQui: string[]
  collegamenti: Collegamenti
  /** I workspace con chat o autopiloti al lavoro adesso: per dire «occupato» prima di rinominare. */
  occupatiQui?: Record<string, string>
  ultimoUso?: Record<string, string>
  spazioDrive?: Record<string, { file: number; byte: number }>
  richieste?: RichiestaVista[]
  migrazione?: StatoMigrazioneNomi
  adesso: number
}

export type TipoProblemaGestione =
  | 'doppioni' | 'proprietari-diversi' | 'senza-proprietario' | 'proprietario-sconosciuto'
  | 'cartella-mancante' | 'nome-diverso' | 'copia-rimasta' | 'collisione' | 'senza-workspace'

export type ProblemaGestione = { tipo: TipoProblemaGestione; testo: string }

export type MembroGestione = {
  id: string
  nome: string
  proprietario?: string
  proprietarioNome?: string
  percorso?: string
  /** Solo se il proprietario è questo PC: la cartella c'è davvero. */
  cartellaEsiste?: boolean
  aggiuntoIl?: string
}

export type CopiaGestione = { pc: string; pcNome: string; percorso: string; qui: boolean; id: string }

export type WorkspaceGestione = {
  nome: string
  pc: string
  pcNome: string
  qui: boolean
  /** Collegato per id (non solo per nome). */
  collegato: boolean
  /** Il nome non è quello della cartella. */
  nomeDiverso: boolean
}

export type RigaGestione = {
  chiave: string
  /** L'id principale (quello che resta se si uniscono i doppioni senza scegliere). */
  id: string
  ids: string[]
  nome: string
  /** Il nome della cartella sul proprietario. */
  nomeCartella: string
  membri: MembroGestione[]
  proprietario?: { pc: string; nome: string; qui: boolean; acceso: boolean }
  percorso?: string
  cartellaQui: boolean
  copie: CopiaGestione[]
  workspace: WorkspaceGestione[]
  ultimoUso?: string
  spazioDrive?: { file: number; byte: number }
  richieste: RichiestaVista[]
  problemi: ProblemaGestione[]
  /** Dove si può spostare o assegnare (i PC che ne hanno già una cartella), per «Imposta proprietario». */
  candidatiProprietario: { pc: string; pcNome: string; percorso: string; id: string }[]
}

export type VistaGestione = {
  io: { id: string; nome: string }
  pc: PcGestione[]
  righe: RigaGestione[]
  /** I workspace di questo PC senza progetto: si possono collegare. */
  workspaceSoli: { nome: string; perche: 'nessuno' | 'scollegato' | 'tolto' | 'ambiguo' }[]
  collisioni: CollisioneNome[]
  migrazione?: StatoMigrazioneNomi
  letto: string
}

/** Il membro che fa da principale: collegato a un workspace di qui, poi con la cartella che c'è, poi con un proprietario, poi il più vecchio. */
function ordinaMembri(membri: ProgettoGestioneIngresso[], collegatiQui: Set<string>, vivo: (p: ProgettoGestioneIngresso) => boolean): ProgettoGestioneIngresso[] {
  return [...membri].sort((a, b) =>
    (collegatiQui.has(b.id) ? 1 : 0) - (collegatiQui.has(a.id) ? 1 : 0) ||
    (vivo(b) ? 1 : 0) - (vivo(a) ? 1 : 0) ||
    (b.proprietario !== undefined ? 1 : 0) - (a.proprietario !== undefined ? 1 : 0) ||
    (a.aggiuntoIl || '9').localeCompare(b.aggiuntoIl || '9') ||
    a.id.localeCompare(b.id))
}

export function costruisciGestione(p: IngressoGestione): VistaGestione {
  const pcs = [{ id: p.io.id, nome: p.io.nome, acceso: true }, ...p.pc.filter((x) => x.id !== p.io.id)]
  const nomeDi = (id: string): string => pcs.find((x) => x.id === id)?.nome ?? `PC ${id.slice(0, 6)}`
  const noto = (id: string): boolean => pcs.some((x) => x.id === id)
  const acceso = (id: string): boolean => pcs.find((x) => x.id === id)?.acceso === true

  // I workspace di ogni PC: qui dal file, gli altri dal battito.
  const collegatiQui = new Set(Object.values(p.collegamenti.collegati).map((l) => l.id))
  const wsDi: { nome: string; pc: string; progetto?: string }[] = [
    ...p.workspaceQui.map((nome) => {
      const e = progettoDelWorkspace(nome, p.collegamenti, p.progetti)
      return { nome, pc: p.io.id, ...(e.tipo === 'collegato' || e.tipo === 'nome' ? { progetto: e.progetto.id } : {}) }
    }),
    ...Object.entries(p.locali).flatMap(([pc, l]) => (pc === p.io.id ? [] : (l?.workspace ?? []).map((w) => ({ nome: w.nome, pc, ...(w.progetto !== undefined ? { progetto: w.progetto } : {}) }))))
  ]

  const vivo = (x: ProgettoGestioneIngresso): boolean => x.proprietario === p.io.id && x.percorso !== undefined && p.esisteQui(x.percorso)
  const gruppi = new Map<string, ProgettoGestioneIngresso[]>()
  for (const x of p.progetti) {
    const k = chiaveProgetto(x.nome)
    gruppi.set(k, [...(gruppi.get(k) ?? []), x])
  }

  const righe: RigaGestione[] = []
  for (const [chiave, membriGrezzi] of gruppi) {
    const ordinati = ordinaMembri(membriGrezzi, collegatiQui, vivo)
    const capo = ordinati[0] as ProgettoGestioneIngresso
    const ids = ordinati.map((m) => m.id)
    const idSet = new Set(ids)
    const membri: MembroGestione[] = ordinati.map((m) => ({
      id: m.id, nome: m.nome,
      ...(m.proprietario !== undefined ? { proprietario: m.proprietario, proprietarioNome: nomeDi(m.proprietario) } : {}),
      ...(m.percorso !== undefined ? { percorso: m.percorso } : {}),
      ...(m.proprietario === p.io.id && m.percorso !== undefined ? { cartellaEsiste: p.esisteQui(m.percorso) } : {}),
      ...(m.aggiuntoIl !== undefined && m.aggiuntoIl !== '' ? { aggiuntoIl: m.aggiuntoIl } : {})
    }))
    const nomeCartella = nomeCartellaDi(capo)
    const proprietario = capo.proprietario !== undefined
      ? { pc: capo.proprietario, nome: nomeDi(capo.proprietario), qui: capo.proprietario === p.io.id, acceso: capo.proprietario === p.io.id || acceso(capo.proprietario) }
      : undefined

    // Le copie rimaste: cartelle su PC che non ne sono proprietari.
    const copie: CopiaGestione[] = []
    const vistaCopia = new Set<string>()
    const metti = (c: CopiaGestione): void => {
      const k = `${c.pc}|${c.percorso.toLowerCase()}`
      if (vistaCopia.has(k)) return
      vistaCopia.add(k)
      copie.push(c)
    }
    for (const c of p.copieQui) if (idSet.has(c.id)) metti({ pc: p.io.id, pcNome: p.io.nome, percorso: c.percorso, qui: true, id: c.id })
    for (const [pc, l] of Object.entries(p.locali)) {
      if (pc === p.io.id) continue
      for (const c of l?.copie ?? []) if (idSet.has(c.id)) metti({ pc, pcNome: nomeDi(pc), percorso: c.percorso, qui: false, id: c.id })
      // Un doppione di cui quel PC è proprietario, ma che non è il principale: è una copia anche lui.
      for (const c of l?.progetti ?? []) if (idSet.has(c.id) && c.id !== capo.id) metti({ pc, pcNome: nomeDi(pc), percorso: c.percorso, qui: false, id: c.id })
    }
    for (const m of ordinati.slice(1)) {
      if (m.proprietario === p.io.id && m.percorso !== undefined && p.esisteQui(m.percorso)) metti({ pc: p.io.id, pcNome: p.io.nome, percorso: m.percorso, qui: true, id: m.id })
    }
    const copieVere = copie.filter((c) => !(proprietario !== undefined && c.pc === proprietario.pc && capo.percorso !== undefined && c.percorso.toLowerCase() === capo.percorso.toLowerCase()))

    const workspace: WorkspaceGestione[] = wsDi
      .filter((w) => (w.progetto !== undefined ? idSet.has(w.progetto) : false))
      .map((w) => ({
        nome: w.nome, pc: w.pc, pcNome: nomeDi(w.pc), qui: w.pc === p.io.id,
        collegato: w.pc === p.io.id ? p.collegamenti.collegati[w.nome] !== undefined : true,
        nomeDiverso: w.nome !== nomeCartella
      }))

    const problemi: ProblemaGestione[] = []
    if (ids.length > 1) {
      const proprietari = new Set(ordinati.map((m) => m.proprietario).filter((x): x is string => x !== undefined))
      problemi.push(proprietari.size > 1
        ? { tipo: 'proprietari-diversi', testo: `Doppione su ${proprietari.size} PC (${[...proprietari].map(nomeDi).join(', ')}): scegli quale tenere.` }
        : { tipo: 'doppioni', testo: `${ids.length} voci per lo stesso progetto: uniscile.` })
    }
    if (capo.proprietario === undefined) problemi.push({ tipo: 'senza-proprietario', testo: 'Nessun PC ne è proprietario.' })
    else if (!noto(capo.proprietario)) problemi.push({ tipo: 'proprietario-sconosciuto', testo: `Il proprietario (${nomeDi(capo.proprietario)}) non si è mai fatto vivo.` })
    if (proprietario?.qui === true && (capo.percorso === undefined || !p.esisteQui(capo.percorso))) problemi.push({ tipo: 'cartella-mancante', testo: `La cartella non c’è su questo PC${capo.percorso !== undefined ? ` (${capo.percorso})` : ''}.` })
    const diversi = workspace.filter((w) => w.nomeDiverso)
    if (diversi.length > 0) problemi.push({ tipo: 'nome-diverso', testo: `Workspace con un nome diverso dalla cartella «${nomeCartella}»: ${diversi.map((w) => `«${w.nome}»${w.qui ? '' : ` su ${w.pcNome}`}`).join(', ')}.` })
    if (copieVere.length > 0) problemi.push({ tipo: 'copia-rimasta', testo: `${copieVere.length === 1 ? 'Una copia rimasta' : `${copieVere.length} copie rimaste`} su ${[...new Set(copieVere.map((c) => c.pcNome))].join(', ')}.` })
    if (proprietario?.qui === true && !workspace.some((w) => w.qui)) problemi.push({ tipo: 'senza-workspace', testo: 'Nessun workspace su questo PC.' })

    // Chi può diventare proprietario senza spostare niente: chi ne ha già una cartella.
    const candidati: RigaGestione['candidatiProprietario'] = []
    const vistoC = new Set<string>()
    const candida = (pc: string, percorso: string, id: string): void => {
      if (vistoC.has(pc)) return
      vistoC.add(pc)
      candidati.push({ pc, pcNome: nomeDi(pc), percorso, id })
    }
    for (const m of ordinati) if (m.proprietario !== undefined && m.percorso !== undefined && (m.proprietario !== p.io.id || p.esisteQui(m.percorso))) candida(m.proprietario, m.percorso, m.id)
    for (const c of copie) candida(c.pc, c.percorso, c.id)

    const ultimi = ids.map((i) => p.ultimoUso?.[i]).filter((x): x is string => x !== undefined).sort()
    const spazi = ids.map((i) => p.spazioDrive?.[i]).filter((x): x is { file: number; byte: number } => x !== undefined)
    righe.push({
      chiave, id: capo.id, ids, nome: capo.nome, nomeCartella, membri,
      ...(proprietario !== undefined ? { proprietario } : {}),
      ...(capo.percorso !== undefined ? { percorso: capo.percorso } : {}),
      cartellaQui: vivo(capo),
      copie: copieVere,
      workspace,
      ...(ultimi.length > 0 ? { ultimoUso: ultimi[ultimi.length - 1] as string } : {}),
      ...(spazi.length > 0 ? { spazioDrive: { file: spazi.reduce((t, x) => t + x.file, 0), byte: spazi.reduce((t, x) => t + x.byte, 0) } } : {}),
      richieste: (p.richieste ?? []).filter((r) => idSet.has(r.progetto)),
      problemi,
      candidatiProprietario: candidati
    })
  }

  const collisioni = p.migrazione?.collisioni ?? []
  for (const c of collisioni) {
    for (const r of righe) {
      if (r.workspace.some((w) => w.qui && c.workspace.includes(w.nome)) && !r.problemi.some((x) => x.tipo === 'collisione')) {
        r.problemi.push({ tipo: 'collisione', testo: `Workspace non rinominato: ${c.perche}.` })
      }
    }
  }

  // Prima i progetti da sistemare, poi per nome.
  righe.sort((a, b) => (b.problemi.length > 0 ? 1 : 0) - (a.problemi.length > 0 ? 1 : 0) || a.nome.localeCompare(b.nome, 'it'))

  const workspaceSoli: VistaGestione['workspaceSoli'] = []
  for (const nome of p.workspaceQui) {
    const e = progettoDelWorkspace(nome, p.collegamenti, p.progetti)
    if (e.tipo === 'collegato' || e.tipo === 'nome') continue
    workspaceSoli.push({ nome, perche: e.tipo })
  }
  return {
    io: p.io, pc: pcs, righe, workspaceSoli, collisioni,
    ...(p.migrazione !== undefined ? { migrazione: p.migrazione } : {}),
    letto: new Date(p.adesso).toISOString()
  }
}

/* ------------------------------------------------------------------ */
/* I testi delle azioni: corti, con la spiegazione dietro il «?».       */
/* ------------------------------------------------------------------ */

export type IdAzioneGestione =
  | 'apri' | 'apri-remoto' | 'sposta' | 'imposta-proprietario' | 'unisci' | 'rinomina'
  | 'collega' | 'scollega' | 'togli-drive' | 'elimina-ovunque' | 'pulisci-copia' | 'torna-nomi'

export const TESTI_AZIONI: Record<IdAzioneGestione, { titolo: string; spiega: string; distruttiva?: boolean }> = {
  'apri': { titolo: 'Apri', spiega: 'Una chat nuova nella cartella del progetto, su questo PC.' },
  'apri-remoto': { titolo: 'Apri su…', spiega: 'Una chat nella cartella del progetto sul suo PC, che guardi da qui dal vivo.' },
  'sposta': { titolo: 'Sposta su…', spiega: 'Il progetto passa a un altro PC con «Sposta»: il PC di prima carica tutto sul Drive, quello nuovo scarica, controlla le impronte e solo allora diventa proprietario. La copia di prima va nel recupero per 30 giorni. Se il PC di arrivo è spento, la richiesta aspetta nella sua posta.' },
  'imposta-proprietario': { titolo: 'Imposta proprietario', spiega: 'Dice di quale PC è il progetto, senza spostare niente: usalo quando la cartella su quel PC c’è già. Gli altri PC lo vedono al prossimo giro del Drive.' },
  'unisci': { titolo: 'Unisci doppioni', spiega: 'Scegli la voce da tenere: le altre escono dall’elenco. Le cartelle sui PC non si toccano (se restano, compaiono come copie rimaste) e i file delle altre voci sul Drive restano finché non li togli.', distruttiva: true },
  'rinomina': { titolo: 'Rinomina', spiega: 'Cambia il nome della cartella del progetto sul suo PC e del workspace, insieme: restano sempre uguali. Le chat del progetto seguono la cartella. Non si fa mentre una chat o un autopilota lavora nel progetto. Se il proprietario è un altro PC, lo fa lui appena legge la posta.', distruttiva: true },
  'collega': { titolo: 'Collega', spiega: 'Lega un workspace di questo PC al progetto: da lì in poi il workspace segue il progetto anche se cambia nome.' },
  'scollega': { titolo: 'Scollega', spiega: 'Il workspace non è più legato al progetto (e non si ricollega da solo per nome). Niente si cancella.' },
  'togli-drive': { titolo: 'Togli dal Drive', spiega: 'Toglie il progetto dall’elenco e i suoi file dal Drive. Le cartelle sui PC restano dove sono.', distruttiva: true },
  'elimina-ovunque': { titolo: 'Elimina ovunque', spiega: 'Toglie il progetto da tutto: le cartelle su ogni PC vanno nel recupero per 30 giorni (ripristinabili), poi i file escono dal Drive. Un PC spento lo fa quando si riaccende. Il workspace resta: eliminalo dal suo menu se non serve.', distruttiva: true },
  'pulisci-copia': { titolo: 'Pulisci copia', spiega: 'Una cartella rimasta su un PC che non è il proprietario va nel recupero per 30 giorni, solo se è uguale alla copia sul Drive e nessuna chat ci lavora. Se no resta, e ti dice perché.', distruttiva: true },
  'torna-nomi': { titolo: 'Torna come prima', spiega: 'Rimette ai workspace i nomi che avevano prima della sistemazione dei nomi. Le cartelle non sono mai state toccate.' }
}

/** Il nome nuovo va bene per un progetto? Mai la chiave di un altro progetto, mai il nome di un altro workspace di qui. */
export function controllaNomeNuovo(nome: string, riga: { ids: string[]; chiave: string }, progetti: readonly { id: string; nome: string }[], workspaceQui: readonly string[], workspaceDelProgetto: readonly string[]): string | undefined {
  const k = chiaveProgetto(nome)
  const altro = progetti.find((p) => !riga.ids.includes(p.id) && chiaveProgetto(p.nome) === k)
  if (altro !== undefined) return `C’è già un progetto «${altro.nome}»: scegli un altro nome.`
  const ws = workspaceQui.find((w) => w.toLowerCase() === nome.toLowerCase() && !workspaceDelProgetto.includes(w))
  if (ws !== undefined) return `C’è già un workspace «${ws}»: scegli un altro nome.`
  return undefined
}
