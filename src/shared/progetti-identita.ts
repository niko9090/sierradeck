import { cartellaDaNomeWorkspace } from './workspace-riparazioni'
import { eNomeDiSistema, nomeNormalizzato } from './progetti-unificati'

/**
 * **Una regola sola per «è lo stesso progetto»** (Gestione progetti, 13/11).
 *
 * Prima ce n'erano tre, e non dicevano la stessa cosa: il registro univa i
 * doppioni con stesso proprietario e nome (spazi e maiuscole), la migrazione
 * con il solo nome, la vista con il nome normalizzato forte. Due PC potevano
 * così vedere lo stesso progetto una volta, l'altro due. Adesso tutti usano
 * `chiaveProgetto`: il nome normalizzato forte di `progetti-unificati`
 * (maiuscole, spazi, trattini, punti, accenti e suffissi delle copie come
 * «(2)» o «- copia» non contano).
 *
 * E **il nome è uno solo**: il workspace e la cartella del progetto si
 * chiamano esattamente uguali (regola di Nicholas, 13/11). `nomeComune` dice
 * quale nome possono avere tutti e due insieme.
 */

/** Quanto può essere lungo il nome di un workspace: lo stesso di `NOME_WORKSPACE_MAX` (validation.ts). */
export const NOME_MAX = 60

/** La chiave di identità di un progetto: due nomi con la stessa chiave sono lo stesso progetto. */
export function chiaveProgetto(nome: string): string {
  return nomeNormalizzato(nome)
}

export function stessoProgetto(a: string, b: string): boolean {
  return chiaveProgetto(a) === chiaveProgetto(b)
}

/** L'ultimo pezzo di un percorso, con le barre di Windows o di Unix. */
export function ultimoPezzo(percorso: string): string {
  const parti = percorso.replace(/[\\/]+$/, '').split(/[\\/]/)
  return parti[parti.length - 1] ?? ''
}

/** La cartella che contiene `percorso` (senza l'ultimo pezzo), con il separatore che usa. */
export function cartellaMadre(percorso: string): string {
  const pulito = percorso.replace(/[\\/]+$/, '')
  const i = Math.max(pulito.lastIndexOf('\\'), pulito.lastIndexOf('/'))
  return i <= 0 ? pulito : pulito.slice(0, i)
}

/** Il separatore di un percorso: `\` se ce n'è uno, se no `/`. */
export function separatoreDi(percorso: string): string {
  return percorso.includes('\\') ? '\\' : '/'
}

/** Il nome della cartella di un progetto: l'ultimo pezzo del percorso sul proprietario, o il suo nome. */
export function nomeCartellaDi(p: { nome: string; percorso?: string }): string {
  if (p.percorso === undefined || p.percorso === '') return p.nome
  const n = ultimoPezzo(p.percorso)
  return n === '' ? p.nome : n
}

export type EsitoNome =
  | { ok: true; nome: string; cambiato: boolean }
  | { ok: false; motivo: string }

/**
 * Il nome che possono avere insieme il workspace e la cartella: quello
 * chiesto, senza i caratteri che Windows non accetta nei nomi di cartella e
 * entro la lunghezza di un workspace. `cambiato`: va detto a chi l'ha scritto.
 */
export function nomeComune(chiesto: string): EsitoNome {
  const t = chiesto.trim()
  if (t === '') return { ok: false, motivo: 'Il nome è vuoto.' }
  // Solo punti e spazi: Windows li toglie tutti, e non resta un nome.
  if (t.replace(/[. ]+$/, '') === '') return { ok: false, motivo: 'Il nome non ha caratteri validi per una cartella.' }
  const pulito = cartellaDaNomeWorkspace(t).slice(0, NOME_MAX).trim().replace(/[. ]+$/, '')
  if (pulito === '') return { ok: false, motivo: 'Il nome non ha caratteri validi per una cartella.' }
  if (eNomeDiSistema(pulito)) return { ok: false, motivo: `«${pulito}» è il nome di una cartella di sistema: scegline un altro.` }
  return { ok: true, nome: pulito, cambiato: pulito !== t }
}

