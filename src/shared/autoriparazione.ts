/**
 * **L'autoriparazione** (k-59): all'avvio della versione nuova, e a richiesta
 * dal tasto «Ripara» nelle Impostazioni, ogni workspace e ogni chat rimasti
 * con l'assetto di prima vengono portati a quello nuovo, riusando le
 * migrazioni che esistono già. Qui le parti pure: i casi, le voci del
 * rapporto, il testo, la lettura tollerante del file.
 *
 * Le regole, tutte obbligatorie:
 * - mai perdere dati: prima del primo cambiamento una copia (`CARTELLA_COPIE_RIPARAZIONE/<id>`),
 *   e «Torna come prima» la rimette;
 * - mai fermare o riavviare una chat al lavoro: una chat occupata si ripara
 *   dopo, a turno finito (voce `rimandato`);
 * - mai toccare le chat «solo mia»: si segnalano e basta;
 * - idempotente: la seconda volta non cambia niente (e non fa copie).
 */

export const FILE_AUTORIPARAZIONE = 'autoriparazione.json'
/** Le copie fatte prima di cambiare, dentro la cartella dei dati. */
export const CARTELLA_COPIE_RIPARAZIONE = 'copie-autoriparazione'
/** Quante copie si tengono: le più recenti. */
export const COPIE_RIPARAZIONE_DA_TENERE = 5

/** I modi in cui un workspace o una chat può essere rimasto indietro. */
export type CasoRiparazione =
  /** La trasformazione in elenco (0.74.1) mai fatta, fallita o rimasta a metà. */
  | 'trasformazione-mancante'
  /** Un workspace nato dopo la trasformazione: fuori dalla vista a elenco. */
  | 'workspace-fuori-elenco'
  /** L'adozione delle chat già avviate (0.78.0) mai fatta, fallita o a metà. */
  | 'adozione-mancante'
  /** Autopiloti di prima mai passati all'autopilota unico del workspace (più autopiloti, migrazione mai fatta o a metà). */
  | 'autopiloti-di-prima'
  /** L'autopilota del workspace è scritto nelle impostazioni ma il suo file non c'è più. */
  | 'autopilota-mancante'
  /** Una chat viva la cui copia (worktree) non c'è più: orfana. */
  | 'chat-orfana'
  /** Copie, rami e trascrizioni rimasti di chat chiuse (l'autopulizia). */
  | 'copie-e-rami'
  /** Un riquadro di un altro PC che non risulta più (casa che non esiste più). Solo segnalato. */
  | 'casa-sparita'
  /** Un riquadro locale con la cartella sparita e nessun PC che la tenga (chat senza casa). Solo segnalato. */
  | 'senza-casa'
  /** Chat «solo mia» di Nicholas: non si toccano. Solo segnalate. */
  | 'chat-solo-mia'

export type EsitoVoce = 'sistemato' | 'rimandato' | 'segnalato' | 'fallito'

export type VoceRiparazione = {
  caso: CasoRiparazione
  /** Il workspace, se la voce è di uno. */
  workspace?: string
  esito: EsitoVoce
  /** In una riga: cosa è stato trovato e cosa si è fatto (o perché no). */
  cosa: string
}

export type MotivoRiparazione = 'avvio' | 'tasto' | 'turno-finito'

export type RapportoRiparazione = {
  /** Anche il nome della cartella della copia. */
  id: string
  quando: string
  motivo: MotivoRiparazione
  voci: VoceRiparazione[]
  /** C'è una copia di questa esecuzione (solo se qualcosa è cambiato). */
  conCopia: boolean
}

/** Cosa serve per «Torna come prima», dell'ultima esecuzione che ha cambiato qualcosa. */
export type AnnulloRiparazione = {
  id: string
  /** La vista a elenco com'era prima, se la riparazione l'ha cambiata. */
  elencoPrima?: string[]
  /** I file di stato del programma erano nella copia (`true`) o non c'erano (`false`). */
  statiPrima: { migrazione: boolean; adozione: boolean }
  /** Il servizio ha cambiato qualcosa (e ha la sua copia). */
  servizio: boolean
  annullatoIl?: string
}

