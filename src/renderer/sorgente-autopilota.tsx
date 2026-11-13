import { createContext, useContext } from 'react'
import type { VistaOrchestratore } from '@shared/piano-orchestratore'
import type { VistaCoda } from '@shared/coda-richieste'
import type { VistaAttesa, MossaAttesa } from '@shared/attesa-specialisti'
import type { RigaSpecialista } from '@shared/piano-orchestratore'
import type { EsitoAzione } from '@shared/autopilota-remoto'
import { normalizzaCoda, normalizzaOrchestratore } from './normalizza-vista'

/**
 * **Da dove arrivano i dati dell'autopilota di un workspace** (0.102.0).
 *
 * Nicholas, 12/11: «quando si vanno a recuperare workspace residenti in altri
 * PC la grafica sia IDENTICA a quello che vedrebbe su quel PC […] come se
 * stessimo scrivendo direttamente nella chat ma in realtà siamo in remoto».
 *
 * Prima il remoto aveva componenti suoi (`ChatAutopilotaRemota`, una colonna
 * di specialisti in sola lettura a sinistra, niente barra né coda): sembrava
 * un altro programma. Ora le schermate sono le stesse e cambia solo la
 * sorgente: questo PC (`window.gestore`) o il PC dove vive il workspace (le
 * sue rotte, firmate, come fa già il telefono).
 */
export type SorgenteAutopilota = {
  /** Il PC dove vive il workspace; assente: questo PC. */
  remoto?: { pcId: string; pcNome: string }
  /** Una chiave per le letture condivise (i sondaggi), diversa per ogni PC. */
  chiave: string
  orchestratore: (ws: string) => Promise<VistaOrchestratore | undefined>
  coda: (ws: string) => Promise<VistaCoda | undefined>
  specialista: (ws: string, id: string) => Promise<{ righe: RigaSpecialista[] } | undefined>
  attesa: () => Promise<VistaAttesa | undefined>
  priorita: (id: string, mossa: MossaAttesa) => Promise<VistaAttesa | undefined>
  dialoga: (autopilota: string, testo: string) => Promise<unknown>
  rispondi: (domanda: string, risposta: string) => Promise<unknown>
  /** Una spinta quando uno specialista cambia; il remoto non spinge (resta il giro). */
  suSpecialistiCambiati: (f: () => void) => (() => void) | undefined
  /** Modello e numero di specialisti: solo dove gira (assente: non si cambiano da qui). */
  impostaOrchestratore?: (ws: string, p: { modello?: string; tettoSpecialisti?: number }) => Promise<unknown>
  /** «Separa» una richiesta della coda: solo dove gira. */
  codaSepara?: (ws: string, id: string) => Promise<unknown>
}

export const SORGENTE_LOCALE: SorgenteAutopilota = {
  chiave: 'qui',
  orchestratore: async (ws) => normalizzaOrchestratore(await window.gestore.autopilota.orchestratore(ws)),
  coda: async (ws) => normalizzaCoda(await window.gestore.autopilota.coda(ws)),
  specialista: (ws, id) => window.gestore.autopilota.specialista(ws, id),
  attesa: () => window.gestore.autopilota.attesaSpecialisti(),
  priorita: (id, mossa) => window.gestore.autopilota.prioritaAttesa(id, mossa),
  dialoga: (a, t) => window.gestore.autopilota.dialoga(a, t),
  rispondi: (d, r) => window.gestore.autopilota.rispondi(d, r),
  suSpecialistiCambiati: (f) => window.gestore.autopilota.suSpecialistiCambiati?.(f),
  impostaOrchestratore: (ws, p) => window.gestore.autopilota.impostaOrchestratore(ws, p),
  codaSepara: (ws, id) => window.gestore.autopilota.codaSepara(ws, id)
}

/** Un'azione sul PC remoto; un errore di rete diventa un esito, mai un'eccezione muta. */
function azione(pcId: string, percorso: string, corpo: Record<string, unknown>): Promise<EsitoAzione> {
  return window.gestore.autopilotiAltri.azione(pcId, percorso, corpo)
    .catch((e: unknown): EsitoAzione => ({ ok: false, stato: 502, messaggio: e instanceof Error ? e.message : String(e) }))
}

/** Il dato di un esito, o l'errore col messaggio di quel PC. */
async function dato<T>(p: Promise<EsitoAzione>): Promise<T> {
  const e = await p
  if (!e.ok) throw new Error(e.messaggio)
  return e.dati as T
}

/**
 * L'avanzamento remoto porta insieme orchestratore e coda: una chiamata sola
 * serve a tutti e due (la barra e la coda chiedono a pochi istanti l'una
 * dall'altra). Vale un secondo e mezzo.
 */
const VALE_MS = 1500
type Avanzamento = { orchestratore: VistaOrchestratore | null; coda: VistaCoda | null }
const avanzamenti = new Map<string, { quando: number; p: Promise<Avanzamento> }>()
function avanzamento(pcId: string, ws: string): Promise<Avanzamento> {
  const k = `${pcId}|${ws}`
  const c = avanzamenti.get(k)
  if (c !== undefined && Date.now() - c.quando < VALE_MS) return c.p
  const p = dato<Avanzamento>(azione(pcId, '/api/autopilota/avanzamento', { workspace: ws }))
  avanzamenti.set(k, { quando: Date.now(), p })
  p.catch(() => { if (avanzamenti.get(k)?.p === p) avanzamenti.delete(k) })
  return p
}

const remote = new Map<string, SorgenteAutopilota>()
/** La sorgente di un PC remoto (una per PC: le letture condivise restano le stesse). */
export function sorgenteRemota(pcId: string, pcNome: string): SorgenteAutopilota {
  const gia = remote.get(pcId)
  if (gia !== undefined && gia.remoto?.pcNome === pcNome) return gia
  const s: SorgenteAutopilota = {
    remoto: { pcId, pcNome },
    chiave: `pc:${pcId}`,
    orchestratore: async (ws) => normalizzaOrchestratore((await avanzamento(pcId, ws)).orchestratore),
    coda: async (ws) => normalizzaCoda((await avanzamento(pcId, ws)).coda),
    specialista: (ws, id) => dato(azione(pcId, '/api/autopilota/specialista', { workspace: ws, id })),
    attesa: () => dato(azione(pcId, '/api/specialisti/attesa', {})),
    priorita: (id, mossa) => dato(azione(pcId, '/api/specialisti/attesa/priorita', { id, mossa })),
    dialoga: (a, testo) => dato(azione(pcId, '/api/autopilota/dialogo', { autopilota: a, testo })),
    rispondi: (domanda, risposta) => dato(azione(pcId, '/api/rispondi', { domanda, risposta })),
    suSpecialistiCambiati: () => undefined
  }
  remote.set(pcId, s)
  return s
}

const Contesto = createContext<SorgenteAutopilota>(SORGENTE_LOCALE)
export const FornisciSorgente = Contesto.Provider
/** La sorgente dei dati dell'autopilota per il workspace che si sta guardando. */
export function useSorgente(): SorgenteAutopilota {
  return useContext(Contesto)
}
