import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Autopilota, ChatGovernata } from '@shared/autopilota'
import { unisci as unisciCoda, type Coda, type Modifica, type PuntoProposto } from '@shared/coda-richieste'
import { eRuolo, ruoloDaTesto, RUOLI_ORDINE, type Ruolo } from '@shared/ruoli-agenti'
import { scriviPiano, type CompitoPiano, type Piano } from '@shared/piano-orchestratore'
import { LEZIONE_MAX, LEZIONI_MAX } from '@shared/lezioni-chat'
import { gettoneBearer, rispondiRpc, type EsitoStrumento, type ServerMcpMinimo, type StrumentoMcp } from '@shared/mcp-minimo'

/**
 * **Gli strumenti dell'orchestratore unico** (P3, 30/10/2026): il server MCP
 * `/mcp/orchestratore?ws=…`, con un gettone per workspace. L'orchestratore
 * (`claude -p`, vedi `orchestratore.ts`) non scrive mai nel repository: ogni
 * cosa che cambia passa da qui, e **il programma valida ogni chiamata**:
 *
 * - `coda_unisci`: l'invariante della coda, nessun punto perso;
 * - `piano_scrivi`: niente cicli nelle dipendenze, richieste aperte;
 * - `specialista_apri`: il compito pronto, i tetti (3 per workspace, al più 4;
 *   `min(posti, 4)` sul PC);
 * - `specialista_scrivi`: il testo arriva solo a chat ferma;
 * - `specialista_chiudi`: unita solo con il ramo unito; le lezioni al quaderno;
 * - `unisci`: il cancello, che il modello non può scavalcare;
 * - `chiedi_utente`: registro delle domande, doppioni, tetto all'ora;
 * - `quaderno_annota`, `stato`.
 */

export const NOME_SERVER_ORCHESTRATORE = 'sierradeck'

