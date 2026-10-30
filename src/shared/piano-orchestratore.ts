import {
  avanzamentoCoda, conRichiesta, passoDichiarato,
  type Coda, type CompitoMisurato, type EventoCoda, type MisuraCompito, type Modifica, type StatoCoda, type StatoCompito
} from './coda-richieste'

/**
 * **Il piano dell'orchestratore unico** (P3, 30/10/2026): i compiti in cui
 * l'orchestratore divide le richieste della coda, con le dipendenze e il peso.
 * Tutto puro; il disco è in `autopilot-host/orchestratore-store.ts`.
 *
 * - `piano_scrivi` passa da `scriviPiano`: ogni compito è di una richiesta
 *   aperta, ha un criterio, peso 1-3, e le dipendenze **non possono formare
 *   cicli** (il piano si rifiuta intero, non cambia niente).
 * - La percentuale la calcola il programma con la formula della coda
 *   (`avanzamentoCoda`): un compito unito vale 1 solo con il criterio verde
 *   (i fatti vincono), altrimenti è in revisione (0.8).
 * - Quando la percentuale scende (punti o compiti nuovi), `conPercento` tiene
 *   il perché, e la vista lo dice.
 */

export type CompitoPiano = {
  /** Scelto dall'orchestratore (`k1`, `ui-coda`…): unico nel piano. */
  id: string
  /** La richiesta della coda che porta avanti (`r-N`). */
  richiesta: string
  titolo: string
  /** Con cosa si dice fatto. Un comando fra apici inversi (`npm test`) si misura davvero in `unisci`. */
  criterio: string
  /** I compiti che devono essere uniti prima. */
  dopo: string[]
  peso: 1 | 2 | 3
  stato: StatoCompito
  /** Lo specialista che ci lavora (o ci ha lavorato). */
  chat?: string
  /** L'ultimo esito del cancello `unisci`: il criterio misurato dopo l'unione. */
  criterioVerde?: boolean
  /** L'ultimo esito in parole (unione, criterio, motivo del rifiuto). */
  esito?: string
  creato: string
  unitoIl?: string
}

export type Piano = { versione: 1; compiti: CompitoPiano[] }

export const pianoVuoto = (): Piano => ({ versione: 1, compiti: [] })

/** Quanti compiti al più in un `piano_scrivi`. */
export const COMPITI_PER_VOLTA_MAX = 30
const ID_COMPITO = /^[\p{L}\p{N}][\p{L}\p{N}._-]{0,39}$/u

const STATI_COMPITO: StatoCompito[] = ['da-fare', 'in-corso', 'in-revisione', 'unito']

export type CompitoProposto = { id: string; richiesta: string; titolo: string; criterio: string; dopo: string[]; peso: 1 | 2 | 3 }

/** I compiti come li manda il modello: ognuno letto e controllato, o il primo errore. */
export function leggiCompitiProposti(raw: unknown): { ok: true; compiti: CompitoProposto[] } | { ok: false; errore: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, errore: 'servono i compiti: un elenco non vuoto' }
  if (raw.length > COMPITI_PER_VOLTA_MAX) return { ok: false, errore: `al più ${COMPITI_PER_VOLTA_MAX} compiti per volta` }
  const fuori: CompitoProposto[] = []
  for (const [i, x] of raw.entries()) {
    const o = (typeof x === 'object' && x !== null ? x : {}) as Record<string, unknown>
    const chi = typeof o.id === 'string' ? `il compito ${o.id}` : `il compito n. ${i + 1}`
    if (typeof o.id !== 'string' || !ID_COMPITO.test(o.id)) return { ok: false, errore: `${chi}: id mancante o non valido (lettere, cifre, . _ -, al più 40)` }
    if (typeof o.richiesta !== 'string' || !/^r-\d+$/u.test(o.richiesta.trim())) return { ok: false, errore: `${chi}: «richiesta» deve essere l’id di una richiesta in coda (r-N)` }
    const titolo = typeof o.titolo === 'string' ? o.titolo.replace(/\s+/gu, ' ').trim() : ''
    if (titolo === '') return { ok: false, errore: `${chi}: manca il titolo` }
    const criterio = typeof o.criterio === 'string' ? o.criterio.trim() : ''
    if (criterio === '') return { ok: false, errore: `${chi}: manca il criterio (come si dice fatto)` }
    const dopo = o.dopo === undefined ? [] : o.dopo
    if (!Array.isArray(dopo) || dopo.some((d) => typeof d !== 'string')) return { ok: false, errore: `${chi}: «dopo» deve essere un elenco di id di compiti` }
    const peso = o.peso === undefined ? 1 : o.peso
    if (peso !== 1 && peso !== 2 && peso !== 3) return { ok: false, errore: `${chi}: il peso va da 1 a 3` }
    if (fuori.some((c) => c.id === o.id)) return { ok: false, errore: `${chi} compare due volte` }
    fuori.push({ id: o.id, richiesta: o.richiesta.trim(), titolo: titolo.slice(0, 160), criterio: criterio.slice(0, 600), dopo: [...new Set(dopo as string[])], peso })
  }
  return { ok: true, compiti: fuori }
}

