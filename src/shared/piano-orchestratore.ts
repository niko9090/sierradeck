import {
  aggiungi, avanzamentoCoda, conRichiesta, contaNellaPercentuale, passoDichiarato,
  type Coda, type CompitoMisurato, type EventoCoda, type MisuraCompito, type Modifica, type Richiesta, type StatoCoda, type StatoCompito
} from './coda-richieste'
import { criterioSempreVerde, esaminaCriterio, titoloDiSolaAnalisi } from './controllo-comandi'

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
  /** Il ramo dello specialista finito: serve a riprendere un'unione a metà dopo un riavvio, quando la memoria dei suoi specialisti non c'è più. */
  ramo?: string
  /**
   * 11/11: i rami di tutti gli specialisti che ci hanno lavorato, qualunque esito. Dopo un riavvio
   * è l'unico filo fra il compito e il lavoro (k-165: «unito» col suo commit rimasto fuori dal principale).
   */
  rami?: string[]
  /** 11/11: il ruolo dell'ultimo specialista partito: dice, anche dopo un riavvio, se è un'analisi senza niente da unire. */
  ruolo?: string
  /** L'ultimo esito del cancello `unisci`: il criterio misurato dopo l'unione. */
  criterioVerde?: boolean
  /** L'ultimo esito in parole (unione, criterio, motivo del rifiuto). */
  esito?: string
  creato: string
  unitoIl?: string
  /**
   * 11/11: chiuso senza unirlo (superato, annullato, o la sua richiesta è stata chiusa). Non è «fatto»:
   * esce dal piano vivo, dalla percentuale e dalle attese di chi veniva dopo.
   */
  chiuso?: ChiusuraCompito
}

/** Come si chiude un compito senza unirlo. `richiesta-chiusa` lo mette solo il programma. */
export type ComeChiusoCompito = 'superato' | 'annullato' | 'richiesta-chiusa'
/** I modi che l'autopilota può scegliere con `piano_chiudi`. */
export const COME_CHIUSO_COMPITO: readonly ComeChiusoCompito[] = ['superato', 'annullato']
export type ChiusuraCompito = { come: ComeChiusoCompito; perche: string; il: string }

export type Piano = { versione: 1; compiti: CompitoPiano[] }

export const pianoVuoto = (): Piano => ({ versione: 1, compiti: [] })

/** Fatto davvero: unito, con il criterio misurato verde. */
export const compitoFatto = (c: Pick<CompitoPiano, 'stato' | 'criterioVerde'>): boolean => c.stato === 'unito' && c.criterioVerde === true

/**
 * **I compiti rimasti di una richiesta ormai chiusa** (11/11: k-6, k-7, k-8, k-10 del 31/10, ancora «in
 * revisione» in ogni stato dell'autopilota e riprovati a ogni aggiornamento). Quelli non fatti di una
 * richiesta fatta (o compattata) si chiudono ed escono dai compiti della richiesta. `salta`: chi ha uno
 * specialista al lavoro o un'unione in corso. Torna gli stessi oggetti se non cambia niente.
 */
export function chiudiCompitiOrfani(piano: Piano, coda: Coda, adesso: string, salta?: ReadonlySet<string>): { piano: Piano; coda: Coda; chiusi: string[] } {
  const perId = new Map(coda.richieste.map((r) => [r.id, r]))
  const compattate = new Set(coda.compattate.map((r) => r.id))
  const chiusi: string[] = []
  const compiti = piano.compiti.map((c) => {
    if (c.chiuso !== undefined || compitoFatto(c) || salta?.has(c.id) === true) return c
    const r = perId.get(c.richiesta)
    if (r === undefined ? !compattate.has(c.richiesta) : r.stato !== 'fatta') return c
    chiusi.push(c.id)
    const perche = r?.chiusa !== undefined ? `la richiesta ${c.richiesta} è stata chiusa (${r.chiusa.come}): ${r.chiusa.perche}` : `la richiesta ${c.richiesta} è fatta`
    return { ...c, chiuso: { come: 'richiesta-chiusa' as const, perche: perche.slice(0, 300), il: adesso } }
  })
  if (chiusi.length === 0) return { piano, coda, chiusi }
  const via = new Set(chiusi)
  return {
    piano: { ...piano, compiti },
    coda: { ...coda, richieste: coda.richieste.map((r) => (r.compiti.some((k) => via.has(k)) ? { ...r, compiti: r.compiti.filter((k) => !via.has(k)) } : r)) },
    chiusi
  }
}