/**
 * Il nome di un workspace nuovo (13/11): con una cartella scelta, il nome
 * della cartella; senza, il nome chiesto reso valido anche per la cartella che
 * nascerà. Se quel nome è già di un altro workspace (o non si può usare) resta
 * quello chiesto, e la differenza la segnala Gestione progetti.
 */
export function nomeWorkspaceNuovo(chiesto: string, cartella: string | undefined, esistenti: readonly string[]): string {
  const preso = (n: string): boolean => n !== chiesto && esistenti.some((w) => w.toLowerCase() === n.toLowerCase())
  if (cartella !== undefined && cartella.trim() !== '') {
    const base = ultimoPezzo(cartella)
    return cartellaVaBeneComeWorkspace(base) && !preso(base) ? base : chiesto
  }
  const n = nomeComune(chiesto)
  return n.ok && !preso(n.nome) ? n.nome : chiesto
}

/** Il nome di una cartella va bene così com'è anche come nome di workspace? */
export function cartellaVaBeneComeWorkspace(nomeCartella: string): boolean {
  const e = nomeComune(nomeCartella)
  return e.ok && e.nome === nomeCartella
}

/* ------------------------------------------------------------------ */
/* Workspace → progetto.                                               */
/* ------------------------------------------------------------------ */

/**
 * Il collegamento di un workspace di questo PC al suo progetto: per id, non
 * più per nome (13/11). Il nome resta per compatibilità: un workspace senza
 * collegamento si collega la prima volta per nome, se c'è un progetto solo con
 * quella chiave. `nome` è il nome della cartella al momento del collegamento:
 * se il progetto cambia nome (rinominato qui o da un altro PC), il workspace
 * lo segue.
 */
export type Collegamento = { id: string; nome: string }

export type Collegamenti = {
  versione: 1
  /** Nome del workspace → il suo progetto. */
  collegati: Record<string, Collegamento>
  /** I workspace scollegati a mano: non si ricollegano da soli per nome. */
  scollegati?: string[]
}

export function collegamentiVuoti(): Collegamenti {
  return { versione: 1, collegati: {} }
}

/** Legge senza mai sollevare: un file storto vale come vuoto. */
export function parseCollegamenti(raw: unknown): Collegamenti {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return collegamentiVuoti()
  const o = raw as Record<string, unknown>
  const collegati: Record<string, Collegamento> = {}
  if (typeof o.collegati === 'object' && o.collegati !== null && !Array.isArray(o.collegati)) {
    for (const [ws, v] of Object.entries(o.collegati as Record<string, unknown>)) {
      if (ws.trim() === '' || typeof v !== 'object' || v === null) continue
      const x = v as Record<string, unknown>
      if (typeof x.id !== 'string' || x.id === '') continue
      collegati[ws] = { id: x.id, nome: typeof x.nome === 'string' ? x.nome : ws }
    }
  }
  const scollegati = Array.isArray(o.scollegati) ? [...new Set(o.scollegati.filter((x): x is string => typeof x === 'string' && x !== ''))] : []
  return { versione: 1, collegati, ...(scollegati.length > 0 ? { scollegati } : {}) }
}

export function collega(c: Collegamenti, ws: string, l: Collegamento): Collegamenti {
  const scollegati = (c.scollegati ?? []).filter((x) => x !== ws)
  return { versione: 1, collegati: { ...c.collegati, [ws]: l }, ...(scollegati.length > 0 ? { scollegati } : {}) }
}

export function scollega(c: Collegamenti, ws: string): Collegamenti {
  const { [ws]: _via, ...resto } = c.collegati
  return { versione: 1, collegati: resto, scollegati: [...new Set([...(c.scollegati ?? []), ws])] }
}

