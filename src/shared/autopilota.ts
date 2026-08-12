/**
 * La versione della forma su disco. Va alzata solo insieme a una migrazione
 * scritta: uno stato di versione superiore viene rifiutato, non interpretato a
 * caso — potrebbe avere campi con lo stesso nome e significato diverso.
 */
export const VERSIONE_AUTOPILOTA = 1

/**
 * Gli stati di un autopilota.
 *
 * `intervista` precede tutti gli altri: l'utente ha descritto cosa vuole, e
 * l'autopilota sta capendo il resto — compresi i criteri di fine — facendo
 * domande. Finita l'intervista si configura da solo e passa a `lavoro`.
 */
export type StatoAutopilota =
  | 'intervista'
  | 'lavoro'
  | 'attesa'
  | 'sospeso'
  | 'finito'
  | 'fallito'

const STATI: StatoAutopilota[] = ['intervista', 'lavoro', 'attesa', 'sospeso', 'finito', 'fallito']

export type Criterio = {
  descrizione: string
  /** Il comando che lo verifica, quando esiste. Senza, lo giudica il supervisore. */
  comando?: string
  soddisfatto: boolean
}

export type Decisione = { quando: string; cosa: string }

/**
 * Una chat governata da un autopilota.
 *
 * Con `tettoChat` a 1 — il caso normale — ce n'è una sola e il `compito`
 * coincide con l'obiettivo. Oltre, ognuna porta avanti un pezzo diverso.
 */
export type ChatGovernata = {
  id: string
  compito: string
  stato: 'lavoro' | 'bloccata' | 'finita'
  cicli: number
  sessionId?: string
}

/** Oltre questo numero di chat contemporanee si ostacolano invece di aiutarsi. */
export const TETTO_CHAT_MAX = 8

/**
 * I freni dell'autopilota. Zero vuol dire «nessun freno», ed e' il predefinito
 * per i due tetti: un lavoro che procede non deve morire allo scadere di un
 * numero deciso da qualcun altro. Cio' che lo ferma davvero e' l'assenza di
 * progresso, e quella la riconosce lo stallo.
 */
export type Limiti = {
  /** Giri massimi. Zero: illimitati. */
  cicliMax: number
  /** Minuti massimi dall'avvio. Zero: illimitati. */
  minutiMax: number
  /**
   * Quante volte lo stesso criterio puo' fallire allo stesso modo prima che sia
   * stallo. Qui zero non ha senso e non e' ammesso: senza soglia non ci sarebbe
   * il momento in cui si cambia strada.
   */
  stalloMax: number
}

/** Una domanda dell'intervista e la risposta che ha ricevuto. */
export type ScambioSalvato = { domanda: string; risposta: string }

export type Autopilota = {
  id: string
  nome: string
  obiettivo: string
  cwd: string
  criteri: Criterio[]
  /** Le domande già fatte in intervista: sopravvivono a un riavvio del servizio. */
  intervista: ScambioSalvato[]
  stato: StatoAutopilota
  /** La sessione della chat governata, nota solo dopo il primo hook. */
  sessionId?: string
  cicli: number
  iniziatoIl: string
  ultimoEvento: string
  decisioni: Decisione[]
  /**
   * La strada che sta tentando per uscire da un cerchio, quando ci si trova
   * dentro. Assente e' il caso normale: sta semplicemente lavorando.
   */
  strategia?: string
  motivoSospensione?: string
  limiti: Limiti
  /** Quante chat può tenere aperte insieme. Uno è il caso normale. */
  tettoChat: number
  chats: ChatGovernata[]
  /** I pezzi di lavoro non ancora affidati a nessuna chat. */
  compitiDaFare: string[]
}

export function limitiPredefiniti(): Limiti {
  return { cicliMax: 0, minutiMax: 0, stalloMax: 3 }
}

export function nuovoAutopilota(p: {
  id: string
  nome: string
  obiettivo: string
  cwd: string
  criteri: Criterio[]
  iniziatoIl: string
  tettoChat?: number
  /** Senza criteri si parte in intervista: sarà lei a produrli. */
  stato?: StatoAutopilota
}): Autopilota {
  return {
    id: p.id,
    nome: p.nome,
    obiettivo: p.obiettivo,
    cwd: p.cwd,
    criteri: p.criteri,
    stato: p.stato ?? 'lavoro',
    cicli: 0,
    iniziatoIl: p.iniziatoIl,
    ultimoEvento: p.iniziatoIl,
    decisioni: [],
    intervista: [],
    limiti: limitiPredefiniti(),
    tettoChat: normalizzaTetto(p.tettoChat),
    chats: [],
    compitiDaFare: []
  }
}

