/**
 * La posta per un PC: i tipi e le due cose pure che servono anche al
 * pannello del PC (`PannelloAccount`, `ModalePosta`) e alla pagina del
 * telefono. Il postino vero e' in `src/main/progetti/posta.ts`: qui niente
 * di Node, cosi' il renderer puo' importare senza trascinarsi `node:fs`.
 */

export type ChatDiPc = {
  /** L'id del riquadro su quel PC: serve per scriverci. Non viaggia sul Drive. */
  id?: string
  sessione?: string
  titolo: string
  cwd: string
  viva: boolean
  aspetta: boolean
}

export type BattitoPc = {
  pcId: string
  nome: string
  versione: string
  /** Quando ha battuto l'ultima volta, ISO. */
  battito: string
  /** Le cartelle in cui quel PC puo' lavorare adesso: chat aperte e progetti collegati. */
  cartelle: string[]
  /** Le chat aperte su quel PC, con se aspettano. */
  chat: { sessione?: string; titolo: string; cwd: string; aspetta: boolean }[]
  /**
   * Dove bussare per guardare una sua chat dal vivo: gli indirizzi del suo
   * Client (rete di casa davanti, Tailscale dopo) e la porta. Mancano nei
   * battiti delle versioni prima della 0.33.0.
   */
  indirizzi?: string[]
  porta?: number
}

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
}

export type Posta = { voci: VocePosta[] }

export function nomeBattitoPc(id: string): string { return `pc-${id}` }
export function nomePosta(id: string): string { return `posta-${id}` }

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
export type ChatAltrove = { cwd: string; pc: { id: string; nome: string }; sessionUuid: string }

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
    return { cwd: o.cwd, sessionUuid: o.sessionUuid, pc: { id: String(o.pc.id ?? ''), nome: String(o.pc.nome ?? 'un altro PC') } }
  } catch { return undefined }
}
