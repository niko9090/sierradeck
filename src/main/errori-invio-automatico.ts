import type { StoricoErrori, VoceErrore } from '@shared/storico-errori'

/**
 * L'invio automatico degli errori al PC di sviluppo (0.88.4).
 *
 * Nicholas (30/10): «voglio che gli errori arrivino in automatico». Prima
 * partivano solo con «Manda al PC di sviluppo»: nessuno lo premeva, e sul PC
 * di sviluppo non arrivava niente.
 *
 * Ogni PC manda **solo gli errori nuovi** (visti dopo l'ultimo invio), quando
 * lo storico è stato zitto per `QUIETE_INVIO_MS` (un difetto che si ripete in
 * raffica va in un invio solo) e mai più spesso di `INTERVALLO_MIN_MS`. Se il
 * PC di sviluppo è spento gli errori restano sul Drive (`mandaErrori`); se
 * l'invio non riesce si riprova al giro dopo, con gli stessi errori.
 *
 * Il PC di sviluppo è quello scelto nelle Impostazioni; se non c'è, il
 * proprietario del progetto SierraDeck (è lì che sta il codice).
 */

export const QUIETE_INVIO_MS = 5 * 60_000
export const INTERVALLO_MIN_MS = 30 * 60_000
export const GIRO_INVIO_MS = 5 * 60_000

export type StatoInvio = {
  /** L'`ultima` più recente fra gli errori già mandati: si manda solo quello che viene dopo. */
  fino?: string
  /** Quando è partito l'ultimo invio riuscito. */
  il?: string
}

/** Gli errori visti dopo `fino`, con il loro conteggio di adesso. */
export function vociNuove(storico: StoricoErrori, fino: string | undefined): VoceErrore[] {
  return storico.voci.filter((v) => fino === undefined || (v.ultima ?? v.quando) > fino)
}

export function decidiInvio(p: {
  nuove: readonly VoceErrore[]
  stato: StatoInvio
  adesso: number
  pcSviluppo: string | undefined
}): { manda: false; perche?: string } | { manda: true; fino: string } {
  if (p.pcSviluppo === undefined) return { manda: false, perche: 'nessun PC di sviluppo' }
  if (p.nuove.length === 0) return { manda: false }
  const fino = p.nuove.map((v) => v.ultima ?? v.quando).sort().at(-1) as string
  if (p.adesso - Date.parse(fino) < QUIETE_INVIO_MS) return { manda: false, perche: 'aspetto che lo storico stia zitto' }
  if (p.stato.il !== undefined && p.adesso - Date.parse(p.stato.il) < INTERVALLO_MIN_MS) return { manda: false, perche: 'l’ultimo invio è troppo recente' }
  return { manda: true, fino }
}

/** Il PC di sviluppo: quello scelto, o il proprietario del progetto SierraDeck. */
export function pcSviluppoDi(scelto: string | undefined, progetti: ReadonlyArray<{ nome: string; proprietario?: string }>): string | undefined {
  if (scelto !== undefined) return scelto
  return progetti.find((p) => p.nome.toLowerCase() === 'sierradeck' && p.proprietario !== undefined)?.proprietario
}

/**
 * Un giro: legge, decide, manda. Il primo giro su un PC che non ha mai
 * mandato niente parte da adesso meno un giorno: lo storico vecchio non si
 * rimanda tutto (lo filtrerebbe comunque il PC di sviluppo, ma pesa).
 */
export async function giroInvioErrori(d: {
  storico: () => StoricoErrori
  stato: { leggi: () => StatoInvio | undefined; scrivi: (s: StatoInvio) => void }
  pcSviluppo: () => string | undefined
  adesso: () => number
  manda: (storico: StoricoErrori) => Promise<{ ok: boolean; messaggio: string }>
  log: (riga: string) => void
}): Promise<void> {
  const adesso = d.adesso()
  let stato = d.stato.leggi()
  if (stato === undefined) {
    stato = { fino: new Date(adesso - 86_400_000).toISOString() }
    d.stato.scrivi(stato)
  }
  const nuove = vociNuove(d.storico(), stato.fino)
  const dec = decidiInvio({ nuove, stato, adesso, pcSviluppo: d.pcSviluppo() })
  if (!dec.manda) return
  const e = await d.manda({ voci: nuove })
  if (!e.ok) { d.log(`[errori] invio automatico non riuscito, riprovo al prossimo giro: ${e.messaggio}`); return }
  d.stato.scrivi({ fino: dec.fino, il: new Date(adesso).toISOString() })
  d.log(`[errori] invio automatico: ${e.messaggio}`)
}