/**
 * Riporta il tetto delle chat entro i limiti utili.
 *
 * Un valore assurdo torna a 1 invece di essere corretto a metà: è il caso
 * normale, e la scelta prudente quando non si capisce cosa l'utente volesse.
 */
function normalizzaTetto(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) return 1
  return Math.min(raw, TETTO_CHAT_MAX)
}

function parseChat(raw: unknown, scartati: string[]): ChatGovernata | undefined {
  if (typeof raw !== 'object' || raw === null) {
    scartati.push('chat governata non oggetto')
    return undefined
  }
  const o = raw as Record<string, unknown>
  const id = stringaNonVuota(o.id)
  if (id === undefined) {
    scartati.push('chat governata senza id')
    return undefined
  }
  const sessionId = stringaNonVuota(o.sessionId)
  // «lavoro» è la scelta prudente qui, al contrario che per l'autopilota: una
  // chat data per finita che invece è viva resterebbe dimenticata con il suo
  // processo acceso.
  const stato =
    o.stato === 'bloccata' || o.stato === 'finita' ? o.stato : 'lavoro'
  return {
    id,
    compito: stringaNonVuota(o.compito) ?? '',
    stato,
    cicli: typeof o.cicli === 'number' && o.cicli >= 0 ? Math.floor(o.cicli) : 0,
    ...(sessionId !== undefined ? { sessionId } : {})
  }
}

function stringaNonVuota(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw.trim() !== '' ? raw : undefined
}

function interoPositivo(raw: unknown): number | undefined {
  return typeof raw === 'number' && Number.isInteger(raw) && raw > 0 ? raw : undefined
}

function interoNonNegativo(raw: unknown): number | undefined {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 ? raw : undefined
}

function parseCriterio(raw: unknown, scartati: string[]): Criterio | undefined {
  if (typeof raw !== 'object' || raw === null) {
    scartati.push('criterio non oggetto')
    return undefined
  }
  const o = raw as Record<string, unknown>
  const descrizione = stringaNonVuota(o.descrizione)
  if (descrizione === undefined) {
    scartati.push('criterio senza descrizione')
    return undefined
  }
  const comando = stringaNonVuota(o.comando)
  return {
    descrizione,
    ...(comando !== undefined ? { comando } : {}),
    soddisfatto: o.soddisfatto === true
  }
}

/**
 * I limiti tornano interi ai predefiniti appena uno non regge.
 *
 * Non si corregge il singolo valore: questo file è modificabile a mano, ed è
 * l'unica strada per cui diventa incoerente. Un `cicliMax` negativo fermerebbe
 * l'autopilota al primo giro, e correggerne uno solo lascerebbe una terna che
 * nessuno ha scelto.
 */
function parseLimiti(raw: unknown): Limiti {
  const predefiniti = limitiPredefiniti()
  if (typeof raw !== 'object' || raw === null) return predefiniti
  const o = raw as Record<string, unknown>
  // I tetti ammettono lo zero — e' cosi' che si dice «nessun tetto» —, la
  // soglia di stallo no: a zero si cambierebbe strada prima ancora di provarne
  // una.
  const cicliMax = interoNonNegativo(o.cicliMax)
  const minutiMax = interoNonNegativo(o.minutiMax)
  const stalloMax = interoPositivo(o.stalloMax)
  if (cicliMax === undefined || minutiMax === undefined || stalloMax === undefined) {
    return predefiniti
  }
  return { cicliMax, minutiMax, stalloMax }
}

/**
 * Legge lo stato di un autopilota da un valore qualunque.
 *
 * Non solleva mai: restituisce `undefined` e l'elenco degli scarti, che il
 * chiamante porta in un log. Il vincolo globale è «scartato **e registrato**».
 */