/** Un ciclo nelle dipendenze, come percorso (`a → b → a`), o `undefined`. */
export function cicloIn(compiti: Pick<CompitoPiano, 'id' | 'dopo'>[]): string[] | undefined {
  const perId = new Map(compiti.map((c) => [c.id, c]))
  const stato = new Map<string, 1 | 2>()
  const pila: string[] = []
  const visita = (id: string): string[] | undefined => {
    const s = stato.get(id)
    if (s === 2) return undefined
    if (s === 1) return [...pila.slice(pila.indexOf(id)), id]
    stato.set(id, 1)
    pila.push(id)
    for (const d of perId.get(id)?.dopo ?? []) {
      if (!perId.has(d)) continue
      const c = visita(d)
      if (c !== undefined) return c
    }
    pila.pop()
    stato.set(id, 2)
    return undefined
  }
  for (const c of compiti) {
    const ciclo = visita(c.id)
    if (ciclo !== undefined) return ciclo
  }
  return undefined
}

export type EsitoPiano =
  | { ok: true; piano: Piano; coda: Modifica; nuovi: string[]; cambiati: string[] }
  | { ok: false; errore: string }

/**
 * Registra i compiti nel piano (nuovi o aggiornati per id) e li lega alle loro
 * richieste (`Richiesta.compiti`). Rifiuta tutto se:
 * - una richiesta non c'è o è già fatta;
 * - un `dopo` nomina un compito che non c'è (né nel piano né qui);
 * - le dipendenze fanno un ciclo, anche passando da compiti di prima;
 * - si sposta di richiesta un compito già partito.
 */
export function scriviPiano(piano: Piano, coda: Coda, raw: unknown, adesso: string): EsitoPiano {
  const letti = leggiCompitiProposti(raw)
  if (!letti.ok) return letti
  for (const c of letti.compiti) {
    const r = coda.richieste.find((x) => x.id === c.richiesta)
    if (r === undefined) return { ok: false, errore: `il compito ${c.id}: la richiesta ${c.richiesta} non è in coda` }
    if (r.stato === 'fatta') return { ok: false, errore: `il compito ${c.id}: la richiesta ${c.richiesta} è già fatta (una nuova la segue)` }
    if (c.dopo.includes(c.id)) return { ok: false, errore: `il compito ${c.id} dipende da sé stesso` }
    const prima = piano.compiti.find((x) => x.id === c.id)
    if (prima !== undefined && prima.stato !== 'da-fare' && prima.richiesta !== c.richiesta) {
      return { ok: false, errore: `il compito ${c.id} è già ${prima.stato}: non cambia richiesta (aprine uno nuovo)` }
    }
  }
  const nuovi: string[] = []
  const cambiati: string[] = []
  const compiti = [...piano.compiti]
  for (const c of letti.compiti) {
    const i = compiti.findIndex((x) => x.id === c.id)
    if (i < 0) {
      compiti.push({ ...c, stato: 'da-fare', creato: adesso })
      nuovi.push(c.id)
      continue
    }
    const prima = compiti[i]!
    const dopo: CompitoPiano = { ...prima, richiesta: c.richiesta, titolo: c.titolo, criterio: c.criterio, dopo: c.dopo, peso: c.peso }
    // Un criterio cambiato non è più verde: va rimisurato.
    if (dopo.criterio !== prima.criterio) delete dopo.criterioVerde
    if (JSON.stringify(dopo) !== JSON.stringify(prima)) cambiati.push(c.id)
    compiti[i] = dopo
  }
  const ids = new Set(compiti.map((c) => c.id))
  for (const c of letti.compiti) {
    const manca = c.dopo.find((d) => !ids.has(d))
    if (manca !== undefined) return { ok: false, errore: `il compito ${c.id} viene dopo ${manca}, che non è nel piano` }
  }
  const ciclo = cicloIn(compiti)
  if (ciclo !== undefined) return { ok: false, errore: `piano rifiutato: le dipendenze fanno un ciclo (${ciclo.join(' → ')})` }

  // Le richieste toccate: i loro compiti (per id) e lo stato «pianificata».
  let c = coda
  const eventi: EventoCoda[] = []
  for (const k of [...nuovi, ...cambiati]) {
    const compito = compiti.find((x) => x.id === k)!
    // Un compito che cambia richiesta esce da quella di prima.
    for (const r of c.richieste) {
      if (r.id !== compito.richiesta && r.compiti.includes(k)) c = conRichiesta(c, r.id, (x) => ({ ...x, compiti: x.compiti.filter((y) => y !== k) }))
    }
    c = conRichiesta(c, compito.richiesta, (r) => {
      const conCompito = r.compiti.includes(k) ? r : { ...r, compiti: [...r.compiti, k] }
      if (conCompito.stato !== 'in-coda') return conCompito
      eventi.push({ tipo: 'stato', quando: adesso, id: r.id, da: r.stato, a: 'pianificata' })
      return { ...conCompito, stato: 'pianificata' as StatoCoda }
    })
  }
  return { ok: true, piano: { versione: 1, compiti }, coda: { coda: c, eventi }, nuovi, cambiati }
}