export type StatoRiparazione = {
  versione: 1
  /** L'ultima esecuzione, anche se non ha cambiato niente. */
  ultimo?: RapportoRiparazione
  /** L'ultima che ha sistemato qualcosa: il rapporto «Ho sistemato…». */
  ultimoCambiamento?: RapportoRiparazione
  annullo?: AnnulloRiparazione
  /** Nicholas ha detto «Torna come prima»: da solo non si ripara più, finché non preme «Ripara». */
  sospesa?: true
  /** I workspace che la riparazione ha già messo nella vista a elenco: se poi li spegni a mano, non li riaccende. */
  aggiuntiAElenco?: string[]
}

export const statoVuoto = (): StatoRiparazione => ({ versione: 1 })

export const sistemate = (r: Pick<RapportoRiparazione, 'voci'>): VoceRiparazione[] => r.voci.filter((v) => v.esito === 'sistemato')
export const rimandate = (r: Pick<RapportoRiparazione, 'voci'>): VoceRiparazione[] => r.voci.filter((v) => v.esito === 'rimandato')
export const segnalate = (r: Pick<RapportoRiparazione, 'voci'>): VoceRiparazione[] => r.voci.filter((v) => v.esito === 'segnalato' || v.esito === 'fallito')

/** I workspace diversi toccati da cambiamenti (per il conto del rapporto). */
export function workspaceSistemati(r: Pick<RapportoRiparazione, 'voci'>): string[] {
  return [...new Set(sistemate(r).flatMap((v) => (v.workspace !== undefined && v.workspace !== '' ? [v.workspace] : [])))]
}

/** Il nome corto di un workspace: `cartella:e:/x/progetto` → `progetto`. */
export function nomeCorto(ws: string): string {
  if (!ws.startsWith('cartella:')) return ws
  return ws.slice('cartella:'.length).split(/[\\/]/u).filter((x) => x !== '').pop() ?? ws
}

/** «Ho sistemato 2 workspace: A, B.» — la riga per la notifica e per le Impostazioni. */
export function riassuntoRiparazione(r: Pick<RapportoRiparazione, 'voci'>): string {
  const ws = workspaceSistemati(r)
  const generali = sistemate(r).filter((v) => v.workspace === undefined || v.workspace === '').length
  const attesa = rimandate(r).length
  const coda = attesa > 0 ? ` ${attesa === 1 ? 'Una cosa aspetta' : `${attesa} cose aspettano`} che la chat finisca il turno.` : ''
  if (ws.length === 0 && generali === 0) return attesa > 0 ? `Niente da sistemare adesso.${coda}` : 'Niente da sistemare: tutto è già come deve essere.'
  const parti: string[] = []
  if (ws.length > 0) parti.push(`${ws.length} workspace: ${ws.map(nomeCorto).join(', ')}`)
  if (generali > 0) parti.push(`${generali === 1 ? 'una cosa' : `${generali} cose`} del programma`)
  return `Ho sistemato ${parti.join(' e ')}.${coda}`
}

const ESITI: readonly EsitoVoce[] = ['sistemato', 'rimandato', 'segnalato', 'fallito']
const CASI: readonly CasoRiparazione[] = [
  'trasformazione-mancante', 'workspace-fuori-elenco', 'adozione-mancante', 'autopiloti-di-prima', 'autopilota-mancante',
  'chat-orfana', 'copie-e-rami', 'casa-sparita', 'senza-casa', 'chat-solo-mia'
]

function leggiVoce(v: unknown): VoceRiparazione[] {
  if (typeof v !== 'object' || v === null) return []
  const o = v as Record<string, unknown>
  if (!CASI.includes(o.caso as CasoRiparazione) || !ESITI.includes(o.esito as EsitoVoce) || typeof o.cosa !== 'string') return []
  return [{
    caso: o.caso as CasoRiparazione,
    esito: o.esito as EsitoVoce,
    cosa: o.cosa.slice(0, 400),
    ...(typeof o.workspace === 'string' ? { workspace: o.workspace } : {})
  }]
}

