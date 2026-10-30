import type { RisorsePc } from './risorse'
/**
 * La posta per un PC: i tipi e le due cose pure che servono anche al
 * pannello del PC (`PannelloAccount`, `ModalePosta`) e alla pagina del
 * telefono. Il postino vero e' in `src/main/progetti/posta.ts`: qui niente
 * di Node, cosi' il renderer puo' importare senza trascinarsi `node:fs`.
 */

/**
 * Un'opzione di una domanda ferma sullo schermo di quel PC (0.52.6): viaggia
 * nel battito, così le Domande degli altri PC hanno i pulsanti. La scelta poi
 * passa dal ponte, e quel PC la ricontrolla sul suo schermo prima di premere.
 */
export type OpzioneBattito = {
  numero: number
  /** Tagliato a `TAGLIO_OPZIONE_BATTITO` caratteri: quel PC lo riconosce anche tagliato (0.84.3). */
  testo: string
  libera?: boolean
  spuntata?: boolean
  invio?: boolean
  /** La spiegazione sotto l'opzione (0.84.3): la scheda la mostra come sullo stesso PC. */
  descrizione?: string
}

/** Quanto testo di un'opzione viaggia nel battito. */
export const TAGLIO_OPZIONE_BATTITO = 200

/**
 * Taglia a `max` unità senza spezzare un carattere (0.84.3, ricollaudo c-94):
 * un emoji sono due unità UTF-16, e tagliarlo a metà lasciava una surrogata
 * sola che dall'app, passando in UTF-8, diventava «?». Allora il testo non era
 * più l'inizio dell'opzione e ogni tocco tornava 409. Il taglio cade prima.
 */
export function tagliaIntero(testo: string, max: number): string {
  if (testo.length <= max) return testo
  const ultimo = testo.charCodeAt(max - 1)
  return testo.slice(0, ultimo >= 0xd800 && ultimo <= 0xdbff ? max - 1 : max)
}

export type ChatDiPc = {
  /** L'id del riquadro su quel PC: serve per scriverci. Non viaggia sul Drive. */
  id?: string
  sessione?: string
  titolo: string
  cwd: string
  viva: boolean
  aspetta: boolean
  /** Le opzioni della domanda sullo schermo, se è ferma su una (0.52.6). Mai per una chat con il PIN. */
  scelte?: OpzioneBattito[]
  /**
   * La domanda scritta in fondo al turno (0.71.1), per le Domande degli altri PC.
   * Dalla 0.84.1 anche il testo sopra le `scelte` di un elenco. Mai per una chat con il PIN.
   */
  domanda?: string
  /** Qualche riga prima della domanda (0.84.1): cosa stava dicendo la chat. Mai per una chat con il PIN. */
  contesto?: string[]
}

export type BattitoPc = {
  pcId: string
  /** Il nome da mostrare: dalla 0.52.4 quello scelto da chi usa il PC, prima l'hostname. */
  nome: string
  /** L'hostname (dalla 0.52.4): solo come sottotitolo piccolo. */
  host?: string
  /** Il nome scelto, se c'è (dalla 0.52.4). */
  nomeScelto?: string
  versione: string
  /** Quando ha battuto l'ultima volta, ISO. */
  battito: string
  /** Le cartelle in cui quel PC puo' lavorare adesso: chat aperte e progetti collegati. */
  cartelle: string[]
  /** Le chat aperte su quel PC, con se aspettano. */
  chat: { sessione?: string; titolo: string; cwd: string; aspetta: boolean; scelte?: OpzioneBattito[]; domanda?: string; contesto?: string[] }[]
  /**
   * Dove bussare per guardare una sua chat dal vivo: gli indirizzi del suo
   * Client (rete di casa davanti, Tailscale dopo) e la porta. Mancano nei
   * battiti delle versioni prima della 0.33.0.
   */
  indirizzi?: string[]
  porta?: number
  /**
   * Le chat e i progetti che quel PC ha sul disco (0.58.0). Mancano nei
   * battiti di prima: il pannello lo dice («va aggiornato»).
   */
  locali?: LocaliBattito
  /** I workspace di quel PC (0.65.1), per la sezione «Su altri PC». Mancano nei battiti di prima. */
  workspace?: string[]
  /**
   * Il Client di quel PC (0.58.1): se non riesce ad ascoltare sulla sua porta
   * (un altro programma la occupa) lo dice, invece di far bussare gli altri a
   * vuoto o, peggio, a chi la occupa.
   */
  client?: { inAscolto: boolean; errore?: string }
  /** Quanto lavora SierraDeck su quel PC (0.69.0). Non conta per decidere se riscrivere il battito. */
  risorse?: RisorsePc
  /**
   * Il formato della posta che quel PC legge (dalla 0.86.2): `POSTA_PER_MITTENTE`
   * se legge le cassette d'uscita di ogni mittente. Manca nei battiti di prima:
   * a quei PC si scrive ancora nella cassetta unica (`nomePosta`).
   */
  posta?: number
}

