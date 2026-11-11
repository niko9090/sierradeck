import type { Autopilota } from '@shared/autopilota'
import type { VistaAttesa } from '@shared/attesa-specialisti'
import type { VistaAutopilota } from '@shared/autopiloti-vista'
import { chiaveWorkspace } from '@shared/coda-richieste'
import type { VistaOrchestratore } from '@shared/piano-orchestratore'
import { leggiAttesa, statoTelefono, type StatoTelefono } from '@shared/stato-telefono'

/**
 * **Lo stato per le schermate del telefono dentro `/api/stato`** (11/11).
 *
 * `/api/stato` si chiede ogni due secondi, da ogni telefono e dagli altri PC:
 * la vista dell'orchestratore di ogni workspace e la lista d'attesa degli
 * specialisti stanno nel servizio degli autopiloti, un altro processo. Qui si
 * tengono in memoria per {@link FRESCO_MS}: una lettura per workspace alla
 * volta (chi arriva mentre è in volo aspetta quella), e una lettura vecchia si
 * dà subito mentre se ne prende una nuova. Solo la prima volta si aspetta, al
 * più {@link PRIMA_LETTURA_MS}: oltre, i campi si calcolano senza (ripiego) e
 * la lettura finisce per il giro dopo. Un errore tiene il valore di prima.
 */

export const FRESCO_MS = 10_000
export const PRIMA_LETTURA_MS = 700
/** Oltre così tante chiavi si tolgono quelle non chieste da un po'. */
const CHIAVI_MAX = 200

type Voce<T> = { valore?: T; il: number; chiesta: number; inVolo?: Promise<void> }

/** Aspetta `p` al più `ms`; il timer non resta appeso. */
function entro(p: Promise<unknown>, ms: number): Promise<void> {
  return new Promise((fatto) => {
    const t = setTimeout(fatto, ms)
    void p.finally(() => { clearTimeout(t); fatto() })
  })
}

/** Una memoria per chiave con lettura condivisa e valore vecchio dato subito. */
export function creaLetture<T>(fonte: (chiave: string) => Promise<T | undefined>, adesso: () => number, frescoMs = FRESCO_MS): { leggi: (chiave: string, attesaMs: number) => Promise<T | undefined> } {
  const voci = new Map<string, Voce<T>>()
  const rinfresca = (k: string, v: Voce<T>): Promise<void> => {
    if (v.inVolo !== undefined) return v.inVolo
    const p = Promise.resolve()
      .then(() => fonte(k))
      .then((x) => { v.valore = x; v.il = adesso() }, () => { v.il = adesso() })
      .finally(() => { v.inVolo = undefined })
    v.inVolo = p
    return p
  }
  return {
    async leggi(k, attesaMs) {
      const ora = adesso()
      let v = voci.get(k)
      if (v === undefined) {
        if (voci.size >= CHIAVI_MAX) for (const [c, x] of voci) if (ora - x.chiesta > 10 * frescoMs && x.inVolo === undefined) voci.delete(c)
        v = { il: 0, chiesta: ora }
        voci.set(k, v)
      }
      v.chiesta = ora
      if (v.il > 0 && ora - v.il < frescoMs) return v.valore
      const p = rinfresca(k, v)
      // Già letta una volta: il valore di prima subito, il nuovo per il giro dopo.
      if (v.il > 0) return v.valore
      await entro(p, attesaMs)
      return v.valore
    }
  }
}

export type DipendenzeStatoTelefono = {
  orchestratore?: (ws: string) => Promise<VistaOrchestratore | undefined>
  attesa?: () => Promise<unknown>
  adesso: () => number
}

/** Un autopilota dell'elenco, con la sua vista in una parola già calcolata. */
export type RigaStatoTelefono = { a: Pick<Autopilota, 'id' | 'cwd' | 'workspace' | 'archiviato'>; vista: Pick<VistaAutopilota, 'stato'> }

/** Il calcolatore dei quattro campi per tutti gli autopiloti di `/api/stato`. */
export function creaStatoTelefono(d: DipendenzeStatoTelefono): (righe: RigaStatoTelefono[], domande: readonly { autopilotaId?: string }[]) => Promise<Map<string, StatoTelefono>> {
  const orchestratore = d.orchestratore
  const attesa = d.attesa
  const viste = orchestratore !== undefined ? creaLetture((ws) => orchestratore(ws), d.adesso) : undefined
  const lista = attesa !== undefined ? creaLetture(async () => leggiAttesa(await attesa()), d.adesso) : undefined
  return async (righe, domande) => {
    // Gli archiviati no: nessuno li guarda, e non si chiede niente al servizio per loro.
    const ws = [...new Set(righe.filter((r) => r.a.archiviato !== true).map((r) => chiaveWorkspace(r.a)))]
    const [att, ...vs] = await Promise.all([
      lista?.leggi('', PRIMA_LETTURA_MS) ?? Promise.resolve(undefined),
      ...ws.map((w) => viste?.leggi(w, PRIMA_LETTURA_MS) ?? Promise.resolve(undefined))
    ])
    const perWs = new Map(ws.map((w, i) => [w, vs[i]]))
    const esito = new Map<string, StatoTelefono>()
    for (const r of righe) {
      const w = chiaveWorkspace(r.a)
      const o = r.a.archiviato === true ? undefined : perWs.get(w)
      esito.set(r.a.id, statoTelefono({
        workspace: w,
        autopilota: r.a.id,
        ...(o !== undefined ? { orchestratore: o } : {}),
        ...(att !== undefined && r.a.archiviato !== true ? { attesa: att as VistaAttesa } : {}),
        vista: r.vista,
        domande: domande.filter((x) => x.autopilotaId === r.a.id).length
      }))
    }
    return esito
  }
}

/**
 * «criteri —» non diceva niente (11/11): i criteri stanno nei compiti del
 * piano. Al loro posto la percentuale vera del workspace, che un'app vecchia
 * mostra dove mostrava i criteri («criteri 40%»). Senza percentuale resta «—».
 */
export function criteriInPercento<V extends Pick<VistaAutopilota, 'criteri'>>(v: V, s: StatoTelefono | undefined): V {
  const p = s?.avanzamento.percento
  return p === undefined ? v : { ...v, criteri: { ...v.criteri, testo: `${p}%` } }
}
