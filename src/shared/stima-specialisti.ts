/**
 * **La stima degli specialisti** (k-53, 06/11): per ogni specialista, al lavoro
 * o in fila, a che punto è (percentuale) e quanto manca; e quanto lavoro resta
 * per svuotare tutta la lista. Funzioni pure: le usa il servizio per riempire
 * la `VistaAttesa`, la sezione «Specialisti» del PC e quella del telefono
 * mostrano i numeri già calcolati.
 *
 * - La **durata attesa** di un compito è la media delle durate vere dei compiti
 *   già finiti con lo stesso peso (1-3); senza storico vale {@link DURATA_ATTESA_MIN}.
 * - La **percentuale** è il tempo trascorso diviso la durata attesa, con un tetto
 *   a {@link PERCENTUALE_MAX} (95): mai 100 finché non è finito. Oltre la durata
 *   attesa la voce è «in ritardo».
 * - Il **totale** tiene conto dei posti in parallelo: chi è in fila parte quando
 *   si libera un posto, nell'ordine della fila.
 */

export type PesoCompito = 1 | 2 | 3

/**
 * La durata attesa, in minuti, quando non c'è ancora uno storico per quel peso.
 * Valori prudenti: un compito leggero è una correzione mirata, uno pesante un
 * pezzo con prove. Appena ci sono compiti finiti con quel peso, vince la loro media.
 */
export const DURATA_ATTESA_MIN: Record<PesoCompito, number> = { 1: 10, 2: 25, 3: 50 }

/** Il peso di chi non ha un compito nel piano (lo specialista lanciato a mano): quello di mezzo. */
export const PESO_PREDEFINITO: PesoCompito = 2

/** Il tetto della percentuale: oltre, la voce è «in ritardo». */
export const PERCENTUALE_MAX = 95

/** Quanto si stima ancora a chi è già in ritardo: non si sa, ma non è zero. */
export const RESTO_IN_RITARDO_MIN = 5

/** Quanti caratteri al più per il titolo breve di un compito. */
export const TITOLO_BREVE_MAX = 60

/** Un compito finito: il peso e quanti minuti c'è voluto davvero. */
export type DurataVera = { peso: PesoCompito; minuti: number }

/** La durata attesa per un peso: la media dello storico valido, o il valore fisso. */
export function durataAttesa(peso: PesoCompito, storico: readonly DurataVera[]): number {
  const buone = storico.filter((d) => d.peso === peso && Number.isFinite(d.minuti) && d.minuti > 0)
  if (buone.length === 0) return DURATA_ATTESA_MIN[peso]
  return buone.reduce((n, d) => n + d.minuti, 0) / buone.length
}

export type StimaAlLavoro = {
  /** Da 0 a 95. */
  percentuale: number
  /** Minuti stimati alla fine, interi, almeno 1. */
  minuti: number
  inRitardo: boolean
}

/** Percentuale e minuti per chi sta lavorando da `trascorsiMin` minuti su un compito di durata attesa `attesaMin`. */
export function stimaAlLavoro(trascorsiMin: number, attesaMin: number): StimaAlLavoro {
  const t = Number.isFinite(trascorsiMin) ? Math.max(0, trascorsiMin) : 0
  const a = Math.max(1, attesaMin)
  if (t >= a) return { percentuale: PERCENTUALE_MAX, minuti: RESTO_IN_RITARDO_MIN, inRitardo: true }
  return { percentuale: Math.min(PERCENTUALE_MAX, Math.floor((t / a) * 100)), minuti: Math.max(1, Math.ceil(a - t)), inRitardo: false }
}

/** Il titolo breve: una riga, senza la sigla del compito in testa («k-48: …»), al più {@link TITOLO_BREVE_MAX} caratteri. */
export function titoloBreve(testo: string): string {
  const t = testo.replace(/\s+/gu, ' ').replace(/^\s*(?:\[[A-Za-z]{1,4}-\d{1,6}\]|[A-Za-z]{1,4}-\d{1,6}\s*[:—–-])\s*/u, '').trim()
  return t.length > TITOLO_BREVE_MAX ? `${t.slice(0, TITOLO_BREVE_MAX - 1).trimEnd()}…` : t
}

export type EntrataStima = { id: string; peso: PesoCompito }
export type AlLavoroStima = EntrataStima & { inizioMs: number }

export type StimaTotale = {
  alLavoro: Record<string, StimaAlLavoro>
  /** In fila: la percentuale è 0 e i minuti includono l'attesa del posto. */
  inFila: Record<string, { percentuale: 0; minuti: number }>
  totale: { minuti: number; compiti: number }
}

/**
 * La stima di tutta la lista. `inFila` è già nell'ordine in cui partiranno;
 * `tetto` i posti in parallelo. Quando i posti sono pieni, il primo in fila
 * parte alla prima fine, il secondo alla seconda, e così via.
 */
export function stimaLista(p: { adesso: number; tetto: number; alLavoro: readonly AlLavoroStima[]; inFila: readonly EntrataStima[]; storico: readonly DurataVera[] }): StimaTotale {
  const alLavoro: StimaTotale['alLavoro'] = {}
  const resti: number[] = []
  for (const l of p.alLavoro) {
    const s = stimaAlLavoro((p.adesso - l.inizioMs) / 60_000, durataAttesa(l.peso, p.storico))
    alLavoro[l.id] = s
    resti.push(s.minuti)
  }
  // I posti: chi lavora li occupa fino alla sua fine; se sono più dei posti, i nuovi aspettano che ne finiscano abbastanza.
  const tetto = Math.max(1, Math.floor(p.tetto))
  const ordinati = resti.sort((a, b) => a - b)
  const posti = ordinati.slice(Math.max(0, ordinati.length - tetto))
  while (posti.length < tetto) posti.unshift(0)
  const inFila: StimaTotale['inFila'] = {}
  let fine = ordinati.length > 0 ? ordinati[ordinati.length - 1]! : 0
  for (const f of p.inFila) {
    posti.sort((a, b) => a - b)
    const parte = posti[0]!
    const finisce = parte + durataAttesa(f.peso, p.storico)
    posti[0] = finisce
    inFila[f.id] = { percentuale: 0, minuti: Math.max(1, Math.ceil(finisce)) }
    fine = Math.max(fine, finisce)
  }
  return { alLavoro, inFila, totale: { minuti: p.alLavoro.length + p.inFila.length === 0 ? 0 : Math.max(1, Math.ceil(fine)), compiti: p.alLavoro.length + p.inFila.length } }
}
