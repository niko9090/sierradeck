/**
 * Una chat guardata **dal vivo su un altro PC**: le cose pure, condivise fra
 * il Core (`main/pc-remoto.ts`, che bussa a quel PC) e il riquadro
 * (`RiquadroRemoto.tsx`, che la mostra).
 *
 * Nicholas (2026-09-22): «il senso del drive e' perche' abbiamo un backup e
 * poi noi da adesso possiamo lavorare su chat di altri pc come se fossimo in
 * remoto a comandare quel computer». Il Drive porta la copia; per comandare
 * la chat **mentre lavora** si bussa al PC che ce l'ha aperta, con la stessa
 * porta e le stesse rotte del telefono. Il battito di ogni PC sul Drive dice
 * dove bussare (`indirizzi`, `porta`), e la chiave la ricavano tutti e due
 * dalla cassaforte condivisa: niente da accoppiare.
 */

/** Cio' che un riquadro remoto si ricorda: quale PC, quale chat. */
export type ChatRemota = {
  pcId: string
  pcNome: string
  /** La cartella come la conosce **quel** PC. */
  cwd: string
  /** La conversazione, se la si conosce: senza, vale la prima chat aperta la' in quella cartella. */
  sessione?: string
}

/** Una chat aperta su quel PC, come la racconta la sua `/api/stato`. */
export type ChatSuPc = {
  id: string
  sessione?: string
  cwd: string
  titolo: string
  aspetta?: boolean
  viva?: boolean
}

const pulisci = (x: string): string => x.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()

/**
 * La chat di quel PC che corrisponde al riquadro: la conversazione precisa se
 * la si conosce, altrimenti la prima aperta nella stessa cartella. `undefined`
 * quando la' non e' aperta: allora si puo' chiedere a quel PC di riprenderla.
 */
export function trovaChatRemota(chat: ChatSuPc[], r: ChatRemota): ChatSuPc | undefined {
  if (r.sessione !== undefined && r.sessione !== '') {
    const precisa = chat.find((c) => c.sessione === r.sessione)
    if (precisa !== undefined) return precisa
    return undefined
  }
  return chat.find((c) => pulisci(c.cwd) === pulisci(r.cwd))
}

/** Un indirizzo di Tailscale (o di un'altra rete privata 100.64/10). */
export function eIndirizzoTailscale(indirizzo: string): boolean {
  const m = /^100\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(indirizzo)
  if (m === null) return false
  const secondo = Number(m[1])
  return secondo >= 64 && secondo <= 127
}

export function descriviIndirizzo(indirizzo: string): string {
  return `${indirizzo} (${eIndirizzoTailscale(indirizzo) ? 'Tailscale' : 'rete locale'})`
}

/**
 * In che ordine provare gli indirizzi di un PC: prima quello che ha risposto
 * l'ultima volta, poi gli altri come li ha messi il battito (la rete di casa
 * davanti, Tailscale dopo, le schede virtuali in fondo).
 */
export function ordinaIndirizzi(indirizzi: string[], buono: string | undefined): string[] {
  const unici = [...new Set(indirizzi.filter((i) => i !== ''))]
  if (buono === undefined || !unici.includes(buono)) return unici
  return [buono, ...unici.filter((i) => i !== buono)]
}

/**
 * Com'e' andata una chiamata a quel PC, come arriva al riquadro: un errore
 * lanciato attraverso l'IPC perde la sua classe e il motivo, e il riquadro
 * deve sapere **perche'** (spento, chiave, irraggiungibile) per dire cosa fare.
 */
export type EsitoRemoto<T> =
  | { ok: true; dati: T }
  | { ok: false; motivo: string; messaggio: string; stato?: number }

/** Lo schermo di una chat remota, com'e' adesso: `/api/storia` di quel PC. */
export type StoriaRemota = {
  chat: string
  totale: number
  da: number
  righe: string[]
  grezze: string[]
  scelte?: { opzioni: { numero: number; testo: string; scelta: boolean }[]; corrente: number }
}

/** Quel PC come lo vede il riquadro: il battito, se e' acceso, l'indirizzo che ha risposto. */
export type PcRemoto = {
  pcId: string
  nome: string
  versione: string
  battito: string
  vivo: boolean
  indirizzi: string[]
  porta: number
  buono?: string
  chat: { sessione?: string; titolo: string; cwd: string; aspetta: boolean }[]
  cartelle: string[]
}

/** La porta del Client quando il battito non la dice (versioni prima della 0.33.0). */
export const PORTA_CLIENT_PREDEFINITA = 47640

/** Ogni quanto il riquadro remoto rilegge lo schermo di quella chat. */
export const RILEGGI_REMOTO_OGNI_MS = 2000
/** Quante righe si chiedono a ogni giro: lo schermo e un po' di storia. */
export const RIGHE_REMOTE = 200
