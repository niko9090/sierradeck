import type { Archivio, PaneSalvato, WorkspaceSalvato } from './workspace'

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