/**
 * Chiude un compito senza unirlo (`piano_chiudi`, 11/11): superato da un altro lavoro, o annullato. Serve
 * il perché. Esce dai compiti della sua richiesta, che così può chiudersi con quelli che restano; se non
 * ne resta nessuno la richiesta torna «in coda», da ripianificare o da chiudere.
 */
export function chiudiCompito(piano: Piano, coda: Coda, p: { id: string; come: string; perche: string; quando: string }): { ok: true; piano: Piano; coda: Modifica; compito: CompitoPiano } | { ok: false; errore: string } {
  const c = piano.compiti.find((x) => x.id === p.id)
  if (c === undefined) return { ok: false, errore: `il compito ${p.id} non è nel piano` }
  if (c.chiuso !== undefined) return { ok: false, errore: `il compito ${p.id} è già chiuso (${c.chiuso.come})` }
  if (compitoFatto(c)) return { ok: false, errore: `il compito ${p.id} è già fatto: unito, con il criterio verde` }
  if (!COME_CHIUSO_COMPITO.includes(p.come as ComeChiusoCompito)) return { ok: false, errore: `«come» è uno fra ${COME_CHIUSO_COMPITO.join(', ')}` }
  const perche = p.perche.replace(/\s+/gu, ' ').trim()
  if (perche === '') return { ok: false, errore: 'serve il perché, in una riga: Nicholas lo legge' }
  const chiuso: CompitoPiano = { ...c, chiuso: { come: p.come as ComeChiusoCompito, perche: perche.slice(0, 300), il: p.quando } }
  const eventi: EventoCoda[] = []
  let nuova = coda
  for (const r of coda.richieste) {
    if (!r.compiti.includes(c.id)) continue
    nuova = conRichiesta(nuova, r.id, (y) => {
      const compiti = y.compiti.filter((k) => k !== c.id)
      // Senza più compiti e non fatta: torna «in coda», così non pesa nella percentuale e si vede che va ripianificata.
      if (compiti.length > 0 || y.stato === 'fatta' || y.stato === 'in-coda') return { ...y, compiti }
      eventi.push({ tipo: 'stato', quando: p.quando, id: y.id, da: y.stato, a: 'in-coda' })
      return { ...y, compiti, stato: 'in-coda' as StatoCoda }
    })
  }
  return { ok: true, piano: conCompito(piano, c.id, () => chiuso), coda: { coda: nuova, eventi }, compito: chiuso }
}

/** Quanti rami si ricordano per compito (i più recenti). */
export const RAMI_RICORDATI = 12

/** Il compito con un ramo in più fra quelli ricordati (lo stesso oggetto se c'era già). */
export function conRamoRicordato(c: CompitoPiano, ramo: string | undefined): CompitoPiano {
  if (ramo === undefined || ramo === '' || c.rami?.includes(ramo) === true) return c
  return { ...c, rami: [...(c.rami ?? []), ramo].slice(-RAMI_RICORDATI) }
}

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
    // 08/11: un criterio che esce sempre con 0 segna fatto un lavoro mai fatto. Fa eccezione l'analisi.
    const comando = comandoDelCriterio(c.criterio)
    const verde = comando !== undefined && !titoloDiSolaAnalisi(c.titolo) ? criterioSempreVerde(comando) : undefined
    if (verde !== undefined) {
      return { ok: false, errore: `il compito ${c.id}: il criterio \`${verde.comando}\` ${verde.motivo}. Usa invece ${verde.alternativa}.` }
    }
    // 11/11 (k-129): lo stesso esame del cancello, subito. Un comando che il cancello respinge sempre non entra nel piano.
    const esame = comando !== undefined ? esaminaCriterio(comando, c.titolo) : undefined
    if (esame !== undefined && !esame.ok) {
      const cosa = esame.problemi.filter((q) => q.gravita === 'errore').map((q) => q.messaggio).join(' ').slice(0, 500)
      const nota = esame.problemi.some((q) => q.tipo === 'note') ? ' Se il compito è proprio una nota, dillo nel titolo («nota», «quaderno», «rapporto»); altrimenti togli il comando e scrivi il criterio a parole.' : ''
      return { ok: false, errore: `il compito ${c.id}: il comando del criterio \`${comando}\` non va bene e il cancello non lo misurerebbe mai. ${cosa}${nota}` }
    }
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
    // 11/11: un compito chiuso senza unirlo torna vivo solo se il piano lo riscrive davvero (richiesta, titolo o criterio nuovi).
    if (dopo.richiesta !== prima.richiesta || dopo.titolo !== prima.titolo || dopo.criterio !== prima.criterio) delete dopo.chiuso
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
    // 11/11: un compito rimasto chiuso non torna fra i compiti della sua richiesta.
    if (compito.chiuso !== undefined) continue
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

