import type { VistaAttesa } from './attesa-specialisti'
import { PAROLA_STATO_CODA, type StatoCoda, type VistaCoda } from './coda-richieste'
import type { VistaOrchestratore } from './piano-orchestratore'
import { ruoloTelefono } from './stato-telefono'
import { inParole } from './titoli-in-parole'

/**
 * **Richieste e compiti in parole** (11/11), per le schermate del telefono:
 * l'avanzamento dell'autopilota (`/api/autopilota/avanzamento`) e la lista
 * d'attesa degli specialisti (`/api/specialisti/attesa`).
 *
 * Campi **nuovi**, accanto a quelli di prima che restano come sono (le app
 * vecchie, la pagina, il PC li leggono): `titoloParole` senza sigle,
 * `statoParole`, `ruoloParole` con il suo `colore` (`#rrggbb`) e, per un calo
 * della percentuale, `percheParole`.
 */

/** Lo stato di uno specialista in parole (come sul PC, `TestaOrchestratore`). */
export const PAROLA_STATO_SPECIALISTA: Record<string, string> = { avviato: 'parte', lavoro: 'al lavoro', finito: 'ha finito', fallito: 'non riuscito', fermato: 'fermato', attesa: 'aspetta' }

type ConCalo = { calo?: { perche: string } | undefined }
const conPerche = <T extends ConCalo>(x: T): T => (x.calo !== undefined ? { ...x, calo: { ...x.calo, percheParole: inParole(x.calo.perche) } } : x)

/** L'avanzamento con i titoli in parole. `null` resta `null` (il servizio non le conosce). */
export function avanzamentoInParole(v: { orchestratore: VistaOrchestratore | null; coda: VistaCoda | null }): { orchestratore: unknown; coda: unknown } {
  const o = v.orchestratore
  const c = v.coda
  return {
    orchestratore: o === null ? null : conPerche({
      ...o,
      specialisti: o.specialisti.map((s) => {
        const r = ruoloTelefono(s.ruolo)
        return { ...s, titoloParole: inParole(s.compito, { sigle: [s.compitoId] }), ruoloParole: r.ruolo, colore: r.colore, statoParole: PAROLA_STATO_SPECIALISTA[s.stato] ?? s.stato }
      })
    }),
    coda: c === null ? null : conPerche({
      ...c,
      richieste: c.richieste.map((r) => ({ ...r, titoloParole: inParole(r.titolo), statoParole: PAROLA_STATO_CODA[r.stato as StatoCoda] ?? r.stato }))
    })
  }
}

/** La lista d'attesa con i titoli in parole e il ruolo con il colore. */
export function attesaInParole(v: VistaAttesa): VistaAttesa {
  const parole = <T extends { titolo?: string; descrizione: string; compito?: string; tipo: string }>(x: T): T & { titoloParole: string; ruoloParole: string; colore: string } => {
    const r = ruoloTelefono(x.tipo)
    return { ...x, titoloParole: inParole(x.titolo ?? x.descrizione, { sigle: [x.compito] }), ruoloParole: r.ruolo, colore: r.colore }
  }
  return { ...v, alLavoro: v.alLavoro.map(parole), inFila: v.inFila.map(parole) }
}
