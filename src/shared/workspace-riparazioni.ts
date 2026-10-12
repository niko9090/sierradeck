import type { Archivio, PaneSalvato, WorkspaceSalvato } from './workspace'
import { removePane } from './layout-tree'
import { aggiungiPaneA } from './workspace'
import { eNomeDiSistema, nomeNormalizzato } from './progetti-unificati'

/**
 * Le riparazioni dei workspace di un PC (0.65.1). Regole pure.
 *
 * Il caso di Nicholas del 12/10: «i workspace adesso sono visualizzati da tutti
 * sempre gli stessi e non trovo più quelli che avevo prima nei vari PC», e
 * «visitafacile» che su ogni PC diceva «è di un altro PC».
 *
 * Le cause (scheda `workspace-di-ogni-pc-0-65-1.md`):
 * - ogni «Porta qui» di un progetto (anche quello automatico dell'allineamento)
 *   fondeva nella lista del PC **tutti** i workspace del Drive: le liste dei PC
 *   diventavano uguali;
 * - la fusione portava sul PC anche i riquadri «remoti» degli altri: un
 *   riquadro che sul portatile guardava il PC fisso, arrivato sul PC fisso,
 *   guardava sé stesso («altro PC» = questo PC);
 * - «Fondi con il Drive» con «tieni quelli del Drive» e «Ripristina»
 *   sostituivano la lista del PC con quella del Drive.
 */

/** Un riquadro remoto che guarda questo stesso PC. */
export function puntaAMe(p: PaneSalvato, io: string): boolean {
  return p.remoto !== undefined && p.remoto.pcId === io
}

/**
 * Un riquadro che guarda questo PC, riparato. Se la chat c'è qui, o nessun
 * altro PC ne è la casa, torna locale: la cartella è quella dove la chat
 * lavora davvero (`remoto.cwd`). Se la casa è un altro PC, guarda quello.
 */
export function riparaRiquadro(p: PaneSalvato, io: string, d: { haChat: (s: string) => boolean; casaAltrove: (s: string) => { pc: string; nome: string } | undefined }): PaneSalvato {
  if (!puntaAMe(p, io)) return p
  const r = p.remoto as NonNullable<PaneSalvato['remoto']>
  const s = r.sessione ?? p.sessionUuid
  const altrove = s !== undefined && s !== '' && !d.haChat(s) ? d.casaAltrove(s) : undefined
  if (altrove !== undefined && altrove.pc !== io) return { ...p, remoto: { ...r, pcId: altrove.pc, pcNome: altrove.nome } }
  const { remoto: _r, ...locale } = p
  return { ...locale, cwd: r.cwd !== '' ? r.cwd : p.cwd }
}

/** Tutti i riquadri di un archivio riparati; `riparati` = quanti. */
export function riparaArchivio(a: Archivio, io: string, d: Parameters<typeof riparaRiquadro>[2]): { archivio: Archivio; riparati: { workspace: string; sessione?: string; verso: string }[] } {
  const riparati: { workspace: string; sessione?: string; verso: string }[] = []
  const workspace = a.workspace.map((w): WorkspaceSalvato => {
    let tocca = false
    const perSlot = Object.fromEntries(Object.entries(w.perSlot).map(([k, l]) => [k, {
      ...l,
      panes: l.panes.map((p) => {
        if (!puntaAMe(p, io)) return p
        tocca = true
        const q = riparaRiquadro(p, io, d)
        riparati.push({ workspace: w.nome, ...(p.sessionUuid !== undefined ? { sessione: p.sessionUuid } : {}), verso: q.remoto === undefined ? 'locale' : q.remoto.pcNome })
        return q
      })
    }]))
    return tocca ? { ...w, perSlot } : w
  })
  return { archivio: riparati.length > 0 ? { ...a, workspace } : a, riparati }
}

/* ------------------------------------------------------------------ */
/* I workspace spariti, ritrovati dalle copie di sicurezza.            */
/* ------------------------------------------------------------------ */

/** Una copia di sicurezza della lista: quando è stata fatta e cosa c'era. */
export type CopiaLista = { file: string; quando: string; archivio: Archivio; /** La copia fatta subito prima di un'eliminazione chiesta da Nicholas. */ primaDiEliminare?: boolean }

/** Un'eliminazione chiesta da Nicholas (dalla 0.65.1 si annota). */
export type Eliminato = { nome: string; quando: string }

