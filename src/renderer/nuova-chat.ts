import type { SessionSummary } from '@shared/types'
import type { PaneData } from './state/layout'
import { normalizzaTitolo } from '@shared/titolo'
import { cartellaPerNuovaChat } from './cartella-nuova-chat'

export type PropostaChat = { cartella: string; nome: string }

/**
 * Il nome che si propone per una chat che nascerà in quella cartella.
 *
 * Il nome della cartella e non «Nuova chat»: con sei riquadri aperti, sei
 * «Nuova chat» identiche non dicono niente, e rinominarle una per una è un
 * lavoro che nessuno fa. Il nome della cartella è quasi sempre il nome del
 * progetto, cioè la risposta giusta a «di cosa parla questa chat».
 */
export function nomeDaCartella(cartella: string): string {
  const pulita = cartella.trim().replace(/[\\/]+$/, '')
  if (pulita === '') return 'Nuova chat'
  const ultimo = pulita.split(/[\\/]/).pop() ?? ''
  // La radice di un disco — `C:\` — non ha un ultimo pezzo che sia un nome.
  if (ultimo === '' || /^[A-Za-z]:$/.test(ultimo)) return 'Nuova chat'
  return ultimo
}

/**
 * Cosa proporre nella finestra prima che l'utente tocchi qualcosa.
 *
 * Proporre non è decidere: entrambi i campi restano modificabili, ed è tutta la
 * differenza rispetto a prima, quando la cartella veniva indovinata e la chat
 * si apriva senza chiedere niente. Chi lavora sempre nello stesso posto preme
 * Invio e non si accorge della finestra; chi sta cambiando progetto se ne
 * accorge in tempo, invece che dopo, con una chat aperta nel posto sbagliato.
 */
export function proponiNuovaChat(
  riquadri: PaneData[],
  sessioni: SessionSummary[],
  casa: string
): PropostaChat {
  const cartella = cartellaPerNuovaChat(riquadri, sessioni, casa)
  return { cartella, nome: nomeDaCartella(cartella) }
}

export type EsitoNuovaChat =
  | { ok: true; cartella: string; nome: string }
  | { ok: false; motivo: string }

/**
 * Controlla e ripulisce ciò che l'utente ha scritto.
 *
 * Le virgolette attorno al percorso se ne vanno: «Copia come percorso» di
 * Esplora risorse le mette, ed è il modo più probabile con cui una cartella
 * arriva in questo campo. Senza toglierle, il Core rifiuterebbe un percorso che
 * a chi l'ha incollato sembra giusto — e avrebbe ragione lui.
 *
 * Un nome vuoto non è un errore: il nome è decorativo — l'identità della chat è
 * il suo `sessionUuid` — e fermare qualcuno per un'etichetta sarebbe un
 * ostacolo messo davanti a niente. La cartella invece è obbligatoria, perché è
 * dove il lavoro succede.
 */
export function validaNuovaChat(p: { cartella: string; nome: string }): EsitoNuovaChat {
  const cartella = p.cartella.trim().replace(/^"(.*)"$/, '$1').trim()
  if (cartella === '') {
    return { ok: false, motivo: 'Serve una cartella: è lì che la chat lavorerà.' }
  }
  const nome = normalizzaTitolo(p.nome)
  return { ok: true, cartella, nome: nome === '' ? nomeDaCartella(cartella) : nome }
}