export function parseAutopilota(raw: unknown): {
  autopilota: Autopilota | undefined
  scartati: string[]
} {
  const scartati: string[] = []

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    scartati.push('stato non e un oggetto')
    return { autopilota: undefined, scartati }
  }
  const o = raw as Record<string, unknown>

  if (typeof o.versione !== 'number' || o.versione > VERSIONE_AUTOPILOTA) {
    scartati.push(`versione non gestita: ${String(o.versione)} (attesa <= ${VERSIONE_AUTOPILOTA})`)
    return { autopilota: undefined, scartati }
  }

  const id = stringaNonVuota(o.id)
  const obiettivo = stringaNonVuota(o.obiettivo)
  const cwd = stringaNonVuota(o.cwd)
  for (const [nome, valore] of [['id', id], ['obiettivo', obiettivo], ['cwd', cwd]] as const) {
    if (valore === undefined) scartati.push(`campo ${nome} mancante o vuoto`)
  }
  if (id === undefined || obiettivo === undefined || cwd === undefined) {
    return { autopilota: undefined, scartati }
  }

  // Lo stato si legge prima dei criteri, perche' decide se possono mancare.
  let stato: StatoAutopilota = 'sospeso'
  if (typeof o.stato === 'string' && (STATI as string[]).includes(o.stato)) {
    stato = o.stato as StatoAutopilota
  } else {
    // Deliberatamente 'sospeso' e non 'lavoro': far ripartire da solo un
    // autopilota il cui stato non sappiamo leggere e' il modo piu' rapido per
    // avere un processo che lavora senza che nessuno sappia a che titolo.
    scartati.push(`stato sconosciuto (${String(o.stato)}), riportato a sospeso`)
  }

  const criteri: Criterio[] = []
  if (Array.isArray(o.criteri)) {
    for (const c of o.criteri) {
      const criterio = parseCriterio(c, scartati)
      if (criterio !== undefined) criteri.push(criterio)
    }
  } else if (o.criteri !== undefined) {
    scartati.push('criteri non e un elenco')
  }
  // I criteri servono a sapere quando fermarsi, quindi li esigono solo gli
  // stati che possono ancora lavorare. In intervista non esistono ancora — è
  // lei a produrli — e in un'intervista fallita non esisteranno mai: rifiutare
  // quel file lo farebbe **sparire dall'elenco**, e l'utente resterebbe senza
  // il suo autopilota e senza sapere perché.
  const STATI_CHE_LAVORANO: StatoAutopilota[] = ['lavoro', 'attesa']
  const senzaFine = criteri.length === 0 && STATI_CHE_LAVORANO.includes(stato)
  if (senzaFine) {
    // Fermato, non buttato. Rifiutare il file lo faceva mettere da parte come
    // illeggibile, e per l'utente l'autopilota **spariva** — senza traccia e
    // senza spiegazione. La protezione che serviva era non farlo lavorare, e si
    // ottiene tutta sospendendolo: così resta nell'elenco, con scritto perché.
    stato = 'sospeso'
    scartati.push('nessun criterio valido: senza criteri non c e una fine da raggiungere')
  }

  const sessionId = stringaNonVuota(o.sessionId)
  const motivoSospensione = senzaFine
    ? 'senza criteri non c e una fine da raggiungere: preparalo di nuovo o eliminalo'
    : stringaNonVuota(o.motivoSospensione)
  const iniziatoIl = stringaNonVuota(o.iniziatoIl) ?? new Date(0).toISOString()
  const ultimoEvento = stringaNonVuota(o.ultimoEvento) ?? iniziatoIl

  const decisioni: Decisione[] = []
  if (Array.isArray(o.decisioni)) {
    for (const d of o.decisioni) {
      if (typeof d !== 'object' || d === null) continue
      const dd = d as Record<string, unknown>
      const quando = stringaNonVuota(dd.quando)
      const cosa = stringaNonVuota(dd.cosa)
      if (quando !== undefined && cosa !== undefined) decisioni.push({ quando, cosa })
    }
  }

  const chats: ChatGovernata[] = []
  if (Array.isArray(o.chats)) {
    for (const c of o.chats) {
      const chat = parseChat(c, scartati)
      if (chat !== undefined) chats.push(chat)
    }
  }

  return {
    autopilota: {
      id,
      nome: stringaNonVuota(o.nome) ?? id,
      obiettivo,
      cwd,
      criteri,
      stato,
      ...(sessionId !== undefined ? { sessionId } : {}),
      cicli: typeof o.cicli === 'number' && o.cicli >= 0 ? Math.floor(o.cicli) : 0,
      iniziatoIl,
      ultimoEvento,
      decisioni,
      ...(stringaNonVuota(o.strategia) !== undefined ? { strategia: o.strategia as string } : {}),
      ...(motivoSospensione !== undefined ? { motivoSospensione } : {}),
      intervista: Array.isArray(o.intervista)
        ? o.intervista.flatMap((s) => {
            if (typeof s !== 'object' || s === null) return []
            const so = s as Record<string, unknown>
            const domanda = stringaNonVuota(so.domanda)
            const risposta = stringaNonVuota(so.risposta)
            return domanda !== undefined && risposta !== undefined ? [{ domanda, risposta }] : []
          })
        : [],
      limiti: parseLimiti(o.limiti),
      tettoChat: normalizzaTetto(o.tettoChat),
      chats,
      compitiDaFare: Array.isArray(o.compitiDaFare)
        ? o.compitiDaFare.filter((c): c is string => typeof c === 'string' && c.trim() !== '')
        : []
    },
    scartati
  }
}

/**
 * La porta del servizio autopilota.
 *
 * Fissa e non configurabile: la conoscono il programma e gli hook iniettati
 * nelle chat governate, e un valore che cambia lascerebbe fuori chi non se ne
 * accorge.
 */
export const PORTA_AUTOPILOTA = 47630
