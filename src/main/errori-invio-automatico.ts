import { chiaveErrore, storicoPerLInvio, type StoricoErrori, type VoceErrore } from '@shared/storico-errori'

/**
 * L'invio automatico degli errori al PC di sviluppo (0.88.4, rivisto 0.95.5).
 *
 * Nicholas (30/10): «voglio che gli errori arrivino in automatico». Il 06/11:
 * «quando sono inviati vengano contrassegnati come inviati, così non compaiono
 * più nella lista».
 *
 * Ogni PC manda **solo gli errori non ancora inviati**, quando lo storico è
 * stato zitto per `QUIETE_INVIO_MS` (un difetto che si ripete in raffica va in
 * un invio solo) e mai più spesso di `INTERVALLO_MIN_MS`. Se il PC di sviluppo
 * è spento gli errori restano sul Drive (`mandaErrori`); se l'invio non riesce
 * non si segna niente e si riprova al giro dopo, con gli stessi errori.
 *
 * Ogni errore inviato si ricorda con il conteggio «volte» di quel momento e la
 * data (`StatoInvio.inviati`): non si rimanda; se si ripete, parte una voce con
 * le sole volte nuove. Le voci inviate escono dalla lista normale e stanno
 * sotto «Già inviati». Il formato dell'invio non cambia: i PC con versioni
 * vecchie, che ricevono e mandano, restano compatibili.
 *
 * Il PC di sviluppo è quello scelto nelle Impostazioni; se non c'è, il
 * proprietario del progetto SierraDeck (è lì che sta il codice). Il PC di
 * sviluppo non manda a se stesso: gli errori sono già lì.
 */

export const QUIETE_INVIO_MS = 90_000
export const INTERVALLO_MIN_MS = 5 * 60_000
export const GIRO_INVIO_MS = 30_000
/** 0.88.8: un errore che si ripete ogni pochi minuti non lascia mai lo storico zitto: dopo questa attesa parte lo stesso. */
export const ATTESA_MASSIMA_MS = 10 * 60_000
/** Quante voci inviate si ricordano, al più. */
const MAX_INVIATI = 500

export type VoceInviata = { volte: number; il: string }

export type StatoInvio = {
  /** Fino a qui (ISO) le voci senza una riga in `inviati` si considerano già inviate (stato del primo giro, o di prima del 0.95.5). */
  fino?: string
  /** Quando è partito l'ultimo invio riuscito. */
  il?: string
  /** Per ogni errore (`chiaveErrore`): quante volte era successo quando è stato inviato, e quando. */
  inviati?: Record<string, VoceInviata>
}

/** Gli errori visti dopo `fino`, con il loro conteggio di adesso. */
export function vociNuove(storico: StoricoErrori, fino: string | undefined): VoceErrore[] {
  return storico.voci.filter((v) => fino === undefined || (v.ultima ?? v.quando) > fino)
}

/**
 * Cosa resta da mandare: per ogni errore mai inviato la voce intera; per uno
 * già inviato che si è ripetuto, la voce con le sole volte nuove. `totale` è
 * il conteggio di adesso, da ricordare quando l'invio riesce.
 */
export function vociDaInviare(storico: StoricoErrori, stato: StatoInvio): Array<{ voce: VoceErrore; totale: number }> {
  const fuori: Array<{ voce: VoceErrore; totale: number }> = []
  for (const v of storico.voci) {
    const e = stato.inviati?.[chiaveErrore(v)]
    if (e === undefined) {
      if (stato.fino !== undefined && (v.ultima ?? v.quando) <= stato.fino) continue
      fuori.push({ voce: v, totale: v.volte })
    } else if (v.quando > e.il) {
      // È tornato dopo che il conteggio si è azzerato (la voce era uscita dallo storico): è tutto nuovo.
      fuori.push({ voce: v, totale: v.volte })
    } else if (v.volte > e.volte) {
      fuori.push({ voce: { ...v, volte: v.volte - e.volte, quando: e.il > v.quando ? e.il : v.quando }, totale: v.volte })
    }
  }
  return fuori
}

/**
 * La lista di «Errori»: le voci non ancora inviate (con le sole volte nuove) e,
 * a parte, quelle già inviate con la data dell'invio.
 */
export function vistaErrori(storico: StoricoErrori, stato: StatoInvio | undefined): { voci: VoceErrore[]; inviate: Array<VoceErrore & { inviatoIl: string }> } {
  const s = stato ?? {}
  const daInviare = vociDaInviare(storico, s)
  const chiavi = new Set(daInviare.map((x) => chiaveErrore(x.voce)))
  const inviate: Array<VoceErrore & { inviatoIl: string }> = []
  const vecchie: VoceErrore[] = []
  for (const v of storico.voci) {
    if (chiavi.has(chiaveErrore(v))) continue
    // Senza una riga propria vale l'ultimo invio (stato di prima del 0.95.5). Se non si è mai mandato
    // niente (le voci più vecchie del primo giro) non c'è una data da dire: restano nella lista.
    const il = s.inviati?.[chiaveErrore(v)]?.il ?? s.il
    if (il !== undefined) inviate.push({ ...v, inviatoIl: il })
    else vecchie.push(v)
  }
  const voci = [...daInviare.map((x) => x.voce), ...vecchie].sort((a, b) => (a.ultima < b.ultima ? 1 : a.ultima > b.ultima ? -1 : 0))
  return { voci, inviate }
}

