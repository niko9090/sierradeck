import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import { esitoPerLaChat, inCorso, nomeCartella, telefonoPredefinito, type Consegna } from '@shared/file-telefono'
import type { AlTelefono } from './al-telefono'
import { dentroOUguale } from './file-progetti'

/**
 * Lo strumento `manda_al_telefono` delle chat (0.54.0).
 *
 * Nicholas (08/10): «se lo chiedo in chat direttamente sierradeck me lo dà
 * fare». Ogni chat che SierraDeck apre riceve, con `--mcp-config` (solo per
 * quella sessione: la configurazione di Claude Code di Nicholas non si
 * tocca), un piccolo server MCP di SierraDeck: HTTP, su 127.0.0.1, sul server
 * del Client che c'è già, con un **gettone per sessione** nell'intestazione
 * `Authorization`. Dal gettone il PC sa da quale chat arriva la richiesta, e
 * quindi qual è la sua cartella.
 *
 * La regola: senza chiedere partono solo i file **sotto la cartella della
 * chat**. Per un file fuori arriva una domanda a Nicholas nelle Domande, e
 * parte solo con il suo sì. Mai cartelle intere, mai oltre 100 MB. La chat
 * riceve l'esito («in coda», «consegnato», «rifiutato perché…») e con
 * `stato_invio_al_telefono` può chiedere com'è andata dopo.
 *
 * Il protocollo è quello «Streamable HTTP» di MCP ridotto all'osso: un POST
 * con JSON-RPC, una risposta JSON. Niente flussi SSE (un GET risponde 405,
 * come la specifica permette).
 */

export type ChatDelGettone = { sessione: string; cwd: string; pty: string }

export type Gettoni = {
  /** Un gettone nuovo per la chat che sta nascendo; quello di prima della stessa sessione non vale più. */
  nuovo: (c: ChatDelGettone) => string
  /** Di chi è questo gettone, se vale. */
  chi: (gettone: string) => ChatDelGettone | undefined
}

const impronta = (g: string): string => createHash('sha256').update(g, 'utf8').digest('hex')

/**
 * I gettoni stanno su disco come impronte: il programma si può riavviare
 * mentre le chat (che vivono nel processo dei terminali) restano accese, e i
 * loro gettoni devono continuare a valere.
 */
export function apriGettoni(file: string, adesso: () => number = () => Date.now()): Gettoni {
  type Voce = ChatDelGettone & { h: string; creato: string }
  let voci: Voce[] = []
  try { const x = JSON.parse(readFileSync(file, 'utf8')) as unknown; if (Array.isArray(x)) voci = x as Voce[] } catch { /* niente ancora */ }
  return {
    nuovo(c) {
      const g = randomBytes(24).toString('base64url')
      voci = [...voci.filter((v) => v.sessione !== c.sessione), { ...c, h: impronta(g), creato: new Date(adesso()).toISOString() }].slice(-300)
      scriviJsonAtomico(file, voci, 'gettoni-mcp', { mode: 0o600 })
      return g
    },
    chi(gettone) {
      if (typeof gettone !== 'string' || gettone.length < 20 || gettone.length > 100) return undefined
      const h = Buffer.from(impronta(gettone), 'hex')
      const v = voci.find((x) => { const y = Buffer.from(x.h, 'hex'); return y.length === h.length && timingSafeEqual(y, h) })
      return v === undefined ? undefined : { sessione: v.sessione, cwd: v.cwd, pty: v.pty }
    }
  }
}

/** Il nome del server nelle chat: gli strumenti si chiamano `mcp__sierradeck__manda_al_telefono`. */
export const NOME_SERVER_MCP = 'sierradeck'

/** Il `--mcp-config` di una chat: un server HTTP su questo PC, con il suo gettone. */
export function configMcp(porta: number, gettone: string): string {
  return JSON.stringify({
    mcpServers: {
      [NOME_SERVER_MCP]: { type: 'http', url: `http://127.0.0.1:${porta}/api/mcp`, headers: { Authorization: `Bearer ${gettone}` } }
    }
  })
}