function leggiRapporto(v: unknown): RapportoRiparazione | undefined {
  if (typeof v !== 'object' || v === null) return undefined
  const o = v as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.quando !== 'string' || !Array.isArray(o.voci)) return undefined
  const motivi: readonly MotivoRiparazione[] = ['avvio', 'tasto', 'turno-finito']
  return {
    id: o.id,
    quando: o.quando,
    motivo: motivi.includes(o.motivo as MotivoRiparazione) ? (o.motivo as MotivoRiparazione) : 'tasto',
    voci: o.voci.flatMap(leggiVoce).slice(0, 200),
    conCopia: o.conCopia === true
  }
}

/** Il file, letto con tolleranza: quello che non torna si scarta, mai un'eccezione. */
export function leggiStatoRiparazione(raw: unknown): StatoRiparazione {
  if (typeof raw !== 'object' || raw === null) return statoVuoto()
  const o = raw as Record<string, unknown>
  const ultimo = leggiRapporto(o.ultimo)
  const cambiamento = leggiRapporto(o.ultimoCambiamento)
  const a = o.annullo as Record<string, unknown> | undefined
  const s = (typeof a === 'object' && a !== null ? a.statiPrima : undefined) as Record<string, unknown> | undefined
  const annullo: AnnulloRiparazione | undefined = typeof a === 'object' && a !== null && typeof a.id === 'string'
    ? {
        id: a.id,
        ...(Array.isArray(a.elencoPrima) ? { elencoPrima: a.elencoPrima.filter((x): x is string => typeof x === 'string') } : {}),
        statiPrima: { migrazione: s?.migrazione === true, adozione: s?.adozione === true },
        servizio: a.servizio === true,
        ...(typeof a.annullatoIl === 'string' ? { annullatoIl: a.annullatoIl } : {})
      }
    : undefined
  return {
    versione: 1,
    ...(ultimo !== undefined ? { ultimo } : {}),
    ...(cambiamento !== undefined ? { ultimoCambiamento: cambiamento } : {}),
    ...(annullo !== undefined ? { annullo } : {}),
    ...(o.sospesa === true ? { sospesa: true as const } : {}),
    ...(Array.isArray(o.aggiuntiAElenco) ? { aggiuntiAElenco: o.aggiuntiAElenco.filter((x): x is string => typeof x === 'string') } : {})
  }
}

/** Il nome della copia di una esecuzione: `20261106-101500`. */
export function idRiparazione(adesso: Date): string {
  return adesso.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '').replace('T', '-')
}

/** Il testo che le Impostazioni mostrano sotto il tasto. */
export function testoRiparazione(s: StatoRiparazione | null): string {
  if (s === null || s.ultimo === undefined) return 'Non ancora controllato su questo PC.'
  const c = s.ultimoCambiamento
  const aspetta = rimandate(s.ultimo).length
  const base = c !== undefined ? `${riassuntoRiparazione(c)} (${c.quando.slice(0, 16).replace('T', ' ')})` : 'Niente da sistemare finora.'
  return aspetta > 0 && c?.id !== s.ultimo.id ? `${base} ${aspetta === 1 ? 'Una cosa aspetta' : `${aspetta} cose aspettano`} un turno finito.` : base
}

export const AIUTO_RIPARAZIONE =
  'Controlla ogni workspace di questo PC e porta all’assetto nuovo quelli rimasti indietro: autopiloti di prima non passati all’autopilota unico, '
  + 'trasformazione o adozione mai finite, workspace fuori dalla vista a elenco, chat orfane, copie e rami di chat chiuse. '
  + 'Prima di cambiare fa una copia, quindi «Torna come prima» rimette tutto. Una chat al lavoro non si ferma né si riavvia: se è occupata si ripara dopo, a turno finito. '
  + 'Le chat «solo mia» non si toccano, si segnalano soltanto. Lanciata due volte, la seconda non cambia niente. '
  + 'Parte da sola all’avvio; qui la lanci a mano.'
