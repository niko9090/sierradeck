import type { Autopilota } from './autopilota'

/**
 * **L'elenco leggero degli autopiloti** (0.85.2).
 *
 * `GET /autopiloti` mandava tutto di tutti, ogni volta: con un autopilota al
 * lavoro da un mese erano 5,4 MB (18.000 decisioni da sole 3,8 MB), riletti dal
 * Gestore, passati alle finestre e ridisegnati ogni 2-5 secondi da sei parti
 * diverse. Il PC restava occupato per mostrare un pallino e una riga.
 *
 * Le viste d'elenco (pannello, LED, piastrelle, «Dal vivo», la pagina del
 * telefono) guardano solo la **coda** delle liste lunghe: l'ultima
 * decisione, l'ultima battuta. L'elenco leggero tiene
 * quella coda e dice in `troncati` quanto erano lunghe davvero; la storia
 * intera la chiede solo chi la mostra (la conversazione, il diario, il Punto),
 * con `GET /autopiloti/:id`.
 */

/** Quante voci restano in coda nell'elenco leggero. */
export const CODA_LEGGERA = { decisioni: 40, dialogo: 20 } as const

/** Quanto erano lunghe le liste prima di tagliarle: c'è solo se qualcosa è stato tagliato. */
export type Troncati = { decisioni: number; dialogo: number }

export type AutopilotaLeggero = Autopilota & { troncati?: Troncati }

/** Le liste tagliate nell'elenco leggero: le stesse che `conIntero` rimette. */
const LISTE = ['decisioni', 'dialogo'] as const

/**
 * L'autopilota per un elenco: le liste lunghe ridotte alla coda.
 *
 * Tutto il resto è com'è (stato, chats, messaggi in coda…): le viste
 * d'elenco non devono accorgersi di niente. Se niente è da tagliare torna
 * l'oggetto stesso, senza `troncati`.
 */
export function autopilotaLeggero(a: Autopilota): AutopilotaLeggero {
  const lunghe = LISTE.some((k) => (a[k]?.length ?? 0) > CODA_LEGGERA[k])
  if (!lunghe) return a
  return {
    ...a,
    decisioni: (a.decisioni ?? []).slice(-CODA_LEGGERA.decisioni),
    dialogo: (a.dialogo ?? []).slice(-CODA_LEGGERA.dialogo),
    troncati: { decisioni: a.decisioni?.length ?? 0, dialogo: a.dialogo?.length ?? 0 }
  }
}

/** È un autopilota dell'elenco leggero con qualcosa di tagliato: per mostrarne la storia serve quello intero. */
export function eTroncato(a: Autopilota): boolean {
  return (a as AutopilotaLeggero).troncati !== undefined
}

/**
 * Le liste lunghe dall'autopilota intero, tutto il resto dall'elenco.
 *
 * L'elenco si rilegge più spesso del dettaglio: stato, chat e segni vengono da
 * lì, che è il più fresco. Le liste, se l'elenco ne ha di più nuove in coda
 * (una decisione arrivata dopo l'ultimo dettaglio), si allungano con quelle:
 * la conversazione non perde mai l'ultima riga mentre il dettaglio arriva.
 */
export function conIntero(leggero: Autopilota, intero: Autopilota | undefined): Autopilota {
  if (intero === undefined || intero.id !== leggero.id || !eTroncato(leggero)) return leggero
  const { troncati, ...resto } = leggero as AutopilotaLeggero & { troncati: Troncati }
  const unite = {} as Pick<Autopilota, (typeof LISTE)[number]>
  for (const k of LISTE) unite[k] = allunga<{ quando: string }>(intero[k] ?? [], leggero[k] ?? [], troncati[k]) as never
  return { ...resto, ...unite }
}

/**
 * La lista intera con in fondo la coda dell'elenco, che è la più fresca.
 *
 * Se la coda si ritrova nella lista intera là dove deve stare (la lista era
 * lunga `lunga`, la coda ne è la fine), la lista è il pezzo prima più la coda:
 * così anche una voce della coda riscritta (l'esito di una tua battuta) si
 * vede subito. Se no (il dettaglio è indietro), si aggiungono le voci più
 * nuove dell'ultima che il dettaglio conosce.
 */
function allunga<T extends { quando: string }>(intera: T[], coda: T[], lunga: number): T[] {
  if (coda.length === 0) return intera
  const inizio = lunga - coda.length
  if (inizio >= 0 && inizio <= intera.length && intera[inizio]?.quando === coda[0]!.quando) return [...intera.slice(0, inizio), ...coda]
  const ultima = intera[intera.length - 1]?.quando
  if (ultima === undefined) return coda
  const nuove = coda.filter((x) => x.quando > ultima)
  return nuove.length === 0 ? intera : [...intera, ...nuove]
}

/**
 * La firma delle liste lunghe di un autopilota dell'elenco: cambia quando una
 * di loro cambia (una voce in più, l'ultima riscritta), non quando cambiano
 * solo i segni di vita. È quella che decide se rileggere il dettaglio.
 */
export function firmaStoria(a: Autopilota): string {
  const t = (a as AutopilotaLeggero).troncati
  const ultima = (l: { quando: string }[] | undefined): string => {
    const x = l?.[l.length - 1]
    return x === undefined ? '' : JSON.stringify(x)
  }
  return [
    t?.decisioni ?? a.decisioni?.length ?? 0, t?.dialogo ?? a.dialogo?.length ?? 0,
    ultima(a.decisioni), ultima(a.dialogo)
  ].join('|')
}

/**
 * Quante battute della conversazione composta (`conversazione`) manda la
 * scheda **leggera** del telefono (0.86.0): la pagina e l'app la rileggono
 * ogni due secondi mentre è aperta, e un autopilota al lavoro da settimane ne
 * ha migliaia. Chi vuole risalire chiede la scheda intera, con un tocco.
 */
export const CODA_CHAT_LEGGERA = 80

/** La coda della conversazione e, se è stata tagliata, quante battute aveva in tutto. */
export function codaConversazione<T>(chat: T[]): { chat: T[]; chatIntera?: number } {
  if (chat.length <= CODA_CHAT_LEGGERA) return { chat }
  return { chat: chat.slice(-CODA_CHAT_LEGGERA), chatIntera: chat.length }
}
