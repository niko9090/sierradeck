/**
 * **Il riassetto** (0.88): una volta sola, al primo avvio dopo
 * l'aggiornamento, pulizia e riordino di quello che i mesi passati hanno
 * lasciato nella cartella dei dati, nelle copie delle chat e nelle
 * trascrizioni. Qui le parti pure, che servono al programma, al servizio e
 * alla finestra: il giornale, la percentuale, il riepilogo.
 *
 * Le regole, tutte obbligatorie:
 * - **niente si cancella**: si sposta in `<dati>/recupero-riassetto/<versione>/<passo>/`
 *   con un `manifesto.json` (percorso di prima, peso, motivo), e lì resta 30
 *   giorni; «Annulla» rimette tutto com'era, «Libera subito» svuota prima;
 * - **un giornale** (`riassetto.json`): ogni cosa fatta si annota prima di
 *   passare alla successiva, quindi un avvio interrotto riprende da dove era;
 *   una cosa che non c'è più conta come fatta;
 * - **si salta** quello che è in uso, bloccato, toccato da poco, con modifiche
 *   non salvate o su un ramo non unito; i collegamenti non si seguono mai.
 */

/** Cambia solo se un giorno serve un secondo riassetto: con lo stesso numero, uno fatto non si rifà. */
export const EDIZIONE_RIASSETTO = 1
/** Il file del giornale, nella cartella dei dati. */
export const FILE_GIORNALE_RIASSETTO = 'riassetto.json'
/** La cartella del recupero, nella cartella dei dati. */
export const CARTELLA_RECUPERO_RIASSETTO = 'recupero-riassetto'
/** Accanto a una cosa su un altro disco, come fa la rimozione sicura. */
export const CARTELLA_RECUPERO_ACCANTO = '.sierradeck-recupero'
/** Quanti giorni resta nel recupero quello che il riassetto ha spostato. */
export const GIORNI_RECUPERO_RIASSETTO = 30
/** Sotto quest'età una cosa non si tocca: potrebbe servire ancora. */
export const ETA_MINIMA_MS = 72 * 60 * 60_000
/** I file di stato e le cartelle dismesse: almeno così vecchi. */
export const ETA_MINIMA_STATO_MS = 7 * 24 * 60 * 60_000

export type FaseRiassetto = 'A' | 'B'
export type StatoPasso = 'da-fare' | 'in-corso' | 'fatto' | 'rimandato'
export type Saltato = { cosa: string; perche: string }

export type VocePasso = {
  id: string
  titolo: string
  stato: StatoPasso
  /** Le chiavi già fatte (di solito il percorso spostato): un avvio dopo non le rifà. */
  fatti: string[]
  saltati: Saltato[]
  errori: string[]
  /** Proposte per Nicholas: cose che il riassetto non fa da solo. */
  proposte: string[]
  byteLiberati: number
  byteInRecupero: number
  iniziato?: string
  finito?: string
  /** Perché il passo aspetta (PC carico, servizio non pronto, spazio poco). */
  rimandatoPerche?: string
}

export type GiornaleRiassetto = {
  edizione: number
  versione: string
  iniziato: string
  passi: VocePasso[]
  /** Lo stampo finale, scritto per ultimo. */
  fatto?: string
  /** «Chiudi» del riepilogo. */
  chiusoIl?: string
  /** «Annulla»: tutto rimesso com'era. */
  annullatoIl?: string
  /** «Libera subito»: il recupero svuotato prima dei 30 giorni. */
  liberatoIl?: string
}

export type VoceManifesto = {
  /** Dove stava. */
  origine: string
  /** Dove sta adesso. */
  dove: string
  byte: number
  motivo: string
  tipo: 'file' | 'cartella'
  quando: string
  /** `in-corso`: annotato prima della rinomina; un avvio dopo guarda dov'è davvero. */
  stato: 'in-corso' | 'spostato' | 'ripristinato'
}

export type ManifestoRiassetto = {
  versione: string
  passo: string
  creato: string
  scadeIl: string
  voci: VoceManifesto[]
}

