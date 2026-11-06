/**
 * **La lista d'attesa degli specialisti** (k-48, 06/11). Quando i posti del PC
 * sono pieni la guardia rifiuta un Agent, e prima il rifiutato non restava da
 * nessuna parte: l'autopilota doveva ricordarsi di riprovare. Ora ogni
 * richiesta rifiutata per posti pieni sta in questa lista, una per tutto il PC.
 *
 * Tutto puro (il disco è in `autopilot-host/attesa-store.ts`):
 * - l'ordine è la priorità (più alta prima), poi l'arrivo (`ordine`);
 * - quando un posto si libera il primo in fila ha il posto **prenotato** per
 *   {@link PRENOTAZIONE_MS}: il servizio sveglia il suo autopilota, che rilancia;
 * - una prenotazione non usata passa al successivo, e chi l'ha persa va in
 *   fondo alla sua priorità; dopo {@link SVEGLIE_MAX} sveglie a vuoto la voce cade;
 * - la voce esce dalla lista quando lo Agent passa davvero la guardia.
 */

export const PRENOTAZIONE_MS = 5 * 60_000
export const SVEGLIE_MAX = 3
export const PRIORITA_MAX = 99

export type VoceAttesa = {
  id: string
  workspace: string
  /** L'id dell'autopilota del workspace, se si sa. */
  autopilota?: string
  /** Il compito del piano («k-48»), preso dalla descrizione dell'Agent. */
  compito?: string
  /** La descrizione breve dell'Agent. */
  descrizione: string
  /** Il tipo di specialista (`subagent_type`). */
  tipo: string
  /** Da quando aspetta (ISO). */
  dal: string
  /** Più alta, prima in fila. Parte da 0. */
  priorita: number
  /** L'arrivo: a parità di priorità, il più basso passa prima. */
  ordine: number
  /** Il posto è suo fino a quest'ora (ISO). */
  prenotataFino?: string
  /** Quante volte è stato svegliato per questo turno. */
  sveglie: number
}

export type StatoAttesa = { voci: VoceAttesa[]; prossimo: number }

export const attesaVuota = (): StatoAttesa => ({ voci: [], prossimo: 1 })

/** Quello che serve a riconoscere una richiesta. */
export type RichiestaSpecialista = {
  workspace: string
  autopilota?: string
  descrizione: string
  tipo: string
}

/** Cosa è cambiato in una mossa: chi va svegliato, chi è caduto. */
export type Mossa = { stato: StatoAttesa; svegli: VoceAttesa[]; cadute: VoceAttesa[] }

const norma = (t: string): string => t.toLowerCase().replace(/\s+/gu, ' ').trim()
const iso = (ms: number): string => new Date(ms).toISOString()

/** L'id del compito in testa alla descrizione: «k-48: …», «[k-48] …». */
export function compitoDi(descrizione: string): string | undefined {
  const m = /^\s*(?:\[([A-Za-z]{1,4}-\d{1,6})\]|([A-Za-z]{1,4}-\d{1,6})\s*[:—–-])/u.exec(descrizione)
  return m?.[1] ?? m?.[2]
}

/** La stessa richiesta ripetuta ha la stessa chiave: il compito, se c'è, altrimenti il testo. */
export function chiaveRichiesta(r: RichiestaSpecialista): string {
  const k = compitoDi(r.descrizione)
  return `${norma(r.workspace)}|${k !== undefined ? norma(k) : `${norma(r.tipo)}|${norma(r.descrizione)}`}`
}

const chiaveVoce = (v: VoceAttesa): string => chiaveRichiesta({ workspace: v.workspace, descrizione: v.descrizione, tipo: v.tipo })

const prenotata = (v: VoceAttesa, adesso: number): boolean => v.prenotataFino !== undefined && Date.parse(v.prenotataFino) > adesso

/** In fila: priorità più alta prima, poi l'arrivo. */
export function ordinate(voci: VoceAttesa[]): VoceAttesa[] {
  return [...voci].sort((a, b) => b.priorita - a.priorita || a.ordine - b.ordine || a.dal.localeCompare(b.dal) || a.id.localeCompare(b.id))
}

/**
 * La fila com'è mostrata: chi ha il posto prenotato per primo (sta per
 * partire), poi gli altri in ordine. Dà anche la posizione, da 1.
 */
