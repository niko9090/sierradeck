import { chiaveCartella, conBarre } from './file-telefono'

/**
 * «Apri cartella» (0.82.0): dove sta la cartella del progetto di un workspace
 * o di una chat, presa dai dati che il PC ha già (il registro dei progetti, i
 * riquadri salvati, le chat aperte) e mai scritta nel codice.
 *
 * Sul PC la cartella si apre in Esplora file; sulla pagina e nell'app si apre
 * la sezione File su quella cartella, che però sfoglia solo **dentro** i
 * progetti noti: `voceFileDi` trova il progetto che la contiene e il percorso
 * relativo.
 */
export type DoveCartella =
  | { tipo: 'qui'; cartella: string }
  | { tipo: 'altrove'; pcNome: string }
  | { tipo: 'niente'; perche: string }

/** Un riquadro come serve qui: la sua cartella e, se guarda un altro PC, quale. */
export type RiquadroCartella = { cwd: string; remoto?: { pcNome: string } | undefined }

/** La cartella di una chat: la sua, se lavora su questo PC. */
export function cartellaDiUnaChat(c: RiquadroCartella | undefined, esiste: (p: string) => boolean): DoveCartella {
  if (c === undefined) return { tipo: 'niente', perche: 'questa chat non c’è più' }
  if (c.remoto !== undefined) return { tipo: 'altrove', pcNome: c.remoto.pcNome }
  if (c.cwd.trim() === '') return { tipo: 'niente', perche: 'questa chat non ha una cartella' }
  if (!esiste(c.cwd)) return { tipo: 'niente', perche: `la cartella ${c.cwd} non c’è più` }
  return { tipo: 'qui', cartella: c.cwd }
}

/**
 * La cartella di un workspace.
 *
 * Prima il progetto del workspace, se ha la sua cartella su questo PC. Se non
 * ce l'ha, la cartella dove lavorano più chat del workspace su questo PC
 * (mai la cartella utente, Documenti o un disco intero: lì non c'è un
 * progetto). Se le chat lavorano tutte su un altro PC, si dice quale.
 */
export function cartellaDiUnWorkspace(p: {
  /** La cartella del progetto del workspace su questo PC, se c'è. */
  progetto?: string | undefined
  riquadri: RiquadroCartella[]
  vietata: (cartella: string) => boolean
  esiste: (cartella: string) => boolean
  windows?: boolean
}): DoveCartella {
  if (p.progetto !== undefined && p.progetto.trim() !== '' && p.esiste(p.progetto)) return { tipo: 'qui', cartella: p.progetto }
  const win = p.windows ?? true
  const conti = new Map<string, { cartella: string; quante: number }>()
  for (const r of p.riquadri) {
    if (r.remoto !== undefined || r.cwd.trim() === '' || p.vietata(r.cwd)) continue
    const k = chiaveCartella(r.cwd, win)
    const prima = conti.get(k)
    conti.set(k, { cartella: prima?.cartella ?? r.cwd, quante: (prima?.quante ?? 0) + 1 })
  }
  // A parità vince la prima incontrata: l'ordine dei riquadri, che non balla.
  let scelta: { cartella: string; quante: number } | undefined
  for (const x of conti.values()) {
    if (p.esiste(x.cartella) && (scelta === undefined || x.quante > scelta.quante)) scelta = x
  }
  if (scelta !== undefined) return { tipo: 'qui', cartella: scelta.cartella }
  const remoto = p.riquadri.find((r) => r.remoto !== undefined)?.remoto
  if (remoto !== undefined) return { tipo: 'altrove', pcNome: remoto.pcNome }
  return { tipo: 'niente', perche: 'questo workspace non ha ancora una cartella di progetto su questo PC' }
}

/**
 * Il progetto della sezione File che contiene `cartella`, e il percorso dentro.
 *
 * Il più interno, se uno sta dentro l'altro: chi apre la cartella di una chat
 * in un worktree vuole quel worktree, non il progetto che lo contiene.
 */
export function voceFileDi(cartella: string, progetti: { percorso: string }[], windows = true): { progetto: string; percorso: string } | undefined {
  const c = chiaveCartella(cartella, windows)
  const pulita = cartella.replace(/[\\/]+/g, '/').replace(/\/$/, '')
  let meglio: { progetto: string; percorso: string; lungo: number } | undefined
  for (const pr of progetti) {
    const k = chiaveCartella(pr.percorso, windows)
    if (k === '' || (c !== k && !c.startsWith(`${k}/`))) continue
    if (meglio !== undefined && k.length <= meglio.lungo) continue
    meglio = { progetto: pr.percorso, percorso: conBarre(pulita.slice(k.length)), lungo: k.length }
  }
  return meglio === undefined ? undefined : { progetto: meglio.progetto, percorso: meglio.percorso }
}

/** La riga corta per chi ha premuto «Apri cartella» e non si è aperto niente. */
export function testoCartellaNonQui(d: Exclude<DoveCartella, { tipo: 'qui' }>): string {
  return d.tipo === 'altrove'
    ? `La cartella è su ${d.pcNome}: aprila da lì.`
    : `Nessuna cartella da aprire: ${d.perche}.`
}
