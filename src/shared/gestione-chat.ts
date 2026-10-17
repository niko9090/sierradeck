/**
 * **La gestione delle chat** (0.79.0): tre azioni chiare per ogni chat, lo
 * spazio che occupa, il recupero di 30 giorni. Regole pure, uguali per il PC,
 * la pagina e l'app: chi mostra legge le stesse risposte del main.
 *
 * - **Chiudi**: ferma il processo (claude.exe). La chat resta dov'è, si
 *   riprende quando vuoi.
 * - **Archivia**: la toglie dagli elenchi («Riprendi», Progetti, telefono). I
 *   file restano: si ritrova in «Archiviate» e si rimette con un gesto.
 * - **Elimina dal PC**: toglie dal disco **solo** i file di quella sessione
 *   (trascrizione, sotto-agenti, storia dei file, ambiente, compiti) e le sue
 *   voci (indice, nome, archiviate). Non cancella: sposta tutto nel recupero
 *   di SierraDeck per 30 giorni, sempre attraverso `cancellaSicura`. La copia
 *   sul Drive resta, a meno di «anche dal Drive» (che va nel recupero del
 *   Drive, anche lui di 30 giorni).
 *
 * Non si elimina, e non si archivia, una chat che lavora, che aspetta una tua
 * risposta, che un autopilota attivo governa o che vive su un altro PC: il
 * motivo si dice in una riga leggibile.
 */

export type AzioneChat = 'chiudi' | 'archivia' | 'ripristina' | 'elimina' | 'rinomina'

export const AZIONI_CHAT: readonly AzioneChat[] = ['chiudi', 'archivia', 'ripristina', 'elimina', 'rinomina']

/** I testi corti delle tre azioni, con il «?» (regola del 12/10: niente paragrafi fissi). */
export const TESTI_AZIONI_CHAT: Record<'chiudi' | 'archivia' | 'elimina', { etichetta: string; breve: string; spiega: string }> = {
  chiudi: {
    etichetta: 'Chiudi',
    breve: 'Ferma la chat. Resta tutto.',
    spiega: 'Ferma il processo di Claude Code di questa chat. La conversazione resta sul PC e si riprende quando vuoi da «Riprendi una conversazione».'
  },
  archivia: {
    etichetta: 'Archivia',
    breve: 'La toglie dagli elenchi. Si ritrova.',
    spiega: 'La chat sparisce dagli elenchi ma non si cancella niente. La ritrovi in «Archiviate» e la rimetti con «Ripristina». Se è aperta e ferma, prima si chiude.'
  },
  elimina: {
    etichetta: 'Elimina dal PC',
    breve: 'Libera spazio. 30 giorni per ripensarci.',
    spiega: 'Toglie da questo PC solo i file di questa chat e libera il loro spazio. Per 30 giorni restano nel recupero e si rimettono con «Ripristina». La copia sul Drive resta, se non scegli «anche dal Drive».'
  }
}

/** Quanto resta nel recupero una chat eliminata dal PC. */
export const RECUPERO_CHAT_GIORNI = 30
const GIORNO_MS = 86_400_000

/** Quanto vale un gettone di conferma di «Svuota il recupero adesso». */
export const GETTONE_SVUOTA_MS = 2 * 60_000
/** La parola da scrivere per svuotare davvero: la conferma forte. */
export const FRASE_SVUOTA = 'SVUOTA'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Lo slug di una cartella come lo scrive Claude Code: niente separatori, niente «..». */
const SLUG = /^[A-Za-z0-9._-]{1,255}$/

export function sessioneValida(s: unknown): s is string {
  return typeof s === 'string' && UUID.test(s)
}

export function slugValido(s: unknown): s is string {
  return typeof s === 'string' && SLUG.test(s) && s !== '.' && s !== '..'
}

/* ------------------------------------------------------------------ */
/* I file di una sessione.                                             */
/* ------------------------------------------------------------------ */

export type ParteSessione = 'trascrizione' | 'sotto-agenti' | 'storia-file' | 'ambiente' | 'compiti' | 'todo' | 'debug'