export function inFila(stato: StatoAttesa, adesso: number): Array<VoceAttesa & { posizione: number; prenotata: boolean }> {
  const o = ordinate(stato.voci)
  const prima = [...o.filter((v) => prenotata(v, adesso)), ...o.filter((v) => !prenotata(v, adesso))]
  return prima.map((v, i) => ({ ...v, posizione: i + 1, prenotata: prenotata(v, adesso) }))
}

export function trovaVoce(stato: StatoAttesa, r: RichiestaSpecialista): VoceAttesa | undefined {
  const k = chiaveRichiesta(r)
  return stato.voci.find((v) => chiaveVoce(v) === k)
}

/** Le prenotazioni scadute: chi le aveva torna in fondo alla sua priorità, o cade dopo troppe sveglie a vuoto. */
export function scadute(stato: StatoAttesa, adesso: number): Mossa {
  const cadute: VoceAttesa[] = []
  let prossimo = stato.prossimo
  const voci: VoceAttesa[] = []
  for (const v of stato.voci) {
    if (v.prenotataFino === undefined || prenotata(v, adesso)) { voci.push(v); continue }
    if (v.sveglie >= SVEGLIE_MAX) { cadute.push(v); continue }
    const { prenotataFino: _p, ...resto } = v
    voci.push({ ...resto, ordine: prossimo })
    prossimo += 1
  }
  return { stato: { voci, prossimo }, svegli: [], cadute }
}

/** Ai posti liberi non ancora prenotati: prenota i primi in fila e dice chi svegliare. */
export function assegna(stato: StatoAttesa, liberi: number, adesso: number): Mossa {
  let presi = stato.voci.filter((v) => prenotata(v, adesso)).length
  const svegli: VoceAttesa[] = []
  const nuove = new Map<string, VoceAttesa>()
  for (const v of ordinate(stato.voci.filter((x) => !prenotata(x, adesso)))) {
    if (presi >= liberi) break
    const n: VoceAttesa = { ...v, prenotataFino: iso(adesso + PRENOTAZIONE_MS), sveglie: v.sveglie + 1 }
    nuove.set(v.id, n)
    svegli.push(n)
    presi += 1
  }
  return { stato: { ...stato, voci: stato.voci.map((v) => nuove.get(v.id) ?? v) }, svegli, cadute: [] }
}

/** Il giro di controllo: scadenze, poi i posti liberi ai primi in fila. */
export function rivedi(stato: StatoAttesa, liberi: number, adesso: number): Mossa {
  const a = scadute(stato, adesso)
  const b = assegna(a.stato, liberi, adesso)
  return { stato: b.stato, svegli: b.svegli, cadute: a.cadute }
}

export type Passo =
  | { passa: true; mossa: Mossa; voce?: VoceAttesa }
  | { passa: false; mossa: Mossa; voce: VoceAttesa; posizione: number; davanti: number; nuova: boolean }

/**
 * Una richiesta di Agent arriva alla guardia, con `liberi` posti liberi sul PC.
 * Prima si rivedono le prenotazioni, così ogni posto libero con qualcuno in
 * fila è già di chi è primo. Passa chi ha il posto prenotato, o chi è nuovo e
 * trova un posto libero che nessuno in fila si aspetta. Chi prova a passare
 * davanti a uno in fila (che ha il posto prenotato, o priorità uguale o più
 * alta) entra in fila anche lui, una volta sola: la stessa richiesta non si duplica.
 */
export function passo(stato: StatoAttesa, r: RichiestaSpecialista, p: { liberi: number; adesso: number; id: () => string }): Passo {
  const rivista = rivedi(stato, p.liberi, p.adesso)
  let s = rivista.stato
  const mossa = (): Mossa => ({ stato: s, svegli: rivista.svegli, cadute: rivista.cadute })
  const esistente = trovaVoce(s, r)
  const prenotati = s.voci.filter((v) => prenotata(v, p.adesso)).length

  if (esistente !== undefined) {
    if (p.liberi > 0 && prenotata(esistente, p.adesso)) {
      s = { ...s, voci: s.voci.filter((v) => v.id !== esistente.id) }
      return { passa: true, mossa: mossa(), voce: esistente }
    }
    const f = inFila(s, p.adesso)
    const mia = f.find((v) => v.id === esistente.id)!
    return { passa: false, mossa: mossa(), voce: esistente, posizione: mia.posizione, davanti: mia.posizione - 1, nuova: false }
  }

  // Dopo `rivedi` ogni posto libero con qualcuno in fila è già prenotato: se ne resta uno non prenotato, la fila è vuota.
  if (p.liberi - prenotati > 0) return { passa: true, mossa: mossa() }

  const voce: VoceAttesa = {
    id: p.id(), workspace: r.workspace, ...(r.autopilota !== undefined ? { autopilota: r.autopilota } : {}),
    ...(compitoDi(r.descrizione) !== undefined ? { compito: compitoDi(r.descrizione)! } : {}),
    descrizione: r.descrizione.replace(/\s+/gu, ' ').trim().slice(0, 200), tipo: r.tipo,
    dal: iso(p.adesso), priorita: 0, ordine: s.prossimo, sveglie: 0
  }
  s = { voci: [...s.voci, voce], prossimo: s.prossimo + 1 }
  const posizione = inFila(s, p.adesso).find((v) => v.id === voce.id)!.posizione
  return { passa: false, mossa: mossa(), voce, posizione, davanti: posizione - 1, nuova: true }
}

