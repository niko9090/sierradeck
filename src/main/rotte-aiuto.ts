import type { ModoAiuto, PostiAiuto } from '@shared/aiuto-rete'

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

export const ROTTE_AIUTO: ReadonlySet<string> = new Set(['/api/aiuto/posti', '/api/aiuto/pezzo', '/api/aiuto/avvia', '/api/aiuto/stato', '/api/aiuto/ritira', '/api/aiuto/chiudi', '/api/aiuto/ferma'])

export type FonteAiuto = {
  modo: () => ModoAiuto
  servizio: (percorso: string, corpo?: Record<string, unknown>) => Promise<unknown>
  /** 12/11: il nome di un altro PC dal suo id, per dire qui per chi lavora. */
  nomePc?: (pcId: string) => string | undefined
  /** 12/11: chi risponde è SierraDeck Aiutante: chi chiede lo preferisce agli altri PC. */
  programma?: 'aiutante'
}

export type RichiestaAiuto = { metodo: string; percorso: string; corpo: unknown; dispositivo?: string }
export type EsitoAiuto = { stato: number; corpo: unknown }

/** `undefined`: non è una rotta dell'aiuto (chi chiama va avanti con le sue). */
export async function rispondiAiuto(r: RichiestaAiuto, aiuto: FonteAiuto | undefined): Promise<EsitoAiuto | undefined> {
  if (!r.percorso.startsWith('/api/aiuto/') || !ROTTE_AIUTO.has(r.percorso)) return undefined
  if (aiuto === undefined) return { stato: 404, corpo: { errore: 'questo PC non presta ancora i suoi posti' } }
  const modo = aiuto.modo()
  const dove = r.percorso.slice('/api'.length)
  const conProgramma = aiuto.programma !== undefined ? { programma: aiuto.programma } : {}
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
  const { daNome: _scartato, ...pulito } = ricevuto
  const corpo = r.percorso === '/api/aiuto/avvia' ? { ...pulito, daNome: (idChi !== undefined ? aiuto.nomePc?.(idChi) : undefined) ?? 'un altro PC' } : pulito
  try { return { stato: 200, corpo: await aiuto.servizio(dove, corpo) } } catch (err) {
    return { stato: 409, corpo: { errore: (err instanceof Error ? err.message : String(err)).replace(/^il servizio autopilota ha rifiutato la richiesta: /u, '').slice(0, 300) } }
  }
}