export const NOME_PARTE: Record<ParteSessione, string> = {
  trascrizione: 'conversazione',
  'sotto-agenti': 'sotto-agenti e risultati',
  'storia-file': 'storia dei file modificati',
  ambiente: 'ambiente della sessione',
  compiti: 'compiti',
  todo: 'liste di cose da fare',
  debug: 'registro di debug'
}

/**
 * Dove Claude Code tiene i file di **una** sessione, relativi alla sua
 * radice (`~/.claude`). Solo nomi che contengono l'id della sessione: niente
 * di condiviso fra le chat (impostazioni, `history.jsonl`, plugin) si tocca.
 * Le liste `todos/<sessione>-agent-*.json` hanno un nome variabile: le
 * trova chi legge la cartella, con `eFileTodoDi`.
 */
export function partiDiSessione(slug: string, sessione: string): { parte: ParteSessione; relativo: string[] }[] {
  if (!slugValido(slug) || !sessioneValida(sessione)) return []
  return [
    { parte: 'trascrizione', relativo: ['projects', slug, `${sessione}.jsonl`] },
    { parte: 'sotto-agenti', relativo: ['projects', slug, sessione] },
    { parte: 'storia-file', relativo: ['file-history', sessione] },
    { parte: 'ambiente', relativo: ['session-env', sessione] },
    { parte: 'compiti', relativo: ['tasks', sessione] },
    { parte: 'debug', relativo: ['debug', `${sessione}.txt`] }
  ]
}

/** Un file di `todos/` di quella sessione: `<sessione>.json` o `<sessione>-agent-<…>.json`. */
export function eFileTodoDi(nome: string, sessione: string): boolean {
  if (!sessioneValida(sessione)) return false
  const n = nome.toLowerCase()
  const s = sessione.toLowerCase()
  return n.endsWith('.json') && (n === `${s}.json` || n.startsWith(`${s}-agent-`))
}

/* ------------------------------------------------------------------ */
/* Cosa si può fare a una chat, e perché no.                            */
/* ------------------------------------------------------------------ */

export type StatoPerAzione = {
  sessione: string
  titolo?: string
  /** Aperta adesso su questo PC (riquadro o sottofondo). */
  aperta?: {
    /** Sta scrivendo o eseguendo qualcosa. */
    lavora: boolean
    /** Ha una domanda o una scelta aperta per te. */
    chiede: boolean
    /** In sottofondo, usata da lontano (un altro PC, il telefono). */
    sottofondo?: string
  }
  /** Un autopilota la governa: con il suo nome e se è attivo (non fermo, non archiviato). */
  governata?: { autopilota: string; attivo: boolean }
  /** Vive su un altro PC (la sua casa, o il progetto è là): il nome di quel PC. */
  altroPc?: string
  /** I suoi file non sono su questo PC. */
  nonQui?: boolean
  /** Protetta dal PIN e ancora chiusa per chi chiede. */
  pinChiusa?: boolean
}

function nome(s: StatoPerAzione): string {
  return s.titolo !== undefined && s.titolo.trim() !== '' ? `«${s.titolo.trim()}»` : 'Questa chat'
}

/** Il perché una chat non si elimina dal PC, o niente se si può. */
export function motivoNonElimina(s: StatoPerAzione): string | undefined {
  const n = nome(s)
  if (s.altroPc !== undefined) return `${n} vive su «${s.altroPc}»: si elimina da lì.`
  if (s.governata?.attivo === true) return `${n} la guida l’autopilota «${s.governata.autopilota}», che è attivo: fermalo prima.`
  if (s.aperta?.lavora === true) return `${n} sta lavorando: aspetta che finisca, poi chiudila.`
  if (s.aperta?.chiede === true) return `${n} aspetta una tua risposta: rispondi o chiudila prima.`
  if (s.aperta?.sottofondo !== undefined) return `${n} è aperta in sottofondo per ${s.aperta.sottofondo}: chiudila prima.`
  if (s.aperta !== undefined) return `${n} è aperta e ti aspetta: chiudila prima con «Chiudi».`
  if (s.pinChiusa === true) return `${n} è protetta dal PIN: sbloccala prima.`
  if (s.nonQui === true) return `${n} non ha file su questo PC: non c’è niente da eliminare qui.`
  return undefined
}

