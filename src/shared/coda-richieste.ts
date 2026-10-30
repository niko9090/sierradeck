import { somiglianza } from './somiglianza-parole'
import { stessoArgomento } from './argomento-testo'

/**
 * **La coda delle richieste** di un workspace (P1 del piano «un solo
 * autopilota per workspace», 30/10/2026).
 *
 * Nicholas: «ogni richiesta va in coda perché tutto va fatto; se le cose che
 * aggiungo riguardano una richiesta che c'è già, l'autopilota le unisce in una
 * sola, riformulandola».
 *
 * Le regole, tutte pure (il disco è in `autopilot-host/coda-store.ts`):
 * - **Mai troncare.** Ogni originale resta parola per parola in `originali`,
 *   e nessun tetto sul numero delle richieste: le fatte da oltre 90 giorni si
 *   compattano a `{id, titolo, fattaIl, commit, versione}`, gli originali
 *   restano nel registro degli eventi (`coda.eventi.jsonl`).
 * - **Nessun punto perso in un'unione.** `unisci` rifiuta un'unione che non
 *   nomina ogni punto delle richieste unite. Un punto contraddetto diventa
 *   `superato` con il perché, e resta visibile.
 * - **Ogni unione si disfa.** `separa` rimette le richieste di prima,
 *   raggruppando i punti per la richiesta da cui venivano.
 * - **Una richiesta già fatta non si riapre:** quella nuova la «segue».
 * - **La percentuale la calcola il programma:** `Σ peso·f(stato) / Σ peso`.
 *
 * Ogni operazione torna la coda nuova **e gli eventi** da aggiungere al
 * registro; se non cambia niente torna la stessa coda (stesso oggetto), così
 * chi salva scrive solo quando serve.
 *
 * Per chi viene dopo (P3, l'orchestratore unico): `coda_unisci` è `unisci`;
 * `piano_scrivi` riempirà `compiti` con gli id dei compiti al posto del loro
 * testo, e `CompitoMisurato` ha già il peso e il «passo k di n».
 */

export type StatoCoda = 'in-coda' | 'pianificata' | 'in-corso' | 'in-verifica' | 'fatta'
export type StatoPunto = 'aperto' | 'fatto' | 'superato'

export type PuntoRichiesta = {
  /** `p-N`, unico nella coda: un'unione li tiene, non li rinumera. */
  id: string
  testo: string
  /** La richiesta da cui viene il punto (`r-N`): non cambia mai, anche dopo un'unione. */
  da: string
  stato: StatoPunto
  /** Il punto che lo contraddice, se si sa. */
  superatoDa?: string
  /** Perché è superato: obbligatorio quando lo è. */
  perche?: string
  /** L'unione (il suo `il`) che l'ha reso superato: `separa` lo riapre. */
  superatoIl?: string
}

export type OriginaleRichiesta = {
  /** La richiesta che ha creato (`r-N`). */
  id: string
  quando: string
  /** Le parole di Nicholas, come le ha scritte: mai modificate, mai tagliate. */
  testo: string
}

/** Una richiesta prima di un'unione, senza i punti: per `separa`. */
export type RichiestaPrima = Omit<Richiesta, 'punti'>

export type UnioneRichieste = {
  /** Quando. */
  il: string
  /** Tutte le richieste unite, compresa quella che resta. */
  fonti: string[]
  perche: string
  /** I punti che ogni fonte aveva al momento dell'unione, per `separa`. */
  puntiDi?: Record<string, string[]>
  /** Le richieste com'erano prima, senza i punti, per `separa`. */
  prima?: RichiestaPrima[]
}

/** Il legame con il lavoro degli autopiloti di oggi: la loro richiesta, o un compito. */
export type CollegamentoRichiesta = { autopilota: string; richiesta?: string; compito?: string }

export type Richiesta = {
  id: string
  creata: string
  titolo: string
  /** Il testo riformulato attuale (all'inizio le sue parole, intere). */
  testo: string
  originali: OriginaleRichiesta[]
  punti: PuntoRichiesta[]
  unioni: UnioneRichieste[]
  /** La richiesta già fatta che questa segue. */
  segue?: string
  stato: StatoCoda
  /** I compiti che la portano avanti (oggi il testo del compito, come in `compitiDaFare`). */
  compiti: string[]
  fattaIl?: string
  commit?: string
  versione?: string
  /** Il criterio con cui si dice fatta (quello dell'autopilota). */
  criterio?: string
  collegate?: CollegamentoRichiesta[]
  /** Richieste che potrebbero essere la stessa: senza una decisione restano separate e si mostrano. */
  candidati?: string[]
}

export type RichiestaCompattata = { id: string; titolo: string; fattaIl: string; commit?: string; versione?: string }

export type Coda = {
  versione: 1
  workspace: string
  /** I prossimi numeri liberi: `r-N` e `p-N` non si riusano mai. */
  prossimo: { r: number; p: number }
  richieste: Richiesta[]
  compattate: RichiestaCompattata[]
  /** Quando sono entrate le richieste e i compiti degli autopiloti di prima (una volta sola). */
  migrata?: string
  /** Gli autopiloti già portati nella coda dalla migrazione. */
  migrati?: string[]
}