// ---------------------------------------------------------------- i seguiti

/** Quanti seguiti al più l'autopilota apre da solo sotto una richiesta di Nicholas. */
export const SEGUITI_PER_RICHIESTA_MAX = 2
/** Così comincia il testo di un seguito aperto dal programma: da qui si riconosce e si conta. */
export const PREFISSO_SEGUITO = 'Seguito deciso dall’autopilota di «'

/** Un seguito aperto dal programma (non una richiesta di Nicholas che ne segue un'altra). */
export function eSeguitoDaSolo(r: Pick<Richiesta, 'originali' | 'testo'>): boolean {
  return (r.originali[0]?.testo ?? r.testo).startsWith(PREFISSO_SEGUITO)
}

export type EsitoSeguiti =
  | { ok: true; compiti: unknown; coda: Coda; eventi: EventoCoda[]; seguiti: { di: string; nuova: string; riusata: boolean }[] }
  | { ok: false; errore: string }

/**
 * **I seguiti** (11/11). Un compito nuovo su una richiesta **già fatta** prima
 * veniva rifiutato («è già fatta»), e l'autopilota non aveva modo di aprire
 * lavoro: così chiedeva a Nicholas «Li correggo?» solo per farsi dare una
 * richiesta aperta (08 e 09/11, tre volte: «il programma non mi lascia aprire
 * lavoro nuovo su una richiesta già chiusa, quindi serve il tuo sì»).
 *
 * Adesso il compito passa a un **seguito**: una richiesta nuova che segue
 * quella fatta, aperta dal programma. Valgono questi limiti:
 * - solo per le richieste fatte con il lavoro: una chiusa senza lavoro
 *   (risposta, doppione, annullata da Nicholas) non si riapre così;
 * - solo per i compiti nuovi: uno che c'è già nel piano non cambia richiesta;
 * - al più `SEGUITI_PER_RICHIESTA_MAX` seguiti sotto la stessa richiesta di
 *   Nicholas, contando anche i seguiti dei seguiti; oltre, si rifiuta;
 * - un seguito ancora aperto si riusa, senza aprirne un altro.
 * Pura: torna i compiti con la richiesta giusta e la coda con i seguiti.
 */