/** Il workspace ha cambiato nome: il collegamento lo segue. `nuovo` assente: eliminato. */
export function rinominaInCollegamenti(c: Collegamenti, vecchio: string, nuovo: string | undefined): Collegamenti {
  const l = c.collegati[vecchio]
  const scoll = c.scollegati ?? []
  if (l === undefined && !scoll.includes(vecchio)) return c
  const { [vecchio]: _via, ...resto } = c.collegati
  const collegati = nuovo !== undefined && l !== undefined ? { ...resto, [nuovo]: l } : resto
  const scollegati = scoll.flatMap((x) => (x !== vecchio ? [x] : nuovo !== undefined ? [nuovo] : []))
  return { versione: 1, collegati, ...(scollegati.length > 0 ? { scollegati } : {}) }
}

/** Un progetto come serve qui: id, nome, proprietario e cartella. */
export type ProgettoIdentita = { id: string; nome: string; proprietario?: string; percorso?: string }

export type ProgettoDelWorkspace<P extends ProgettoIdentita> =
  | { tipo: 'collegato'; progetto: P }
  /** Il collegamento c'è ma il progetto no: tolto, o eliminato ovunque. Non si ricrea niente. */
  | { tipo: 'tolto'; id: string }
  | { tipo: 'nome'; progetto: P }
  /** Più progetti con la stessa chiave: doppioni da sistemare in Gestione progetti. */
  | { tipo: 'ambiguo'; progetti: P[] }
  | { tipo: 'scollegato' }
  | { tipo: 'nessuno' }

/**
 * Il progetto di un workspace: prima il collegamento per id, poi il nome
 * (una sola corrispondenza). Un workspace scollegato a mano non ha progetto.
 * Un collegamento a un progetto che non c'è più vale «tolto»: chi crea
 * progetti non deve ricrearlo (l'anello dei doppioni).
 */
export function progettoDelWorkspace<P extends ProgettoIdentita>(ws: string, c: Collegamenti, progetti: readonly P[]): ProgettoDelWorkspace<P> {
  const l = c.collegati[ws]
  if (l !== undefined) {
    const p = progetti.find((x) => x.id === l.id)
    if (p !== undefined) return { tipo: 'collegato', progetto: p }
    return { tipo: 'tolto', id: l.id }
  }
  if ((c.scollegati ?? []).includes(ws)) return { tipo: 'scollegato' }
  const k = chiaveProgetto(ws)
  const stessi = progetti.filter((p) => chiaveProgetto(p.nome) === k)
  if (stessi.length === 1) return { tipo: 'nome', progetto: stessi[0] as P }
  if (stessi.length > 1) return { tipo: 'ambiguo', progetti: [...stessi] }
  return { tipo: 'nessuno' }
}

/**
 * I collegamenti che mancano: ogni workspace senza collegamento e con un solo
 * progetto della sua chiave si collega a lui (una volta, poi vale l'id).
 */
export function collegaPerNome<P extends ProgettoIdentita>(c: Collegamenti, workspace: readonly string[], progetti: readonly P[]): { collegamenti: Collegamenti; nuovi: { ws: string; id: string }[] } {
  let fuori = c
  const nuovi: { ws: string; id: string }[] = []
  // Un collegamento che punta a un workspace che non c'è più si toglie.
  const presenti = new Set(workspace)
  for (const ws of Object.keys(c.collegati)) if (!presenti.has(ws)) fuori = rinominaInCollegamenti(fuori, ws, undefined)
  for (const ws of workspace) {
    const e = progettoDelWorkspace(ws, fuori, progetti)
    if (e.tipo !== 'nome') continue
    fuori = collega(fuori, ws, { id: e.progetto.id, nome: nomeCartellaDi(e.progetto) })
    nuovi.push({ ws, id: e.progetto.id })
  }
  return { collegamenti: fuori, nuovi }
}

export type DecisioneProgettoWs =
  /** C'è, è di questo PC e la cartella c'è: si usa. `collega`: va collegato per id (trovato per nome). */
  | { tipo: 'usa'; id: string; percorso: string; collega: boolean }
  /** È di un altro PC: qui niente cartelle. */
  | { tipo: 'altrove'; id: string; pc: string }
  /** Non si crea niente, con il motivo (per il registro). */
  | { tipo: 'niente'; perche: string }
  /** Nessun progetto con quel nome: si può creare, con questo nome di cartella. */
  | { tipo: 'crea'; nomeCartella: string }