export type Ritrovato = { nome: string; da: string; quando: string; workspace: WorkspaceSalvato }

/**
 * I workspace che una copia recente aveva e la lista di adesso no, presi
 * dalla copia più recente che li ha. Non si ritrova un workspace:
 * - eliminato da Nicholas (annotato, dopo l'ultima copia che lo aveva);
 * - visto per l'ultima volta proprio nella copia fatta prima di
 *   un'eliminazione: è quello che è stato eliminato;
 * - più vecchio di `dalle` (le copie molto vecchie non riportano indietro il passato).
 */
export function workspaceRitrovati(attuale: Archivio, copie: CopiaLista[], eliminati: Eliminato[], dalle: string): Ritrovato[] {
  const ci = new Set(attuale.workspace.map((w) => w.nome))
  const ultima = new Map<string, { copia: CopiaLista; w: WorkspaceSalvato }>()
  for (const c of [...copie].filter((x) => x.quando >= dalle).sort((a, b) => a.quando.localeCompare(b.quando))) {
    for (const w of c.archivio.workspace) ultima.set(w.nome, { copia: c, w })
  }
  const fuori: Ritrovato[] = []
  for (const [nome, { copia, w }] of ultima) {
    if (ci.has(nome)) continue
    if (eliminati.some((e) => e.nome === nome && e.quando >= copia.quando)) continue
    if (copia.primaDiEliminare === true) continue
    fuori.push({ nome, da: copia.file, quando: copia.quando, workspace: w })
  }
  return fuori.sort((a, b) => a.nome.localeCompare(b.nome))
}

/** La lista con i ritrovati aggiunti in fondo: niente si toglie, niente si sostituisce. */
export function conRitrovati(a: Archivio, r: Ritrovato[]): Archivio {
  const ci = new Set(a.workspace.map((w) => w.nome))
  const nuovi = r.filter((x) => !ci.has(x.nome)).map((x) => x.workspace)
  return nuovi.length === 0 ? a : { ...a, workspace: [...a.workspace, ...nuovi] }
}

/* ------------------------------------------------------------------ */
/* «Su altri PC».                                                      */
/* ------------------------------------------------------------------ */

/**
 * I workspace degli altri PC che qui non ci sono, PC per PC (dai battiti).
 * La lista di questo PC resta sua: questi si mostrano a parte, sotto.
 */
export function suAltriPc(qui: string[], altri: { pc: string; nome: string; workspace?: string[] }[]): { pc: string; nome: string; workspace: string[] }[] {
  const ci = new Set(qui.map((n) => n.toLowerCase()))
  return altri
    .map((p) => ({ pc: p.pc, nome: p.nome, workspace: [...new Set((p.workspace ?? []).filter((n) => !ci.has(n.toLowerCase())))].sort((a, b) => a.localeCompare(b)) }))
    .filter((p) => p.workspace.length > 0)
}

/* ------------------------------------------------------------------ */
/* Ogni progetto ha il suo workspace (0.67.0).                         */
/* ------------------------------------------------------------------ */

// La stessa regola dei progetti, «stesso nome = stesso progetto» (0.67.4):
// maiuscole, spazi, punti, trattini e accenti non contano. Fino alla 0.67.3
// questo file ne aveva una sua, più stretta, e la 0.67.1 ha creato «NAS-film»
// accanto a «Nas film».
const norma = (n: string): string => nomeNormalizzato(n)

/**
 * Quanti riquadri al massimo in un workspace creato dal programma (0.67.4).
 * Il 12/10 «Documents» ne aveva 541: aprirlo avrebbe acceso 541 terminali. Le
 * altre chat del progetto restano nel pannello «Progetti» e in «Riprendi».
 */
export const MAX_RIQUADRI_CREATI = 8

/** Un progetto visto da questo PC, per decidere il suo workspace. */
export type ProgettoPerWorkspace = {
  nome: string
  /** Questo PC è il residente del progetto. */
  residenteQui: boolean
  /** Le chat del progetto che hanno un nome e una copia qui. */
  chat: { sessione: string; titolo: string; cwd: string }[]
}

/**
 * I workspace da creare su questo PC (0.67.0, «workspace = progetto»): uno per
 * ogni progetto di cui questo PC è il residente e che non ha già un workspace
 * con il suo nome. Dentro, le sue chat con nome che non stanno già in un altro
 * workspace (una chat, un workspace). Mai uno che Nicholas ha eliminato.
 */