/** Le copie locali di un PC: chat (sessione, cartella, ultimo messaggio) e progetti (id, cartella). */
export type LocaliBattito = {
  /** `size` (0.65.0): quanto è lungo il `.jsonl` sul disco, per sapere se la copia è intera. */
  chat: { sessione: string; cwd?: string; mtime?: number; size?: number }[]
  progetti: { id: string; percorso: string }[]
}

/** Quante chat al massimo nel battito: le più recenti. */
export const LOCALI_MAX_CHAT = 2000

export type VocePosta = {
  id: string
  testo: string
  /** La cartella, come la conosce **il PC destinatario**. */
  cwd: string
  /** Una chat precisa (la sua conversazione); senza, la prima libera nella cartella, o una nuova. */
  sessione?: string
  creataIl: string
  daPc: string
  daNome: string
  stato: 'attesa' | 'consegnata' | 'fallita'
  consegnataIl?: string
  aSessione?: string
  /** Perche' e' fallita, o una nota sulla consegna. */
  esito?: string
  /** Il postino ha gia' aperto una chat per questa voce: non ne apre un'altra. */
  apertaIl?: string
  /**
   * Chi l'ha scritta (0.49.1): una persona (`umano`, il predefinito: le voci
   * di prima lo erano tutte) o un autopilota. Una persona verso una chat
   * protetta dal PIN passa dal PIN; un autopilota no. Non si può cambiare per
   * strada: la cassetta è cifrata e autenticata con la chiave della cassaforte.
   */
  origine?: 'umano' | 'autopilota'
  /** Chi guarda, per il PIN (0.49.1): l'id del PC che scrive, o `tel:<telefono>@<PC>`. */
  daVisore?: string
  /**
   * Un comando per il programma di quel PC, non per una chat (0.88.0): «Sposta
   * su questo PC» chiesto mentre il proprietario era spento. Il suo postino lo
   * esegue e scrive l'esito (JSON) in `esito`.
   */
  comando?: ComandoPosta
}

/** I comandi che viaggiano nella posta (0.88.0). */
export type ComandoPosta =
  | { tipo: 'sposta-prepara'; progetto: string; verso: string; versoNome: string; sposta: string }
  | { tipo: 'sposta-concludi'; progetto: string; verso: string; percorso: string; proprietarioDal: string; sposta: string }

/** Il motivo, per esteso, di una voce rifiutata da una chat protetta (0.49.1). */
export const ESITO_PROTETTA = 'Chat protetta: inserisci il PIN. Su quel PC questa chat è protetta dal PIN e non è aperta per chi ha scritto: aprila dal vivo (il riquadro della chat o «Chat … dal vivo» sul telefono), metti il PIN lì e rimanda il messaggio.'

export type Posta = { voci: VocePosta[] }

/**
 * La cassetta d'uscita di un mittente verso un PC (0.86.2, audit I1): la scrive
 * **solo** il mittente. Prima tutti riscrivevano la stessa cassetta
 * (`nomePosta`) senza lucchetto, e due PC che scrivevano insieme si
 * cancellavano i messaggi a vicenda. `tolte`: voci di altri mittenti che questo
 * mittente ha tolto o pulito dalla vista (non puo' toccare la loro cassetta).
 */
export type UscitaPosta = { voci: VocePosta[]; tolte?: string[] }

/** Come e' andata una voce, scritto **solo** dal PC destinatario (0.86.2). */
export type EsitoVoce = {
  stato: VocePosta['stato']
  consegnataIl?: string
  aSessione?: string
  esito?: string
  apertaIl?: string
  /** Quando il destinatario l'ha scritto: per far scadere gli esiti vecchi. */
  il: string
}
export type EsitiPosta = { esiti: Record<string, EsitoVoce> }

/** Il formato della posta per mittente: lo dice il battito (`BattitoPc.posta`). */
export const POSTA_PER_MITTENTE = 2