export type MossaPriorita = 'su' | 'giu' | 'cima'

const limita = (n: number): number => Math.max(-PRIORITA_MAX, Math.min(PRIORITA_MAX, n))

/**
 * Cambia la priorità di una voce: `su` e `giu` la spostano di un posto in
 * fila, `cima` in testa. Torna `undefined` se la voce non c'è.
 */
export function cambiaPriorita(stato: StatoAttesa, id: string, mossa: MossaPriorita): StatoAttesa | undefined {
  const o = ordinate(stato.voci)
  const i = o.findIndex((v) => v.id === id)
  if (i < 0) return undefined
  const mia = o[i]!
  let nuova: VoceAttesa = mia
  if (mossa === 'cima') {
    const primo = o[0]!
    if (primo.id !== mia.id) nuova = { ...mia, priorita: limita(primo.priorita), ordine: primo.ordine - 1 }
  } else if (mossa === 'su') {
    const p = o[i - 1]
    if (p !== undefined) {
      if (p.priorita === mia.priorita) return { ...stato, voci: stato.voci.map((v) => (v.id === mia.id ? { ...v, ordine: p.ordine } : v.id === p.id ? { ...v, ordine: mia.ordine } : v)) }
      const pp = o[i - 2]
      const sotto = pp !== undefined && pp.priorita === p.priorita ? pp.ordine : p.ordine - 1
      nuova = { ...mia, priorita: limita(p.priorita), ordine: (sotto + p.ordine) / 2 }
    }
  } else {
    const n = o[i + 1]
    if (n !== undefined) {
      if (n.priorita === mia.priorita) return { ...stato, voci: stato.voci.map((v) => (v.id === mia.id ? { ...v, ordine: n.ordine } : v.id === n.id ? { ...v, ordine: mia.ordine } : v)) }
      const nn = o[i + 2]
      const sopra = nn !== undefined && nn.priorita === n.priorita ? nn.ordine : n.ordine + 1
      nuova = { ...mia, priorita: limita(n.priorita), ordine: (n.ordine + sopra) / 2 }
    }
  }
  return { ...stato, voci: stato.voci.map((v) => (v.id === id ? nuova : v)) }
}

/** Toglie una voce. `undefined` se non c'è. */
export function togliVoce(stato: StatoAttesa, id: string): { stato: StatoAttesa; voce: VoceAttesa } | undefined {
  const voce = stato.voci.find((v) => v.id === id)
  return voce === undefined ? undefined : { stato: { ...stato, voci: stato.voci.filter((v) => v.id !== id) }, voce }
}

/** Il posto in fila a parole: «2°». */
export const ordinale = (n: number): string => `${n}°`

/** Quello che vede la sezione: chi lavora adesso e chi aspetta, in ordine. */
export type VistaAttesa = {
  /** Specialisti al lavoro sul PC e posti disponibili. */
  posti: { usati: number; tetto: number }
  alLavoro: Array<{
    /** Il numero del posto, da 1, in ordine di partenza. */
    posto: number
    id: string
    workspace: string
    autopilota?: string
    compito?: string
    descrizione: string
    tipo: string
    dal: string
  }>
  inFila: Array<{
    id: string
    posizione: number
    workspace: string
    autopilota?: string
    compito?: string
    descrizione: string
    tipo: string
    dal: string
    priorita: number
    /** Il posto è già suo: sta per partire. */
    prenotata: boolean
    prenotataFino?: string
  }>
}