/**
 * **Il progetto di un workspace, senza doppioni** (13/11). Le regole:
 * - prima il collegamento per id: un workspace rinominato non perde il suo
 *   progetto (prima ne nasceva uno nuovo, con una cartella nuova);
 * - un collegamento a un progetto tolto (o eliminato ovunque) non fa
 *   rinascere niente;
 * - la cartella di un progetto di questo PC che non c'è (un disco staccato,
 *   un percorso vecchio) **non** fa nascere un progetto nuovo: lo si dice, e
 *   lo sistema Nicholas in Gestione progetti (era l'anello dei doppioni);
 * - più progetti con la stessa chiave: si usa quello di qui con la cartella,
 *   se c'è; se no niente, sono doppioni da unire;
 * - si crea solo se nessun progetto ha quella chiave, con il nome comune.
 */
export function decidiProgettoWorkspace<P extends ProgettoIdentita>(
  ws: string, c: Collegamenti, progetti: readonly P[],
  p: { io: string; esiste: (percorso: string) => boolean; diSistema: (nome: string) => boolean }
): DecisioneProgettoWs {
  let e = progettoDelWorkspace(ws, c, progetti)
  // «A:B» ha la cartella «A-B»: anche quel nome dice lo stesso progetto.
  if (e.tipo === 'nessuno') {
    const n = nomeComune(ws)
    if (n.ok && n.nome !== ws) {
      const k = chiaveProgetto(n.nome)
      const stessi = progetti.filter((x) => chiaveProgetto(x.nome) === k)
      if (stessi.length === 1) e = { tipo: 'nome', progetto: stessi[0] as P }
      else if (stessi.length > 1) e = { tipo: 'ambiguo', progetti: stessi }
    }
  }
  const usa = (x: P, collegare: boolean): DecisioneProgettoWs => {
    if (x.proprietario !== undefined && x.proprietario !== p.io) return { tipo: 'altrove', id: x.id, pc: x.proprietario }
    if (x.proprietario === undefined) return { tipo: 'niente', perche: `il progetto «${x.nome}» non ha ancora un proprietario` }
    if (x.percorso === undefined || !p.esiste(x.percorso)) return { tipo: 'niente', perche: `la cartella del progetto «${x.nome}» non c’è su questo PC${x.percorso !== undefined ? ` (${x.percorso})` : ''}: non ne creo un’altra` }
    return { tipo: 'usa', id: x.id, percorso: x.percorso, collega: collegare }
  }
  switch (e.tipo) {
    case 'collegato': return usa(e.progetto, false)
    case 'nome': return usa(e.progetto, true)
    case 'tolto': return { tipo: 'niente', perche: 'il suo progetto è stato tolto o eliminato' }
    case 'scollegato': return { tipo: 'niente', perche: 'il workspace è scollegato dai progetti' }
    case 'ambiguo': {
      const qui = e.progetti.find((x) => x.proprietario === p.io && x.percorso !== undefined && p.esiste(x.percorso))
      return qui !== undefined ? usa(qui, false) : { tipo: 'niente', perche: `${e.progetti.length} progetti con lo stesso nome: doppioni da unire in Gestione progetti` }
    }
    default: {
      const n = nomeComune(ws)
      if (!n.ok || p.diSistema(ws)) return { tipo: 'niente', perche: n.ok ? 'nome di una cartella di sistema' : n.motivo }
      return { tipo: 'crea', nomeCartella: n.nome }
    }
  }
}

/* ------------------------------------------------------------------ */
/* «Il workspace si chiama come la cartella» (13/11).                 */
/* ------------------------------------------------------------------ */

export type RinominaWs = { da: string; a: string; progetto: string }
export type CollisioneNome = { nome: string; workspace: string[]; perche: string }