export type EventoCoda =
  | { tipo: 'aggiunta'; quando: string; id: string; originale: OriginaleRichiesta; punti: string[]; segue?: string; collegata?: CollegamentoRichiesta[] }
  | { tipo: 'unione'; quando: string; il: string; fonti: string[]; perche: string; testo: string; titolo: string; punti: PuntoRichiesta[] }
  | { tipo: 'unione-rifiutata'; quando: string; fonti: string[]; errore: string }
  | { tipo: 'separazione'; quando: string; id: string; fonti: string[] }
  | { tipo: 'stato'; quando: string; id: string; da: StatoCoda; a: StatoCoda }
  | { tipo: 'compattazione'; quando: string; ids: string[] }
  | { tipo: 'migrazione'; quando: string; autopiloti: string[]; ids: string[] }

export type Modifica = { coda: Coda; eventi: EventoCoda[] }

/** Le fatte da più di tanto si compattano. */
export const COMPATTA_DOPO_GIORNI = 90
/** Somiglianza per parole oltre la quale due richieste sono candidate a unirsi. */
export const SIMILE_PER_UNIRE = 0.35
/** Quanto è lungo un titolo scritto dal programma (il testo resta intero). */
const TITOLO_MAX = 120

export function codaVuota(workspace: string): Coda {
  return { versione: 1, workspace, prossimo: { r: 1, p: 1 }, richieste: [], compattate: [] }
}

/** La chiave del workspace di un autopilota: il suo workspace, o la sua cartella se è nato prima del campo. */
export function chiaveWorkspace(a: { workspace?: string | undefined; cwd: string }): string {
  const ws = a.workspace?.trim()
  return ws !== undefined && ws !== '' ? ws : `cartella:${a.cwd.replace(/[\\/]+$/u, '').toLowerCase()}`
}

/** Il titolo dalle parole: una riga, al più 120 caratteri, senza parole tagliate a metà. */
export function titoloDalle(testo: string): string {
  const t = testo.replace(/^\s*Hai risposto:\s*/iu, '').replace(/\s+/gu, ' ').trim()
  if (t.length <= TITOLO_MAX) return t
  return `${t.slice(0, TITOLO_MAX - 1).replace(/\s+\S*$/u, '')}…`
}

const numeroDi = (id: string): number => Number(/^[rp]-(\d+)$/u.exec(id)?.[1] ?? 0)

// ---------------------------------------------------------------- aggiungere

export type NuovaRichiesta = {
  /** Le sue parole, intere. */
  testo: string
  quando: string
  titolo?: string
  /** I punti, se si sanno (i titoli delle richieste viste dal supervisore); se no uno, con le sue parole. */
  punti?: string[]
  compiti?: string[]
  criterio?: string
  collegate?: CollegamentoRichiesta[]
  segue?: string
  candidati?: string[]
  fattaIl?: string
  versione?: string
  commit?: string
  /** Per la migrazione: l'originale ha un'altra data (quella della richiesta di allora). */
  stato?: StatoCoda
}

/** Aggiunge una richiesta. Il testo non si tocca: resta intero nell'originale e nel testo attuale. */
export function aggiungi(coda: Coda, n: NuovaRichiesta): Modifica & { richiesta: Richiesta } {
  const id = `r-${coda.prossimo.r}`
  let p = coda.prossimo.p
  const testiPunti = (n.punti ?? []).map((x) => x.trim()).filter((x) => x !== '')
  const punti: PuntoRichiesta[] = (testiPunti.length > 0 ? testiPunti : [n.testo]).map((testo) => ({ id: `p-${p++}`, testo, da: id, stato: n.fattaIl !== undefined ? 'fatto' : 'aperto' }))
  const originale: OriginaleRichiesta = { id, quando: n.quando, testo: n.testo }
  const compiti = [...new Set((n.compiti ?? []).filter((c) => c.trim() !== ''))]
  const richiesta: Richiesta = {
    id,
    creata: n.quando,
    titolo: n.titolo?.trim() || titoloDalle(n.testo),
    testo: n.testo,
    originali: [originale],
    punti,
    unioni: [],
    ...(n.segue !== undefined ? { segue: n.segue } : {}),
    stato: n.stato ?? (n.fattaIl !== undefined ? 'fatta' : compiti.length > 0 ? 'pianificata' : 'in-coda'),
    compiti,
    ...(n.fattaIl !== undefined ? { fattaIl: n.fattaIl } : {}),
    ...(n.commit !== undefined ? { commit: n.commit } : {}),
    ...(n.versione !== undefined ? { versione: n.versione } : {}),
    ...(n.criterio !== undefined ? { criterio: n.criterio } : {}),
    ...(n.collegate !== undefined && n.collegate.length > 0 ? { collegate: n.collegate } : {}),
    ...(n.candidati !== undefined && n.candidati.length > 0 ? { candidati: n.candidati } : {})
  }
  return {
    richiesta,
    coda: { ...coda, prossimo: { r: coda.prossimo.r + 1, p }, richieste: [...coda.richieste, richiesta] },
    eventi: [{
      tipo: 'aggiunta', quando: n.quando, id, originale, punti: punti.map((x) => x.id),
      ...(n.segue !== undefined ? { segue: n.segue } : {}),
      ...(richiesta.collegate !== undefined ? { collegata: richiesta.collegate } : {})
    }]
  }
}

