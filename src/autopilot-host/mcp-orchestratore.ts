import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Autopilota, ChatGovernata } from '@shared/autopilota'
import { chiudi as chiudiCoda, unisci as unisciCoda, COME_CHIUSA, type Coda, type ComeChiusa, type Modifica, type PuntoProposto } from '@shared/coda-richieste'
import { apriSeguiti, scriviPiano, type Piano } from '@shared/piano-orchestratore'
import type { Specialista } from '@shared/flusso-orchestratore'
import { LEZIONE_MAX } from '@shared/lezioni-chat'
import { gettoneBearer, rispondiRpc, type EsitoStrumento, type ServerMcpMinimo, type StrumentoMcp } from '@shared/mcp-minimo'
import { argomentoDi } from '@shared/argomento-testo'

/**
 * **Gli strumenti dell'orchestratore unico** (P3, 30/10/2026): il server MCP
 * `/mcp/orchestratore?ws=…`, con un gettone per workspace. L'orchestratore
 * (`claude -p`, vedi `orchestratore.ts`) non scrive mai nel repository: ogni
 * cosa che cambia passa da qui, e **il programma valida ogni chiamata**:
 *
 * - `coda_unisci`: l'invariante della coda, nessun punto perso;
 * - `piano_scrivi`: niente cicli nelle dipendenze, richieste aperte;
 * - `unisci`: il cancello, che il modello non può scavalcare;
 * - `permesso`: il `--permission-prompt-tool` della CLI; decide il programma
 *   (`permessi-automatici.ts`): concede o nega con il motivo. Dall'11/11 non
 *   diventa più una domanda a Nicholas.
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

/**
 * Quanto aspettava, al più, una risposta di Nicholas a un permesso. Dall'11/11 i
 * permessi li decide subito il programma: resta solo come base del tetto qui sotto.
 */
export const ATTESA_PERMESSO_MS = 10 * 60_000
/**
 * Il tetto di una chiamata a uno strumento del nostro server, per la CLI.
 * Senza, la CLI 2.1.314 chiude la richiesta HTTP dopo **60 s** (provato il
 * 30/10: «timeoutMs: 60000» nel debug, e un permesso risposto dopo 90 s
 * andava perso); con `timeout` nella voce del server aspetta. Un minuto più
 * dell'attesa del permesso, così risponde sempre prima il programma.
 */
export const TETTO_CHIAMATA_MCP_MS = ATTESA_PERMESSO_MS + 60_000