/**
 * Il perché una chat non si archivia, o niente. Una chat aperta e ferma si
 * archivia (prima si chiude); una che lavora o chiede no.
 */
export function motivoNonArchivia(s: StatoPerAzione): string | undefined {
  const n = nome(s)
  if (s.altroPc !== undefined) return `${n} vive su «${s.altroPc}»: si archivia da lì.`
  if (s.governata?.attivo === true) return `${n} la guida l’autopilota «${s.governata.autopilota}», che è attivo: fermalo prima.`
  if (s.aperta?.lavora === true) return `${n} sta lavorando: aspetta che finisca.`
  if (s.aperta?.chiede === true) return `${n} aspetta una tua risposta: rispondi prima.`
  if (s.aperta?.sottofondo !== undefined) return `${n} è aperta in sottofondo per ${s.aperta.sottofondo}: chiudila prima.`
  if (s.pinChiusa === true) return `${n} è protetta dal PIN: sbloccala prima.`
  return undefined
}

/** Il perché una chat non si chiude, o niente. Una chat che lavora si chiude (lo chiedi tu), una governata no. */
export function motivoNonChiude(s: StatoPerAzione): string | undefined {
  const n = nome(s)
  if (s.aperta === undefined) return `${n} non è aperta: è già chiusa.`
  if (s.governata?.attivo === true) return `${n} la guida l’autopilota «${s.governata.autopilota}», che è attivo: fermalo prima.`
  if (s.pinChiusa === true) return `${n} è protetta dal PIN: sbloccala prima.`
  return undefined
}

/* ------------------------------------------------------------------ */
/* Le chat archiviate.                                                 */
/* ------------------------------------------------------------------ */

export type ChatArchiviata = { sessione: string; il: string; titolo?: string }

export function leggiArchiviate(raw: unknown): ChatArchiviata[] {
  const voci = Array.isArray(raw) ? raw : typeof raw === 'object' && raw !== null && Array.isArray((raw as { archiviate?: unknown }).archiviate) ? (raw as { archiviate: unknown[] }).archiviate : []
  const fuori: ChatArchiviata[] = []
  const viste = new Set<string>()
  for (const v of voci) {
    if (typeof v !== 'object' || v === null) continue
    const o = v as Record<string, unknown>
    if (!sessioneValida(o.sessione) || viste.has(o.sessione)) continue
    if (typeof o.il !== 'string' || Number.isNaN(Date.parse(o.il))) continue
    viste.add(o.sessione)
    fuori.push({ sessione: o.sessione, il: o.il, ...(typeof o.titolo === 'string' && o.titolo !== '' ? { titolo: o.titolo.slice(0, 200) } : {}) })
  }
  return fuori
}

export function conArchiviata(elenco: readonly ChatArchiviata[], v: ChatArchiviata): ChatArchiviata[] {
  if (!sessioneValida(v.sessione)) return [...elenco]
  return [v, ...elenco.filter((x) => x.sessione !== v.sessione)]
}

export function senzaArchiviate(elenco: readonly ChatArchiviata[], sessioni: readonly string[]): ChatArchiviata[] {
  const via = new Set(sessioni)
  return elenco.filter((x) => !via.has(x.sessione))
}

/** Un elenco di chat senza le archiviate: lo stesso filtro per PC, pagina e app. */
export function nascondiArchiviate<T>(voci: readonly T[], archiviate: readonly ChatArchiviata[], sessioneDi: (v: T) => string | undefined): T[] {
  if (archiviate.length === 0) return [...voci]
  const set = new Set(archiviate.map((a) => a.sessione))
  return voci.filter((v) => { const s = sessioneDi(v); return s === undefined || !set.has(s) })
}

/* ------------------------------------------------------------------ */
/* Il recupero delle chat eliminate dal PC.                            */
/* ------------------------------------------------------------------ */

export type FileInRecupero = { parte: ParteSessione; relativo: string[]; dove: string; byte: number }

export type ChatInRecupero = {
  id: string
  sessione: string
  titolo: string
  slug: string
  cwd?: string
  quando: string
  scadeIl: string
  byte: number
  file: FileInRecupero[]
  /** Le voci tolte con la chat, per rimetterle al ripristino. */
  etichetta?: string
  archiviata?: ChatArchiviata
  /** «anche dal Drive»: la pulizia del Drive che ha tolto le sue copie lassù. */
  drive?: { pulizia: string; file: number; byte: number }
  /** Chi l'ha chiesto: il PC, il telefono, un altro PC. */
  da?: string
  ripristinataIl?: string
  svuotataIl?: string
}

