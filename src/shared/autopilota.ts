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
  | 'pronto'
  | 'lavoro'
  | 'attesa'
  | 'sospeso'
  | 'finito'
  | 'fallito'

const STATI: StatoAutopilota[] = [
  'intervista', 'pronto', 'lavoro', 'attesa', 'sospeso', 'finito', 'fallito'
]

/** Com'è andata l'ultima volta che si è provato a misurare un criterio. */
export type Verifica = {
  quando: string
  /** Zero è passato. Qualunque altro numero è il codice con cui il comando è uscito. */
  codice: number
  /** Quello che ha stampato, tagliato: serve a capire, non ad archiviare. */
  uscita: string
}

export type Criterio = {
  descrizione: string
  /** Il comando che lo verifica, quando esiste. Senza, lo giudica il supervisore. */
  comando?: string
  soddisfatto: boolean
  /**
   * Quando e' stato raggiunto, se lo e'.
   *
   * «Puntare quelli che riesce a raggiungere» vuol dire vedere **quando**: una
   * spunta senza data non dice se e' successo adesso o tre ore fa, e con un
   * lavoro che dura una notte e' la differenza fra «sta procedendo» e «e'
   * fermo da stamattina».
   */
  raggiuntoIl?: string
  /**
   * L'esito dell'ultima misura, per poterlo mostrare accanto al criterio.
   *
   * È la riga che spiega cosa sia un criterio senza doverlo definire: sotto «i
   * test passano tutti» si legge `npm test` e come è finita l'ultima volta.
   * Prima l'uscita dei comandi viveva solo dentro il giro che la produceva, e
   * dall'esterno restava una spunta senza storia.
   */
  ultimaVerifica?: Verifica
}

/** Obiettivo, criteri e compiti com'erano prima di una modifica. */
export type Istantanea = {
  obiettivo: string
  criteri: Criterio[]
  compitiDaFare: string[]
}

/**
 * Una modifica chiesta a parole, e cosa ne è stato fatto.
 *
 * Si applica subito — è la scelta di chi la usa: un passaggio in meno vale più
 * di una conferma — e proprio per questo porta con sé la fotografia di prima.
 * Senza `prima`, «applica subito» sarebbe una porta a senso unico, e un
 * fraintendimento costerebbe di rifare tutto a mano.
 */
export type Modifica = {
  quando: string
  /** Quello che hai scritto tu, parola per parola. */
  testo: string
  /** Come l'ha capito, scritto per essere letto: è la parte che insegna. */
  capito: string
  prima: Istantanea
}