/** Il `--mcp-config` di una chiamata: il server di SierraDeck su questo PC, con il gettone del workspace. */
export function configMcpOrchestratore(porta: number, ws: string, gettone: string): string {
  return JSON.stringify({
    mcpServers: {
      [NOME_SERVER_ORCHESTRATORE]: {
        type: 'http',
        url: `http://127.0.0.1:${porta}/mcp/orchestratore?ws=${encodeURIComponent(ws)}`,
        headers: { Authorization: `Bearer ${gettone}` },
        timeout: TETTO_CHIAMATA_MCP_MS
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
  /** Una richiesta di permesso della CLI: la decide il programma, subito (11/11: mai una domanda a Nicholas). */
  permesso: (ws: string, strumento: string, input: unknown) => Promise<{ consenti: boolean; motivo?: string }>
  /** Apre la domanda (registro, doppioni); il tetto all'ora lo guarda lo strumento. */
  chiedi: (ws: string, domanda: string, scelte: string[], perche?: string, richiesta?: string, opz?: { rischiosa?: boolean }) => EsitoAmbiente
  /** Ritira una propria domanda superata (0.92.1). */
  ritira: (ws: string, id: string, perche: string) => EsitoAmbiente
  /** Le domande partite nell'ultima ora. */
  domandeUltimaOra: (ws: string) => number
  annota: (ws: string, testo: string, tag: string) => EsitoAmbiente
  /** 11/11: il progetto di questo workspace è SierraDeck stesso (lì «la installi?» non è una domanda). */
  eIlProgramma?: (ws: string) => boolean
  /** 11/11: la domanda parla di una cosa già successa (versione già installata, chat già chiusa)? Il perché, o `undefined`. */
  giaSuccesso?: (ws: string, testo: string) => string | undefined
  /** 11/11: una riga di avviso a Nicholas nella chat, senza risposta richiesta. Uguale a una recente non si ripete. */
  avviso?: (ws: string, testo: string) => void
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
    name: 'coda_chiudi',
    title: 'Chiudi richieste che non chiedono lavoro',
    description: 'Chiude in coda le richieste che non sono lavoro, con il perché in una riga: una domanda a cui hai appena risposto («a che punto siamo?»), una conferma o un ordine già eseguito («sì», «fermati»), un doppione di una richiesta aperta, una richiesta che risulta già fatta, una che Nicholas ha annullato. Escono dalla percentuale. Chiudile nello stesso turno in cui rispondi: dire «la chiudo» senza chiamare questo strumento non la chiude.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string' }, description: 'Le richieste da chiudere (r-N).' },
        come: { type: 'string', enum: [...COME_CHIUSA], description: 'risposta: domanda o conferma, già risposta; doppione: la contiene un’altra richiesta (doppione_di); gia-fatta: il lavoro c’è già; annullata: Nicholas l’ha fermata.' },
        perche: { type: 'string', description: 'Una riga che Nicholas legge.' },
        doppione_di: { type: 'string', description: 'Solo per «doppione»: la richiesta (r-N) che la contiene.' }
      },
      required: ['ids', 'come', 'perche']
    }
  },
  {
    name: 'piano_scrivi',
    title: 'Scrivi il piano dei compiti',
    description: 'Registra (o aggiorna per id) i compiti in cui dividi le richieste aperte. Ogni compito: id tuo, richiesta (r-N), titolo, criterio (come si dice fatto; un comando fra apici inversi, per esempio `npm test`, il programma lo misura davvero), dopo (id dei compiti da unire prima), peso 1-3. Le dipendenze non possono fare cicli: il piano si rifiuta intero. Un compito nuovo su una richiesta già fatta (per esempio i difetti trovati da una revisione) non si rifiuta: il programma apre da solo il «seguito» di quella richiesta e te lo dice, al più due per richiesta.',
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
    description: 'Una domanda a Nicholas, solo quando serve davvero una sua decisione (cosa vuole, quando pubblicare, un rischio da accettare), non per cose che puoi leggere nel codice. Scrivila in parole semplici, come a chi non legge il codice: niente comandi, nomi di file, rami o sigle (k-N, r-N). Non chiedergli mai di fare a mano un lavoro tecnico (git, comandi, file): quello lo fa uno specialista. Compare subito nella chat di Nicholas con le scelte da toccare (risponde lì); se in dieci minuti nessuno la vede, passa nelle Domande di SierraDeck e su Telegram. Al più poche all’ora; una domanda uguale a una aperta o già risposta si rifiuta. La risposta ti arriva come messaggio.',
    inputSchema: {
      type: 'object',
      properties: {
        domanda: { type: 'string', description: 'Una domanda sola, breve.' },
        perche: { type: 'string', description: 'Una frase: perché serve la sua decisione e cosa cambia, in parole semplici.' },
        scelte: { type: 'array', items: { type: 'string' }, description: 'Da 2 a 4 risposte possibili, la consigliata per prima. Ognuna «scelta → cosa succede dopo».' },
        richiesta: { type: 'string', description: 'Facoltativo: la richiesta della coda da cui nasce la domanda (r-N). Quando è fatta o chiusa, la domanda si ritira da sola.' },
        rischiosa: { type: 'boolean', description: 'Facoltativo: true se la scelta tocca cose di Nicholas che non si rimettono a posto (cancellare, account, dati personali, soldi, spegnere o fermare cose sue), o se la risposta è un fatto che sa solo lui. Allora la domanda resta aperta finché non risponde. Senza, dopo un’ora il programma sceglie la consigliata (la prima scelta) e glielo scrive.' }
      },
      required: ['domanda', 'perche']
    }
  },
  {
    name: 'ritira_domanda',
    title: 'Ritira una domanda',
    description: 'Toglie dalle Domande di Nicholas una tua domanda che non serve più: hai deciso tu, il lavoro è andato avanti o è finito, oppure lui ti ha risposto nel dialogo. Gli id sono in DOMANDE APERTE nello stato. Una domanda superata lasciata aperta lo confonde.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'L’id della domanda, da DOMANDE APERTE.' },
        perche: { type: 'string', description: 'Una frase: perché non serve più.' }
      },
      required: ['id', 'perche']
    }
  },
  {
    name: 'permesso',
    title: 'Permesso per uno strumento',
    description: 'Lo usa la CLI da sola quando uno strumento chiede un permesso: decide il programma, che concede o nega con il motivo (Nicholas non viene disturbato). Non chiamarlo tu.',
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

    case 'coda_chiudi': {
      const ids = Array.isArray(arg.ids) ? arg.ids.filter((x): x is string => typeof x === 'string').map((x) => x.trim()) : []
      const come = str(arg.come) as ComeChiusa
      let esito: ReturnType<typeof chiudiCoda> | undefined
      amb.cambiaCoda(ws, (c) => {
        esito = chiudiCoda(c, { ids, come, perche: str(arg.perche), quando: amb.adesso(), ...(str(arg.doppione_di) !== '' ? { doppioneDi: str(arg.doppione_di) } : {}) })
        return esito.ok ? esito : { coda: c, eventi: [] }
      })
      const e = esito as ReturnType<typeof chiudiCoda> | undefined
      if (e === undefined || !e.ok) return no(e?.ok === false ? e.errore : 'chiusura non fatta')
      amb.ricalcola(ws, `chiuse ${ids.join(', ')}`)
      return si(`Chiuse ${ids.join(', ')} (${come}): non contano più nella percentuale.`)
    }

    case 'piano_scrivi': {
      const prima = amb.piano(ws)
      // 11/11: un compito nuovo su una richiesta già fatta apre il suo seguito, invece di un rifiuto
      // che finiva in una domanda a Nicholas («Li correggo?») solo per avere una richiesta aperta.
      const s = apriSeguiti(prima, amb.coda(ws), arg.compiti, amb.adesso())
      if (!s.ok) return no(s.errore)
      const e = scriviPiano(prima, s.coda, s.compiti, amb.adesso())
      if (!e.ok) return no(e.errore)
      amb.cambiaCoda(ws, () => ({ coda: e.coda.coda, eventi: [...s.eventi, ...e.coda.eventi] }))
      amb.scriviPiano(ws, e.piano)
      const toccate = [...new Set(e.piano.compiti.filter((c) => e.nuovi.includes(c.id)).map((c) => c.richiesta))]
      amb.ricalcola(ws, e.nuovi.length > 0 ? `${e.nuovi.length === 1 ? 'un compito nuovo' : `${e.nuovi.length} compiti nuovi`} nel piano (${toccate.join(', ')})` : 'piano aggiornato')
      const seguiti = s.seguiti.length === 0 ? '' : ` ${s.seguiti.map((x) => (x.riusata
        ? `La richiesta ${x.di} è già fatta: i compiti nuovi sono nel suo seguito ${x.nuova}, ancora aperto.`
        : `La richiesta ${x.di} è già fatta: ho aperto il seguito ${x.nuova} e ci ho messo i compiti nuovi.`)).join(' ')} Di’ a Nicholas in una riga cosa correggi e perché, senza chiedere.`
      return si(`Piano registrato: ${e.nuovi.length} nuovi${e.nuovi.length > 0 ? ` (${e.nuovi.join(', ')})` : ''}, ${e.cambiati.length} aggiornati. ${e.piano.compiti.length} compiti in tutto.${seguiti}`)
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
      return si(JSON.stringify(r.consenti ? { behavior: 'allow', updatedInput: input } : { behavior: 'deny', message: r.motivo ?? 'il programma non lo permette' }))
    }

    case 'chiedi_utente': {
      const domanda = str(arg.domanda)
      if (domanda === '') return no('la domanda è vuota')
      if (domanda.length > 2000) return no('domanda troppo lunga (al più 2000 caratteri): falla più corta')
      const scelte = Array.isArray(arg.scelte) ? arg.scelte.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter((x) => x !== '') : []
      if (scelte.length === 1 || scelte.length > 4) return no('le scelte sono da 2 a 4 (o nessuna, per una risposta libera)')
      const perche = str(arg.perche).replace(/\s+/gu, ' ')
      // 0.89.4 (02/11, «domande fatte male»): a Nicholas non si chiede di fare il lavoro tecnico.
      if (/\bgit\s+(checkout|reset|merge|stash|commit|push|pull|rebase|restore|clean)\b|\bnpm\s+(run|install|ci)\b|\bnpx\s/iu.test(`${domanda} ${scelte.join(' ')}`)) {
        return no('non chiedere a Nicholas di lanciare comandi: il lavoro tecnico lo fa uno specialista (o il programma). Chiedigli solo la decisione, in parole semplici')
      }
      // 11/11: una cosa già successa non si chiede (20/10: «Installi tu la 0.80.0?» con la 0.80.1 già installata).
      const gia = amb.giaSuccesso?.(ws, domanda)
      if (gia !== undefined) return si(`Già fatto: ${gia}. Non lo chiedo a Nicholas: vai avanti tenendone conto.`)
      // 11/11: «Quando la installi?» non è una domanda che scade e «decide da sola»: è un avviso.
      const etichette = scelte.map((s) => s.split(/\s*(?:→|->)\s*/u, 1)[0] ?? s)
      if (domandaSullInstallazione(domanda, etichette, amb.eIlProgramma?.(ws) === true)) {
        if (amb.avviso === undefined) return no(`${MOTIVO_INSTALLAZIONE} Scrivi tu una riga di avviso nel tuo messaggio («La X è pronta: quando la installi, succede Y») e vai avanti con il resto, senza aspettare.`)
        amb.avviso(ws, avvisoInstallazione(domanda))
        return no(`${MOTIVO_INSTALLAZIONE} L’ho scritto io a Nicholas come avviso, senza risposta richiesta: non ripeterlo come domanda e vai avanti con il resto, senza aspettare.`)
      }
      // 06/11: l'autopilota è autosufficiente: riavvii, programmi da chiudere e lavoro a mano si risolvono da soli.
      const inutile = motivoDomandaInutile(`${domanda} ${scelte.join(' ')}`)
      if (inutile !== undefined) return no(inutile)
      const n = amb.domandeUltimaOra(ws)
      if (n >= DOMANDE_ORA_ORCHESTRATORE) return no(`hai già fatto ${n} domande nell’ultima ora: decidi tu con la scelta più prudente e dillo nel dialogo`)
      const richiesta = str(arg.richiesta)
      // 11/11: `rischiosa` è facoltativo: le parole di rischio le guarda comunque il programma.
      const e = amb.chiedi(ws, domanda, scelte, perche !== '' ? perche : undefined, richiesta !== '' ? richiesta : undefined, arg.rischiosa === true ? { rischiosa: true } : undefined)
      return e.ok ? si(e.testo) : no(e.motivo)
    }

    case 'ritira_domanda': {
      const id = str(arg.id)
      const perche = str(arg.perche).replace(/\s+/gu, ' ').slice(0, 300)
      if (id === '') return no('manca l’id della domanda')
      const e = amb.ritira(ws, id, perche !== '' ? perche : 'non serve più')
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

/**
 * 06/11: domande che a Nicholas non si fanno. Riavviare il servizio, chiudere
 * programmi o fare a mano un lavoro tecnico: l'autopilota le risolve da solo
 * (con uno specialista, o aspettando). `undefined` se la domanda va bene.
 */
export function motivoDomandaInutile(testo: string): string | undefined {
  const t = testo.replace(/\s+/gu, ' ')
  if (/\b(riavvi\w*|riavv\w*|riparti\w*|restart\w*)\b[^.?!]{0,60}\b(servizio|sierradeck|programma|app|pc|computer|server|autopilot\w*)\b|\b(servizio|sierradeck|programma|app|pc|computer|server)\b[^.?!]{0,40}\b(riavvi\w*|riavv\w*|riparti\w*|restart\w*)\b/iu.test(t)) {
    return 'non chiedere a Nicholas di riavviare il servizio, il programma o il PC: risolvilo da solo (uno specialista, un nuovo tentativo, un’altra strada) e vai avanti'
  }
  if (/\b(chiud\w+|termin\w+|esci\w*|quit\w*|kill\w*)\b[^.?!]{0,50}\b(programm\w+|app|applicazion\w+|finestr\w+|process\w+|chat|sierradeck|editor|browser|claude)\b/iu.test(t)) {
    return 'non chiedere a Nicholas di chiudere programmi o processi: se qualcosa tiene occupata una cartella o un file, risolvilo da solo (un nuovo tentativo, un’altra copia, uno specialista)'
  }
  if (/\b(lanci\w*|esegu\w*|digit\w*|scrivi)\b[^.?!]{0,40}\b(comando|terminale|prompt|powershell|bash|cmd)\b|\b(da terminale|a mano)\b[^.?!]{0,60}\b(lanci\w*|esegu\w*|fai\w*|sistem\w*|copi\w*|cancell\w*)\b|\b(lanci\w*|esegu\w*|fai\w*)\b[^.?!]{0,30}\ba mano\b/iu.test(t)) {
    return 'non chiedere a Nicholas di fare a mano lavoro tecnico o di lanciare comandi: affidalo a uno specialista, o al programma, e chiedigli solo una decisione sua'
  }
  // 11/11: cinque volte in due settimane («Nella cartella principale c'è una modifica non salvata… Come faccio?»,
  // «La fila delle unioni è ferma da 7 ore… Come vuoi fare?», «…saltando la fila?»). Di questo si occupa il programma.
  if (UNIONI_FERME.test(t)) return MOTIVO_UNIONI_FERME
  return undefined
}

export const MOTIVO_INSTALLAZIONE = 'l’installazione di SierraDeck la fa Nicholas quando vuole: non è una domanda e non ha una scadenza.'

/**
 * **«Quando la installi?»** (11/11). Installare SierraDeck spetta solo a
 * Nicholas, quindi non c'è niente da decidere: la domanda dell'11/11 offriva
 * «La installo adesso (consigliata)» e prometteva «fra un giorno decido io con
 * la scelta consigliata», cioè una cosa che l'autopilota non può fare.
 *
 * Vale per SierraDeck e basta: se il testo lo nomina, oppure se il progetto del
 * workspace è SierraDeck e si parla di una versione o di un aggiornamento.
 * «Installo il servizio sul NAS?» di un altro progetto non c'entra. Si guardano
 * la domanda e i tasti, non le conseguenze («…poi una release che installi
 * tu»), e non conta un «senza installarla».
 */
export function domandaSullInstallazione(domanda: string, etichette: string[], suSierraDeck: boolean): boolean {
  const t = `${domanda} ${etichette.join(' ')}`.replace(/\s+/gu, ' ')
  const senzaNegate = t.replace(/(?<![\p{L}])(?:senza|non|mai)\s+(?:[\p{L}’']+\s+){0,2}?install[\p{L}]*/giu, ' ')
  if (!argomentoDi(senzaNegate).installa) return false
  if (/(?<![\p{L}])sierradeck(?![\p{L}])/iu.test(t)) return true
  return suSierraDeck && (argomentoDi(t).versioni.length > 0 || /(?<![\p{L}])(?:aggiornament[\p{L}]*|versione|release)(?![\p{L}])/iu.test(t))
}

/**
 * La riga di avviso al posto della domanda: quello che la domanda diceva prima
 * del punto interrogativo, e «installala quando vuoi». Senza risposta richiesta.
 */
export function avvisoInstallazione(domanda: string): string {
  const coda = 'non serve rispondere, intanto vado avanti con il resto.'
  const frasi = domanda.replace(/\s+/gu, ' ').trim().split(/(?<=[.!?])\s+/u)
  const premessa = frasi.filter((f) => !f.trim().endsWith('?')).join(' ').trim()
  if (premessa !== '') return `${premessa} Installala quando vuoi: ${coda}`
  const versione = argomentoDi(domanda).versioni[0]
  return versione !== undefined
    ? `Quando vuoi puoi installare la ${versione}: ${coda}`
    : `Quando vuoi puoi installare la versione nuova di SierraDeck: ${coda}`
}

/** File non salvati, cartella principale, fila delle unioni ferma o da saltare: non sono domande dell'autopilota. */
const UNIONI_FERME = /\b(?:modific\w*|file|note|righe)\b[^.?!]{0,60}\bnon\s+salvat\w*|\bnon\s+salvat\w*[^.?!]{0,60}\b(?:cartella|union\w*|fila)\b|\bcartella\s+principale\b|\bfila\s+(?:delle\s+|di\s+)?union\w*|\bunion\w*\b[^.?!]{0,50}\b(?:ferm\w*|scad\w*|bloccat\w*|rifiutat\w*|in\s+fila|in\s+attesa)\b|\b(?:ferm\w*|scad\w*|bloccat\w*|rifiutat\w*)\b[^.?!]{0,50}\bunion\w*|\bsalt\w*\s+la\s+fila\b/iu
export const MOTIVO_UNIONI_FERME = 'non chiedere a Nicholas di file non salvati, della cartella principale o della fila delle unioni: gliel’ha già chiesto il programma, tu vai avanti con il resto'

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