/** Cosa la finestra mostra mentre lavora e alla fine. */
export type ProgressoRiassetto = {
  versione: string
  percentuale: number
  /** Il titolo del passo in corso; assente a riassetto finito o fermo. */
  passo?: string
  saltatiInUso: number
  finito: boolean
  /** Fermo fino al prossimo avvio (spazio, copia di versione mancante). */
  fermoPerche?: string
}

export type RiepilogoRiassetto = {
  versione: string
  byteLiberati: number
  byteInRecupero: number
  /** Dove sta il recupero (la cartella della versione). */
  cartellaRecupero: string
  /** Fino a quando «Annulla» funziona. */
  annullabileFino: string
  saltati: Saltato[]
  proposte: string[]
  errori: string[]
  passi: Array<{ titolo: string; stato: StatoPasso; fatti: number }>
}

export type StatoRiassetto = {
  progresso: ProgressoRiassetto
  riepilogo?: RiepilogoRiassetto
  chiuso: boolean
  annullato: boolean
  liberato: boolean
}

/** Un passo vuoto per il giornale. */
export function vocePassoNuova(id: string, titolo: string): VocePasso {
  return { id, titolo, stato: 'da-fare', fatti: [], saltati: [], errori: [], proposte: [], byteLiberati: 0, byteInRecupero: 0 }
}

/** Il giornale nuovo con i passi in quest'ordine. */
export function giornaleNuovo(versione: string, passi: Array<{ id: string; titolo: string }>, adesso: string): GiornaleRiassetto {
  return { edizione: EDIZIONE_RIASSETTO, versione, iniziato: adesso, passi: passi.map((p) => vocePassoNuova(p.id, p.titolo)) }
}

/** Un giornale letto dal disco, o `undefined` se non lo è. Tollerante: i campi mancanti si riempiono. */
export function leggiGiornale(x: unknown): GiornaleRiassetto | undefined {
  if (typeof x !== 'object' || x === null) return undefined
  const o = x as Record<string, unknown>
  if (typeof o.versione !== 'string' || !Array.isArray(o.passi)) return undefined
  const passi: VocePasso[] = []
  for (const p of o.passi as unknown[]) {
    if (typeof p !== 'object' || p === null) continue
    const q = p as Record<string, unknown>
    if (typeof q.id !== 'string') continue
    const stato = q.stato === 'in-corso' || q.stato === 'fatto' || q.stato === 'rimandato' ? q.stato : 'da-fare'
    const stringhe = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [])
    passi.push({
      id: q.id,
      titolo: typeof q.titolo === 'string' ? q.titolo : q.id,
      stato,
      fatti: stringhe(q.fatti),
      saltati: Array.isArray(q.saltati)
        ? (q.saltati as unknown[]).filter((s): s is Saltato => typeof s === 'object' && s !== null && typeof (s as Saltato).cosa === 'string' && typeof (s as Saltato).perche === 'string')
        : [],
      errori: stringhe(q.errori),
      proposte: stringhe(q.proposte),
      byteLiberati: typeof q.byteLiberati === 'number' ? q.byteLiberati : 0,
      byteInRecupero: typeof q.byteInRecupero === 'number' ? q.byteInRecupero : 0,
      ...(typeof q.iniziato === 'string' ? { iniziato: q.iniziato } : {}),
      ...(typeof q.finito === 'string' ? { finito: q.finito } : {}),
      ...(typeof q.rimandatoPerche === 'string' ? { rimandatoPerche: q.rimandatoPerche } : {})
    })
  }
  const facoltativa = (k: 'fatto' | 'chiusoIl' | 'annullatoIl' | 'liberatoIl'): Partial<GiornaleRiassetto> => (typeof o[k] === 'string' ? { [k]: o[k] } : {})
  return {
    edizione: typeof o.edizione === 'number' ? o.edizione : 0,
    versione: o.versione,
    iniziato: typeof o.iniziato === 'string' ? o.iniziato : new Date(0).toISOString(),
    passi,
    ...facoltativa('fatto'),
    ...facoltativa('chiusoIl'),
    ...facoltativa('annullatoIl'),
    ...facoltativa('liberatoIl')
  }
}