/** Cambia una richiesta per id: la coda nuova, o la stessa se l'id non c'è. */
export function conRichiesta(coda: Coda, id: string, f: (r: Richiesta) => Richiesta): Coda {
  const i = coda.richieste.findIndex((r) => r.id === id)
  if (i < 0) return coda
  const vecchia = coda.richieste[i]!
  const nuova = f(vecchia)
  if (nuova === vecchia) return coda
  const richieste = [...coda.richieste]
  richieste[i] = nuova
  return { ...coda, richieste }
}

// ---------------------------------------------------------------- candidati

/** I percorsi di file («src/shared/x.ts», «PannelloAutopiloti.tsx») e gli identificatori («stessoArgomento», «TESTO_MAX») di un testo. */
export function riferimentiDi(testo: string): Set<string> {
  const fuori = new Set<string>()
  for (const m of testo.matchAll(/(?:[\w.-]+[\\/])*[\w.-]+\.(?:tsx?|jsx?|mjs|cjs|json|md|css|html|kt|java|gradle|py|ps1|cmd|yml|yaml)\b/giu)) {
    // Del percorso conta il nome del file: «src/x/coda.ts» e «coda.ts» sono lo stesso.
    fuori.add(m[0].split(/[\\/]/u).pop()!.toLowerCase())
  }
  for (const m of testo.matchAll(/(?<![\p{L}\p{N}_])(?:[a-z]+[A-Z][\p{L}\p{N}]*|[A-Z][a-z]+[A-Z][\p{L}\p{N}]*|[A-Z][A-Z0-9]*_[A-Z0-9_]+|[a-z][a-z0-9]*_[a-z0-9_]+)(?![\p{L}\p{N}_])/gu)) {
    if (m[0].length >= 6) fuori.add(m[0].toLowerCase())
  }
  return fuori
}

/** Le richieste citate per numero: «r-12», «R-12», «la r 12» no. */
export function citateIn(testo: string): string[] {
  return [...new Set([...testo.matchAll(/(?<![\p{L}\p{N}-])r-(\d+)(?![\p{N}])/giu)].map((m) => `r-${Number(m[1])}`))]
}

export type CandidatoUnione = {
  id: string
  /** Perché è candidata: «parole 0.42», «file coda.ts», «stesso argomento», «citata». */
  motivi: string[]
  punteggio: number
  /** È già fatta: non si unisce, la nuova la segue. */
  fatta: boolean
}

/**
 * Le richieste della coda che potrebbero parlare della stessa cosa di `testo`:
 * somiglianza per parole ≥ 0.35 (col testo attuale, il titolo, gli originali e
 * i punti), file o identificatori in comune, lo stesso argomento riconosciuto
 * (`stessoArgomento`), o la citazione esplicita («r-12»). Dalla più simile.
 */
export function candidatiUnione(coda: Coda, testo: string, opz: { escludi?: string[] } = {}): CandidatoUnione[] {
  const citate = new Set(citateIn(testo))
  const rif = riferimentiDi(testo)
  const fuori: CandidatoUnione[] = []
  for (const r of coda.richieste) {
    if (opz.escludi?.includes(r.id) === true) continue
    const testi = [r.testo, r.titolo, ...r.originali.map((o) => o.testo), ...r.punti.filter((p) => p.stato !== 'superato').map((p) => p.testo)]
    const motivi: string[] = []
    let punteggio = 0
    if (citate.has(r.id)) { motivi.push('citata'); punteggio += 1 }
    const simile = Math.max(...testi.map((t) => somiglianza(t, testo)))
    if (simile >= SIMILE_PER_UNIRE) { motivi.push(`parole ${simile.toFixed(2)}`); punteggio += simile }
    const comuni = [...rif].filter((x) => testi.some((t) => riferimentiDi(t).has(x)))
    if (comuni.length > 0) { motivi.push(`in comune: ${comuni.slice(0, 3).join(', ')}`); punteggio += 0.3 + 0.1 * Math.min(comuni.length, 3) }
    if (testi.some((t) => stessoArgomento(t, testo))) { motivi.push('stesso argomento'); punteggio += 0.5 }
    if (motivi.length > 0) fuori.push({ id: r.id, motivi, punteggio, fatta: r.stato === 'fatta' })
  }
  return fuori.sort((a, b) => b.punteggio - a.punteggio || numeroDi(a.id) - numeroDi(b.id))
}

// ---------------------------------------------------------------- unire

/** Un punto come lo nomina chi unisce: lo tiene (con un testo nuovo, se lo riformula) o lo dà per superato. */
export type PuntoProposto = {
  id: string
  testo?: string
  /** Il perché: il punto è contraddetto da uno più nuovo. */
  superato?: string
  superatoDa?: string
}

export type UnioneProposta = {
  ids: string[]
  testo: string
  titolo?: string
  punti: PuntoProposto[]
  perche: string
  quando: string
}

export type EsitoUnione = (Modifica & { ok: true; id: string }) | { ok: false; errore: string }

/** L'ordine degli stati, per dire «il più avanti». */
const ORDINE: Record<StatoCoda, number> = { 'in-coda': 0, pianificata: 1, 'in-corso': 2, 'in-verifica': 3, fatta: 4 }

/**
 * Unisce più richieste in una, riformulata.
 *
 * **L'invariante:** `punti` deve nominare **ogni** punto di **ogni** richiesta
 * unita, altrimenti l'unione si rifiuta e non cambia niente. Un punto
 * contraddetto si nomina con `superato` (e il perché): diventa `superato` e
 * resta visibile. Una richiesta già fatta non si unisce (si segue). Resta la
 * richiesta col numero più basso, con il testo nuovo, gli originali di tutte
 * e i loro compiti; le altre escono dalla coda, e `separa` le rimette.
 */