export const STRUMENTI_MCP = [
  {
    name: 'manda_al_telefono',
    title: 'Manda un file al telefono',
    description: 'Manda un file al telefono di Nicholas con SierraDeck (arriva nell’app SierraDeck, con una notifica). Usalo quando ti chiede di mandargli, inviargli o passargli un file sul telefono o sul cellulare. I file dentro la cartella di questa chat partono subito; per un file fuori dalla cartella SierraDeck chiede prima conferma a Nicholas. Non manda cartelle intere (fai prima uno .zip) né file oltre 100 MB. Restituisce l’esito: in coda, consegnato, in attesa di conferma, o rifiutato con il motivo.',
    inputSchema: {
      type: 'object',
      properties: {
        percorso: { type: 'string', description: 'Il file da mandare: relativo alla cartella della chat, oppure assoluto.' },
        nota: { type: 'string', description: 'Facoltativa: due parole che Nicholas legge nella notifica (per esempio cosa contiene).' }
      },
      required: ['percorso']
    }
  },
  {
    name: 'stato_invio_al_telefono',
    title: 'Com’è andato un invio al telefono',
    description: 'Dice a che punto è un file mandato con manda_al_telefono: in attesa di conferma, in coda, in viaggio, consegnato, annullato o rifiutato.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'L’id dell’invio, come l’ha restituito manda_al_telefono.' } }, required: ['id'] }
  }
] as const

export type DipendenzeMcp = {
  gettoni: Gettoni
  alTelefono: AlTelefono
  /** Il titolo della chat di quella sessione, se è aperta: va nella domanda di conferma. */
  titoloChat: (sessione: string) => string | undefined
  versione: string
  /** Quanto aspettare il sì nelle Domande, e quanto la consegna di un file sotto la cartella. */
  attesaConfermaMs?: number
  attesaConsegnaMs?: number
}

/** Aspetta che una consegna cambi in uno degli stati voluti, o il tempo. */
function aspetta(t: AlTelefono, id: string, fino: (c: Consegna) => boolean, ms: number): Promise<Consegna | undefined> {
  const subito = t.leggi(id)
  if (subito === undefined || fino(subito) || ms <= 0) return Promise.resolve(subito)
  return new Promise((ok) => {
    let finito = false
    const fine = (c: Consegna | undefined): void => { if (finito) return; finito = true; clearTimeout(timer); smetti(); ok(c) }
    const smetti = t.quandoCambia((c) => { if (c.id === id && fino(c)) fine(c) })
    const timer = setTimeout(() => fine(t.leggi(id)), ms)
  })
}

/** Lo strumento vero: risolve il file, decide se serve chiedere, mette in coda, aspetta l'esito. */
export async function mandaDaChat(
  deps: DipendenzeMcp, chat: ChatDelGettone, percorso: unknown, nota: unknown
): Promise<{ testo: string; errore: boolean }> {
  const no = (testo: string): { testo: string; errore: boolean } => ({ testo: `Rifiutato: ${testo}`, errore: true })
  if (typeof percorso !== 'string' || percorso.trim() === '') return no('manca il file da mandare (percorso).')
  const chiesto = isAbsolute(percorso) ? percorso : resolve(chat.cwd, percorso)
  let vero: string
  try { vero = await realpath(chiesto) } catch { return no(`il file «${percorso}» non c’è (cercato in ${chiesto}).`) }
  const s = await stat(vero)
  if (s.isDirectory()) return no('è una cartella: le cartelle intere non si mandano. Fai prima uno .zip e manda quello, oppure manda i file uno per uno.')
  if (!s.isFile()) return no('non è un file normale.')
  let cartella: string
  try { cartella = await realpath(chat.cwd) } catch { cartella = resolve(chat.cwd) }
  const dentro = dentroOUguale(cartella, vero)
  const tel = telefonoPredefinito(deps.alTelefono.telefoni())
  if (tel === undefined) return no('a questo PC non è accoppiato nessun telefono. Nicholas deve prima collegare l’app SierraDeck (Impostazioni → Client sul PC).')
  const titolo = deps.titoloChat(chat.sessione) ?? nomeCartella(chat.cwd)
  const e = await deps.alTelefono.metti({
    file: vero, a: tel.chiave, da: 'chat', daChat: titolo, daSessione: chat.sessione, conferma: !dentro,
    ...(typeof nota === 'string' && nota.trim() !== '' ? { nota: nota.trim() } : {})
  })
  if (!e.ok) return no(e.errore)
  const finale = dentro
    // Dentro la cartella: parte subito; se il telefono è collegato lo ritira in pochi secondi.
    ? await aspetta(deps.alTelefono, e.c.id, (c) => c.stato === 'consegnata' || !inCorso(c), deps.attesaConsegnaMs ?? 15_000)
    // Fuori: si aspetta il sì o il no nelle Domande.
    : await aspetta(deps.alTelefono, e.c.id, (c) => c.stato !== 'conferma', deps.attesaConfermaMs ?? 120_000)
  const c = finale ?? e.c
  return { testo: esitoPerLaChat(c), errore: c.stato === 'rifiutata' || c.stato === 'annullata' || c.stato === 'scaduta' }
}