/**
 * Il giornale porta i passi di adesso: quelli nuovi (aggiunti dopo un avvio
 * interrotto) entrano da fare, quelli che non ci sono più escono, l'ordine è
 * quello dei passi.
 */
export function allineaGiornale(g: GiornaleRiassetto, passi: Array<{ id: string; titolo: string }>): GiornaleRiassetto {
  const per = new Map(g.passi.map((p) => [p.id, p]))
  return { ...g, passi: passi.map((p) => per.get(p.id) ?? vocePassoNuova(p.id, p.titolo)) }
}

/** Il riassetto è da fare (o da finire) per questa versione? */
export function daFare(g: GiornaleRiassetto | undefined, p: { versione: string; copiaAppenaFatta: boolean; primoAvvio: boolean }): boolean {
  if (g !== undefined && g.edizione === EDIZIONE_RIASSETTO && g.fatto !== undefined) return false
  if (g !== undefined && g.edizione === EDIZIONE_RIASSETTO && g.versione === p.versione) return true
  // Al primissimo avvio non c'è niente da riassettare.
  return p.copiaAppenaFatta && !p.primoAvvio
}

/**
 * La percentuale: i pesi dei passi fatti, più la parte fatta di quello in
 * corso. Arrotondata per difetto, 100 solo a giornale chiuso.
 */
export function percentuale(g: GiornaleRiassetto, pesi: ReadonlyMap<string, number>, inCorso?: { id: string; frazione: number }): number {
  let totale = 0
  let fatto = 0
  for (const p of g.passi) {
    const peso = pesi.get(p.id) ?? 1
    totale += peso
    if (p.stato === 'fatto') fatto += peso
    else if (inCorso !== undefined && inCorso.id === p.id) fatto += peso * Math.min(1, Math.max(0, inCorso.frazione))
  }
  if (totale === 0) return 100
  if (g.fatto !== undefined) return 100
  return Math.min(99, Math.floor((fatto / totale) * 100))
}

/** Quanti saltati perché in uso o bloccati: la riga della banda. */
export function saltatiInUso(g: GiornaleRiassetto): number {
  return g.passi.reduce((n, p) => n + p.saltati.filter((s) => /in uso|bloccat/i.test(s.perche)).length, 0)
}

/** Il riepilogo di fine riassetto. */
export function componiRiepilogo(g: GiornaleRiassetto, p: { cartellaRecupero: string; adesso?: string }): RiepilogoRiassetto {
  const fine = g.fatto ?? p.adesso ?? g.iniziato
  const annullabileFino = new Date(Date.parse(fine) + GIORNI_RECUPERO_RIASSETTO * 86_400_000).toISOString()
  return {
    versione: g.versione,
    byteLiberati: g.passi.reduce((s, x) => s + x.byteLiberati, 0),
    byteInRecupero: g.passi.reduce((s, x) => s + x.byteInRecupero, 0),
    cartellaRecupero: p.cartellaRecupero,
    annullabileFino,
    saltati: g.passi.flatMap((x) => x.saltati),
    proposte: g.passi.flatMap((x) => x.proposte),
    errori: g.passi.flatMap((x) => x.errori.map((e) => `${x.titolo}: ${e}`)),
    passi: g.passi.map((x) => ({ titolo: x.titolo, stato: x.stato, fatti: x.fatti.length }))
  }
}

/** Byte in MB leggibili: «535 MB», «1,2 MB», «0 MB». */
export function mb(byte: number): string {
  const v = byte / (1024 * 1024)
  if (v >= 10) return `${Math.round(v)} MB`
  if (v === 0) return '0 MB'
  return `${v.toFixed(1).replace('.', ',')} MB`
}