/**
 * Le rinomine dei workspace perché abbiano il nome della cartella del loro
 * progetto. Non sposta mai file: cambia solo il nome del workspace. Se due
 * workspace vorrebbero lo stesso nome, o il nome c'è già, o la cartella ha un
 * nome che un workspace non può avere, non si rinomina niente e si segnala.
 *
 * `soloCambiati` (la regola che segue nel tempo): si rinomina solo dove il
 * progetto ha cambiato nome dall'ultima volta (il collegamento lo ricorda) e il
 * workspace aveva ancora il nome di allora. Così un «Torna come prima» di
 * Nicholas resta com'è. Senza: la migrazione di una volta, per tutti.
 * `fermi`: i workspace da non toccare (la casa di un autopilota), con il motivo.
 */
export function pianoNomiWorkspace<P extends ProgettoIdentita>(p: {
  workspace: readonly string[]
  collegamenti: Collegamenti
  progetti: readonly P[]
  soloCambiati?: boolean
  fermi?: Readonly<Record<string, string>>
}): { rinomine: RinominaWs[]; collisioni: CollisioneNome[]; collegamenti: Collegamenti } {
  const voluti: { da: string; a: string; progetto: string }[] = []
  const collisioni: CollisioneNome[] = []
  let collegamenti = p.collegamenti
  for (const ws of p.workspace) {
    const l = p.collegamenti.collegati[ws]
    if (l === undefined) continue
    const prog = p.progetti.find((x) => x.id === l.id)
    if (prog === undefined) continue
    const cartella = nomeCartellaDi(prog)
    if (ws === cartella) {
      if (l.nome !== cartella) collegamenti = collega(collegamenti, ws, { id: l.id, nome: cartella })
      continue
    }
    if (p.soloCambiati === true && (l.nome === cartella || ws !== l.nome)) continue
    const fermo = p.fermi?.[ws]
    if (fermo !== undefined) { collisioni.push({ nome: cartella, workspace: [ws], perche: fermo }); continue }
    if (!cartellaVaBeneComeWorkspace(cartella)) {
      collisioni.push({ nome: cartella, workspace: [ws], perche: `la cartella «${cartella}» ha un nome che un workspace non può avere (troppo lungo o con caratteri non validi)` })
      continue
    }
    voluti.push({ da: ws, a: cartella, progetto: prog.id })
  }
  const restano = new Set(p.workspace.filter((w) => !voluti.some((v) => v.da === w)))
  const perNome = new Map<string, RinominaWs[]>()
  for (const v of voluti) perNome.set(v.a.toLowerCase(), [...(perNome.get(v.a.toLowerCase()) ?? []), v])
  const rinomine: RinominaWs[] = []
  for (const gruppo of perNome.values()) {
    const a = (gruppo[0] as RinominaWs).a
    const occupato = [...restano].find((w) => w.toLowerCase() === a.toLowerCase())
    if (gruppo.length > 1 || occupato !== undefined) {
      collisioni.push({
        nome: a,
        workspace: [...gruppo.map((g) => g.da), ...(occupato !== undefined ? [occupato] : [])],
        perche: gruppo.length > 1 ? `${gruppo.length} workspace vorrebbero chiamarsi «${a}»` : `c'è già un workspace «${occupato as string}»`
      })
      continue
    }
    rinomine.push(gruppo[0] as RinominaWs)
  }
  for (const r of rinomine) {
    const l = collegamenti.collegati[r.da] as Collegamento
    collegamenti = rinominaInCollegamenti(collegamenti, r.da, r.a)
    collegamenti = collega(collegamenti, r.a, { id: l.id, nome: r.a })
  }
  return { rinomine, collisioni, collegamenti }
}

/** Le rinomine al contrario, per «Torna come prima»: solo dove il nome nuovo c'è ancora e quello vecchio è libero. */
export function pianoTornaComePrima(rinominati: readonly { da: string; a: string }[], workspace: readonly string[]): { da: string; a: string }[] {
  const ci = new Set(workspace.map((w) => w.toLowerCase()))
  const fuori: { da: string; a: string }[] = []
  for (const r of rinominati) {
    if (!workspace.includes(r.a)) continue
    if (ci.has(r.da.toLowerCase()) && r.da.toLowerCase() !== r.a.toLowerCase()) continue
    fuori.push({ da: r.a, a: r.da })
    ci.delete(r.a.toLowerCase())
    ci.add(r.da.toLowerCase())
  }
  return fuori
}
