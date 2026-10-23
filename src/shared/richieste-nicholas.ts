import type { Autopilota } from './autopilota'

/**
 * **Le richieste di Nicholas diventano obiettivi da sole** (0.85.0).
 *
 * Nicholas, 23/10: «ogni richiesta aumenta o cambia gli obbiettivi finali e
 * dovrà avere un riscontro giusto». Fino alla 0.84.4 una richiesta scritta
 * all'autopilota dalla scheda entrava nei criteri e nella coda solo se il
 * supervisore se ne ricordava nel JSON del dialogo: il 23/10 alle 07:25 due
 * richieste (la Revisione che respinge rami giusti per l'ambiente, le risposte
 * che arrivano ma non vengono prese) sono finite solo in un messaggio per la
 * chat, e in coda le ha messe il supervisore a mano due ore dopo.
 *
 * Adesso il programma tiene il **registro delle richieste** dentro
 * l'autopilota: data, le sue parole, un titolo, il criterio (mai vuoto) e i
 * compiti in coda. Lo stato si calcola: da fare → in corso → fatta nella
 * versione X. Il «Punto» le mostra in cima, uguali su PC, pagina e app.
 *
 * Qui la forma, la lettura dal disco e le regole pure. La registrazione dal
 * dialogo è in `autopilot-host/richieste.ts`.
 *
 * Per chi viene dopo (c-128 riscontro, c-129 velocità): il registro è questo,
 * non se ne fa un altro. I campi opzionali in fondo si aggiungono qui.
 */

export type RichiestaNicholas = {
  /** `r-<numero>`: stabile, per il Punto e per il riscontro. */
  id: string
  /** Quando l'ha scritta (ISO): la battuta del dialogo. */
  quando: string
  /** Le sue parole, come le ha scritte (tagliate a `TESTO_MAX`). */
  testo: string
  /** In poche parole, per il Punto: lo scrive il supervisore, o il programma dalle sue parole. */
  titolo: string
  /** La descrizione del criterio aggiunto ai criteri dell'autopilota: mai vuota. */
  criterio: string
  /** I compiti messi in coda per lei (il testo, come in `compitiDaFare` e `ChatGovernata.compito`). */
  compiti: string[]
  /** Chi l'ha capita: il supervisore, o il programma quando il supervisore non l'ha detta. */
  da: 'supervisore' | 'programma'
  /** Quando è stata fatta: il criterio è risultato soddisfatto. */
  fattaIl?: string
  /** La versione pubblicata che la contiene, per esempio `0.85.0`. */
  versione?: string
  /** Il commit che la contiene, se si sa (il riscontro). */
  commit?: string
}

export type StatoRichiesta = 'da-fare' | 'in-corso' | 'fatta'

/** Quante se ne tengono per autopilota: le più vecchie fatte e pubblicate escono per prime. */
export const RICHIESTE_MAX = 200
/** Quanto delle sue parole si tiene. */
export const TESTO_MAX = 2000

function stringa(x: unknown): string | undefined {
  return typeof x === 'string' && x.trim() !== '' ? x.trim() : undefined
}

function data(x: unknown): string | undefined {
  return typeof x === 'string' && !Number.isNaN(Date.parse(x)) ? x : undefined
}

/** Il registro dal disco: una voce illeggibile sparisce, le altre restano. */
export function leggiRichieste(x: unknown): RichiestaNicholas[] {
  if (!Array.isArray(x)) return []
  return x.flatMap((v: unknown): RichiestaNicholas[] => {
    if (typeof v !== 'object' || v === null) return []
    const o = v as Record<string, unknown>
    const id = stringa(o.id)
    const quando = data(o.quando)
    const testo = stringa(o.testo)
    const titolo = stringa(o.titolo)
    const criterio = stringa(o.criterio)
    if (id === undefined || quando === undefined || testo === undefined || titolo === undefined || criterio === undefined) return []
    const compiti = Array.isArray(o.compiti) ? o.compiti.filter((c): c is string => typeof c === 'string' && c.trim() !== '') : []
    const fattaIl = data(o.fattaIl)
    const versione = stringa(o.versione)
    const commit = typeof o.commit === 'string' && /^[0-9a-f]{7,64}$/.test(o.commit) ? o.commit : undefined
    return [{
      id, quando, testo: testo.slice(0, TESTO_MAX), titolo, criterio, compiti,
      da: o.da === 'programma' ? 'programma' : 'supervisore',
      ...(fattaIl !== undefined ? { fattaIl } : {}),
      ...(versione !== undefined ? { versione } : {}),
      ...(commit !== undefined ? { commit } : {})
    }]
  }).slice(-RICHIESTE_MAX)
}

/**
 * Lo stato di una richiesta, dai fatti dell'autopilota:
 * - **fatta**: ha la data, o il suo criterio è soddisfatto;
 * - **in corso**: uno dei suoi compiti è in mano a una chat (anche finita: il
 *   ramo è unito ma il criterio non è ancora misurato);
 * - **da fare**: i compiti sono in coda e nessuno li ha presi.
 */
export function statoRichiesta(r: RichiestaNicholas, a: Pick<Autopilota, 'criteri' | 'chats'>): StatoRichiesta {
  if (r.fattaIl !== undefined) return 'fatta'
  if (a.criteri.some((c) => c.descrizione === r.criterio && c.soddisfatto)) return 'fatta'
  if (a.chats.some((c) => r.compiti.includes(c.compito))) return 'in-corso'
  return 'da-fare'
}

/** «23/10», con l'ora di Roma: è quella con cui Nicholas ricorda le sue richieste. */
export function giornoDi(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Rome' }).format(new Date(t))
}

/** Lo stato in parole, uguale su PC, pagina e app. */
export function parolaStato(stato: StatoRichiesta, versione?: string): string {
  if (stato === 'da-fare') return 'da fare'
  if (stato === 'in-corso') return 'in corso'
  return versione !== undefined ? `fatta nella versione ${versione}` : 'fatta, va nella prossima versione'
}

/** Il colore dello stato, coi nomi di `COLORE_ADESSO`. */
export const COLORE_RICHIESTA: Record<StatoRichiesta, 'ambra' | 'blu' | 'verde'> = {
  'da-fare': 'ambra',
  'in-corso': 'blu',
  fatta: 'verde'
}

/** Il «?» delle richieste nel Punto. */
export const AIUTO_RICHIESTE = 'Ogni cosa che chiedi all’autopilota scrivendogli qui (non una semplice domanda) diventa da sola un obiettivo: ha la data, un criterio per dire quando è fatta e i suoi compiti in coda. Qui vedi quelle aperte, con lo stato: da fare, in corso, fatta nella versione che la contiene.'