/** Un compito cambiato per id: il piano nuovo, o lo stesso se non c'è. */
export function conCompito(piano: Piano, id: string, f: (c: CompitoPiano) => CompitoPiano): Piano {
  const i = piano.compiti.findIndex((c) => c.id === id)
  if (i < 0) return piano
  const compiti = [...piano.compiti]
  compiti[i] = f(compiti[i]!)
  return { ...piano, compiti }
}

/** I compiti pronti a partire: da fare, con tutte le dipendenze unite. */
export function compitiPronti(piano: Piano): CompitoPiano[] {
  const uniti = new Set(piano.compiti.filter((c) => c.stato === 'unito').map((c) => c.id))
  return piano.compiti.filter((c) => c.stato === 'da-fare' && c.dopo.every((d) => uniti.has(d)))
}

/** Quello che serve di una chat per misurare il suo compito. */
export type ChatMisurata = { id: string; ultimaAzione?: string; rapporto?: { testo?: string } }

/**
 * La misura dei compiti del piano: lo stato, il peso e il «passo k di n» dello
 * specialista. Un compito unito ma con il criterio rosso è in revisione: i
 * fatti vincono anche sulla percentuale.
 */
export function misuraDalPiano(piano: Piano, chats: ChatMisurata[] = []): MisuraCompito {
  const perId = new Map(piano.compiti.map((c) => [c.id, c]))
  return (id) => {
    const c = perId.get(id)
    if (c === undefined) return undefined
    const stato: StatoCompito = c.stato === 'unito' && c.criterioVerde !== true ? 'in-revisione' : c.stato
    const chat = c.chat !== undefined ? chats.find((x) => x.id === c.chat) : undefined
    const passo = stato === 'in-corso' ? (passoDichiarato(chat?.rapporto?.testo) ?? passoDichiarato(chat?.ultimaAzione)) : undefined
    const m: CompitoMisurato = { stato, peso: c.peso, ...(passo !== undefined ? { passo } : {}) }
    return m
  }
}

/** Prima il piano, poi (per i compiti di prima, migrati come testo) l'altra misura. */
export function misuraUnita(prima: MisuraCompito, poi: MisuraCompito): MisuraCompito {
  return (id) => prima(id) ?? poi(id)
}

/**
 * Lo stato di ogni richiesta segue i suoi compiti del piano: fatta quando
 * sono tutti uniti con il criterio verde (i punti aperti diventano fatti), in
 * verifica quando sono tutti uniti o in revisione, in corso appena uno parte.
 * Solo le richieste con almeno un compito del piano; una fatta non torna
 * indietro. Torna la stessa coda se non cambia niente.
 */
export function allineaConPiano(coda: Coda, piano: Piano, adesso: string): Modifica {
  const perId = new Map(piano.compiti.map((c) => [c.id, c]))
  const eventi: EventoCoda[] = []
  let cambiata = false
  const richieste = coda.richieste.map((r) => {
    if (r.stato === 'fatta') return r
    const suoi = r.compiti.flatMap((k) => { const c = perId.get(k); return c !== undefined ? [c] : [] })
    if (suoi.length === 0) return r
    const altri = r.compiti.length - suoi.length
    const verdi = suoi.every((c) => c.stato === 'unito' && c.criterioVerde === true)
    let stato: StatoCoda
    if (verdi && altri === 0) stato = 'fatta'
    else if (suoi.some((c) => c.stato === 'in-corso')) stato = 'in-corso'
    else if (suoi.every((c) => c.stato === 'unito' || c.stato === 'in-revisione') && altri === 0) stato = 'in-verifica'
    else if (suoi.some((c) => c.stato !== 'da-fare')) stato = 'in-corso'
    else stato = r.stato === 'in-coda' ? 'pianificata' : r.stato
    if (stato === r.stato) return r
    cambiata = true
    eventi.push({ tipo: 'stato', quando: adesso, id: r.id, da: r.stato, a: stato })
    if (stato !== 'fatta') return { ...r, stato }
    const ultima = suoi.map((c) => c.unitoIl ?? adesso).sort().pop() ?? adesso
    return { ...r, stato, fattaIl: ultima, punti: r.punti.map((p) => (p.stato === 'aperto' ? { ...p, stato: 'fatto' as const } : p)) }
  })
  return { coda: cambiata ? { ...coda, richieste } : coda, eventi }
}

