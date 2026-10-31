/**
 * **Gli autopiloti doppioni** (31/10): dopo «ogni progetto vive su un PC
 * solo» (0.88.0) su ogni PC restano gli autopiloti dei workspace i cui
 * progetti ora stanno altrove. Non lavorano più (0.88.8, `contestoTurno`), ma
 * restano in elenco e si riaccendono a ogni evento. Nicholas, 31/10: «pulizia
 * automatica su ogni PC, solo cose sicure».
 *
 * Un autopilota di workspace è un doppione su questo PC se la sua cartella:
 * 1. non c'è; oppure
 * 2. ha il nome (l'ultima parte del percorso, senza maiuscole) di un progetto
 *    del registro che ha per proprietario **un altro** PC, e nessun progetto
 *    con quel nome è di questo PC.
 * Un progetto che il registro non conosce (NexoraOS) non è mai un doppione.
 *
 * Qui solo la decisione, pura: il servizio la usa e fa il resto (ferma,
 * archivia, mette nel recupero); il programma gli manda il registro.
 */

/** L'autopilota di un workspace come lo vede il servizio. */
export type OrchestratoreSulPc = { ws: string; autopilota: string; cwd: string }

/** Di un progetto del registro basta questo. */
export type ProgettoNoto = { nome: string; proprietario?: string }

export type Doppione = {
  ws: string
  autopilota: string
  cwd: string
  motivo: 'cartella-mancante' | 'altro-pc'
  /** Per «altro-pc»: l'id del PC proprietario. */
  pc?: string
}

/** Quello che il programma manda al servizio (`POST /orchestratore/doppioni`). */
export type RichiestaDoppioni = {
  pcId: string
  progetti: ProgettoNoto[]
  /** I nomi dei PC da mostrare, per id. */
  nomiPc: Record<string, string>
}

/** Il nome di una cartella per il confronto: l'ultima parte del percorso, senza maiuscole. Puro, senza `node:path`. */
export function nomeDiCartella(percorso: string): string {
  const parti = percorso.split(/[\\/]+/u).filter((x) => x.trim() !== '')
  return (parti.at(-1) ?? '').normalize('NFC').trim().toLowerCase()
}

const nomeDiProgetto = (nome: string): string => nome.normalize('NFC').trim().toLowerCase()

/** Quali autopiloti sono doppioni su questo PC. Pura; `giaFatti`: gli autopiloti già archiviati, che non si riguardano. */
export function doppioniDaArchiviare(p: {
  orchestratori: OrchestratoreSulPc[]
  progetti: ProgettoNoto[]
  pcId: string
  esiste: (cartella: string) => boolean
  giaFatti?: ReadonlySet<string>
}): Doppione[] {
  // Senza sapere chi è questo PC non si decide niente: ogni progetto sembrerebbe di un altro.
  if (p.pcId.trim() === '') return []
  const miei = new Set<string>()
  const altrui = new Map<string, string>()
  for (const g of p.progetti) {
    const n = nomeDiProgetto(g.nome)
    if (n === '' || g.proprietario === undefined || g.proprietario === '') continue
    if (g.proprietario === p.pcId) miei.add(n)
    else if (!altrui.has(n)) altrui.set(n, g.proprietario)
  }
  const fuori: Doppione[] = []
  for (const o of p.orchestratori) {
    if (p.giaFatti?.has(o.autopilota) === true || o.cwd.trim() === '') continue
    if (!p.esiste(o.cwd)) { fuori.push({ ...o, motivo: 'cartella-mancante' }); continue }
    const n = nomeDiCartella(o.cwd)
    const di = altrui.get(n)
    if (di !== undefined && !miei.has(n)) fuori.push({ ...o, motivo: 'altro-pc', pc: di })
  }
  return fuori
}

/** La riga del registro per un doppione archiviato. Pura. */
export function rigaDoppione(d: Doppione, nomiPc: Readonly<Record<string, string>> = {}): string {
  const perche = d.motivo === 'altro-pc'
    ? `il progetto vive su ${(d.pc !== undefined ? nomiPc[d.pc] : undefined) ?? 'un altro PC'}`
    : `la cartella ${d.cwd} non c’è su questo PC`
  return `[pulizia] autopilota di ${d.ws} archiviato: ${perche}`
}

/** Il corpo della richiesta, controllato. `undefined` se non va. Pura. */
export function leggiRichiestaDoppioni(x: unknown): RichiestaDoppioni | undefined {
  if (typeof x !== 'object' || x === null) return undefined
  const o = x as Record<string, unknown>
  if (typeof o.pcId !== 'string' || o.pcId.trim() === '' || !Array.isArray(o.progetti)) return undefined
  const progetti = o.progetti.flatMap((g): ProgettoNoto[] => {
    if (typeof g !== 'object' || g === null) return []
    const q = g as Record<string, unknown>
    if (typeof q.nome !== 'string' || q.nome === '') return []
    return [{ nome: q.nome, ...(typeof q.proprietario === 'string' && q.proprietario !== '' ? { proprietario: q.proprietario } : {}) }]
  })
  const nomiPc: Record<string, string> = {}
  if (typeof o.nomiPc === 'object' && o.nomiPc !== null && !Array.isArray(o.nomiPc)) {
    for (const [id, nome] of Object.entries(o.nomiPc as Record<string, unknown>)) if (typeof nome === 'string' && nome !== '') nomiPc[id] = nome
  }
  return { pcId: o.pcId, progetti, nomiPc }
}

/** L'impronta di una richiesta: due uguali, niente da rimandare. Pura. */
export function firmaRichiestaDoppioni(r: RichiestaDoppioni): string {
  const progetti = r.progetti
    .map((g) => `${nomeDiProgetto(g.nome)}|${g.proprietario ?? ''}`)
    .sort()
  const nomi = Object.entries(r.nomiPc).map(([id, n]) => `${id}=${n}`).sort()
  return JSON.stringify([r.pcId, progetti, nomi])
}
