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
 *   fondo alla sua priorità;
 * - 11/11: la voce non cade più. Dopo {@link SVEGLIE_MAX} sveglie a vuoto
 *   resta in fila e **riposa** (5, 10, 20, 40 minuti, poi un'ora): intanto non
 *   tiene nessun posto prenotato, e se il suo autopilota rilancia e c'è un
 *   posto libero passa subito. Prima cadeva dalla lista e il compito restava
 *   «da fare» per sempre;
 * - la voce esce dalla lista quando lo Agent passa davvero la guardia.
 */

export const PRENOTAZIONE_MS = 5 * 60_000
/** Dopo così tante sveglie a vuoto la voce va a riposo (non cade più, 11/11). */
export const SVEGLIE_MAX = 3
/** Il riposo più lungo fra una sveglia a vuoto e la prossima. */
export const RIPOSO_MASSIMO_MS = 60 * 60_000
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
  /** 11/11: a riposo fino a quest'ora (ISO) dopo troppe sveglie a vuoto: resta in fila, ma non le si prenota un posto. */
  riposaFino?: string
  /** Fermato da Nicholas con «Ferma e metti in cima» (k-53): il suo lavoro resta sul ramo, riparte per primo. */
  parcheggiata?: true
  /** Il ramo dove il lavoro fermato resta salvato. */
  ramo?: string
  /** 06/11: il prompt dell'Agent rifiutato dal tetto: mai perso, sta in questa voce finché non riparte. */
  prompt?: string
  /** Rifiutato dal tetto di specialisti (non fermato da Nicholas). */
  rifiutata?: true
}

export type StatoAttesa = {
  voci: VoceAttesa[]
  prossimo: number
  /**
   * La precedenza di un workspace (k-53): chi la alza prende il prossimo posto
   * libero prima degli altri, anche se il suo specialista non è ancora in fila.
   * Le voci nuove del workspace partono da questa priorità. Assente = nessuna.
   */
  precedenze?: Record<string, number>
}

export const attesaVuota = (): StatoAttesa => ({ voci: [], prossimo: 1 })

/** Quello che serve a riconoscere una richiesta. */
export type RichiestaSpecialista = {
  workspace: string
  autopilota?: string
  descrizione: string
  tipo: string
  /** Il prompt dell'Agent, se il programma lo conosce (06/11: tetto pieno, si rilancia senza perderlo). */
  prompt?: string
}

/**
 * Cosa è cambiato in una mossa: chi va svegliato, e `cadute`. 11/11: le
 * «cadute» non escono più dalla lista: sono le voci appena messe a riposo
 * dopo {@link SVEGLIE_MAX} sveglie a vuoto (lo si dice una volta sola).
 */
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
/** A riposo dopo troppe sveglie a vuoto (11/11): in fila, ma senza posto prenotato finché il riposo non finisce. */
export const aRiposo = (v: VoceAttesa, adesso: number): boolean => v.riposaFino !== undefined && Date.parse(v.riposaFino) > adesso
/** Quanto riposa una voce svegliata a vuoto `sveglie` volte: 5, 10, 20, 40 minuti, poi un'ora. */
export function riposoDopo(sveglie: number): number {
  return Math.min(RIPOSO_MASSIMO_MS, PRENOTAZIONE_MS * 2 ** Math.min(10, Math.max(0, sveglie - SVEGLIE_MAX)))
}

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

/**
 * Le prenotazioni scadute: chi le aveva torna in fondo alla sua priorità.
 * 11/11: dopo troppe sveglie a vuoto la voce non cade, va a riposo e resta in
 * fila; in `cadute` c'è solo la prima volta, per dirlo al suo autopilota.
 */
export function scadute(stato: StatoAttesa, adesso: number): Mossa {
  const cadute: VoceAttesa[] = []
  let prossimo = stato.prossimo
  const voci: VoceAttesa[] = []
  for (const v of stato.voci) {
    if (v.prenotataFino === undefined || prenotata(v, adesso)) { voci.push(v); continue }
    const { prenotataFino: _p, ...resto } = v
    // Chi era stato parcheggiato (k-53) e non ha rilanciato torna in fondo come gli altri: la precedenza è esaurita.
    const { parcheggiata: _q, ...normale } = resto
    if (v.sveglie >= SVEGLIE_MAX) {
      voci.push({ ...normale, ordine: prossimo, riposaFino: iso(adesso + riposoDopo(v.sveglie)) })
      if (v.sveglie === SVEGLIE_MAX) cadute.push(v)
    } else voci.push({ ...normale, ordine: prossimo })
    prossimo += 1
  }
  return { stato: { ...stato, voci, prossimo }, svegli: [], cadute }
}