export function workspaceDaCreare(progetti: ProgettoPerWorkspace[], qui: Archivio, eliminati: string[]): { nome: string; panes: PaneSalvato[] }[] {
  const nomiQui = new Set(qui.workspace.map((w) => norma(w.nome)))
  const tolti = new Set(eliminati.map(norma))
  const giaInUnWorkspace = new Set(qui.workspace.flatMap((w) => Object.values(w.perSlot).flatMap((l) => l.panes.map((p) => p.sessionUuid))).filter((s): s is string => s !== undefined))
  // Le chat che stanno già in un workspace che non è «Predefinito» (0.67.2):
  // quel workspace è già il workspace del progetto, con un altro nome («HA»
  // per il progetto «HomeAssistant»). Predefinito no: è dove finisce tutto.
  const inUnWorkspaceVero = new Set(qui.workspace.filter((w) => norma(w.nome) !== 'predefinito').flatMap((w) => Object.values(w.perSlot).flatMap((l) => l.panes.map((p) => p.sessionUuid))).filter((s): s is string => s !== undefined))
  const fuori: { nome: string; panes: PaneSalvato[] }[] = []
  for (const p of progetti) {
    if (!p.residenteQui || eNomeDiSistema(p.nome) || nomiQui.has(norma(p.nome)) || tolti.has(norma(p.nome))) continue
    if (p.chat.some((c) => inUnWorkspaceVero.has(c.sessione))) continue
    nomiQui.add(norma(p.nome))
    // Le chat arrivano dalla più recente: si tengono le prime.
    const panes = p.chat.filter((c) => !giaInUnWorkspace.has(c.sessione)).slice(0, MAX_RIQUADRI_CREATI).map((c): PaneSalvato => ({ id: `pane-${c.sessione}`, sessionUuid: c.sessione, cwd: c.cwd, title: c.titolo }))
    for (const x of panes) if (x.sessionUuid !== undefined) giaInUnWorkspace.add(x.sessionUuid)
    fuori.push({ nome: p.nome, panes })
  }
  return fuori
}

/**
 * Un workspace di un altro PC aperto qui (0.67.0, «Su altri PC» → «Apri»): lo
 * stesso nome, e un riquadro dal vivo verso quel PC per ogni sua chat. Le chat
 * restano là: qui si guardano e si comandano, e partono in sottofondo là.
 */
export function workspaceDaAltroPc(nome: string, pc: { id: string; nome: string }, chat: { workspace: string; sessione?: string; cwd: string; titolo: string }[]): { nome: string; panes: PaneSalvato[] } {
  const panes = chat
    .filter((c) => c.workspace === nome && c.sessione !== undefined && c.sessione !== '' && !eSessioneInterna(c, new Set()))
    .map((c): PaneSalvato => ({
      id: `pane-${c.sessione as string}`, sessionUuid: c.sessione as string, cwd: c.cwd, title: c.titolo,
      remoto: { pcId: pc.id, pcNome: pc.nome, cwd: c.cwd, sessione: c.sessione as string }
    }))
  return { nome, panes }
}

/**
 * Il nome della cartella del progetto di un workspace (0.65.1): lo stesso
 * nome, senza i caratteri che Windows non accetta.
 */
export function cartellaDaNomeWorkspace(nome: string): string {
  const pulito = nome.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 80).trim()
  return pulito === '' ? 'Progetto' : pulito
}

/**
 * Una cartella dove una chat nuova non deve lavorare: la radice di un disco,
 * la cartella dell'utente, Documenti (0.65.1). Lì dentro una sottocartella va bene.
 */
export function cartellaVietataPerChat(cartella: string, vietate: { casa: string; documenti?: string }): boolean {
  const n = (x: string): string => x.trim().replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
  const c = n(cartella)
  if (c === '' || /^[a-z]:$/.test(c)) return true
  return c === n(vietate.casa) || (vietate.documenti !== undefined && vietate.documenti !== '' && c === n(vietate.documenti))
}


/* ------------------------------------------------------------------ */
/* Le sessioni interne degli autopiloti non sono chat (0.67.3).        */
/* ------------------------------------------------------------------ */

/**
 * Come cominciano le conversazioni che il servizio autopiloti apre per sé:
 * supervisore, dialogo con chi ha affidato il lavoro, preparazione. Il titolo
 * di una chat è il suo primo messaggio.
 */