type Rpc = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown }

/** Una richiesta JSON-RPC sola: la risposta, o niente per una notifica. */
async function una(deps: DipendenzeMcp, chat: ChatDelGettone, r: Rpc): Promise<Record<string, unknown> | undefined> {
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
      serverInfo: { name: NOME_SERVER_MCP, title: 'SierraDeck', version: deps.versione },
      instructions: 'SierraDeck: per mandare un file al telefono di Nicholas usa manda_al_telefono.'
    })
  }
  if (notifica) return undefined
  if (metodo === 'ping') return risposta({})
  if (metodo === 'tools/list') return risposta({ tools: STRUMENTI_MCP })
  if (metodo === 'tools/call') {
    const nome = p.name
    const arg = (typeof p.arguments === 'object' && p.arguments !== null ? p.arguments : {}) as Record<string, unknown>
    if (nome === 'manda_al_telefono') {
      const e = await mandaDaChat(deps, chat, arg.percorso, arg.nota)
      return risposta({ content: [{ type: 'text', text: e.testo }], isError: e.errore })
    }
    if (nome === 'stato_invio_al_telefono') {
      const c = typeof arg.id === 'string' ? deps.alTelefono.leggi(arg.id) : undefined
      // Una chat vede solo i suoi invii: quelli partiti da un'altra chat, per lei, non esistono.
      const sua = c !== undefined && c.daSessione === chat.sessione ? c : undefined
      return risposta({ content: [{ type: 'text', text: sua === undefined ? 'Nessun invio con questo id.' : esitoPerLaChat(sua) }], isError: sua === undefined })
    }
    return errore(-32602, `Strumento sconosciuto: ${String(nome)}`)
  }
  return errore(-32601, `Metodo non supportato: ${metodo}`)
}

/**
 * La rotta `/api/mcp`, già solo da 127.0.0.1. Senza gettone, o con uno che
 * non è di nessuna chat: 401, e niente strumenti.
 */
export async function rispondiMcp(
  deps: DipendenzeMcp, metodo: string, autorizzazione: string | undefined, corpo: unknown
): Promise<{ stato: number; corpo?: unknown }> {
  const gettone = /^Bearer\s+(\S+)$/i.exec(autorizzazione ?? '')?.[1]
  const chat = gettone === undefined ? undefined : deps.gettoni.chi(gettone)
  if (chat === undefined) return { stato: 401, corpo: { errore: 'gettone mancante o non valido' } }
  if (metodo !== 'POST') return { stato: 405 }
  if (Array.isArray(corpo)) {
    const fuori = (await Promise.all(corpo.map((x) => una(deps, chat, (x ?? {}) as Rpc)))).filter((x) => x !== undefined)
    return fuori.length === 0 ? { stato: 202 } : { stato: 200, corpo: fuori }
  }
  if (typeof corpo !== 'object' || corpo === null) return { stato: 400, corpo: { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON non valido' } } }
  const r = await una(deps, chat, corpo as Rpc)
  return r === undefined ? { stato: 202 } : { stato: 200, corpo: r }
}
