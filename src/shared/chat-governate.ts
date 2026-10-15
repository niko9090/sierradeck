import type { Autopilota } from './autopilota'

/**
 * Le chat di un autopilota quando il lavoro è finito (0.74.0).
 *
 * Nicholas, 15/10: «A più chat finite tolte da sole». Prima un riquadro
 * restava «guidato» per sempre: `pane.autopilota` si scriveva alla consegna e
 * non si toglieva mai. Così le chat degli specialisti finiti restavano
 * aperte, con il loro claude.exe acceso, e a ogni riavvio si riaprivano tutte
 * insieme (dieci riquadri minuscoli nella copia di prova del 15/10). E una
 * chat di un autopilota fermato da te restava «ci pensa l'autopilota»: se ti
 * faceva una domanda, non arrivava né alle Domande né al telefono.
 *
 * - **chiudi**: lo **specialista** (una chat della flotta, con il suo ruolo)
 *   ha finito, o ha finito tutto l'autopilota. Il riquadro e il processo si
 *   chiudono; la conversazione resta nella storia di Claude Code e nel diario.
 *   La chat principale di un autopilota (senza ruolo) **non si chiude mai**:
 *   è spesso la chat in cui Nicholas lavora, e torna sua (0.74.1, «niente di
 *   ciò che lavora viene toccato»). Chi chiama, inoltre, non chiude una chat
 *   che sta scrivendo o che chiede qualcosa in quel momento.
 * - **libera**: l'autopilota è fermo, fallito, archiviato o non c'è più. La
 *   chat resta aperta ma torna tua: le sue domande arrivano a te.
 *
 * Pura: la usa la finestra a ogni lettura degli autopiloti.
 */
export type RiquadroGovernato = { paneId: string; autopilota: { id: string; chat: string }; remoto?: boolean
  /** Sta scrivendo o chiede qualcosa adesso (0.74.1): non si chiude, si riprova al giro dopo. */
  occupata?: boolean }

export type CosaFare = { chiudi: string[]; libera: string[] }

export function chatDaSistemare(riquadri: RiquadroGovernato[], autopiloti: Pick<Autopilota, 'id' | 'stato' | 'chats' | 'archiviato'>[] | undefined): CosaFare {
  const fuori: CosaFare = { chiudi: [], libera: [] }
  // Elenco non letto (il servizio non ha risposto): non si tocca niente.
  if (autopiloti === undefined) return fuori
  for (const r of riquadri) {
    // Una chat di un altro PC si chiude là, non da qui.
    if (r.remoto === true) continue
    const a = autopiloti.find((x) => x.id === r.autopilota.id)
    if (a === undefined) { fuori.libera.push(r.paneId); continue }
    const c = a.chats.find((x) => x.id === r.autopilota.chat)
    const specialista = c?.ruolo !== undefined
    if (specialista && (a.stato === 'finito' || c?.stato === 'finita')) {
      if (r.occupata !== true) fuori.chiudi.push(r.paneId)
      continue
    }
    if (a.stato === 'finito' || a.stato === 'sospeso' || a.stato === 'fallito' || a.archiviato === true) fuori.libera.push(r.paneId)
  }
  return fuori
}