const INIZI_INTERNI = [
  'Sei il supervisore di una chat',
  'Sei l\'autopilota che sta portando avanti',
  'Sei l autopilota che sta portando avanti',
  'Stai preparando un autopilota'
]

/**
 * Le sessioni interne degli autopiloti, da non mettere mai in un workspace.
 * Il 12/10 il workspace «fionda apl» creato dalla 0.67.1 ne conteneva due
 * (dialogo e preparazione) accanto alle chat vere: aprirlo le avrebbe fatte
 * ripartire in un terminale, accanto al servizio che le usa.
 */
export function sessioniInterne(autopiloti: { sessioneSupervisore?: string; sessioneIntervista?: string; chats?: { sessioneSupervisore?: string }[] }[]): Set<string> {
  const fuori = new Set<string>()
  for (const a of autopiloti) {
    if (a.sessioneSupervisore !== undefined) fuori.add(a.sessioneSupervisore)
    if (a.sessioneIntervista !== undefined) fuori.add(a.sessioneIntervista)
    for (const c of a.chats ?? []) if (c.sessioneSupervisore !== undefined) fuori.add(c.sessioneSupervisore)
  }
  return fuori
}

export function eSessioneInterna(c: { sessione?: string; titolo?: string }, interne: ReadonlySet<string>): boolean {
  if (c.sessione !== undefined && interne.has(c.sessione)) return true
  const t = (c.titolo ?? '').trim()
  return INIZI_INTERNI.some((i) => t.startsWith(i))
}

/**
 * Toglie dai workspace i riquadri delle sessioni interne **aggiunti dalla
 * 0.67.x**: quelli che non c'erano nella copia fatta prima di creare i
 * workspace dei progetti. Tutto il resto resta com'è.
 */
export function togliInterneAggiunte(a: Archivio, prima: Archivio | undefined, interne: ReadonlySet<string>): { archivio: Archivio; tolti: { workspace: string; titolo: string }[] } {
  const cerano = new Set((prima?.workspace ?? []).flatMap((w) => Object.values(w.perSlot).flatMap((l) => l.panes.map((p) => p.sessionUuid))).filter((s): s is string => s !== undefined))
  const tolti: { workspace: string; titolo: string }[] = []
  const workspace = a.workspace.map((w): WorkspaceSalvato => {
    let tocca = false
    const perSlot = Object.fromEntries(Object.entries(w.perSlot).map(([k, l]) => {
      const via = l.panes.filter((p) => p.sessionUuid !== undefined && !cerano.has(p.sessionUuid) && eSessioneInterna({ sessione: p.sessionUuid, titolo: p.title }, interne))
      if (via.length === 0) return [k, l]
      tocca = true
      for (const p of via) tolti.push({ workspace: w.nome, titolo: p.title.slice(0, 60) })
      // Anche dall'albero del layout, o resterebbe un posto vuoto che rimanda a un riquadro che non c'è.
      let root = l.root
      for (const p of via) root = root === undefined ? undefined : removePane(root, p.id)
      return [k, { ...l, root, panes: l.panes.filter((p) => !via.includes(p)) }]
    }))
    return tocca ? { ...w, perSlot } : w
  })
  return { archivio: tolti.length > 0 ? { ...a, workspace } : a, tolti }
}

/* ------------------------------------------------------------------ */
/* I workspace creati per sbaglio dalla 0.67.x, rimessi a posto (0.67.4). */
/* ------------------------------------------------------------------ */

/** Cosa ha fatto `riordinaCreatiDalProgramma`, per il registro e il quaderno. */
export type Riordino =
  | { tipo: 'unito'; da: string; in: string; riquadri: number }
  | { tipo: 'tolto'; nome: string; spostati: { in: string; riquadri: number }[]; nonRiportati: number }

/**
 * Il progetto di una chat dalla sua cartella: l'ultima cartella del percorso,
 * se non è una cartella di sistema. `…\Documents\Portfolio` → «Portfolio»;
 * `…\Documents` o la cartella utente → nessuno.
 */