export function unisci(coda: Coda, u: UnioneProposta): EsitoUnione {
  const ids = [...new Set(u.ids)]
  if (ids.length < 2) return { ok: false, errore: 'per unire servono almeno due richieste' }
  const fonti: Richiesta[] = []
  for (const id of ids) {
    const r = coda.richieste.find((x) => x.id === id)
    if (r === undefined) return { ok: false, errore: `la richiesta ${id} non è in coda` }
    if (r.stato === 'fatta') return { ok: false, errore: `la richiesta ${id} è già fatta: una nuova la segue, non si unisce` }
    fonti.push(r)
  }
  const testo = u.testo.trim()
  if (testo === '') return { ok: false, errore: 'il testo riformulato è vuoto' }
  const perche = u.perche.trim()
  if (perche === '') return { ok: false, errore: 'manca il perché dell’unione' }

  const tutti = new Map(fonti.flatMap((r) => r.punti.map((p) => [p.id, p] as const)))
  const nominati = new Map<string, PuntoProposto>()
  for (const p of u.punti) {
    if (!tutti.has(p.id)) return { ok: false, errore: `il punto ${p.id} non è di nessuna delle richieste unite` }
    if (nominati.has(p.id)) return { ok: false, errore: `il punto ${p.id} è nominato due volte` }
    if (p.superato !== undefined && p.superato.trim() === '') return { ok: false, errore: `il punto ${p.id} è superato senza un perché` }
    if (p.superatoDa !== undefined && !tutti.has(p.superatoDa)) return { ok: false, errore: `il punto ${p.id} è superato da ${p.superatoDa}, che non c’è` }
    nominati.set(p.id, p)
  }
  const mancanti = [...tutti.keys()].filter((id) => !nominati.has(id))
  if (mancanti.length > 0) return { ok: false, errore: `unione rifiutata: si perderebbero i punti ${mancanti.join(', ')}` }

  const quando = u.quando
  const punti: PuntoRichiesta[] = u.punti.map((pp) => {
    const p = tutti.get(pp.id)!
    const testoPunto = pp.testo?.trim() || p.testo
    if (pp.superato !== undefined && p.stato !== 'superato') {
      return { ...p, testo: testoPunto, stato: 'superato', perche: pp.superato.trim(), superatoIl: quando, ...(pp.superatoDa !== undefined ? { superatoDa: pp.superatoDa } : {}) }
    }
    return { ...p, testo: testoPunto }
  })
  if (!punti.some((p) => p.stato !== 'superato')) return { ok: false, errore: 'unione rifiutata: tutti i punti sarebbero superati' }

  const ordinate = [...fonti].sort((a, b) => numeroDi(a.id) - numeroDi(b.id))
  const resta = ordinate[0]!
  const aperti = punti.some((p) => p.stato === 'aperto')
  const piuAvanti = ordinate.reduce((m, r) => (ORDINE[r.stato] > ORDINE[m] ? r.stato : m), 'in-coda' as StatoCoda)
  // Una richiesta in verifica che riceve punti aperti torna in corso.
  const stato: StatoCoda = piuAvanti === 'in-verifica' && aperti && ordinate.some((r) => r.stato !== 'in-verifica') ? 'in-corso' : piuAvanti
  const unione: UnioneRichieste = {
    il: quando,
    fonti: ordinate.map((r) => r.id),
    perche,
    puntiDi: Object.fromEntries(ordinate.map((r) => [r.id, r.punti.map((p) => p.id)])),
    prima: ordinate.map(({ punti: _p, ...resto }) => resto)
  }
  const collegate = ordinate.flatMap((r) => r.collegate ?? [])
  const unita: Richiesta = {
    ...resta,
    titolo: u.titolo?.trim() || resta.titolo,
    testo,
    originali: ordinate.flatMap((r) => r.originali).sort((a, b) => a.quando.localeCompare(b.quando)),
    punti,
    unioni: [...resta.unioni, unione],
    stato,
    compiti: [...new Set(ordinate.flatMap((r) => r.compiti))],
    ...(collegate.length > 0 ? { collegate: dedupCollegate(collegate) } : {})
  }
  delete unita.candidati
  const via = new Set(ordinate.slice(1).map((r) => r.id))
  const richieste = coda.richieste.filter((r) => !via.has(r.id)).map((r) => (r.id === resta.id ? unita : senzaCandidati(r, via)))
  return {
    ok: true,
    id: resta.id,
    coda: { ...coda, richieste },
    eventi: [{ tipo: 'unione', quando, il: resta.id, fonti: unione.fonti, perche, testo, titolo: unita.titolo, punti }]
  }
}

function dedupCollegate(c: CollegamentoRichiesta[]): CollegamentoRichiesta[] {
  const viste = new Set<string>()
  return c.filter((x) => {
    const k = `${x.autopilota}|${x.richiesta ?? ''}|${x.compito ?? ''}`
    if (viste.has(k)) return false
    viste.add(k)
    return true
  })
}

function senzaCandidati(r: Richiesta, via: Set<string>): Richiesta {
  if (r.candidati === undefined || !r.candidati.some((c) => via.has(c))) return r
  const candidati = r.candidati.filter((c) => !via.has(c))
  const { candidati: _c, ...resto } = r
  return candidati.length > 0 ? { ...resto, candidati } : resto
}