export function nomeBattitoPc(id: string): string { return `pc-${id}` }
/** La cassetta unica di prima della 0.86.2: si legge ancora, e ci si scrive per i PC vecchi. */
export function nomePosta(id: string): string { return `posta-${id}` }
export function nomeUscita(destinatario: string, mittente: string): string { return `posta-${destinatario}-da-${mittente}` }
export function nomeEsiti(destinatario: string): string { return `posta-${destinatario}-esiti` }

/** Un battito piu' vecchio di cosi' e' un PC spento, o senza rete. */
export const PC_SPENTO_DOPO_MS = 5 * 60_000
/** Il battito si riscrive comunque ogni tanto, anche se niente e' cambiato. */
export const BATTITO_PC_OGNI_MS = 2 * 60_000
/** Una chat aperta dal postino che non arriva ad aspettare entro tanto: si riprova ad aprirla. */
export const RIAPRI_DOPO_MS = 5 * 60_000
/** Quante voci si tengono per PC: le consegnate piu' vecchie escono da sole. */
export const VOCI_MAX = 50
export const TESTO_POSTA_MAX = 4000

export function pcVivo(b: BattitoPc | undefined, adesso: number): boolean {
  if (b === undefined) return false
  const t = Date.parse(b.battito)
  return !Number.isNaN(t) && adesso - t < PC_SPENTO_DOPO_MS
}

/** `C:\\a\\b` sta sotto `c:/a/`? Percorsi di Windows: maiuscole e barre non contano. */
export function staSottoCartella(cwd: string, radice: string): boolean {
  const pulisci = (x: string): string => x.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
  const c = pulisci(cwd)
  const r = pulisci(radice)
  return r !== '' && (c === r || c.startsWith(`${r}\\`))
}

/**
 * Il PC che **ha** quella cartella, fra quelli che hanno lasciato un battito.
 *
 * E' la domanda che decide se una chat arrivata dal Drive si adotta qui (la
 * sua cartella non ce l'ha nessuno: nasce vuota in «Progetti SierraDeck») o
 * se e' **di un altro PC** e va lasciata la': aprirla qui in una cartella
 * vuota da' solo «directory non trovata» in rosso, e sdoppia la chat sul
 * Drive. Un battito vecchio conta lo stesso: un PC spento ha ancora le sue
 * cartelle. Se piu' PC ce l'hanno, vince quello che ha battuto per ultimo.
 */
export function pcCheHaLaCartella(cwd: string, battiti: BattitoPc[], me?: string): BattitoPc | undefined {
  return battiti
    .filter((b) => b.pcId !== me && (b.cartelle.some((c) => staSottoCartella(cwd, c)) || b.chat.some((c) => staSottoCartella(cwd, c.cwd))))
    .sort((a, b) => b.battito.localeCompare(a.battito))[0]
}

/**
 * Lo spawn di una chat la cui cartella e' di un altro PC si ferma con un
 * errore che comincia cosi': il riquadro lo riconosce e, invece della riga
 * rossa, mostra di chi e' la chat e cosa si puo' fare.
 */
export const PREFISSO_CHAT_ALTROVE = 'CHAT_DI_UN_ALTRO_PC:'
export type ChatAltrove = {
  cwd: string
  pc: { id: string; nome: string }
  sessionUuid: string
  /** Fermata perché la sua casa è quel PC (0.52.0): «Apri qui lo stesso» non c'è, c'è «Porta qui la chat». */
  casa?: true
  perche?: string
}

export function messaggioChatAltrove(c: ChatAltrove): string {
  return PREFISSO_CHAT_ALTROVE + JSON.stringify(c)
}

/** Da un errore qualunque (Error, stringa, l'errore di un invoke Electron) alla chat altrove, se e' quello. */
export function leggiChatAltrove(err: unknown): ChatAltrove | undefined {
  const testo = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  const i = testo.indexOf(PREFISSO_CHAT_ALTROVE)
  if (i < 0) return undefined
  try {
    const o = JSON.parse(testo.slice(i + PREFISSO_CHAT_ALTROVE.length)) as Partial<ChatAltrove>
    if (typeof o.cwd !== 'string' || typeof o.sessionUuid !== 'string' || typeof o.pc !== 'object' || o.pc === null) return undefined
    return {
      cwd: o.cwd, sessionUuid: o.sessionUuid, pc: { id: String(o.pc.id ?? ''), nome: String(o.pc.nome ?? 'un altro PC') },
      ...(o.casa === true ? { casa: true as const } : {}),
      ...(typeof o.perche === 'string' ? { perche: o.perche } : {})
    }
  } catch { return undefined }
}