export function decidiInvio(p: {
  nuove: readonly VoceErrore[]
  stato: StatoInvio
  adesso: number
  pcSviluppo: string | undefined
}): { manda: false; perche?: string } | { manda: true; fino: string } {
  if (p.pcSviluppo === undefined) return { manda: false, perche: 'nessun PC di sviluppo' }
  if (p.nuove.length === 0) return { manda: false }
  const fino = p.nuove.map((v) => v.ultima ?? v.quando).sort().at(-1) as string
  // Da quando aspetta l'errore più vecchio: dalla sua prima volta, o dall'ultimo invio se è venuto dopo.
  const primo = p.nuove.map((v) => (p.stato.il !== undefined && p.stato.il > v.quando ? p.stato.il : v.quando)).sort()[0] as string
  const zitto = p.adesso - Date.parse(fino) >= QUIETE_INVIO_MS
  if (!zitto && p.adesso - Date.parse(primo) < ATTESA_MASSIMA_MS) return { manda: false, perche: 'aspetto che lo storico stia zitto' }
  if (p.stato.il !== undefined && p.adesso - Date.parse(p.stato.il) < INTERVALLO_MIN_MS) return { manda: false, perche: 'l’ultimo invio è troppo recente' }
  return { manda: true, fino }
}

/** Il PC di sviluppo: quello scelto, o il proprietario del progetto SierraDeck. */
export function pcSviluppoDi(scelto: string | undefined, progetti: ReadonlyArray<{ nome: string; proprietario?: string }>): string | undefined {
  if (scelto !== undefined) return scelto
  return progetti.find((p) => p.nome.toLowerCase() === 'sierradeck' && p.proprietario !== undefined)?.proprietario
}

/**
 * Un giro: legge, decide, manda, segna. Il primo giro su un PC che non ha mai
 * mandato niente parte da adesso meno un giorno: lo storico vecchio non si
 * rimanda tutto. `forza` (il tasto «Manda ora») salta le attese.
 */
export async function giroInvioErrori(d: {
  storico: () => StoricoErrori
  stato: { leggi: () => StatoInvio | undefined; scrivi: (s: StatoInvio) => void }
  pcSviluppo: () => string | undefined
  /** Questo PC è il PC di sviluppo: non manda a se stesso. */
  eSviluppo?: () => boolean
  adesso: () => number
  /** Manda; `quante` (se c'è) dice quante voci, dalla prima, sono davvero partite (il tetto di peso ne può togliere). */
  manda: (storico: StoricoErrori) => Promise<{ ok: boolean; messaggio: string; quante?: number }>
  log: (riga: string) => void
  /** Il motivo dell'ultimo invio fallito (come per la posta): la riga di errore si scrive una volta, e di nuovo solo se il motivo cambia. */
  fallimento?: { leggi: () => string | undefined; scrivi: (motivo: string | undefined) => void }
  forza?: boolean
}): Promise<{ ok: boolean; messaggio: string }> {
  const adesso = d.adesso()
  if (d.pcSviluppo() === undefined) return { ok: false, messaggio: 'Prima scegli il PC di sviluppo.' }
  if (d.eSviluppo?.() === true) return { ok: true, messaggio: 'Questo è il PC di sviluppo: gli errori sono già qui.' }
  let stato = d.stato.leggi()
  if (stato === undefined) {
    stato = { fino: new Date(adesso - 86_400_000).toISOString() }
    d.stato.scrivi(stato)
  }
  const storico = d.storico()
  const dovuti = vociDaInviare(storico, stato)
  if (dovuti.length === 0) return { ok: false, messaggio: 'Non c’è nessun errore da mandare.' }
  if (d.forza !== true) {
    const dec = decidiInvio({ nuove: dovuti.map((x) => x.voce), stato, adesso, pcSviluppo: d.pcSviluppo() })
    if (!dec.manda) return { ok: true, messaggio: dec.perche ?? 'Niente da mandare adesso.' }
  }
  // Prima del tetto di peso: le voci che non ci stanno restano da mandare, non si segnano.
  const invio = storicoPerLInvio({ voci: dovuti.map((x) => x.voce) })
  const e = await d.manda(invio)
  if (!e.ok) {
    if (d.fallimento === undefined || d.fallimento.leggi() !== e.messaggio) {
      d.fallimento?.scrivi(e.messaggio)
      d.log(`[errori] invio automatico non riuscito, riprovo al prossimo giro (non lo ripeto finche' il motivo e' lo stesso): ${e.messaggio}`)
    }
    return { ok: false, messaggio: e.messaggio }
  }
  if (d.fallimento?.leggi() !== undefined) { d.fallimento.scrivi(undefined); d.log('[errori] invio errori ripreso') }
  const partite = dovuti.slice(0, Math.min(invio.voci.length, e.quante ?? invio.voci.length))
  const il = new Date(adesso).toISOString()
  const inviati: Record<string, VoceInviata> = { ...(stato.inviati ?? {}) }
  for (const x of partite) inviati[chiaveErrore(x.voce)] = { volte: x.totale, il }
  // Si ricordano solo gli errori ancora nello storico, e al più MAX_INVIATI.
  const vivi = new Set(storico.voci.map(chiaveErrore))
  const tenuti = Object.entries(inviati).filter(([k]) => vivi.has(k)).sort((a, b) => (a[1].il < b[1].il ? 1 : -1)).slice(0, MAX_INVIATI)
  d.stato.scrivi({ ...(stato.fino !== undefined ? { fino: stato.fino } : {}), il, inviati: Object.fromEntries(tenuti) })
  d.log(`[errori] invio automatico: ${e.messaggio}`)
  return { ok: true, messaggio: e.messaggio }
}