export type RegistroRecuperoChat = { versione: 1; chat: ChatInRecupero[] }

export function recuperoVuoto(): RegistroRecuperoChat { return { versione: 1, chat: [] } }

export function leggiRecuperoChat(raw: unknown): RegistroRecuperoChat {
  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as { chat?: unknown }).chat)) return recuperoVuoto()
  const chat = (raw as { chat: unknown[] }).chat.filter((c): c is ChatInRecupero => {
    if (typeof c !== 'object' || c === null) return false
    const o = c as Record<string, unknown>
    return typeof o.id === 'string' && sessioneValida(o.sessione) && typeof o.quando === 'string' && typeof o.scadeIl === 'string' && Array.isArray(o.file) && typeof o.byte === 'number'
  })
  return { versione: 1, chat }
}

export function scadenzaRecupero(quando: string): string {
  return new Date(Date.parse(quando) + RECUPERO_CHAT_GIORNI * GIORNO_MS).toISOString()
}

/** Ancora nel recupero: né rimessa né svuotata. */
export function nelRecupero(c: ChatInRecupero): boolean {
  return c.ripristinataIl === undefined && c.svuotataIl === undefined
}

/** Quelle scadute: i loro file si cancellano davvero. */
export function scaduteRecupero(r: RegistroRecuperoChat, adesso: number): ChatInRecupero[] {
  return r.chat.filter((c) => nelRecupero(c) && Date.parse(c.scadeIl) <= adesso)
}

/** Quanti giorni mancano allo svuotamento da solo (almeno 0). */
export function giorniAllaScadenza(c: ChatInRecupero, adesso: number): number {
  return Math.max(0, Math.ceil((Date.parse(c.scadeIl) - adesso) / GIORNO_MS))
}

/**
 * Le voci da tenere nel registro. Le rimesse al loro posto si dimenticano
 * dopo 60 giorni; le svuotate restano (le ultime 2000): dicono all'arrivo dal
 * Drive che quella chat qui l'hai eliminata tu, e non deve tornare da sola.
 */
export function potaRecupero(r: RegistroRecuperoChat, adesso: number): RegistroRecuperoChat {
  const limite = adesso - 60 * GIORNO_MS
  const chat = r.chat.filter((c) => {
    if (c.ripristinataIl === undefined) return true
    const fine = Date.parse(c.ripristinataIl)
    return Number.isNaN(fine) || fine >= limite
  })
  return { versione: 1, chat: chat.slice(-2000) }
}

/* ------------------------------------------------------------------ */
/* «Svuota il recupero adesso»: la conferma forte.                     */
/* ------------------------------------------------------------------ */

/** L'impronta di cosa si svuota: un gettone vale solo per questo contenuto. */
export function improntaSvuota(chat: readonly ChatInRecupero[], ancheDalDrive: boolean): string {
  const ids = chat.filter(nelRecupero).map((c) => c.id).sort()
  return `${ancheDalDrive ? 'drive' : 'pc'}:${ids.join(',')}`
}

export type GettoneSvuota = { gettone: string; impronta: string; scadeIl: number }

/**
 * Il gettone presentato vale? Deve essere quello dato, non scaduto, per lo
 * stesso contenuto del recupero (se nel frattempo è entrata o uscita una
 * chat, si richiede), e con la frase giusta scritta.
 */
export function controllaGettone(
  dato: GettoneSvuota | undefined,
  p: { gettone: unknown; frase: unknown; impronta: string; adesso: number }
): { ok: true } | { ok: false; motivo: string } {
  if (dato === undefined) return { ok: false, motivo: 'Prima chiedi «Svuota il recupero adesso»: serve la conferma.' }
  if (typeof p.gettone !== 'string' || p.gettone !== dato.gettone) return { ok: false, motivo: 'Conferma non valida: richiedila.' }
  if (p.adesso > dato.scadeIl) return { ok: false, motivo: 'La conferma è scaduta (vale 2 minuti): richiedila.' }
  if (p.impronta !== dato.impronta) return { ok: false, motivo: 'Il recupero è cambiato dalla conferma: richiedila.' }
  if (typeof p.frase !== 'string' || p.frase.trim().toUpperCase() !== FRASE_SVUOTA) return { ok: false, motivo: `Per svuotare davvero scrivi ${FRASE_SVUOTA}.` }
  return { ok: true }
}