// ---------------------------------------------------------------- percentuale

export type CaloPercento = { da: number; a: number; perche: string; il: string }
export type PercentoWs = { valore?: number; il: string; calo?: CaloPercento }

/** Quello che `GET /orchestratore?ws=` manda alla vista (P3). */
export type VistaOrchestratore = {
  workspace: string
  attivo: boolean
  /** Il workspace ha già autopiloti: l'interruttore si accende con «Attiva». */
  conAutopiloti: boolean
  autopilota?: string
  modello: 'sonnet' | 'opus'
  tettoSpecialisti: number
  percento?: number
  calo?: CaloPercento
  /** Una chiamata è in volo adesso, o un messaggio la aspetta: la vista dice «sta pensando». */
  pensa: boolean
  specialisti: { id: string; ruolo?: string; compito: string; stato: string; compitoId?: string }[]
  piano: { totale: number; uniti: number }
  /** Gli autopiloti di prima, in sola lettura. */
  precedenti: { id: string; nome: string; stato: string; iniziatoIl: string }[]
}

/** Quanto resta visibile il perché di un calo. */
export const CALO_VISIBILE_MS = 6 * 3_600_000

/**
 * La percentuale nuova, con il perché quando scende: «aggiunti 2 punti a
 * r-12». Un calo resta detto per qualche ora, o finché la percentuale non
 * torna sopra a dov'era.
 */
export function conPercento(prima: PercentoWs | undefined, valore: number | undefined, perche: string, il: string): PercentoWs {
  const vecchio = prima?.valore
  let calo = prima?.calo
  if (vecchio !== undefined && valore !== undefined && valore < vecchio) calo = { da: vecchio, a: valore, perche, il }
  if (calo !== undefined && valore !== undefined && valore >= calo.da) calo = undefined
  if (calo !== undefined && Date.parse(il) - Date.parse(calo.il) > CALO_VISIBILE_MS) calo = undefined
  return { ...(valore !== undefined ? { valore } : {}), il, ...(calo !== undefined ? { calo } : {}) }
}

/** La percentuale del workspace dal piano (e, per i compiti di prima, dall'altra misura). */
export function percentoDalPiano(coda: Coda, piano: Piano, chats: ChatMisurata[], altra?: MisuraCompito): number | undefined {
  const m = misuraDalPiano(piano, chats)
  return avanzamentoCoda(coda, altra !== undefined ? misuraUnita(m, altra) : m)
}

// ---------------------------------------------------------------- lettura

function leggiCompitoPiano(x: unknown): CompitoPiano | undefined {
  if (typeof x !== 'object' || x === null) return undefined
  const o = x as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.richiesta !== 'string' || typeof o.titolo !== 'string' || typeof o.criterio !== 'string') return undefined
  const peso = o.peso === 2 || o.peso === 3 ? o.peso : 1
  return {
    id: o.id,
    richiesta: o.richiesta,
    titolo: o.titolo,
    criterio: o.criterio,
    dopo: Array.isArray(o.dopo) ? o.dopo.filter((d): d is string => typeof d === 'string') : [],
    peso,
    stato: STATI_COMPITO.includes(o.stato as StatoCompito) ? (o.stato as StatoCompito) : 'da-fare',
    creato: typeof o.creato === 'string' ? o.creato : '',
    ...(typeof o.chat === 'string' && o.chat !== '' ? { chat: o.chat } : {}),
    ...(typeof o.criterioVerde === 'boolean' ? { criterioVerde: o.criterioVerde } : {}),
    ...(typeof o.esito === 'string' && o.esito !== '' ? { esito: o.esito.slice(0, 600) } : {}),
    ...(typeof o.unitoIl === 'string' && o.unitoIl !== '' ? { unitoIl: o.unitoIl } : {})
  }
}

export function leggiPiano(x: unknown): Piano {
  if (typeof x !== 'object' || x === null) return pianoVuoto()
  const o = x as Record<string, unknown>
  const compiti = Array.isArray(o.compiti) ? o.compiti.flatMap((c) => { const l = leggiCompitoPiano(c); return l !== undefined ? [l] : [] }) : []
  return { versione: 1, compiti }
}

/** Il comando da misurare, se il criterio ne porta uno fra apici inversi: «passa `npm test`». */
export function comandoDelCriterio(criterio: string): string | undefined {
  const m = /`([^`\n]{2,400})`/u.exec(criterio)
  return m?.[1]?.trim() || undefined
}