/** Oltre queste, le più vecchie si dimenticano: il file non deve crescere per sempre. */
export const MODIFICHE_RICORDATE = 10

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
  /**
   * La sessione del supervisore **di questa chat**.
   *
   * Il supervisore e' uno per chat (scelta di Nicholas, 2026-09-05): ognuno
   * segue il suo compito dall'inizio e non vede i turni delle sorelle come
   * salti. Prima era una sola sull'autopilota, e due chat della stessa flotta
   * che si fermavano insieme se la scrivevano a vicenda: l'ultima vinceva e
   * la conversazione dell'altra restava orfana.
   */
  sessioneSupervisore?: string
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
  /**
   * L'obiettivo come lo capisce lui: riscritto dalla preparazione, piu' preciso.
   *
   * E' questo che finisce nei prompt, ed e' giusto che sia il suo. Ma non e'
   * quello che hai chiesto tu — vedi `obiettivoTuo`.
   */
  obiettivo: string
  /**
   * Le tue parole, come le hai scritte, e che nessuno riscrive mai.
   *
   * La preparazione riformula l'obiettivo con parole sue: piu' precise, e
   * **sue**. Quello che avevi scritto tu spariva, e con lui l'unico modo di
   * giudicare se aveva capito bene o se stava andando a fare un'altra cosa.
   * Assente per gli autopiloti nati prima di questo campo.
   */
  obiettivoTuo?: string
  cwd: string
  /**
   * Il workspace dove il suo lavoro deve comparire.
   *
   * Lo decide lui, alla nascita: è il workspace da cui l'utente lo ha avviato.
   * Prima si deduceva cercando la sua sessione in `workspaces.json` — che
   * funziona per una chat **ripresa** e mai per una che deve **nascere**: quella
   * sessione lì dentro non c'è ancora, la ricerca torna a vuoto, e la chat
   * compare nel workspace che hai davanti invece che nel suo.
   *
   * Assente per gli autopiloti nati prima di questo campo: la loro chat nasce
   * dove sei, come faceva prima.
   */
  workspace?: string
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
  /**
   * La sessione del supervisore, che si riusa giro dopo giro.
   *
   * E' cio' che gli fa ricordare il lavoro invece di ricostruirlo da capo a
   * ogni fermata: la differenza fra chi segue il compito e chi lo vede per la
   * prima volta ogni volta.
   */
  sessioneSupervisore?: string
  /**
   * La sessione con cui si sta preparando, decisa **prima** di aprirla.
   *
   * La preparazione dura minuti in cui l'autopilota legge il progetto, e senza
   * questo id non c'è niente da guardare: la sua conversazione esiste, ma il
   * suo nome si conoscerebbe solo alla fine. Deciderlo alla nascita la rende
   * visibile dal primo istante — è la stessa cosa che fanno le chat governate.
   */
  sessioneIntervista?: string
  motivoSospensione?: string
  limiti: Limiti
  /**
   * Se riprendere **questo** autopilota quando il servizio torna su.
   *
   * Per autopilota e non per programma: uno che lavora tutta la notte deve
   * ripartire da solo dopo un riavvio, un altro che stava provando qualcosa
   * no. Assente vale «sì», che era il comportamento di prima e resta quello
   * che ci si aspetta.
   */
  riprendiAlRiavvio?: boolean
  /**
   * Fermato da noi per installare un aggiornamento.
   *
   * **Non e' una sospensione**, ed e' tutta la differenza: chi risulta
   * `sospeso` non viene ripreso di proposito, perche' dietro c'e' la decisione
   * di qualcuno e riprenderlo la disferebbe. Qui la decisione e' nostra, e non
   * riguarda il lavoro: riguarda il fatto che stiamo per chiudere il
   * programma. Un aggiornamento non e' una chiusura per fine lavori, quindi
   * chi si e' fermato per questo **deve** ripartire da solo al ritorno, senza
   * chiedere niente a nessuno.
   *
   * Vale anche sopra `riprendiAlRiavvio: false`: quell'interruttore serve a non
   * far resuscitare un autopilota dopo un riavvio del computer, non a lasciare
   * per strada un lavoro che siamo stati **noi** a interrompere.
   */
  fermatoPerAggiornamento?: boolean
  /** Quante chat può tenere aperte insieme. Uno è il caso normale. */
  tettoChat: number
  chats: ChatGovernata[]
  /** I pezzi di lavoro non ancora affidati a nessuna chat. */
  compitiDaFare: string[]
  /** Le ultime modifiche dette a parole, con com'era prima di ognuna. */
  modifiche: Modifica[]
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
  /** Il workspace da cui è stato avviato: è lì che il suo lavoro deve andare. */
  workspace?: string
  /** Senza criteri si parte in intervista: sarà lei a produrli. */
  stato?: StatoAutopilota
}): Autopilota {
  return {
    id: p.id,
    nome: p.nome,
    obiettivo: p.obiettivo,
    // Le tue parole si mettono da parte **adesso**: dopo la preparazione non
    // esistono piu' da nessuna parte.
    obiettivoTuo: p.obiettivo,
    cwd: p.cwd,
    ...(p.workspace !== undefined && p.workspace.trim() !== '' ? { workspace: p.workspace } : {}),
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
    compitiDaFare: [],
    modifiche: []
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
  const sessioneSupervisore = stringaNonVuota(o.sessioneSupervisore)
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
    ...(sessionId !== undefined ? { sessionId } : {}),
    ...(sessioneSupervisore !== undefined ? { sessioneSupervisore } : {})
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
    soddisfatto: o.soddisfatto === true,
    ...(stringaNonVuota(o.raggiuntoIl) !== undefined
      ? { raggiuntoIl: o.raggiuntoIl as string }
      : {}),
    // Una verifica illeggibile sparisce da sola: e' un di piu' che serve a
    // raccontare, e portarsi via il criterio per colpa sua sarebbe togliere
    // all'autopilota un pezzo della sua fine.
    ...(parseVerifica(o.ultimaVerifica) !== undefined
      ? { ultimaVerifica: parseVerifica(o.ultimaVerifica) as Verifica }
      : {})
  }
}

function parseVerifica(raw: unknown): Verifica | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const o = raw as Record<string, unknown>
  const quando = stringaNonVuota(o.quando)
  if (quando === undefined || typeof o.codice !== 'number' || !Number.isFinite(o.codice)) {
    return undefined
  }
  return {
    quando,
    codice: Math.trunc(o.codice),
    uscita: typeof o.uscita === 'string' ? o.uscita : ''
  }
}