/** Ai posti liberi non ancora prenotati: prenota i primi in fila e dice chi svegliare. */
export function assegna(stato: StatoAttesa, liberi: number, adesso: number): Mossa {
  let presi = stato.voci.filter((v) => prenotata(v, adesso)).length
  const svegli: VoceAttesa[] = []
  const nuove = new Map<string, VoceAttesa>()
  // 11/11: chi riposa non prende il posto: resta libero per chi arriva, o per lui se rilancia.
  for (const v of ordinate(stato.voci.filter((x) => !prenotata(x, adesso) && !aRiposo(x, adesso)))) {
    if (presi >= liberi) break
    const { riposaFino: _r, ...sveglio } = v
    const n: VoceAttesa = { ...sveglio, prenotataFino: iso(adesso + PRENOTAZIONE_MS), sveglie: v.sveglie + 1 }
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
    // 11/11: anche chi riposa (senza prenotazione): se rilancia e c'è un posto che nessuno ha prenotato, passa.
    if (p.liberi > 0 && (prenotata(esistente, p.adesso) || p.liberi - prenotati > 0)) {
      s = { ...s, voci: s.voci.filter((v) => v.id !== esistente.id) }
      return { passa: true, mossa: mossa(), voce: esistente }
    }
    const f = inFila(s, p.adesso)
    const mia = f.find((v) => v.id === esistente.id)!
    return { passa: false, mossa: mossa(), voce: esistente, posizione: mia.posizione, davanti: mia.posizione - 1, nuova: false }
  }

  // Dopo `rivedi` ogni posto libero con qualcuno in fila è già prenotato: se ne resta uno non prenotato, la fila è vuota
  // (o chi c'è sta riposando, 11/11: non tiene il posto).
  if (p.liberi - prenotati > 0) return { passa: true, mossa: mossa() }

  const voce: VoceAttesa = {
    id: p.id(), workspace: r.workspace, ...(r.autopilota !== undefined ? { autopilota: r.autopilota } : {}),
    ...(compitoDi(r.descrizione) !== undefined ? { compito: compitoDi(r.descrizione)! } : {}),
    descrizione: r.descrizione.replace(/\s+/gu, ' ').trim().slice(0, 200), tipo: r.tipo,
    dal: iso(p.adesso), priorita: s.precedenze?.[r.workspace] ?? 0, ordine: s.prossimo, sveglie: 0
  }
  s = { ...s, voci: [...s.voci, voce], prossimo: s.prossimo + 1 }
  const posizione = inFila(s, p.adesso).find((v) => v.id === voce.id)!.posizione
  return { passa: false, mossa: mossa(), voce, posizione, davanti: posizione - 1, nuova: true }
}

/**
 * 06/11: l'Agent è stato rifiutato dal tetto di specialisti contemporanei.
 * Non è fallito: entra in fila (una volta sola, la stessa richiesta non si
 * duplica) con il suo prompt, davanti a chi non ha ancora aspettato.
 */
export function rifiutata(stato: StatoAttesa, r: RichiestaSpecialista & { compito?: string }, p: { adesso: number; id: () => string }): StatoAttesa {
  const prompt = r.prompt !== undefined && r.prompt.trim() !== '' ? r.prompt : undefined
  const esistente = trovaVoce(stato, r)
  if (esistente !== undefined) {
    return { ...stato, voci: stato.voci.map((v) => (v.id === esistente.id ? { ...v, rifiutata: true as const, ...(prompt !== undefined ? { prompt } : {}) } : v)) }
  }
  const compito = compitoDi(r.descrizione)
  const voce: VoceAttesa = {
    id: p.id(), workspace: r.workspace, ...(r.autopilota !== undefined ? { autopilota: r.autopilota } : {}),
    ...(compito !== undefined ? { compito } : {}),
    descrizione: r.descrizione.replace(/\s+/gu, ' ').trim().slice(0, 200), tipo: r.tipo,
    dal: iso(p.adesso), priorita: stato.precedenze?.[r.workspace] ?? 0,
    ordine: stato.voci.reduce((m, v) => Math.min(m, v.ordine), stato.prossimo) - 1,
    sveglie: 0, rifiutata: true, ...(prompt !== undefined ? { prompt } : {})
  }
  return { ...stato, voci: [...stato.voci, voce] }
}

export type MossaPriorita = 'su' | 'giu' | 'cima'
/** Le mosse delle rotte: le tre della fila e `ferma` («Ferma e metti in cima»: solo a mano, solo per chi lavora). */
export type MossaAttesa = MossaPriorita | 'ferma'

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

/**
 * La precedenza di un workspace (k-53), per chi è già al lavoro o ancora nel
 * piano e quindi non ha una voce in fila: stesse mosse di {@link cambiaPriorita}.
 * `cima` lo porta sopra tutti gli altri; `su` e `giu` di un gradino. Le sue
 * voci già in fila prendono la nuova priorità; quelle nuove ci partono.
 *
 * Cambia **solo l'ordine di chi aspetta un posto**: non tocca nessuno
 * specialista già al lavoro, non li scavalca e non li ferma mai.
 */
