import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Autopilota, ChatGovernata } from '@shared/autopilota'
import { unisci as unisciCoda, type Coda, type Modifica, type PuntoProposto } from '@shared/coda-richieste'
import { scriviPiano, type Piano } from '@shared/piano-orchestratore'
import type { Specialista } from '@shared/flusso-orchestratore'
import { LEZIONE_MAX } from '@shared/lezioni-chat'
import { gettoneBearer, rispondiRpc, type EsitoStrumento, type ServerMcpMinimo, type StrumentoMcp } from '@shared/mcp-minimo'

/**
 * **Gli strumenti dell'orchestratore unico** (P3, 30/10/2026): il server MCP
 * `/mcp/orchestratore?ws=…`, con un gettone per workspace. L'orchestratore
 * (`claude -p`, vedi `orchestratore.ts`) non scrive mai nel repository: ogni
 * cosa che cambia passa da qui, e **il programma valida ogni chiamata**:
 *
 * - `coda_unisci`: l'invariante della coda, nessun punto perso;
 * - `piano_scrivi`: niente cicli nelle dipendenze, richieste aperte;
 * - `unisci`: il cancello, che il modello non può scavalcare;
 * - `permesso`: il `--permission-prompt-tool` della CLI; quello che chiede
 *   ancora un permesso diventa una domanda nel riquadro, e la risposta torna
 *   come esito dello strumento.
 *
 * Gli specialisti sono subagenti nativi (`--agents`): li apre, li segue e li
 * chiude la CLI; il tetto è `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`.
 * - `chiedi_utente`: registro delle domande, doppioni, tetto all'ora;
 * - `quaderno_annota`, `stato`.
 */

export const NOME_SERVER_ORCHESTRATORE = 'sierradeck'

/** Il tetto delle chat degli specialisti su tutto il PC: `min(posti, 4)`. */
export const SPECIALISTI_PC_MAX = 4
/** Domande a Nicholas all'ora, al più. */
export const DOMANDE_ORA_ORCHESTRATORE = 4


// ---------------------------------------------------------------- gettoni

export type GettoniOrchestratore = {
  /** Il gettone del workspace (lo stesso finché il servizio vive). */
  di: (ws: string) => string
  /** Il workspace del gettone, se vale ed è quello chiesto. */
  chi: (gettone: string, ws?: string) => string | undefined
}

const impronta = (g: string): Buffer => createHash('sha256').update(g, 'utf8').digest()

/**
 * In memoria: nessun processo dell'orchestratore resta vivo fra due chiamate,
 * e ognuna riceve il gettone nel suo `--mcp-config`. Un riavvio del servizio
 * ne fa di nuovi, e le chiamate dopo li ricevono.
 */
export function creaGettoniOrchestratore(): GettoniOrchestratore {
  const perWs = new Map<string, string>()
  const impronte = new Map<string, Buffer>()
  return {
    di(ws) {
      let g = perWs.get(ws)
      if (g === undefined) {
        g = randomBytes(24).toString('base64url')
        perWs.set(ws, g)
        impronte.set(ws, impronta(g))
      }
      return g
    },
    chi(gettone, ws) {
      if (typeof gettone !== 'string' || gettone.length < 20 || gettone.length > 100) return undefined
      const h = impronta(gettone)
      for (const [w, x] of impronte) {
        if (x.length === h.length && timingSafeEqual(x, h)) return ws === undefined || ws === w ? w : undefined
      }
      return undefined
    }
  }
}

/** Il `--mcp-config` di una chiamata: il server di SierraDeck su questo PC, con il gettone del workspace. */
export function configMcpOrchestratore(porta: number, ws: string, gettone: string): string {
  return JSON.stringify({
    mcpServers: {
      [NOME_SERVER_ORCHESTRATORE]: {
        type: 'http',
        url: `http://127.0.0.1:${porta}/mcp/orchestratore?ws=${encodeURIComponent(ws)}`,
        headers: { Authorization: `Bearer ${gettone}` }
      }
    }
  })
}