/** La riga unica del registro: `[riassetto] …`. */
export function rigaRiepilogo(r: RiepilogoRiassetto): string {
  const fatti = r.passi.reduce((s, x) => s + x.fatti, 0)
  const parti = [
    `riassetto della ${r.versione} finito`,
    `${fatti} cose sistemate`,
    `${mb(r.byteLiberati)} liberati`,
    `${mb(r.byteInRecupero)} nel recupero (${r.cartellaRecupero}, annullabile fino al ${r.annullabileFino.slice(0, 10)})`
  ]
  if (r.saltati.length > 0) parti.push(`${r.saltati.length} saltati`)
  if (r.proposte.length > 0) parti.push(`${r.proposte.length} proposte`)
  if (r.errori.length > 0) parti.push(`${r.errori.length} errori: ${r.errori.slice(0, 3).join('; ')}`)
  return parti.join(', ')
}

/**
 * Lo storico degli errori compattato: escono gli errori di una versione
 * vecchia che non si ripetono da `ETA_MINIMA_MS` (72 ore). Quelli di questa
 * versione restano tutti. Pura; torna anche quelli tolti, per il recupero.
 */
export function compattaErrori<T extends { versione?: string; ultima: string }>(voci: readonly T[], versione: string, ora: number, etaMs = ETA_MINIMA_MS): { tenute: T[]; tolte: T[] } {
  const tenute: T[] = []
  const tolte: T[] = []
  for (const v of voci) {
    const ultima = Date.parse(v.ultima)
    if (v.versione === versione || !Number.isFinite(ultima) || ora - ultima < etaMs) tenute.push(v)
    else tolte.push(v)
  }
  return { tenute, tolte }
}

/** I passi che il servizio degli autopiloti fa per il riassetto (`POST /riassetto/passo`). */
export const PASSI_DEL_SERVIZIO = ['consegne', 'autopiloti', 'worktree', 'trascrizioni', 'errori'] as const
export type PassoDelServizio = typeof PASSI_DEL_SERVIZIO[number]

/** Cosa risponde il servizio a un passo. */
export type EsitoPassoServizio = {
  fatti: string[]
  saltati: Saltato[]
  errori: string[]
  proposte: string[]
  byteLiberati: number
  byteInRecupero: number
  /** Le sessioni le cui trascrizioni sono andate nel recupero: escono dall'indice. */
  sessioniTolte?: string[]
  /** Non adesso (PC carico): il programma riprova più tardi. */
  rimandato?: string
}

export function esitoServizioVuoto(): EsitoPassoServizio {
  return { fatti: [], saltati: [], errori: [], proposte: [], byteLiberati: 0, byteInRecupero: 0 }
}

/** La risposta del servizio letta con prudenza: quello che non torna si scarta. */
export function leggiEsitoServizio(x: unknown): EsitoPassoServizio | undefined {
  if (typeof x !== 'object' || x === null) return undefined
  const o = x as Record<string, unknown>
  const stringhe = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [])
  const numero = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)
  if (typeof o.rimandato === 'string') return { ...esitoServizioVuoto(), rimandato: o.rimandato }
  if (!Array.isArray(o.fatti)) return undefined
  return {
    fatti: stringhe(o.fatti),
    saltati: Array.isArray(o.saltati) ? (o.saltati as unknown[]).filter((s): s is Saltato => typeof s === 'object' && s !== null && typeof (s as Saltato).cosa === 'string' && typeof (s as Saltato).perche === 'string') : [],
    errori: stringhe(o.errori),
    proposte: stringhe(o.proposte),
    byteLiberati: numero(o.byteLiberati),
    byteInRecupero: numero(o.byteInRecupero),
    ...(Array.isArray(o.sessioniTolte) ? { sessioniTolte: stringhe(o.sessioniTolte) } : {})
  }
}

/** I saltati raggruppati per motivo, per il riepilogo: «in uso: 3». */
export function saltatiPerMotivo(s: readonly Saltato[]): Array<{ perche: string; quanti: number; esempi: string[] }> {
  const per = new Map<string, string[]>()
  for (const x of s) per.set(x.perche, [...(per.get(x.perche) ?? []), x.cosa])
  return [...per.entries()].map(([perche, cose]) => ({ perche, quanti: cose.length, esempi: cose.slice(0, 3) })).sort((a, b) => b.quanti - a.quanti)
}