// ---------------------------------------------------------------- separare

/**
 * Disfa l'ultima unione di una richiesta: le richieste unite tornano come
 * erano, ognuna con i suoi punti (raggruppati per la fonte che li aveva, o per
 * `da`). Un punto fatto nel frattempo resta fatto; uno reso superato da
 * quell'unione torna aperto. Quello arrivato dopo l'unione resta dov'è.
 */
export function separa(coda: Coda, id: string, quando: string): EsitoUnione {
  const r = coda.richieste.find((x) => x.id === id)
  if (r === undefined) return { ok: false, errore: `la richiesta ${id} non è in coda` }
  const u = r.unioni[r.unioni.length - 1]
  if (u === undefined) return { ok: false, errore: `la richiesta ${id} non unisce niente` }
  const altre = u.fonti.filter((f) => f !== id)
  const giaInCoda = altre.filter((f) => coda.richieste.some((x) => x.id === f))
  if (giaInCoda.length > 0) return { ok: false, errore: `le richieste ${giaInCoda.join(', ')} sono già in coda` }

  const fonteDi = (p: PuntoRichiesta): string => {
    for (const [f, punti] of Object.entries(u.puntiDi ?? {})) if (punti.includes(p.id)) return f
    return altre.includes(p.da) ? p.da : id
  }
  const riaperto = (p: PuntoRichiesta): PuntoRichiesta => {
    if (p.stato !== 'superato' || p.superatoIl !== u.il) return p
    const { superatoDa: _a, perche: _b, superatoIl: _c, ...resto } = p
    return { ...resto, stato: 'aperto' }
  }
  const puntiPer = new Map<string, PuntoRichiesta[]>()
  for (const p of r.punti) {
    const f = fonteDi(p)
    puntiPer.set(f, [...(puntiPer.get(f) ?? []), riaperto(p)])
  }
  const prima = new Map((u.prima ?? []).map((x) => [x.id, x]))
  // Gli originali di una fonte: quelli che aveva prima dell'unione (o, senza la fotografia, quelli col suo id).
  const originaliDi = (f: string): OriginaleRichiesta[] => {
    const loro = prima.get(f)?.originali.map((o) => `${o.id}|${o.quando}`)
    return r.originali.filter((o) => (loro !== undefined ? loro.includes(`${o.id}|${o.quando}`) : o.id === f))
  }
  const delleAltre = new Set(altre.flatMap((f) => originaliDi(f).map((o) => `${o.id}|${o.quando}`)))
  const rimesse: Richiesta[] = altre.map((f) => {
    const p = prima.get(f)
    const punti = puntiPer.get(f) ?? []
    const base: Richiesta = p !== undefined
      ? { ...p, punti }
      : { id: f, creata: quando, titolo: titoloDalle(punti[0]?.testo ?? f), testo: punti.map((x) => x.testo).join('\n'), originali: [], punti, unioni: [], stato: 'in-coda', compiti: [] }
    return { ...base, originali: originaliDi(f) }
  })
  const primaResta = prima.get(id)
  const compitiAltre = new Set(rimesse.flatMap((x) => x.compiti))
  const restaPunti = puntiPer.get(id) ?? []
  const resta: Richiesta = {
    ...r,
    ...(primaResta !== undefined ? { titolo: primaResta.titolo, testo: primaResta.testo, stato: primaResta.stato === 'fatta' ? r.stato : primaResta.stato } : {}),
    originali: r.originali.filter((o) => !delleAltre.has(`${o.id}|${o.quando}`)),
    punti: restaPunti,
    unioni: r.unioni.slice(0, -1),
    compiti: primaResta !== undefined
      ? [...new Set([...primaResta.compiti, ...r.compiti.filter((c) => !compitiAltre.has(c))])]
      : r.compiti.filter((c) => !compitiAltre.has(c)),
    ...(primaResta?.collegate !== undefined ? { collegate: primaResta.collegate } : {})
  }
  if (primaResta !== undefined && primaResta.collegate === undefined) delete resta.collegate
  const richieste = [...coda.richieste.map((x) => (x.id === id ? resta : x)), ...rimesse]
    .sort((a, b) => numeroDi(a.id) - numeroDi(b.id))
  return {
    ok: true,
    id,
    coda: { ...coda, richieste },
    eventi: [{ tipo: 'separazione', quando, id, fonti: u.fonti }]
  }
}

// ---------------------------------------------------------------- seguire, compattare

/** La richiesta già fatta che una nuova segue: la candidata fatta più simile, se c'è. */
export function daSeguire(candidati: CandidatoUnione[]): string | undefined {
  return candidati.find((c) => c.fatta)?.id
}

/** Le fatte da oltre 90 giorni diventano `{id, titolo, fattaIl, commit, versione}`. Gli originali restano negli eventi. */
export function compatta(coda: Coda, adesso: string, giorni: number = COMPATTA_DOPO_GIORNI): Modifica {
  const limite = Date.parse(adesso) - giorni * 86_400_000
  const vecchie = coda.richieste.filter((r) => r.stato === 'fatta' && r.fattaIl !== undefined && Date.parse(r.fattaIl) < limite)
  if (vecchie.length === 0) return { coda, eventi: [] }
  const ids = new Set(vecchie.map((r) => r.id))
  return {
    coda: {
      ...coda,
      richieste: coda.richieste.filter((r) => !ids.has(r.id)),
      compattate: [...coda.compattate, ...vecchie.map((r) => ({
        id: r.id, titolo: r.titolo, fattaIl: r.fattaIl!,
        ...(r.commit !== undefined ? { commit: r.commit } : {}),
        ...(r.versione !== undefined ? { versione: r.versione } : {})
      }))]
    },
    eventi: [{ tipo: 'compattazione', quando: adesso, ids: [...ids] }]
  }
}