// ---------------------------------------------------------------- l'ambiente

export type EsitoAmbiente = { ok: true; testo: string } | { ok: false; motivo: string }

/** Quello che il servizio mette a disposizione degli strumenti: dati e azioni vere. */
export type AmbienteOrchestratore = {
  adesso: () => string
  coda: (ws: string) => Coda
  cambiaCoda: (ws: string, f: (c: Coda) => Modifica | undefined) => Coda
  piano: (ws: string) => Piano
  scriviPiano: (ws: string, p: Piano) => void
  /** L'autopilota unico del workspace. */
  unico: (ws: string) => Autopilota | undefined
  /** Gli specialisti (subagenti) del workspace, come li legge il flusso. */
  specialisti: (ws: string) => Specialista[]
  /** Avvia il cancello: l'esito arriva dopo, come evento. */
  unisci: (ws: string, p: { compito?: string; specialista?: string; ramo?: string }) => EsitoAmbiente
  /** Una richiesta di permesso della CLI: si risolve con la risposta di Nicholas (o con un no allo scadere). */
  permesso: (ws: string, strumento: string, input: unknown) => Promise<{ consenti: boolean; motivo?: string }>
  /** Apre la domanda (registro, doppioni); il tetto all'ora lo guarda lo strumento. */
  chiedi: (ws: string, domanda: string, scelte: string[]) => EsitoAmbiente
  /** Le domande partite nell'ultima ora. */
  domandeUltimaOra: (ws: string) => number
  annota: (ws: string, testo: string, tag: string) => EsitoAmbiente
  /** Ricalcola la percentuale dopo un cambio, con il perché se scende. */
  ricalcola: (ws: string, perche: string) => void
  riassunto: (ws: string) => string
}

// ---------------------------------------------------------------- gli strumenti