/** Il tetto delle chat degli specialisti su tutto il PC: `min(posti, 4)`. */
export const SPECIALISTI_PC_MAX = 4
/** Domande a Nicholas all'ora, al più. */
export const DOMANDE_ORA_ORCHESTRATORE = 4
const TESTO_MAX = 8000

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
  /** Il tetto degli specialisti del workspace (impostazione, 1-4). */
  tettoWs: (ws: string) => number
  /** I posti del PC per le chat (`posti()`). */
  posti: () => number
  /** Le chat al lavoro su tutto il PC, di ogni autopilota. */
  chatAlLavoroSulPc: () => number
  apriSpecialista: (ws: string, p: { compito: CompitoPiano; ruolo: Ruolo; istruzioni: string }) => Promise<EsitoAmbiente>
  scriviSpecialista: (ws: string, chat: string, testo: string) => EsitoAmbiente
  chiudiSpecialista: (ws: string, chat: string, esito: 'unita' | 'abbandonata', lezioni: string[]) => EsitoAmbiente
  /** Avvia il cancello: l'esito arriva dopo, come evento. */
  unisci: (ws: string, chat: string) => EsitoAmbiente
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
    name: 'specialista_apri',
    title: 'Apri uno specialista',
    description: 'Apre una chat specialista per un compito del piano pronto (da fare, dipendenze unite): la sua copia del progetto (worktree, ramo suo) e le tue istruzioni, nel mosaico di Nicholas. Al più 3 specialisti insieme per workspace e pochi su tutto il PC: se il tetto è pieno il programma rifiuta, aspetta che uno finisca. Ruoli: sviluppo, interfaccia, collaudo, revisione, rilascio.',
    inputSchema: {
      type: 'object',
      properties: {
        compito: { type: 'string', description: 'L’id del compito del piano.' },
        ruolo: { type: 'string', enum: [...RUOLI_ORDINE] },
        istruzioni: { type: 'string', description: 'Cosa deve fare, con i file e i vincoli che sai. Il compito e il criterio li aggiunge il programma.' }
      },
      required: ['compito', 'istruzioni']
    }
  },
  {
    name: 'specialista_scrivi',
    title: 'Scrivi a uno specialista',
    description: 'Manda un messaggio a una chat specialista. Arriva solo quando la chat è ferma (a fine turno): non la interrompe.',
    inputSchema: {
      type: 'object',
      properties: { chat: { type: 'string', description: 'L’id della chat (c-N).' }, testo: { type: 'string' } },
      required: ['chat', 'testo']
    }
  },
  {
    name: 'specialista_chiudi',
    title: 'Chiudi uno specialista',
    description: 'Chiude una chat specialista finita: «unita» solo se il suo ramo è già entrato con unisci; «abbandonata» se il compito torna da fare. Le lezioni (al più 3 righe di 200 caratteri) vanno nel quaderno del progetto; poi la chat si elimina da sola.',
    inputSchema: {
      type: 'object',
      properties: {
        chat: { type: 'string' },
        esito: { type: 'string', enum: ['unita', 'abbandonata'] },
        lezioni: { type: 'array', items: { type: 'string' } }
      },
      required: ['chat', 'esito']
    }
  },
  {
    name: 'unisci',
    title: 'Unisci il ramo di uno specialista',
    description: 'Il cancello: il programma prova il ramo della chat nella cartella principale, lo unisce se non rompe i criteri che passavano, poi misura il criterio del compito. I fatti vincono: un criterio rosso non diventa verde a parole. Parte subito; l’esito ti arriva come evento nella chiamata dopo.',
    inputSchema: { type: 'object', properties: { chat: { type: 'string' } }, required: ['chat'] }
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

/**
 * Si può aprire uno specialista? I due tetti: quello del workspace
 * (impostazione, 1-4) e quello del PC (`min(posti, 4)` chat al lavoro).
 */
export function puoAprire(p: { vivi: number; tettoWs: number; alLavoroPc: number; posti: number }): { ok: true } | { ok: false; motivo: string } {
  const tettoWs = Math.min(4, Math.max(1, p.tettoWs))
  if (p.vivi >= tettoWs) return { ok: false, motivo: `ci sono già ${p.vivi} specialisti in questo workspace (al più ${tettoWs}): aspetta che uno finisca, o chiudine uno` }
  const tettoPc = Math.min(Math.max(0, p.posti), SPECIALISTI_PC_MAX)
  if (p.alLavoroPc >= tettoPc) return { ok: false, motivo: `il PC ha già ${p.alLavoroPc} chat al lavoro (al più ${tettoPc} adesso): riprova quando se ne libera una` }
  return { ok: true }
}

/** Il compito si può affidare: c'è, è da fare, le dipendenze sono unite, nessuno ci lavora. */
export function compitoAffidabile(piano: Piano, id: string, vivi: ChatGovernata[]): { ok: true; compito: CompitoPiano } | { ok: false; motivo: string } {
  const c = piano.compiti.find((x) => x.id === id)
  if (c === undefined) return { ok: false, motivo: `il compito ${id} non è nel piano (scrivilo prima con piano_scrivi)` }
  if (c.stato !== 'da-fare') return { ok: false, motivo: `il compito ${id} è già ${c.stato}` }
  const chi = vivi.find((x) => x.compitoId === id)
  if (chi !== undefined) return { ok: false, motivo: `il compito ${id} ce l’ha già ${chi.id}` }
  const mancano = c.dopo.filter((d) => piano.compiti.find((x) => x.id === d)?.stato !== 'unito')
  if (mancano.length > 0) return { ok: false, motivo: `il compito ${id} viene dopo ${mancano.join(', ')}, non ancora uniti` }
  return { ok: true, compito: c }
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

    case 'specialista_apri': {
      const id = str(arg.compito)
      const istruzioni = str(arg.istruzioni)
      if (istruzioni === '') return no('mancano le istruzioni per lo specialista')
      if (istruzioni.length > TESTO_MAX) return no(`istruzioni troppo lunghe (al più ${TESTO_MAX} caratteri)`)
      if (arg.ruolo !== undefined && !eRuolo(arg.ruolo)) return no(`ruolo sconosciuto: ${String(arg.ruolo)} (${RUOLI_ORDINE.join(', ')})`)
      const a = amb.unico(ws)
      if (a === undefined) return no('l’autopilota unico di questo workspace non c’è')
      const vivi = specialistiVivi(a)
      const affidabile = compitoAffidabile(amb.piano(ws), id, vivi)
      if (!affidabile.ok) return no(affidabile.motivo)
      const tetto = puoAprire({ vivi: vivi.length, tettoWs: amb.tettoWs(ws), alLavoroPc: amb.chatAlLavoroSulPc(), posti: amb.posti() })
      if (!tetto.ok) return no(tetto.motivo)
      const ruolo: Ruolo = eRuolo(arg.ruolo) ? arg.ruolo : ruoloDaTesto(affidabile.compito.titolo)
      const e = await amb.apriSpecialista(ws, { compito: affidabile.compito, ruolo, istruzioni })
      return e.ok ? si(e.testo) : no(e.motivo)
    }

    case 'specialista_scrivi': {
      const chat = str(arg.chat)
      const testo = str(arg.testo)
      if (testo === '') return no('il messaggio è vuoto')
      if (testo.length > TESTO_MAX) return no(`messaggio troppo lungo (al più ${TESTO_MAX} caratteri)`)
      const c = amb.unico(ws)?.chats.find((x) => x.id === chat)
      if (c === undefined) return no(`la chat ${chat} non è uno specialista di questo workspace`)
      if (c.stato === 'finita' || c.fine !== undefined) return no(`la chat ${chat} è già chiusa`)
      const e = amb.scriviSpecialista(ws, chat, testo)
      return e.ok ? si(e.testo) : no(e.motivo)
    }

    case 'specialista_chiudi': {
      const chat = str(arg.chat)
      const esito = arg.esito === 'unita' || arg.esito === 'abbandonata' ? arg.esito : undefined
      if (esito === undefined) return no('l’esito è «unita» o «abbandonata»')
      const lezioni = Array.isArray(arg.lezioni) ? arg.lezioni.filter((x): x is string => typeof x === 'string').map((x) => x.replace(/\s+/gu, ' ').trim()).filter((x) => x !== '') : []
      if (lezioni.length > LEZIONI_MAX) return no(`al più ${LEZIONI_MAX} lezioni`)
      const lunga = lezioni.find((x) => x.length > LEZIONE_MAX)
      if (lunga !== undefined) return no(`una lezione supera ${LEZIONE_MAX} caratteri: «${lunga.slice(0, 60)}…»`)
      const c = amb.unico(ws)?.chats.find((x) => x.id === chat)
      if (c === undefined) return no(`la chat ${chat} non è uno specialista di questo workspace`)
      if (c.fine !== undefined) return no(`la chat ${chat} è già in chiusura`)
      if (esito === 'unita' && c.ramo !== undefined) {
        const compito = c.compitoId !== undefined ? amb.piano(ws).compiti.find((x) => x.id === c.compitoId) : undefined
        if (compito !== undefined && compito.stato !== 'unito' && c.conclusa?.come !== 'unito') return no(`il ramo di ${chat} non è ancora unito: prima unisci(${chat}), o chiudila «abbandonata»`)
      }
      const e = amb.chiudiSpecialista(ws, chat, esito, lezioni)
      return e.ok ? si(e.testo) : no(e.motivo)
    }

    case 'unisci': {
      const chat = str(arg.chat)
      const c = amb.unico(ws)?.chats.find((x) => x.id === chat)
      if (c === undefined) return no(`la chat ${chat} non è uno specialista di questo workspace`)
      if (c.fine !== undefined) return no(`la chat ${chat} è già in chiusura`)
      if (c.ramo === undefined) return no(`la chat ${chat} non ha un ramo suo: non c’è niente da unire`)
      const e = amb.unisci(ws, chat)
      return e.ok ? si(e.testo) : no(e.motivo)
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