// ---------------------------------------------------------------- percentuale

export type StatoCompito = 'da-fare' | 'in-corso' | 'in-revisione' | 'unito'
export type CompitoMisurato = {
  stato: StatoCompito
  /** 1-3 (P3, `piano_scrivi`); oggi 1. */
  peso?: number
  /** Il «passo k di n» dichiarato dalla chat. */
  passo?: { k: number; n: number }
}

/** «passo 2 di 5», «Passo 3/4»: il passo dichiarato, se c'è. */
export function passoDichiarato(testo: string | undefined): { k: number; n: number } | undefined {
  if (testo === undefined) return undefined
  const m = /passo\s+(\d+)\s*(?:di|\/|su|of)\s*(\d+)/iu.exec(testo)
  if (m === null) return undefined
  const k = Number(m[1])
  const n = Number(m[2])
  return n > 0 && k >= 0 ? { k: Math.min(k, n), n } : undefined
}

/** `f(stato)`: da fare 0, in corso 0.2 (+ fino a 0.4 dal passo), in revisione 0.8, unito 1. */
export function fattoreCompito(c: CompitoMisurato): number {
  if (c.stato === 'unito') return 1
  if (c.stato === 'in-revisione') return 0.8
  if (c.stato === 'da-fare') return 0
  const passo = c.passo !== undefined && c.passo.n > 0 ? Math.min(1, Math.max(0, c.passo.k / c.passo.n)) : 0
  return 0.2 + 0.4 * passo
}

const pesoDi = (c: CompitoMisurato): number => (c.peso !== undefined && c.peso > 0 ? c.peso : 1)

/** `Σ peso·f(stato) / Σ peso`, da 0 a 1; senza compiti `undefined`. */
export function frazione(compiti: CompitoMisurato[]): number | undefined {
  const tot = compiti.reduce((s, c) => s + pesoDi(c), 0)
  if (tot === 0) return undefined
  return compiti.reduce((s, c) => s + pesoDi(c) * fattoreCompito(c), 0) / tot
}

/** Come misurare un compito: dagli autopiloti di oggi (`coda-autopiloti.ts`), o dal piano in P3. */
export type MisuraCompito = (compito: string) => CompitoMisurato | undefined

/** Una richiesta senza compiti misurati vale per il suo stato. */
const PER_STATO: Record<StatoCoda, number> = { 'in-coda': 0, pianificata: 0, 'in-corso': 0.2, 'in-verifica': 0.8, fatta: 1 }

/** I compiti di una richiesta, misurati: quelli che non si trovano sono da fare. */
function compitiMisurati(r: Richiesta, misura: MisuraCompito): CompitoMisurato[] {
  return r.compiti.map((c) => misura(c) ?? { stato: 'da-fare' })
}

/** La percentuale di una richiesta, da 0 a 100: una fatta è 100. */
export function avanzamentoRichiesta(r: Richiesta, misura: MisuraCompito): number {
  if (r.stato === 'fatta') return 100
  const f = frazione(compitiMisurati(r, misura)) ?? PER_STATO[r.stato]
  // Finché non è fatta non è al 100%: il criterio non è ancora verde.
  return Math.min(99, Math.round(f * 100))
}

/**
 * La percentuale del workspace: tutti i compiti delle richieste di adesso, con
 * il loro peso (una richiesta senza compiti vale uno, per il suo stato). «Di
 * adesso»: le aperte, più le fatte da quando è nata la più vecchia aperta.
 * Senza richieste aperte, 100 se ce ne sono di fatte; senza niente `undefined`.
 */
export function avanzamentoCoda(coda: Coda, misura: MisuraCompito): number | undefined {
  const aperte = coda.richieste.filter((r) => r.stato !== 'fatta')
  if (aperte.length === 0) return coda.richieste.length > 0 ? 100 : undefined
  const dal = Math.min(...aperte.map((r) => Date.parse(r.creata)).filter((t) => !Number.isNaN(t)))
  const dentro = coda.richieste.filter((r) => r.stato !== 'fatta' || (r.fattaIl !== undefined && Date.parse(r.fattaIl) >= dal))
  let num = 0
  let den = 0
  for (const r of dentro) {
    if (r.stato === 'fatta') {
      const n = Math.max(1, r.compiti.length)
      num += n
      den += n
      continue
    }
    const compiti = compitiMisurati(r, misura)
    if (compiti.length === 0) { num += PER_STATO[r.stato]; den += 1; continue }
    for (const c of compiti) { num += pesoDi(c) * fattoreCompito(c); den += pesoDi(c) }
  }
  return den === 0 ? undefined : Math.min(99, Math.round((num / den) * 100))
}

// ---------------------------------------------------------------- lettura

function str(x: unknown): string | undefined {
  return typeof x === 'string' && x.trim() !== '' ? x : undefined
}
const STATI: StatoCoda[] = ['in-coda', 'pianificata', 'in-corso', 'in-verifica', 'fatta']
const STATI_PUNTO: StatoPunto[] = ['aperto', 'fatto', 'superato']
const listaStr = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string' && v.trim() !== '') : [])