export function apriSeguiti(piano: Piano, coda: Coda, raw: unknown, adesso: string): EsitoSeguiti {
  const niente: EsitoSeguiti = { ok: true, compiti: raw, coda, eventi: [], seguiti: [] }
  const letti = leggiCompitiProposti(raw)
  // Un elenco che non si legge lo rifiuta `scriviPiano`, con il suo errore.
  if (!letti.ok || !Array.isArray(raw)) return niente
  const perId = (c: Coda, id: string): Richiesta | undefined => c.richieste.find((r) => r.id === id)
  /** La richiesta di Nicholas da cui discende un seguito (risalendo i seguiti aperti dal programma). */
  const radice = (c: Coda, id: string): string => {
    let qui = id
    for (let giri = 0; giri < 50; giri += 1) {
      const r = perId(c, qui)
      if (r === undefined || r.segue === undefined || !eSeguitoDaSolo(r)) return qui
      qui = r.segue
    }
    return qui
  }
  const daSpostare = new Map<string, CompitoProposto[]>()
  for (const k of letti.compiti) {
    const r = perId(coda, k.richiesta)
    if (r === undefined || r.stato !== 'fatta' || r.chiusa !== undefined) continue
    if (piano.compiti.some((x) => x.id === k.id)) continue
    daSpostare.set(r.id, [...(daSpostare.get(r.id) ?? []), k])
  }
  if (daSpostare.size === 0) return niente
  let c = coda
  const eventi: EventoCoda[] = []
  const seguiti: { di: string; nuova: string; riusata: boolean }[] = []
  const nuovaRichiesta = new Map<string, string>()
  for (const [fatta, compiti] of daSpostare) {
    const origine = radice(c, fatta)
    const sotto = c.richieste.filter((r) => r.id !== origine && eSeguitoDaSolo(r) && radice(c, r.id) === origine)
    const aperto = sotto.find((r) => r.stato !== 'fatta' && r.chiusa === undefined)
    if (aperto !== undefined) {
      nuovaRichiesta.set(fatta, aperto.id)
      seguiti.push({ di: fatta, nuova: aperto.id, riusata: true })
      continue
    }
    if (sotto.length >= SEGUITI_PER_RICHIESTA_MAX) {
      return { ok: false, errore: `il compito ${compiti[0]!.id}: la richiesta ${fatta} è già fatta e ha già ${sotto.length} seguiti aperti da te (${sotto.map((r) => r.id).join(', ')}). Altro lavoro su questa cosa lo decide Nicholas: diglielo in una riga, o legalo a una richiesta aperta se ne fa parte` }
    }
    const titoloFatta = perId(c, fatta)?.titolo ?? fatta
    const m = aggiungi(c, {
      testo: `${PREFISSO_SEGUITO}${titoloFatta}» (${fatta}): ${compiti.map((k) => k.titolo).join('; ')}`,
      quando: adesso,
      segue: fatta
    })
    c = m.coda
    eventi.push(...m.eventi)
    nuovaRichiesta.set(fatta, m.richiesta.id)
    seguiti.push({ di: fatta, nuova: m.richiesta.id, riusata: false })
  }
  const spostati = new Set([...daSpostare.values()].flat().map((k) => k.id))
  const compiti = raw.map((x: unknown) => {
    const o = (typeof x === 'object' && x !== null ? x : {}) as Record<string, unknown>
    if (typeof o.id !== 'string' || !spostati.has(o.id) || typeof o.richiesta !== 'string') return x
    return { ...o, richiesta: nuovaRichiesta.get(o.richiesta.trim()) ?? o.richiesta }
  })
  return { ok: true, compiti, coda: c, eventi, seguiti }
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
  // 11/11: un compito chiuso senza unirlo non è pronto, e chi veniva dopo di lui non lo aspetta.
  const uniti = new Set(piano.compiti.filter((c) => c.stato === 'unito' || c.chiuso !== undefined).map((c) => c.id))
  return piano.compiti.filter((c) => c.stato === 'da-fare' && c.chiuso === undefined && c.dopo.every((d) => uniti.has(d)))
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
    const delPiano = r.compiti.flatMap((k) => { const c = perId.get(k); return c !== undefined ? [c] : [] })
    // 11/11: un compito chiuso senza unirlo non tiene aperta la richiesta (di norma non è nemmeno più fra i suoi).
    const suoi = delPiano.filter((c) => c.chiuso === undefined)
    if (suoi.length === 0) return r
    const altri = r.compiti.length - delPiano.length
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

/** Quello che `GET /orchestratore?ws=` manda alla vista: l'autopilota del workspace, sempre acceso. */
export type VistaOrchestratore = {
  workspace: string
  /** Assente finché nel workspace non si scrive il primo messaggio. */
  autopilota?: string
  modello: string
  tettoSpecialisti: number
  /** 11/11: le classi di azioni protette che Nicholas ha tolto in questo progetto («Sì, sempre»). */
  permessi?: import('./permessi-nicholas').PermessiScelti
  percento?: number
  calo?: CaloPercento
  /** Una chiamata è in volo adesso, o un messaggio la aspetta: la vista dice «sta pensando». */
  pensa: boolean
  /**
   * 0.102.1: la prossima sveglia che l'autopilota si è messo (es. «riprendo stasera alle
   * 19:02, come mi hai chiesto»). Fino ad allora il fermo è voluto: «In pausa fino alle…».
   */
  sveglia?: { il: string; perche: string }
  /** Gli specialisti: subagenti (con ruolo, attività, stato e durata) e chat adottate. */
  specialisti: { id: string; ruolo?: string; compito: string; stato: string; compitoId?: string; attivita?: string; durata?: string; adottata?: true; fine?: string; pc?: string }[]
  /** Il processo `claude` del workspace è acceso. */
  vivo: boolean
  /** Le ultime righe del registro dal vivo (turni, specialisti, strumenti). */
  registro: { quando: string; tipo: string; testo: string }[]
  /** Quanto è costato: oggi e l'ultimo turno (dal `result` della CLI). */
  costo: { oggiUsd: number; turniOggi: number; ultimoUsd?: number; contesto?: number }
  /** 0.89.2: solo i compiti delle richieste aperte (prima erano tutti, anche quelli di giorni fa). */
  piano: { totale: number; uniti: number }
  /** 0.89.2: le richieste aperte che contano nella percentuale, e i messaggi ancora senza piano. */
  richieste?: { aperte: number; daPianificare: number }
  /** 0.89.2: le domande dell'autopilota che aspettano Nicholas. */
  domandeAperte?: number
  /** 12/11: quello che il programma sta facendo da sé (unire e provare il lavoro finito): non è un fermo. */
  inCorso?: { unione?: string; fase?: 'prova' | 'criterio'; inFila: number }
}

/**
 * Cosa sta succedendo adesso, in una frase (0.89.2). Nicholas (01/11):
 * «l'autopilota mi risponde ma non vedo chat attive e che il compito vada
 * avanti». Gli specialisti lavorano dentro l'autopilota, non come chat: la
 * frase dice chi lavora, o perché è tutto fermo.
 */
/** «alle 19:02», «domani alle 9:00», «il 14/11 alle 8:30». Pura. */
export function quandoSveglia(il: string, ora: number = Date.now()): string {
  const d = new Date(il)
  if (Number.isNaN(d.getTime())) return ''
  const hh = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  const giorno = (t: Date): string => `${t.getFullYear()}-${t.getMonth()}-${t.getDate()}`
  const oggi = new Date(ora)
  const domani = new Date(ora + 86_400_000)
  if (giorno(d) === giorno(oggi)) return `alle ${hh}`
  if (giorno(d) === giorno(domani)) return `domani alle ${hh}`
  return `il ${d.getDate()}/${d.getMonth() + 1} alle ${hh}`
}

/** 12/11: la riga di quello che il programma sta unendo o provando, se c'è. */
export function rigaUnioneInCorso(v: Pick<VistaOrchestratore, 'inCorso'>): string | undefined {
  const c = v.inCorso
  if (c === undefined || c.inFila === 0) return undefined
  const altre = c.unione !== undefined ? c.inFila - 1 : c.inFila
  const fa = c.unione === undefined ? '' : `il programma ${c.fase === 'criterio' ? 'misura il criterio di' : 'prova e unisce'} ${c.unione}`
  const fila = altre > 0 ? `${altre === 1 ? '1 unione' : `${altre} unioni`} in fila` : ''
  return [fa, fila].filter((s) => s !== '').join(', ')
}

export function fraseStatoOrchestratore(v: Pick<VistaOrchestratore, 'pensa' | 'specialisti' | 'piano' | 'richieste' | 'domandeAperte' | 'vivo' | 'sveglia' | 'inCorso'>, ora: number = Date.now()): { testo: string; tono: 'lavora' | 'aspetta' | 'fermo' | 'riposo' } {
  const alLavoro = v.specialisti.filter((c) => c.stato === 'lavoro' || c.stato === 'avviato')
  const domande = v.domandeAperte ?? 0
  const aperte = v.richieste?.aperte ?? 0
  const daPianificare = v.richieste?.daPianificare ?? 0
  const da = (n: number, uno: string, piu: string): string => (n === 1 ? `1 ${uno}` : `${n} ${piu}`)
  if (alLavoro.length > 0) {
    const chi = alLavoro.map((c) => `${c.ruolo ?? 'specialista'}${c.compitoId !== undefined ? ` (${c.compitoId})` : ''}`).join(', ')
    const unione = rigaUnioneInCorso(v)
    return { testo: `Al lavoro: ${chi}${unione !== undefined ? ` · ${unione}` : ''}${v.pensa ? ' · l’autopilota sta pensando' : ''}`, tono: 'lavora' }
  }
  const unione = rigaUnioneInCorso(v)
  if (unione !== undefined && v.inCorso?.unione !== undefined) return { testo: `Al lavoro: ${unione}${v.pensa ? ' · l’autopilota sta pensando' : ''}`, tono: 'lavora' }
  if (v.pensa) return { testo: 'L’autopilota sta pensando: sta leggendo e decidendo cosa affidare', tono: 'lavora' }
  if (domande > 0) return { testo: `Fermo: aspetta ${domande === 1 ? 'una tua risposta' : `${domande} tue risposte`} (nelle Domande)`, tono: 'aspetta' }
  // 0.102.1: una pausa chiesta da Nicholas (la sveglia) non è un fermo.
  if (v.sveglia !== undefined && Date.parse(v.sveglia.il) > ora) return { testo: `In pausa: riprende ${quandoSveglia(v.sveglia.il, ora)}, come gli hai chiesto`, tono: 'riposo' }
  const daFare = v.piano.totale - v.piano.uniti
  // 12/11: unioni in fila che ripartono da sole: il lavoro va avanti, non è un fermo.
  if (unione !== undefined) return { testo: `In attesa: ${unione}, ripartono da sole`, tono: 'riposo' }
  // 12/11: niente più «scrivi vai avanti»: il programma lo risveglia da solo (`spingiFermi`).
  if (aperte > 0 && daFare > 0) return { testo: `Fermo: ${da(daFare, 'compito', 'compiti')} nel piano e nessuno specialista al lavoro: il programma lo rimette al lavoro da solo fra pochi minuti`, tono: 'fermo' }
  if (aperte > 0 || daPianificare > 0) return { testo: `Fermo: ${da(aperte + daPianificare, 'richiesta aperta', 'richieste aperte')} senza compiti: il programma lo rimette al lavoro da solo fra pochi minuti`, tono: 'fermo' }
  return { testo: 'Niente da fare: tutte le richieste sono chiuse', tono: 'riposo' }
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

/** 0.89.2: i numeri del riquadro, solo sul lavoro di adesso (le richieste aperte e i loro compiti). */
export function vistaLavoro(coda: Coda, piano: Piano, domandeAperte: number): Pick<VistaOrchestratore, 'piano' | 'richieste' | 'domandeAperte'> {
  const aperte = coda.richieste.filter((r) => r.stato !== 'fatta')
  const ids = new Set(aperte.map((r) => r.id))
  const suoi = piano.compiti.filter((c) => ids.has(c.richiesta) && c.chiuso === undefined)
  return {
    piano: { totale: suoi.length, uniti: suoi.filter((c) => c.stato === 'unito' && c.criterioVerde === true).length },
    richieste: { aperte: aperte.filter(contaNellaPercentuale).length, daPianificare: aperte.filter((r) => !contaNellaPercentuale(r)).length },
    domandeAperte
  }
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
    ...(typeof o.ramo === 'string' && o.ramo !== '' ? { ramo: o.ramo.slice(0, 200) } : {}),
    ...(Array.isArray(o.rami) && o.rami.some((r) => typeof r === 'string' && r !== '') ? { rami: o.rami.filter((r): r is string => typeof r === 'string' && r !== '').map((r) => r.slice(0, 200)).slice(-RAMI_RICORDATI) } : {}),
    ...(typeof o.ruolo === 'string' && o.ruolo !== '' ? { ruolo: o.ruolo.slice(0, 60) } : {}),
    ...(typeof o.criterioVerde === 'boolean' ? { criterioVerde: o.criterioVerde } : {}),
    ...(typeof o.esito === 'string' && o.esito !== '' ? { esito: o.esito.slice(0, 600) } : {}),
    ...(typeof o.unitoIl === 'string' && o.unitoIl !== '' ? { unitoIl: o.unitoIl } : {}),
    ...(leggiChiusura(o.chiuso) !== undefined ? { chiuso: leggiChiusura(o.chiuso)! } : {})
  }
}

function leggiChiusura(x: unknown): ChiusuraCompito | undefined {
  if (typeof x !== 'object' || x === null) return undefined
  const q = x as Record<string, unknown>
  const come = q.come === 'superato' || q.come === 'annullato' || q.come === 'richiesta-chiusa' ? q.come : undefined
  if (come === undefined || typeof q.perche !== 'string' || typeof q.il !== 'string') return undefined
  return { come, perche: q.perche.slice(0, 300), il: q.il }
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

/** 0.90.0: una riga della conversazione di uno specialista, da guardare a destra. */
export type RigaSpecialista = { tipo: 'compito' | 'testo' | 'strumento' | 'esito'; testo: string; quando?: string; errore?: true }

/** 0.90.0: la conversazione di uno specialista (le ultime righe); `trovata: false` se la CLI non l'ha ancora scritta. */
export type TrascrizioneSpecialista = { id: string; trovata: boolean; righe: RigaSpecialista[] }