/* ------------------------------------------------------------------ */
/* Lo spazio delle chat.                                               */
/* ------------------------------------------------------------------ */

export type VoceSpazio = {
  sessione: string
  titolo: string
  cwd?: string
  slug: string
  byte: number
  /** Byte per parte: dove sta lo spazio. */
  parti: Partial<Record<ParteSessione, number>>
  ultimaAttivita?: string
  archiviata: boolean
  aperta: boolean
  /** Il perché non si elimina; assente = si può. */
  nonEliminabile?: string
}

export type VistaSpazio = {
  chat: VoceSpazio[]
  totale: number
  /** Quanto si libererebbe eliminando tutte quelle che si possono. */
  eliminabili: number
  recupero: { chat: number; byte: number }
}

/** La vista «Spazio delle chat»: dalla più grande, a parità la meno recente prima. */
export function ordinaPerSpazio(v: readonly VoceSpazio[]): VoceSpazio[] {
  return [...v].sort((a, b) => b.byte - a.byte || (a.ultimaAttivita ?? '').localeCompare(b.ultimaAttivita ?? '') || a.sessione.localeCompare(b.sessione))
}

export function vistaSpazio(voci: readonly VoceSpazio[], recupero: RegistroRecuperoChat): VistaSpazio {
  const chat = ordinaPerSpazio(voci)
  const nel = recupero.chat.filter(nelRecupero)
  return {
    chat,
    totale: chat.reduce((t, c) => t + c.byte, 0),
    eliminabili: chat.filter((c) => c.nonEliminabile === undefined).reduce((t, c) => t + c.byte, 0),
    recupero: { chat: nel.length, byte: nel.reduce((t, c) => t + c.byte, 0) }
  }
}

/** Più chat scelte insieme: quante, quanto spazio, quante si possono eliminare. */
export function totaleSelezione(voci: readonly VoceSpazio[], scelte: readonly string[]): { chat: number; byte: number; eliminabili: number; byteEliminabili: number; escluse: { sessione: string; motivo: string }[] } {
  const set = new Set(scelte)
  const sel = voci.filter((v) => set.has(v.sessione))
  const ok = sel.filter((v) => v.nonEliminabile === undefined)
  return {
    chat: sel.length,
    byte: sel.reduce((t, v) => t + v.byte, 0),
    eliminabili: ok.length,
    byteEliminabili: ok.reduce((t, v) => t + v.byte, 0),
    escluse: sel.filter((v) => v.nonEliminabile !== undefined).map((v) => ({ sessione: v.sessione, motivo: v.nonEliminabile as string }))
  }
}

/* ------------------------------------------------------------------ */
/* Le risposte delle azioni.                                           */
/* ------------------------------------------------------------------ */

export type EsitoChat = { sessione: string; ok: boolean; motivo?: string; byte?: number; id?: string }

export type EsitoAzioni = {
  azione: AzioneChat
  esiti: EsitoChat[]
  fatte: number
  rifiutate: number
  /** Elimina: i byte tolti dalle cartelle di Claude Code (ora nel recupero). */
  byte?: number
  messaggio: string
}

/** La riga che dice com'è andata, uguale ovunque. */
export function messaggioEsito(azione: AzioneChat, fatte: number, rifiutate: number, byte: number | undefined, byteLeggibili: (n: number) => string): string {
  const quante = (n: number): string => (n === 1 ? '1 chat' : `${n} chat`)
  const no = rifiutate > 0 ? ` ${quante(rifiutate)} no: guarda il motivo.` : ''
  if (fatte === 0) return rifiutate > 0 ? `Niente fatto: ${quante(rifiutate)} non si ${azione === 'elimina' ? 'possono eliminare' : 'possono toccare'} adesso.` : 'Niente da fare.'
  switch (azione) {
    case 'chiudi': return `${quante(fatte)} chiuse.${no}`
    case 'archivia': return `${quante(fatte)} archiviate: le trovi in «Archiviate».${no}`
    case 'ripristina': return `${quante(fatte)} di nuovo negli elenchi.${no}`
    case 'rinomina': return `Nome cambiato.${no}`
    case 'elimina': return `${quante(fatte)} eliminate dal PC: ${byteLeggibili(byte ?? 0)} tolti dalle chat. Per 30 giorni restano nel recupero; il disco si libera quando si svuota.${no}`
  }
}