function leggiRichiesta(v: unknown): Richiesta | undefined {
  if (typeof v !== 'object' || v === null) return undefined
  const o = v as Record<string, unknown>
  const id = str(o.id)
  const creata = str(o.creata)
  const titolo = str(o.titolo)
  const testo = typeof o.testo === 'string' ? o.testo : undefined
  if (id === undefined || !/^r-\d+$/u.test(id) || creata === undefined || titolo === undefined || testo === undefined) return undefined
  const originali = Array.isArray(o.originali)
    ? o.originali.flatMap((x): OriginaleRichiesta[] => {
      const q = x as Record<string, unknown> | null
      return q !== null && typeof q === 'object' && str(q.id) !== undefined && str(q.quando) !== undefined && typeof q.testo === 'string'
        ? [{ id: q.id as string, quando: q.quando as string, testo: q.testo }]
        : []
    })
    : []
  const punti = Array.isArray(o.punti)
    ? o.punti.flatMap((x): PuntoRichiesta[] => {
      const q = x as Record<string, unknown> | null
      if (q === null || typeof q !== 'object' || str(q.id) === undefined || typeof q.testo !== 'string' || str(q.da) === undefined) return []
      const stato = STATI_PUNTO.includes(q.stato as StatoPunto) ? (q.stato as StatoPunto) : 'aperto'
      return [{
        id: q.id as string, testo: q.testo, da: q.da as string, stato,
        ...(str(q.superatoDa) !== undefined ? { superatoDa: q.superatoDa as string } : {}),
        ...(str(q.perche) !== undefined ? { perche: q.perche as string } : {}),
        ...(str(q.superatoIl) !== undefined ? { superatoIl: q.superatoIl as string } : {})
      }]
    })
    : []
  const unioni = Array.isArray(o.unioni)
    ? o.unioni.flatMap((x): UnioneRichieste[] => {
      const q = x as Record<string, unknown> | null
      if (q === null || typeof q !== 'object' || str(q.il) === undefined || typeof q.perche !== 'string') return []
      const prima = Array.isArray(q.prima) ? q.prima.flatMap((p) => { const l = leggiRichiesta({ ...(p as object), punti: [] }); if (l === undefined) return []; const { punti: _p, ...resto } = l; return [resto] }) : undefined
      const puntiDi = typeof q.puntiDi === 'object' && q.puntiDi !== null
        ? Object.fromEntries(Object.entries(q.puntiDi as Record<string, unknown>).map(([k, v2]) => [k, listaStr(v2)]))
        : undefined
      return [{ il: q.il as string, fonti: listaStr(q.fonti), perche: q.perche, ...(puntiDi !== undefined ? { puntiDi } : {}), ...(prima !== undefined ? { prima } : {}) }]
    })
    : []
  const collegate = Array.isArray(o.collegate)
    ? o.collegate.flatMap((x): CollegamentoRichiesta[] => {
      const q = x as Record<string, unknown> | null
      return q !== null && typeof q === 'object' && str(q.autopilota) !== undefined
        ? [{ autopilota: q.autopilota as string, ...(str(q.richiesta) !== undefined ? { richiesta: q.richiesta as string } : {}), ...(typeof q.compito === 'string' ? { compito: q.compito } : {}) }]
        : []
    })
    : []
  const candidati = listaStr(o.candidati)
  return {
    id, creata, titolo, testo, originali, punti, unioni,
    ...(str(o.segue) !== undefined ? { segue: o.segue as string } : {}),
    stato: STATI.includes(o.stato as StatoCoda) ? (o.stato as StatoCoda) : 'in-coda',
    compiti: listaStr(o.compiti),
    ...(str(o.fattaIl) !== undefined ? { fattaIl: o.fattaIl as string } : {}),
    ...(str(o.commit) !== undefined ? { commit: o.commit as string } : {}),
    ...(str(o.versione) !== undefined ? { versione: o.versione as string } : {}),
    ...(str(o.criterio) !== undefined ? { criterio: o.criterio as string } : {}),
    ...(collegate.length > 0 ? { collegate } : {}),
    ...(candidati.length > 0 ? { candidati } : {})
  }
}

/** La coda dal disco: una richiesta illeggibile si salta, il resto resta. I contatori non tornano mai indietro. */
export function leggiCoda(x: unknown, workspace: string): Coda {
  if (typeof x !== 'object' || x === null) return codaVuota(workspace)
  const o = x as Record<string, unknown>
  const richieste = Array.isArray(o.richieste) ? o.richieste.flatMap((r) => { const l = leggiRichiesta(r); return l !== undefined ? [l] : [] }) : []
  const compattate = Array.isArray(o.compattate)
    ? o.compattate.flatMap((v): RichiestaCompattata[] => {
      const q = v as Record<string, unknown> | null
      return q !== null && typeof q === 'object' && str(q.id) !== undefined && str(q.titolo) !== undefined && str(q.fattaIl) !== undefined
        ? [{ id: q.id as string, titolo: q.titolo as string, fattaIl: q.fattaIl as string, ...(str(q.commit) !== undefined ? { commit: q.commit as string } : {}), ...(str(q.versione) !== undefined ? { versione: q.versione as string } : {}) }]
        : []
    })
    : []
  const p = (o.prossimo ?? {}) as Record<string, unknown>
  const maxR = Math.max(0, ...richieste.map((r) => numeroDi(r.id)), ...compattate.map((r) => numeroDi(r.id)), ...richieste.flatMap((r) => r.unioni.flatMap((u) => u.fonti.map(numeroDi))))
  const maxP = Math.max(0, ...richieste.flatMap((r) => r.punti.map((q) => numeroDi(q.id))))
  const migrati = listaStr(o.migrati)
  return {
    versione: 1,
    workspace: str(o.workspace) ?? workspace,
    prossimo: {
      r: Math.max(typeof p.r === 'number' && Number.isFinite(p.r) ? p.r : 1, maxR + 1),
      p: Math.max(typeof p.p === 'number' && Number.isFinite(p.p) ? p.p : 1, maxP + 1)
    },
    richieste,
    compattate,
    ...(str(o.migrata) !== undefined ? { migrata: o.migrata as string } : {}),
    ...(migrati.length > 0 ? { migrati } : {})
  }
}