export function cambiaPrecedenzaWorkspace(stato: StatoAttesa, workspace: string, mossa: MossaPriorita): StatoAttesa {
  const prec = { ...(stato.precedenze ?? {}) }
  const vecchia = prec[workspace] ?? 0
  const altre = Math.max(0, ...stato.voci.filter((v) => v.workspace !== workspace).map((v) => v.priorita), ...Object.entries(prec).filter(([w]) => w !== workspace).map(([, n]) => n))
  const nuova = limita(mossa === 'cima' ? (vecchia > altre ? vecchia : altre + 1) : mossa === 'su' ? vecchia + 1 : vecchia - 1)
  if (nuova === 0) delete prec[workspace]
  else prec[workspace] = nuova
  const voci = stato.voci.map((v) => {
    if (v.workspace !== workspace) return v
    if (mossa === 'giu') return v.priorita === vecchia ? { ...v, priorita: nuova } : v
    return v.priorita < nuova ? { ...v, priorita: nuova } : v
  })
  return { ...stato, voci, precedenze: prec }
}

/**
 * **Ferma e metti in cima** (k-53): lo specialista fermato da Nicholas entra
 * nella fila, che qui è il parcheggio, davanti a tutti: priorità sopra ogni
 * altra e arrivo prima di ogni altro. Il lavoro resta sul suo ramo. Se la stessa
 * richiesta è già in fila, la voce c'è già e viene solo portata davanti.
 * Quando si libera un posto è il primo a essere prenotato.
 */
export function parcheggia(stato: StatoAttesa, r: RichiestaSpecialista & { compito?: string; ramo?: string }, p: { adesso: number; id: () => string }): StatoAttesa {
  const alte = [...stato.voci.map((v) => v.priorita), ...Object.values(stato.precedenze ?? {})]
  const priorita = limita(Math.max(0, ...alte) + 1)
  const ordine = stato.voci.reduce((m, v) => Math.min(m, v.ordine), stato.prossimo) - 1
  const esistente = trovaVoce(stato, r)
  if (esistente !== undefined) {
    const { prenotataFino: _p, ...resto } = esistente
    return { ...stato, voci: stato.voci.map((v) => (v.id === esistente.id ? { ...resto, priorita, ordine, parcheggiata: true as const, ...(r.ramo !== undefined ? { ramo: r.ramo } : {}) } : v)) }
  }
  const voce: VoceAttesa = {
    id: p.id(), workspace: r.workspace, ...(r.autopilota !== undefined ? { autopilota: r.autopilota } : {}),
    ...(r.compito !== undefined ? { compito: r.compito } : {}),
    descrizione: r.descrizione.replace(/\s+/gu, ' ').trim().slice(0, 200), tipo: r.tipo,
    dal: iso(p.adesso), priorita, ordine, sveglie: 0, parcheggiata: true, ...(r.ramo !== undefined ? { ramo: r.ramo } : {})
  }
  return { ...stato, voci: [...stato.voci, voce] }
}

/** Toglie una voce. `undefined` se non c'è. */
export function togliVoce(stato: StatoAttesa, id: string): { stato: StatoAttesa; voce: VoceAttesa } | undefined {
  const voce = stato.voci.find((v) => v.id === id)
  return voce === undefined ? undefined : { stato: { ...stato, voci: stato.voci.filter((v) => v.id !== id) }, voce }
}

/** Il posto in fila a parole: «2°». */
export const ordinale = (n: number): string => `${n}°`

/** La stima di una voce (k-53): tutti campi facoltativi, i client vecchi li ignorano. */
export type StimaVoce = {
  /** Il nome leggibile del workspace (l'ultimo pezzo del percorso). */
  workspaceNome?: string
  /** Il titolo del compito, al più una sessantina di caratteri. */
  titolo?: string
  /** «Cosa fa adesso» in una riga, dall'ultima azione; assente se non si sa. */
  cosaFa?: string
  /** Da 0 a 95: mai 100 finché non è finito. Per chi è in fila è 0. */
  percentuale?: number
  /** Minuti stimati alla fine; per chi è in fila includono l'attesa del posto. */
  minutiStimati?: number
  /** Ha superato la durata attesa: la percentuale resta al tetto. */
  inRitardo?: true
  /** Il peso del compito (1-3), se è nel piano. */
  peso?: 1 | 2 | 3
}

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
    /** La precedenza del suo workspace per il prossimo posto libero (k-53); non ferma nessuno. */
    precedenza?: number
    /** Nicholas ha chiesto «Ferma e metti in cima»: si sta fermando ed è già in fila davanti a tutti. */
    fermaRichiesta?: true
  } & StimaVoce>
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
    /** Fermato da Nicholas con «Ferma e metti in cima»: riparte per primo dal suo ramo (k-53). */
    parcheggiata?: true
    /** Il ramo dove il suo lavoro resta salvato. */
    ramo?: string
  } & StimaVoce>
  /** Il lavoro che resta per svuotare la lista, con i posti in parallelo (k-53). */
  totale?: { minuti: number; compiti: number }
}