/* ------------------------------------------------------------------ */
/* Lo stato di una chat, dai pezzi che il main conosce.                */
/* ------------------------------------------------------------------ */

/** Gli stati in cui un autopilota non guida più niente. */
const AUTOPILOTA_FERMO = new Set(['sospeso', 'finito', 'fallito'])

export type AutopilotaPerChat = {
  id: string
  nome: string
  stato: string
  archiviato?: boolean
  sessionId?: string
  sessioneSupervisore?: string
  chats: { sessionId?: string; sessioneSupervisore?: string }[]
}

/** L'autopilota che governa quella conversazione (la sua chat, una della flotta, o un suo supervisore). */
export function governataDa(autopiloti: readonly AutopilotaPerChat[], sessione: string): { autopilota: string; attivo: boolean } | undefined {
  const s = sessione.toLowerCase()
  const uguale = (x: string | undefined): boolean => x !== undefined && x.toLowerCase() === s
  let trovato: { autopilota: string; attivo: boolean } | undefined
  for (const a of autopiloti) {
    const sua = uguale(a.sessionId) || uguale(a.sessioneSupervisore) || a.chats.some((c) => uguale(c.sessionId) || uguale(c.sessioneSupervisore))
    if (!sua) continue
    const attivo = a.archiviato !== true && !AUTOPILOTA_FERMO.has(a.stato)
    // Se più autopiloti la conoscono, conta quello attivo.
    if (trovato === undefined || (attivo && !trovato.attivo)) trovato = { autopilota: a.nome, attivo }
  }
  return trovato
}

export type ChatApertaPerAzione = {
  sessione?: string
  titolo?: string
  viva?: boolean
  aspetta?: boolean
  chiede?: boolean
  chiedeSegnale?: boolean
  sceltaAperta?: boolean
  sottofondo?: { nome: string }
}

/**
 * Lo stato per le azioni, dai pezzi: le chat aperte qui, gli autopiloti, la
 * casa memorizzata, la cartella del progetto su un altro PC, il PIN.
 */
export function statoPerAzione(p: {
  sessione: string
  titolo?: string
  aperte: readonly ChatApertaPerAzione[]
  autopiloti: readonly AutopilotaPerChat[]
  /** La casa memorizzata della chat. */
  casa?: { pc: string; pcNome: string }
  io: string
  /** Il PC dove sta il progetto, se la cartella qui non c'è. */
  progettoAltrove?: string
  pinChiusa?: boolean
}): StatoPerAzione {
  const s = p.sessione.toLowerCase()
  const c = p.aperte.find((x) => x.sessione !== undefined && x.sessione.toLowerCase() === s)
  const chiede = c !== undefined && (c.chiede === true || c.chiedeSegnale === true || c.sceltaAperta === true)
  const lavora = c !== undefined && c.viva !== false && c.aspetta !== true && !chiede
  const gov = governataDa(p.autopiloti, p.sessione)
  const altroPc = p.casa !== undefined && p.casa.pc !== p.io ? p.casa.pcNome : p.progettoAltrove
  return {
    sessione: p.sessione,
    ...(p.titolo !== undefined ? { titolo: p.titolo } : c?.titolo !== undefined ? { titolo: c.titolo } : {}),
    ...(c !== undefined ? { aperta: { lavora, chiede, ...(c.sottofondo !== undefined ? { sottofondo: c.sottofondo.nome } : {}) } } : {}),
    ...(gov !== undefined ? { governata: gov } : {}),
    ...(altroPc !== undefined ? { altroPc } : {}),
    ...(p.pinChiusa === true ? { pinChiusa: true } : {})
  }
}
