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