export const STRUMENTI_ORCHESTRATORE: readonly StrumentoMcp[] = [
  {
    name: 'stato',
    title: 'Lo stato del workspace',
    description: 'La vista compatta di adesso: coda delle richieste con i punti, piano dei compiti, specialisti al lavoro, percentuale, eventi recenti, tetti. Usalo prima di decidere se non sei sicuro.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'coda_unisci',
    title: 'Unisci richieste della coda',
    description: 'Unisce due o più richieste aperte che parlano della stessa cosa in una sola, riformulata. Devi nominare OGNI punto di ogni richiesta unita (per id, p-N): tienilo (con un testo nuovo se lo riformuli) o dichiaralo superato con il perché. Se ne manca uno il programma rifiuta l’unione. Non unire richieste già fatte, né con obiettivi diversi.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string' }, description: 'Le richieste da unire (r-N), almeno due.' },
        testo: { type: 'string', description: 'Il testo riformulato della richiesta unita.' },
        titolo: { type: 'string', description: 'Facoltativo: il titolo nuovo, una riga.' },
        punti: {
          type: 'array',
          description: 'Tutti i punti delle richieste unite.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              testo: { type: 'string', description: 'Facoltativo: il punto riformulato.' },
              superato: { type: 'string', description: 'Facoltativo: perché il punto è superato (contraddetto da uno più nuovo).' },
              superatoDa: { type: 'string', description: 'Facoltativo: il punto che lo supera.' }
            },
            required: ['id']
          }
        },
        perche: { type: 'string', description: 'Perché sono la stessa cosa.' }
      },
      required: ['ids', 'testo', 'punti', 'perche']
    }
  },
  {
    name: 'piano_scrivi',
    title: 'Scrivi il piano dei compiti',
    description: 'Registra (o aggiorna per id) i compiti in cui dividi le richieste aperte. Ogni compito: id tuo, richiesta (r-N), titolo, criterio (come si dice fatto; un comando fra apici inversi, per esempio `npm test`, il programma lo misura davvero), dopo (id dei compiti da unire prima), peso 1-3. Le dipendenze non possono fare cicli: il piano si rifiuta intero.',
    inputSchema: {
      type: 'object',
      properties: {
        compiti: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              richiesta: { type: 'string' },
              titolo: { type: 'string' },
              criterio: { type: 'string' },
              dopo: { type: 'array', items: { type: 'string' } },
              peso: { type: 'integer', minimum: 1, maximum: 3 }
            },
            required: ['id', 'richiesta', 'titolo', 'criterio']
          }
        }
      },
      required: ['compiti']
    }
  },
  {
    name: 'unisci',
    title: 'Unisci il lavoro di uno specialista',
    description: 'Il cancello: il programma trova il ramo dello specialista (dal compito del piano, dall’id dello specialista, o dal ramo che dai tu), lo prova nella cartella principale, lo unisce se non rompe i criteri che passavano, poi misura il criterio del compito. I fatti vincono: un criterio rosso non diventa verde a parole. Parte subito; l’esito ti arriva dopo, come evento.',
    inputSchema: {
      type: 'object',
      properties: {
        compito: { type: 'string', description: 'L’id del compito del piano (k-N).' },
        specialista: { type: 'string', description: 'Facoltativo: l’id dello specialista (quello dello stato), o di una chat adottata (c-N).' },
        ramo: { type: 'string', description: 'Facoltativo: il ramo git da unire, se il programma non lo trova da sé.' }
      }
    }
  },
  {
    name: 'chiedi_utente',
    title: 'Chiedi a Nicholas',
    description: 'Una domanda a Nicholas, solo quando serve davvero una sua decisione (non per cose che puoi leggere nel codice). Compare nelle Domande di SierraDeck e su Telegram. Al più poche all’ora; una domanda uguale a una aperta o già risposta si rifiuta. La risposta ti arriva come messaggio.',
    inputSchema: {
      type: 'object',
      properties: {
        domanda: { type: 'string' },
        scelte: { type: 'array', items: { type: 'string' }, description: 'Da 2 a 4 risposte possibili, la consigliata per prima.' }
      },
      required: ['domanda']
    }
  },
  {
    name: 'permesso',
    title: 'Permesso per uno strumento',
    description: 'Lo usa la CLI da sola quando uno strumento chiede un permesso: la domanda va a Nicholas nel riquadro. Non chiamarlo tu.',
    inputSchema: {
      type: 'object',
      properties: { tool_name: { type: 'string' }, input: { type: 'object' }, tool_use_id: { type: 'string' } },
      required: ['tool_name']
    }
  },
  {
    name: 'quaderno_annota',
    title: 'Annota nel quaderno',
    description: 'Una lezione da ricordare nel quaderno del progetto (lezioni.md), senza doppioni. Una riga, al più 200 caratteri, con un tag (per esempio «test», «git», «interfaccia»).',
    inputSchema: {
      type: 'object',
      properties: { testo: { type: 'string' }, tag: { type: 'string' } },
      required: ['testo']
    }
  }
]

const no = (testo: string): EsitoStrumento => ({ testo: `Rifiutato: ${testo}`, errore: true })
const si = (testo: string): EsitoStrumento => ({ testo, errore: false })
const str = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')

/** Le chat specialiste vive (non finite) di un autopilota unico. */
export function specialistiVivi(a: Pick<Autopilota, 'chats'> | undefined): ChatGovernata[] {
  return (a?.chats ?? []).filter((c) => c.stato !== 'finita' && c.fine === undefined)
}