export function progettoDallaCartella(cwd: string): string | undefined {
  const parti = cwd.replace(/\//g, '\\').replace(/\\+$/, '').split('\\').filter((x) => x !== '')
  if (parti.length < 2) return undefined
  const ultima = parti[parti.length - 1] as string
  const sopra = (parti[parti.length - 2] ?? '').toLowerCase()
  // La cartella utente (`…\Users\<nome>`) non è un progetto.
  if (sopra === 'users' || sopra === 'utenti') return undefined
  return eNomeDiSistema(ultima) ? undefined : ultima
}

/**
 * Rimette a posto i workspace **creati dal programma** (quelli che non c'erano
 * nella copia `prima`, fatta prima di creare i workspace dei progetti). Quelli
 * di Nicholas non si toccano mai.
 * - Un doppione per nome («NAS-film» accanto a «Nas film»): i suoi riquadri
 *   vanno in quello che c'era, senza doppioni, e il doppione se ne va.
 * - Uno con il nome di una cartella di sistema («Documents»): se ne va; ogni
 *   riquadro va nel workspace del suo progetto vero se lo si riconosce dalla
 *   cartella (`progettoDallaCartella`) e il suo workspace c'è già,
 *   altrimenti in «Predefinito». Al massimo `MAX_RIQUADRI_CREATI` per
 *   workspace: le altre chat restano nel pannello «Progetti» e in «Riprendi».
 */
export function riordinaCreatiDalProgramma(ora: Archivio, prima: Archivio): { archivio: Archivio; fatto: Riordino[] } {
  const diNicholas = new Set(prima.workspace.map((w) => w.nome))
  const fatto: Riordino[] = []
  let ws = [...ora.workspace]
  const riquadri = (w: WorkspaceSalvato): PaneSalvato[] => Object.values(w.perSlot).flatMap((l) => l.panes)
  const versa = (nome: string, panes: PaneSalvato[], tetto: number): number => {
    let i = ws.findIndex((w) => norma(w.nome) === norma(nome))
    if (i === -1) { ws.push({ nome, perSlot: {} } as WorkspaceSalvato); i = ws.length - 1 }
    const w = ws[i] as WorkspaceSalvato
    const ci = new Set(riquadri(w).map((p) => p.sessionUuid).filter((s): s is string => s !== undefined))
    let layout = w.perSlot[1] ?? { root: undefined, panes: [] }
    let messi = 0
    for (const p of panes) {
      if (messi >= tetto) break
      if (p.sessionUuid !== undefined && ci.has(p.sessionUuid)) continue
      layout = aggiungiPaneA(layout, p)
      if (p.sessionUuid !== undefined) ci.add(p.sessionUuid)
      messi += 1
    }
    ws[i] = { ...w, perSlot: { ...w.perSlot, 1: layout } }
    return messi
  }
  for (const w of ora.workspace) {
    if (diNicholas.has(w.nome)) continue
    const gemello = ws.find((x) => x.nome !== w.nome && norma(x.nome) === norma(w.nome) && diNicholas.has(x.nome))
    if (gemello !== undefined) {
      ws = ws.filter((x) => x.nome !== w.nome)
      const n = versa(gemello.nome, riquadri(w), Number.POSITIVE_INFINITY)
      fatto.push({ tipo: 'unito', da: w.nome, in: gemello.nome, riquadri: n })
      continue
    }
    if (!eNomeDiSistema(w.nome)) continue
    ws = ws.filter((x) => x.nome !== w.nome)
    const perMeta = new Map<string, PaneSalvato[]>()
    for (const p of riquadri(w)) {
      const meta = progettoDallaCartella(p.cwd) ?? 'Predefinito'
      perMeta.set(meta, [...(perMeta.get(meta) ?? []), p])
    }
    const spostati: { in: string; riquadri: number }[] = []
    let nonRiportati = 0
    for (const [meta, panes] of perMeta) {
      // Solo in un workspace che c'è già: crearne uno nuovo vorrebbe dire un
      // workspace di un progetto che magari vive su un altro PC.
      const dove = ws.find((x) => norma(x.nome) === norma(meta))?.nome ?? 'Predefinito'
      const n = versa(dove, panes, MAX_RIQUADRI_CREATI)
      if (n > 0) spostati.push({ in: dove, riquadri: n })
      nonRiportati += panes.length - n
    }
    fatto.push({ tipo: 'tolto', nome: w.nome, spostati, nonRiportati })
  }
  if (fatto.length === 0) return { archivio: ora, fatto }
  const nomi = new Set(ws.map((w) => w.nome))
  const attivo = nomi.has(ora.attivo) ? ora.attivo : (ws[0]?.nome ?? ora.attivo)
  return { archivio: { ...ora, workspace: ws, attivo }, fatto }
}