/**
 * L'unione proposta dal supervisore nel JSON del dialogo (`"unisci"`), già
 * letta: `con` le richieste in coda, `nuovo` il punto (o i punti) del
 * messaggio di adesso. `undefined` se non c'è o non si legge: allora restano
 * separate.
 */
export type UnioneDalDialogo = { con: string[]; testo: string; titolo?: string; punti: PuntoProposto[]; perche: string }

export function leggiUnioneDalDialogo(raw: unknown): UnioneDalDialogo | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const o = raw as Record<string, unknown>
  const con = listaStr(o.con).map((x) => x.trim())
  const testo = str(o.testo)?.trim()
  const perche = str(o.perche)?.trim()
  if (con.length === 0 || testo === undefined || perche === undefined || !Array.isArray(o.punti)) return undefined
  const punti = o.punti.flatMap((x): PuntoProposto[] => {
    if (typeof x === 'string' && x.trim() !== '') return [{ id: x.trim() }]
    const q = x as Record<string, unknown> | null
    if (q === null || typeof q !== 'object' || str(q.id) === undefined) return []
    return [{
      id: (q.id as string).trim(),
      ...(str(q.testo) !== undefined ? { testo: (q.testo as string).trim() } : {}),
      ...(str(q.superato) !== undefined ? { superato: (q.superato as string).trim() } : {}),
      ...(str(q.superatoDa) !== undefined ? { superatoDa: (q.superatoDa as string).trim() } : {})
    }]
  })
  const titolo = str(o.titolo)?.trim()
  return { con, testo, perche, punti, ...(titolo !== undefined ? { titolo } : {}) }
}

/**
 * Dall'unione del dialogo all'unione da fare: `nuovo` diventa i punti della
 * richiesta appena aggiunta. Se il supervisore non nomina `nuovo` i punti
 * nuovi si aggiungono da soli (sono di questo messaggio, non si possono
 * perdere), e così quelli già superati prima (restano superati). Gli altri
 * punti delle richieste di prima no: l'invariante decide.
 */
export function unioneDaDialogo(d: UnioneDalDialogo, nuova: Richiesta, coda: Coda, quando: string): UnioneProposta {
  const nuovi = nuova.punti.map((p) => p.id)
  const punti: PuntoProposto[] = []
  let nominatoNuovo = false
  for (const p of d.punti) {
    if (p.id === 'nuovo') {
      nominatoNuovo = true
      punti.push(...nuovi.map((id, i) => ({ id, ...(nuovi.length === 1 && i === 0 && p.testo !== undefined ? { testo: p.testo } : {}) })))
      continue
    }
    const superatoDa = p.superatoDa === 'nuovo' ? nuovi[0] : p.superatoDa
    punti.push({ ...p, ...(superatoDa !== undefined ? { superatoDa } : {}) })
  }
  if (!nominatoNuovo) for (const id of nuovi) if (!punti.some((p) => p.id === id)) punti.push({ id })
  for (const r of coda.richieste) {
    if (!d.con.includes(r.id)) continue
    for (const p of r.punti) if (p.stato === 'superato' && !punti.some((x) => x.id === p.id)) punti.push({ id: p.id })
  }
  return {
    ids: [...d.con.filter((x) => x !== nuova.id), nuova.id],
    testo: d.testo,
    ...(d.titolo !== undefined ? { titolo: d.titolo } : {}),
    punti,
    perche: d.perche,
    quando
  }
}

/** Il badge «unisce r-12, r-14»: tutte le richieste che ha unito, lei compresa. */
export function unite(r: Pick<Richiesta, 'unioni' | 'id'>): string[] {
  const ids = new Set<string>()
  for (const u of r.unioni) for (const f of u.fonti) ids.add(f)
  return [...ids].sort((a, b) => numeroDi(a) - numeroDi(b))
}

/** Lo stato in parole, per la vista. */
export const PAROLA_STATO_CODA: Record<StatoCoda, string> = {
  'in-coda': 'in coda',
  pianificata: 'pianificata',
  'in-corso': 'in corso',
  'in-verifica': 'in verifica',
  fatta: 'fatta'
}

/** Quello che `GET /coda` manda alla vista: la coda con la percentuale di ogni richiesta e del workspace. */
export type VistaCoda = {
  workspace: string
  totale?: number
  richieste: Array<Richiesta & { percento: number }>
  compattate: RichiestaCompattata[]
}