function leggiPuntiProposti(raw: unknown): PuntoProposto[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const fuori: PuntoProposto[] = []
  for (const x of raw) {
    if (typeof x === 'string' && x.trim() !== '') { fuori.push({ id: x.trim() }); continue }
    const o = (typeof x === 'object' && x !== null ? x : {}) as Record<string, unknown>
    if (str(o.id) === '') return undefined
    fuori.push({
      id: str(o.id),
      ...(str(o.testo) !== '' ? { testo: str(o.testo) } : {}),
      ...(o.superato !== undefined ? { superato: typeof o.superato === 'string' ? o.superato : '' } : {}),
      ...(str(o.superatoDa) !== '' ? { superatoDa: str(o.superatoDa) } : {})
    })
  }
  return fuori
}

/** Esegue uno strumento per il workspace `ws`, validando tutto. `undefined`: strumento sconosciuto. */
export async function chiamaStrumento(amb: AmbienteOrchestratore, ws: string, nome: string, arg: Record<string, unknown>): Promise<EsitoStrumento | undefined> {
  switch (nome) {
    case 'stato':
      return si(amb.riassunto(ws))

    case 'coda_unisci': {
      const ids = Array.isArray(arg.ids) ? arg.ids.filter((x): x is string => typeof x === 'string').map((x) => x.trim()) : []
      const punti = leggiPuntiProposti(arg.punti)
      if (punti === undefined) return no('«punti» deve essere un elenco di punti con il loro id (p-N)')
      let esito: ReturnType<typeof unisciCoda> | undefined
      const quando = amb.adesso()
      amb.cambiaCoda(ws, (c) => {
        esito = unisciCoda(c, {
          ids, testo: str(arg.testo), punti, perche: str(arg.perche), quando,
          ...(str(arg.titolo) !== '' ? { titolo: str(arg.titolo) } : {})
        })
        if (esito.ok) return esito
        return { coda: c, eventi: [{ tipo: 'unione-rifiutata', quando, fonti: ids, errore: esito.errore }] }
      })
      const e = esito as ReturnType<typeof unisciCoda> | undefined
      if (e === undefined || !e.ok) return no(e?.ok === false ? e.errore : 'unione non fatta')
      amb.ricalcola(ws, `unite ${ids.join(', ')} in ${e.id}`)
      return si(`Unite in ${e.id}: ${ids.filter((x) => x !== e.id).join(', ')} escono dalla coda (Nicholas può separarle).`)
    }

    case 'piano_scrivi': {
      const prima = amb.piano(ws)
      const e = scriviPiano(prima, amb.coda(ws), arg.compiti, amb.adesso())
      if (!e.ok) return no(e.errore)
      amb.cambiaCoda(ws, () => e.coda)
      amb.scriviPiano(ws, e.piano)
      const toccate = [...new Set(e.piano.compiti.filter((c) => e.nuovi.includes(c.id)).map((c) => c.richiesta))]
      amb.ricalcola(ws, e.nuovi.length > 0 ? `${e.nuovi.length === 1 ? 'un compito nuovo' : `${e.nuovi.length} compiti nuovi`} nel piano (${toccate.join(', ')})` : 'piano aggiornato')
      return si(`Piano registrato: ${e.nuovi.length} nuovi${e.nuovi.length > 0 ? ` (${e.nuovi.join(', ')})` : ''}, ${e.cambiati.length} aggiornati. ${e.piano.compiti.length} compiti in tutto.`)
    }

    case 'unisci': {
      const compito = str(arg.compito)
      const specialista = str(arg.specialista)
      const ramo = str(arg.ramo)
      if (compito === '' && specialista === '' && ramo === '') return no('dimmi il compito (k-N), o lo specialista, o il ramo')
      if (ramo !== '' && (!/^[\w./-]{1,200}$/u.test(ramo) || ramo.startsWith('-') || ramo.includes('..'))) return no(`ramo non valido: ${ramo}`)
      if (compito !== '') {
        const k = amb.piano(ws).compiti.find((x) => x.id === compito)
        if (k === undefined) return no(`il compito ${compito} non è nel piano`)
        if (k.stato === 'unito' && k.criterioVerde === true) return no(`il compito ${compito} è già unito, con il criterio verde`)
      }
      if (specialista !== '') {
        const noto = amb.specialisti(ws).some((x) => x.id === specialista || x.task === specialista || x.agente === specialista) || amb.unico(ws)?.chats.some((c) => c.id === specialista) === true
        if (!noto) return no(`lo specialista ${specialista} non è di questo workspace`)
      }
      const e = amb.unisci(ws, { ...(compito !== '' ? { compito } : {}), ...(specialista !== '' ? { specialista } : {}), ...(ramo !== '' ? { ramo } : {}) })
      return e.ok ? si(e.testo) : no(e.motivo)
    }

    case 'permesso': {
      const strumento = str(arg.tool_name) || 'uno strumento'
      const input = typeof arg.input === 'object' && arg.input !== null ? arg.input : {}
      const r = await amb.permesso(ws, strumento, input)
      // La risposta che la CLI si aspetta: un JSON nel testo.
      return si(JSON.stringify(r.consenti ? { behavior: 'allow', updatedInput: input } : { behavior: 'deny', message: r.motivo ?? 'Nicholas non l’ha permesso' }))
    }

    case 'chiedi_utente': {
      const domanda = str(arg.domanda)
      if (domanda === '') return no('la domanda è vuota')
      if (domanda.length > 2000) return no('domanda troppo lunga (al più 2000 caratteri): falla più corta')
      const scelte = Array.isArray(arg.scelte) ? arg.scelte.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter((x) => x !== '') : []
      if (scelte.length === 1 || scelte.length > 4) return no('le scelte sono da 2 a 4 (o nessuna, per una risposta libera)')
      const n = amb.domandeUltimaOra(ws)
      if (n >= DOMANDE_ORA_ORCHESTRATORE) return no(`hai già fatto ${n} domande nell’ultima ora: decidi tu con la scelta più prudente e dillo nel dialogo`)
      const e = amb.chiedi(ws, domanda, scelte)
      return e.ok ? si(e.testo) : no(e.motivo)
    }

    case 'quaderno_annota': {
      const testo = str(arg.testo).replace(/\s+/gu, ' ')
      if (testo === '') return no('la lezione è vuota')
      if (testo.length > LEZIONE_MAX) return no(`al più ${LEZIONE_MAX} caratteri`)
      const e = amb.annota(ws, testo, str(arg.tag) || 'orchestratore')
      return e.ok ? si(e.testo) : no(e.motivo)
    }

    default:
      return undefined
  }
}

