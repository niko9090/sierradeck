import type { ModoAiuto, PostiAiuto } from '@shared/aiuto-rete'
import type { CapacitaPc } from '@shared/capacita-pc'
import { risorseValide } from '@shared/aiuto-risorse'

/**
 * Le rotte `/api/aiuto/*` sul collegamento sicuro fra i PC («Aiuta la rete»,
 * 0.103.0): i posti per gli altri, il progetto a pezzi, l'avvio, lo stato, il
 * ramo da ritirare, chiudi e ferma.
 *
 * 12/11: staccate da `client-rotte.ts` senza cambiare niente, perché le usa
 * anche SierraDeck Aiutante. Nel programma completo `servizio` porta le
 * richieste al servizio degli autopiloti; nell'Aiutante al suo lavoratore,
 * nello stesso processo. Le risposte sono le stesse, così chi chiede non sa
 * (e non deve sapere) quale dei due gli risponde, se non da `programma`.
 */

export const ROTTE_AIUTO: ReadonlySet<string> = new Set(['/api/aiuto/posti', '/api/aiuto/pezzo', '/api/aiuto/avvia', '/api/aiuto/stato', '/api/aiuto/ritira', '/api/aiuto/chiudi', '/api/aiuto/ferma', '/api/aiuto/credenziali'])

export type FonteAiuto = {
  modo: () => ModoAiuto
  servizio: (percorso: string, corpo?: Record<string, unknown>) => Promise<unknown>
  /** 12/11: il nome di un altro PC dal suo id, per dire qui per chi lavora. */
  nomePc?: (pcId: string) => string | undefined
  /** 12/11: chi risponde è SierraDeck Aiutante: chi chiede lo preferisce agli altri PC. */
  programma?: 'aiutante'
  /** k-166n1: cosa sa fare questo PC, nella risposta dei posti. */
  capacita?: () => CapacitaPc | undefined
  /**
   * 20/11: le credenziali di rete che un lavoro affidato da questo PC dichiara, per il PC che aiuta
   * (`servi` di `aiuto-credenziali`). Riceve l'id del PC dalla richiesta firmata; rifiuta lanciando.
   * Senza: questo PC non ne dà.
   */
  credenziali?: (r: { pcId: string | undefined; corpo: unknown }) => Promise<unknown>
  /**
   * k-166n7: per un lavoro che sta per partire qui, i valori delle credenziali che dichiara (cassaforte di
   * questo PC, poi il PC che l'ha affidato: `chiedi` di `aiuto-credenziali`). Vanno solo al lavoratore,
   * in memoria; mai nel registro. Senza: il lavoratore non ne riceve.
   */
  chiediCredenziali?: (r: { lavoro: string; nomi: string[]; daPc: string }) => Promise<Record<string, string>>
}

export type RichiestaAiuto = { metodo: string; percorso: string; corpo: unknown; dispositivo?: string }
export type EsitoAiuto = { stato: number; corpo: unknown }

/** `undefined`: non è una rotta dell'aiuto (chi chiama va avanti con le sue). */
export async function rispondiAiuto(r: RichiestaAiuto, aiuto: FonteAiuto | undefined): Promise<EsitoAiuto | undefined> {
  if (!r.percorso.startsWith('/api/aiuto/') || !ROTTE_AIUTO.has(r.percorso)) return undefined
  if (aiuto === undefined) return { stato: 404, corpo: { errore: 'questo PC non presta ancora i suoi posti' } }
  if (r.percorso === '/api/aiuto/credenziali') {
    if (r.metodo !== 'POST') return { stato: 405, corpo: { errore: 'solo POST' } }
    // Solo un altro PC riconosciuto (id dalla firma della richiesta): mai un telefono, mai una richiesta senza dispositivo.
    const pcId = r.dispositivo?.startsWith('pc:') === true && !r.dispositivo.startsWith('pc:tel:') && r.dispositivo.length > 3 ? r.dispositivo.slice(3) : undefined
    if (pcId === undefined) return { stato: 403, corpo: { errore: 'le credenziali si danno solo a un altro PC riconosciuto' } }
    if (aiuto.credenziali === undefined) return { stato: 404, corpo: { errore: 'questo PC non dà credenziali' } }
    try { return { stato: 200, corpo: await aiuto.credenziali({ pcId, corpo: r.corpo }) } } catch (err) {
      return { stato: 409, corpo: { errore: (err instanceof Error ? err.message : String(err)).slice(0, 300) } }
    }
  }
  const modo = aiuto.modo()
  const dove = r.percorso.slice('/api'.length)
  const cap = (() => { try { return aiuto.capacita?.() } catch { return undefined } })()
  const conProgramma = { ...(aiuto.programma !== undefined ? { programma: aiuto.programma } : {}), ...(cap !== undefined ? { capacita: cap } : {}) }
  if (r.percorso === '/api/aiuto/posti') {
    if (modo === 'no') return { stato: 200, corpo: { modo, liberi: 0, tetto: 0, ...conProgramma } satisfies PostiAiuto }
    const p = await aiuto.servizio(dove).catch(() => undefined) as { liberi?: unknown; tetto?: unknown } | undefined
    const liberi = typeof p?.liberi === 'number' ? Math.max(0, Math.floor(p.liberi)) : 0
    const tetto = typeof p?.tetto === 'number' ? Math.max(0, Math.floor(p.tetto)) : 0
    return { stato: 200, corpo: { modo, liberi, tetto, ...conProgramma } satisfies PostiAiuto }
  }
  if (r.metodo !== 'POST') return { stato: 405, corpo: { errore: 'solo POST' } }
  // Un lavoro nuovo non parte se questo PC ha detto «no»; quelli già partiti si seguono fino alla fine.
  if (modo === 'no' && (r.percorso === '/api/aiuto/pezzo' || r.percorso === '/api/aiuto/avvia')) return { stato: 409, corpo: { errore: 'questo PC non presta più i suoi posti' } }
  const ricevuto = (typeof r.corpo === 'object' && r.corpo !== null ? r.corpo : {}) as Record<string, unknown>
  // 12/11: il nome di chi chiede lo mette questo PC, dall'id firmato della richiesta (non da quello che dice il corpo).
  const idChi = r.dispositivo?.startsWith('pc:') === true ? r.dispositivo.slice(3) : undefined
  // I segreti non arrivano mai dal corpo: li mette solo questo PC, qui sotto.
  const { daNome: _scartato, segreti: _segreti, ...pulito } = ricevuto
  let corpo: Record<string, unknown> = r.percorso === '/api/aiuto/avvia' ? { ...pulito, daNome: (idChi !== undefined ? aiuto.nomePc?.(idChi) : undefined) ?? 'un altro PC' } : pulito
  if (r.percorso === '/api/aiuto/avvia' && aiuto.chiediCredenziali !== undefined && idChi !== undefined && typeof pulito.lavoro === 'string') {
    const nomi = risorseValide(pulito.risorse).filter((c) => c.tipo === 'credenziale').map((c) => c.valore)
    if (nomi.length > 0) {
      const segreti = await aiuto.chiediCredenziali({ lavoro: pulito.lavoro, nomi, daPc: idChi }).catch(() => ({}))
      if (Object.keys(segreti).length > 0) corpo = { ...corpo, segreti }
    }
  }
  try { return { stato: 200, corpo: await aiuto.servizio(dove, corpo) } } catch (err) {
    return { stato: 409, corpo: { errore: (err instanceof Error ? err.message : String(err)).replace(/^il servizio autopilota ha rifiutato la richiesta: /u, '').slice(0, 300) } }
  }
}