function parseModifica(raw: unknown): Modifica | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const o = raw as Record<string, unknown>
  const quando = stringaNonVuota(o.quando)
  const testo = stringaNonVuota(o.testo)
  const capito = stringaNonVuota(o.capito)
  const prima = o.prima
  // Senza la fotografia di prima la modifica non si potrebbe disfare, e una
  // riga con un tasto che non funziona e' peggio della riga mancante.
  if (quando === undefined || testo === undefined || capito === undefined) return undefined
  if (typeof prima !== 'object' || prima === null) return undefined
  const p = prima as Record<string, unknown>
  const obiettivo = stringaNonVuota(p.obiettivo)
  if (obiettivo === undefined) return undefined
  const criteri: Criterio[] = []
  if (Array.isArray(p.criteri)) {
    for (const c of p.criteri) {
      const criterio = parseCriterio(c, [])
      if (criterio !== undefined) criteri.push(criterio)
    }
  }
  return {
    quando,
    testo,
    capito,
    prima: {
      obiettivo,
      criteri,
      compitiDaFare: Array.isArray(p.compitiDaFare)
        ? p.compitiDaFare.filter((c): c is string => typeof c === 'string' && c.trim() !== '')
        : []
    }
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
  // «pronto» è fra questi: è lo stato di chi sta per partire, e partire senza
  // una fine da raggiungere è precisamente ciò da cui questo controllo difende.
  const STATI_CHE_LAVORANO: StatoAutopilota[] = ['pronto', 'lavoro', 'attesa']
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
      ...(stringaNonVuota(o.obiettivoTuo) !== undefined
        ? { obiettivoTuo: o.obiettivoTuo as string }
        : {}),
      cwd,
      // Il workspace sopravvive a un riavvio del servizio: senza, un autopilota
      // ripreso tornerebbe a far nascere le sue chat dove capita.
      ...(stringaNonVuota(o.workspace) !== undefined ? { workspace: o.workspace as string } : {}),
      criteri,
      stato,
      ...(sessionId !== undefined ? { sessionId } : {}),
      cicli: typeof o.cicli === 'number' && o.cicli >= 0 ? Math.floor(o.cicli) : 0,
      iniziatoIl,
      ultimoEvento,
      decisioni,
      ...(stringaNonVuota(o.strategia) !== undefined ? { strategia: o.strategia as string } : {}),
      ...(typeof o.riprendiAlRiavvio === 'boolean' ? { riprendiAlRiavvio: o.riprendiAlRiavvio } : {}),
      ...(o.fermatoPerAggiornamento === true ? { fermatoPerAggiornamento: true } : {}),
      ...(stringaNonVuota(o.sessioneSupervisore) !== undefined
        ? { sessioneSupervisore: o.sessioneSupervisore as string }
        : {}),
      ...(stringaNonVuota(o.sessioneIntervista) !== undefined
        ? { sessioneIntervista: o.sessioneIntervista as string }
        : {}),
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
        : [],
      modifiche: Array.isArray(o.modifiche)
        ? o.modifiche
            .flatMap((m) => {
              const modifica = parseModifica(m)
              return modifica !== undefined ? [modifica] : []
            })
            .slice(-MODIFICHE_RICORDATE)
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

/**
 * La porta su cui il servizio autopiloti ascolta davvero.
 *
 * Il servizio è un **processo a parte**: non vede le preferenze dell'utente, e
 * finché si limitava a importare la costante qui sopra l'impostazione «Porta
 * degli autopiloti» era un campo che si poteva cambiare senza che cambiasse
 * niente. Il Gestore gliela passa nell'ambiente quando lo avvia, e questa
 * funzione è l'unico posto che la legge — di qua e di là, così i due processi
 * non possono divergere.
 *
 * Un valore assente o assurdo non ferma il servizio: si torna al predefinito.
 * Un autopilota che non parte perché qualcuno ha scritto «ottomila» in un campo
 * sarebbe un prezzo sproporzionato, e il Gestore cerca comunque qui.
 */
export const AMBIENTE_PORTA_AUTOPILOTI = 'SIERRADECK_PORTA_AUTOPILOTI'

export function portaAutopilotiDa(ambiente: Record<string, string | undefined>): number {
  const grezzo = ambiente[AMBIENTE_PORTA_AUTOPILOTI]
  if (grezzo === undefined) return PORTA_AUTOPILOTA
  const n = Number(grezzo)
  return Number.isInteger(n) && n >= 1024 && n <= 65535 ? n : PORTA_AUTOPILOTA
}