export const ISTRUZIONI_MCP_ORCHESTRATORE = 'SierraDeck, l’autopilota unico del workspace: coda delle richieste, piano dei compiti, specialisti, cancello di unione, domande a Nicholas, quaderno. Ogni chiamata la valida il programma: se rifiuta, leggi il motivo e cambia strada.'

export function serverOrchestratore(amb: AmbienteOrchestratore, versione: string): ServerMcpMinimo<string> {
  return {
    nome: NOME_SERVER_ORCHESTRATORE,
    titolo: 'SierraDeck — orchestratore',
    versione,
    istruzioni: ISTRUZIONI_MCP_ORCHESTRATORE,
    strumenti: STRUMENTI_ORCHESTRATORE,
    chiama: (ws, nome, arg) => chiamaStrumento(amb, ws, nome, arg)
  }
}

/** La rotta `/mcp/orchestratore?ws=…`: il gettone deve essere di quel workspace. */
export function rispondiMcpOrchestratore(
  amb: AmbienteOrchestratore, gettoni: GettoniOrchestratore, versione: string,
  p: { metodo: string; ws: string; autorizzazione: string | undefined; corpo: unknown }
): Promise<{ stato: number; corpo?: unknown }> {
  const g = gettoneBearer(p.autorizzazione)
  const ws = g === undefined || p.ws === '' ? undefined : gettoni.chi(g, p.ws)
  return rispondiRpc(serverOrchestratore(amb, versione), ws, p.metodo, p.corpo)
}
