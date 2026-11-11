/**
 * Scritture senza doppioni: `x-sierradeck-richiesta`.
 *
 * Il telefono cambia rete mentre manda «apri questa chat»: la richiesta
 * arriva, la risposta no. L'app riprova sull'altra strada, e il PC apriva la
 * chat due volte (o mandava due volte lo stesso testo, o creava due
 * workspace). Da fuori non si distingue «non è arrivata» da «è arrivata e la
 * risposta si è persa»: lo sa solo il PC.
 *
 * Quindi l'app mette su ogni scrittura un id suo (`x-sierradeck-richiesta`,
 * un uuid), e lo **stesso** id su ogni nuovo tentativo della stessa azione. Il
 * PC ricorda per dieci minuti la risposta data a quell'id e la ridà uguale,
 * senza rifare niente.
 *
 * La chiave è rotta + id, **non** il dispositivo: lo stesso telefono ha un id
 * diverso su ogni PC, e dal ponte arriva come «un altro PC». Così una scrittura
 * partita dal ponte (il PC di mezzo inoltra l'id) e ritentata dritta verso il
 * PC giusto si riconosce lo stesso. Un uuid non si indovina: chi non l'ha
 * mandato non legge la risposta di un altro.
 *
 * - Un secondo tentativo che arriva **mentre il primo lavora ancora** aspetta
 *   lo stesso esito: non parte una seconda volta.
 * - Si ricorda qualunque risposta data, anche un rifiuto: un esito incerto
 *   («non so se è arrivata») resta quello, non diventa un doppione. Chi vuole
 *   davvero rifare (un nuovo tocco di chi usa l'app) manda un id nuovo.
 * - Non si ricorda una rotta che è caduta (eccezione: non ha risposto niente)
 *   né una risposta oltre `RISPOSTA_RICORDATA_MAX`: quelle grandi sono
 *   letture, e rifarle non fa danni.
 * - La memoria è in RAM: un riavvio del programma la svuota. Dopo un riavvio
 *   anche le chat sono ripartite, e un doppione lì non è più lo stesso rischio.
 */

type Esito = { stato: number; corpo: unknown; tipo?: string }

export const INTESTAZIONE_RICHIESTA = 'x-sierradeck-richiesta'
/** Per quanto si ricorda la risposta a un id. */
export const RICORDA_RICHIESTA_MS = 10 * 60_000
/** Oltre questo peso (caratteri del JSON) la risposta non si ricorda: è una lettura. */
export const RISPOSTA_RICORDATA_MAX = 256 * 1024
/** Fino a qui una risposta è «piccola» (una scrittura): quelle grandi hanno un tetto insieme. */
const PICCOLA_MAX = 8 * 1024
/** Quanto pesano al più, insieme, le risposte grandi ricordate. */
const GRANDI_INSIEME_MAX = 8 * 1024 * 1024
/** Quante voci al più: oltre, via le più vecchie. */
const VOCI_MAX = 5000
const ID_VALIDO = /^[A-Za-z0-9_-]{8,80}$/

/** L'id della richiesta, se c'è e ha una forma accettabile. */
export function idRichiestaDa(intestazioni: Record<string, string | string[] | undefined>): string | undefined {
  const grezzo = intestazioni[INTESTAZIONE_RICHIESTA]
  const testo = (typeof grezzo === 'string' ? grezzo : Array.isArray(grezzo) ? (grezzo[0] ?? '') : '').trim()
  return ID_VALIDO.test(testo) ? testo : undefined
}

type Voce = { scade: number; peso: number; testo?: string; stato?: number; tipo?: string; inVolo?: Promise<Esito> }

export type MemoriaRichieste = {
  /**
   * Fa l'azione una volta sola per (`percorso`, `id`). `ripetuta` viene
   * chiamata quando si ridà una risposta di prima, o si aspetta quella in corso.
   */
  unaVolta: (percorso: string, id: string, fai: () => Promise<Esito> | Esito, opzioni?: { valeMs?: number; ripetuta?: () => void }) => Promise<Esito>
  /** Quante risposte sono ricordate adesso (per i test). */
  quante: () => number
}

export function creaMemoriaRichieste(adesso: () => number = Date.now): MemoriaRichieste {
  // Una Map tiene l'ordine di inserimento: la prima è la più vecchia.
  const voci = new Map<string, Voce>()
  let grandi = 0

  const togli = (chiave: string): void => {
    const v = voci.get(chiave)
    if (v === undefined) return
    if (v.peso > PICCOLA_MAX) grandi -= v.peso
    voci.delete(chiave)
  }

  const pulisci = (): void => {
    const ora = adesso()
    for (const [k, v] of voci) {
      // In ordine di nascita, non di scadenza (quelle con `valeMs` scadono prima):
      // si guardano tutte, sono al più qualche migliaio.
      if (v.inVolo === undefined && v.scade <= ora) togli(k)
    }
    // Le grandi hanno un tetto insieme: via le più vecchie fra le grandi.
    if (grandi > GRANDI_INSIEME_MAX) {
      for (const [k, v] of voci) {
        if (grandi <= GRANDI_INSIEME_MAX) break
        if (v.inVolo === undefined && v.peso > PICCOLA_MAX) togli(k)
      }
    }
    if (voci.size > VOCI_MAX) {
      for (const [k, v] of voci) {
        if (voci.size <= VOCI_MAX) break
        if (v.inVolo === undefined) togli(k)
      }
    }
  }

  const daVoce = (v: Voce): Esito => {
    const json = v.tipo === undefined || v.tipo.startsWith('application/json')
    return { stato: v.stato as number, corpo: json ? (JSON.parse(v.testo as string) as unknown) : v.testo, ...(v.tipo !== undefined ? { tipo: v.tipo } : {}) }
  }

  return {
    async unaVolta(percorso, id, fai, opzioni = {}) {
      pulisci()
      const chiave = `${percorso}\n${id}`
      const gia = voci.get(chiave)
      if (gia !== undefined) {
        try { opzioni.ripetuta?.() } catch { /* il registro non ferma la risposta */ }
        return gia.inVolo !== undefined ? gia.inVolo : daVoce(gia)
      }
      const voce: Voce = { scade: Number.POSITIVE_INFINITY, peso: 0 }
      const inVolo = (async () => fai())()
      voce.inVolo = inVolo
      voci.set(chiave, voce)
      let esito: Esito
      try {
        esito = await inVolo
      } catch (err) {
        // La rotta è caduta: non ha dato nessuna risposta da ricordare.
        if (voci.get(chiave) === voce) voci.delete(chiave)
        throw err
      }
      const json = esito.tipo === undefined || esito.tipo.startsWith('application/json')
      let testo: string | undefined
      try { testo = json ? JSON.stringify(esito.corpo) : String(esito.corpo) } catch { testo = undefined }
      if (testo === undefined || testo.length > RISPOSTA_RICORDATA_MAX) {
        if (voci.get(chiave) === voce) voci.delete(chiave)
        return esito
      }
      voce.inVolo = undefined
      voce.testo = testo
      voce.stato = esito.stato
      if (esito.tipo !== undefined) voce.tipo = esito.tipo
      voce.peso = testo.length
      voce.scade = adesso() + (opzioni.valeMs ?? RICORDA_RICHIESTA_MS)
      if (voce.peso > PICCOLA_MAX) grandi += voce.peso
      return esito
    },
    quante: () => voci.size
  }
}
