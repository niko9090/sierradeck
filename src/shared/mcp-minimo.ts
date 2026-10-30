/**
 * **Il server MCP minimo** di SierraDeck: JSON-RPC su un POST, una risposta
 * JSON. Niente flussi SSE (un GET risponde 405, come la specifica permette).
 *
 * Nato in `main/mcp-telefono.ts` (0.54.0) per lo strumento
 * `manda_al_telefono` delle chat; spostato qui (P3, 30/10) perché lo usa anche
 * l'orchestratore unico (`autopilot-host/mcp-orchestratore.ts`). Ognuno porta
 * i suoi strumenti, il suo modo di dire chi chiama (il gettone) e la sua
 * funzione che li esegue; il protocollo è lo stesso.
 */

export type StrumentoMcp = {
  name: string
  title?: string
  description: string
  inputSchema: Record<string, unknown>
}

/** L'esito di uno strumento: il testo per il modello, e se è un errore. */
export type EsitoStrumento = { testo: string; errore: boolean }

export type ServerMcpMinimo<C> = {
  /** Il nome del server: gli strumenti si chiamano `mcp__<nome>__<strumento>`. */
  nome: string
  titolo: string
  versione: string
  /** Le istruzioni che il modello legge all'inizio. */
  istruzioni: string
  strumenti: readonly StrumentoMcp[]
  /** Esegue uno strumento; `undefined` se non lo conosce. */
  chiama: (ctx: C, nome: string, argomenti: Record<string, unknown>) => Promise<EsitoStrumento | undefined>
}

export type RichiestaRpc = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown }

/** Il gettone da `Authorization: Bearer …`, se c'è. */
export function gettoneBearer(autorizzazione: string | undefined): string | undefined {
  return /^Bearer\s+(\S+)$/i.exec(autorizzazione ?? '')?.[1]
}

/** Una richiesta JSON-RPC sola: la risposta, o niente per una notifica. */
export async function unaRichiestaRpc<C>(s: ServerMcpMinimo<C>, ctx: C, r: RichiestaRpc): Promise<Record<string, unknown> | undefined> {
  const id = r.id
  const notifica = id === undefined || id === null
  const risposta = (result: unknown): Record<string, unknown> => ({ jsonrpc: '2.0', id, result })
  const errore = (code: number, message: string): Record<string, unknown> => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })
  const metodo = typeof r.method === 'string' ? r.method : ''
  const p = (typeof r.params === 'object' && r.params !== null ? r.params : {}) as Record<string, unknown>
  if (metodo === 'initialize') {
    const versione = typeof p.protocolVersion === 'string' ? p.protocolVersion : '2025-06-18'
    return risposta({
      protocolVersion: versione,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: s.nome, title: s.titolo, version: s.versione },
      instructions: s.istruzioni
    })
  }
  if (notifica) return undefined
  if (metodo === 'ping') return risposta({})
  if (metodo === 'tools/list') return risposta({ tools: s.strumenti })
  if (metodo === 'tools/call') {
    const nome = typeof p.name === 'string' ? p.name : ''
    const arg = (typeof p.arguments === 'object' && p.arguments !== null && !Array.isArray(p.arguments) ? p.arguments : {}) as Record<string, unknown>
    let e: EsitoStrumento | undefined
    try {
      e = await s.chiama(ctx, nome, arg)
    } catch (err) {
      // Un guasto dello strumento torna al modello come errore dello strumento, non come 500.
      e = { testo: `Errore: ${err instanceof Error ? err.message : String(err)}`, errore: true }
    }
    if (e === undefined) return errore(-32602, `Strumento sconosciuto: ${String(p.name)}`)
    return risposta({ content: [{ type: 'text', text: e.testo }], isError: e.errore })
  }
  return errore(-32601, `Metodo non supportato: ${metodo}`)
}

/**
 * Una rotta MCP intera, dato chi chiama (già riconosciuto dal gettone):
 * `undefined` vuol dire gettone mancante o non valido, e allora 401 e niente
 * strumenti.
 */
export async function rispondiRpc<C>(
  s: ServerMcpMinimo<C>, ctx: C | undefined, metodo: string, corpo: unknown
): Promise<{ stato: number; corpo?: unknown }> {
  if (ctx === undefined) return { stato: 401, corpo: { errore: 'gettone mancante o non valido' } }
  if (metodo !== 'POST') return { stato: 405 }
  if (Array.isArray(corpo)) {
    const fuori = (await Promise.all(corpo.map((x) => unaRichiestaRpc(s, ctx, (x ?? {}) as RichiestaRpc)))).filter((x) => x !== undefined)
    return fuori.length === 0 ? { stato: 202 } : { stato: 200, corpo: fuori }
  }
  if (typeof corpo !== 'object' || corpo === null) return { stato: 400, corpo: { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON non valido' } } }
  const r = await unaRichiestaRpc(s, ctx, corpo as RichiestaRpc)
  return r === undefined ? { stato: 202 } : { stato: 200, corpo: r }
}
