import type { Diagnosi } from './diagnosi-chat'

/**
 * Le chat la cui cartella non c'e' piu' (0.94.3).
 *
 * E' un caso atteso: la cartella l'ha spostata o cancellata l'utente. Prima il
 * riquadro lo scriveva nel registro come ERRORE a ogni apertura (ripristino
 * all'avvio, cambio di workspace, Panoramica), e gli errori arrivati lo
 * contavano come difetto che «si ripresenta». Ora si segna una volta per chat
 * e cartella: i montaggi successivi mostrano subito la diagnosi, senza rifare
 * lo spawn e senza riscrivere la riga, finche' l'utente non agisce («Scegli la
 * cartella», «Riprova» riuscito).
 */
const segnate = new Map<string, Diagnosi>()

const chiave = (sessionUuid: string, cwd: string): string => `${sessionUuid}|${cwd}`

/** Segna la chat; `true` solo la prima volta (quella da scrivere nel registro). */
export function segnaCartellaSparita(sessionUuid: string, cwd: string, d: Diagnosi): boolean {
  const k = chiave(sessionUuid, cwd)
  const nuova = !segnate.has(k)
  segnate.set(k, d)
  return nuova
}

/** La diagnosi gia' data a questa chat nella cartella di adesso, se c'e'. */
export function cartellaSegnataSparita(sessionUuid: string, cwd: string): Diagnosi | undefined {
  return segnate.get(chiave(sessionUuid, cwd))
}

/** La chat e' ripartita (o l'utente ha scelto un'altra cartella): il segno cade. */
export function dimenticaCartellaSparita(sessionUuid: string, cwd: string): void {
  segnate.delete(chiave(sessionUuid, cwd))
}

/** Solo per i test. */
export function azzeraCartelleSparite(): void {
  segnate.clear()
}

export type RigaDelGuasto = { livello: 'info' | 'errore'; testo: string }

/**
 * La riga del registro per una chat che non si apre. `cartella-sparita` e'
 * un avviso (livello info, come gli altri casi attesi) e non un errore: non
 * finisce negli errori arrivati. Ogni altro caso resta un errore.
 */
export function rigaDelGuasto(d: Diagnosi, chat: { title?: string; sessionUuid: string; cwd: string }): RigaDelGuasto {
  const dettaglio = d.dettaglio.replace(/\s+/g, ' ').slice(0, 600)
  const testo = `[chat] «${chat.title ?? ''}» (${chat.sessionUuid}, ${chat.cwd}) non si apre — ${d.caso}: ${d.titolo}. ${dettaglio}`
  return { livello: d.caso === 'cartella-sparita' ? 'info' : 'errore', testo }
}
