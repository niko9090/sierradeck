import type { SessionSummary } from '@shared/types'

export type GruppoSessioni = {
  /** L'esecuzione più recente: è quella che si riapre premendo la voce. */
  principale: SessionSummary
  /** Tutte le esecuzioni, dalla più recente: servono a sceglierne una precisa. */
  sessioni: SessionSummary[]
  /** Come si chiama questa voce nell'elenco. */
  titolo: string
  /** Vero se il titolo viene dalla richiesta iniziale e non da Claude. */
  dalPrompt: boolean
  /** Quante esecuzioni compongono questa voce. */
  quante: number
  /** Vero quando la stessa cosa è stata rilanciata più volte. */
  ricorrente: boolean
  /** I messaggi di tutte le esecuzioni messi insieme. */
  messaggi: number
  /** La cartella in cui si è lavorato. */
  cartella: string
  /** La parte di cartella sotto il progetto, quando la chat girava più in basso. */
  sottocartella?: string
}

/** Oltre questa lunghezza una richiesta non è più un'etichetta ma un paragrafo. */
const TITOLO_MAX = 70

/**
 * Da quante cartelle di lavoro in giù una cartella è un contenitore.
 *
 * `Documents` non è un progetto: è il posto dove stanno i progetti. Il segno
 * che li distingue è quanti ne raccoglie — sui dati veri `Documents` ne
 * contiene sei e `progetto` uno solo, ed è quella differenza a dire che
 * la prima non deve inghiottire le altre mentre la seconda deve riprendersi la
 * propria sottocartella.
 */
const CONTENITORE = 3

function quando(s: SessionSummary): number {
  const t = Date.parse(s.lastTimestamp ?? '')
  return Number.isNaN(t) ? 0 : t
}

function cartellaDi(s: SessionSummary): string {
  return s.cwd ?? s.projectPath
}

/** Il confronto fra due richieste: maiuscole e spaziatura non fanno testo. */
function normalizza(testo: string): string {
  return testo.replace(/\s+/g, ' ').trim().toLowerCase()
}

function accorcia(testo: string): string {
  const pulito = testo.replace(/\s+/g, ' ').trim()
  if (pulito.length <= TITOLO_MAX) return pulito
  // Si taglia sull'ultimo spazio: una parola mozzata a metà si legge peggio di
  // una frase che finisce prima.
  const tagliato = pulito.slice(0, TITOLO_MAX - 1)
  const spazio = tagliato.lastIndexOf(' ')
  return `${(spazio > TITOLO_MAX / 2 ? tagliato.slice(0, spazio) : tagliato).trimEnd()}…`
}

/**
 * Raccoglie le sessioni in voci che corrispondano a qualcosa di reale.
 *
 * **Ogni `.jsonl` è una conversazione a sé.** Verificato sui dati veri di
 * questa macchina: 738 file, 738 identificatori diversi, nessuna catena di
 * messaggi condivisa fra due file. La regola di prima — «stesso progetto e
 * stesso titolo ⇒ la stessa chat ripresa più volte» — fondeva quindi
 * conversazioni distinte, e aprendo la voce se ne trovava una che non si stava
 * cercando. È il difetto dei «titoli misti».
 *
 * Quello che invece esiste davvero sono le **ripetizioni**: 693 file su 738
 * sono rilanci di 26 lavori automatici, ognuno avviato ogni volta con lo stesso
 * identico prompt. Quelle sono la stessa attività che gira di nuovo, e
 * nell'elenco valgono una riga sola con dentro le sue esecuzioni.
 *
 * Da qui la chiave: **cartella + titolo + richiesta iniziale**.
 *
 * - la richiesta iniziale distingue due chat che Claude ha battezzato uguale;
 * - il titolo distingue due lavori diversi partiti dallo stesso preambolo;
 * - la cartella distingue lo stesso lavoro fatto in due progetti.
 *
 * Le sessioni senza titolo — sei su dieci — prendono per nome la richiesta con
 * cui sono cominciate. Quelle che non hanno né l'uno né l'altra restano voci
 * separate: di loro non si sa niente, e accorparle sarebbe un accostamento
 * inventato.
 */
export function raggruppaSessioni(sessioni: SessionSummary[]): GruppoSessioni[] {
  const gruppi = new Map<string, SessionSummary[]>()

  for (const s of sessioni) {
    const titolo = s.aiTitle ?? ''
    const prompt = s.primoPrompt ?? ''
    // Senza titolo e senza richiesta non c'è niente su cui accorpare: l'uuid
    // tiene la sessione per sé.
    const firma = titolo === '' && prompt === '' ? s.uuid : `${normalizza(titolo)}|${normalizza(prompt)}`
    const chiave = `${cartellaDi(s).toLowerCase()}|${firma}`
    const esistenti = gruppi.get(chiave)
    if (esistenti === undefined) gruppi.set(chiave, [s])
    else esistenti.push(s)
  }

  const risultato: GruppoSessioni[] = []
  for (const membri of gruppi.values()) {
    const ordinati = [...membri].sort((a, b) => quando(b) - quando(a))
    const principale = ordinati[0]
    if (principale === undefined) continue
    const dalPrompt = principale.aiTitle === undefined && principale.primoPrompt !== undefined
    risultato.push({
      principale,
      sessioni: ordinati,
      titolo: principale.aiTitle ?? (principale.primoPrompt === undefined ? 'senza titolo' : accorcia(principale.primoPrompt)),
      dalPrompt,
      quante: ordinati.length,
      ricorrente: ordinati.length > 1,
      messaggi: ordinati.reduce((tot, s) => tot + s.messageCount, 0),
      cartella: cartellaDi(principale)
    })
  }

  return risultato.sort((a, b) => quando(b.principale) - quando(a.principale))
}

/**
 * Filtra per testo libero.
 *
 * Cerca nel titolo, nella cartella **e** nella richiesta iniziale: di una chat
 * senza titolo ci si ricorda ciò che si era chiesto, non altro.
 */
export function filtra(gruppi: GruppoSessioni[], testo: string): GruppoSessioni[] {
  const ago = normalizza(testo)
  if (ago === '') return gruppi
  return gruppi.filter((g) => {
    const campi = [g.titolo, g.cartella, g.principale.primoPrompt ?? '']
    return campi.some((c) => c.toLowerCase().includes(ago))
  })
}

/**
 * Quali sezioni nascono aperte.
 *
 * Sui dati veri una sola cartella di servizio contiene 313 conversazioni: aperta
 * insieme alle altre seppellisce tutto il resto, e la finestra si apre su una
 * cascata di righe in cui non si trova niente. Aprire invece dall'alto finché il
 * conto sta in piedi mostra il lavoro recente — che è quello che si cerca — e
 * lascia il resto a un clic di distanza.
 *
 * Il primo progetto è sempre aperto anche quando da solo sfora: è quello su cui
 * si stava lavorando, e una finestra tutta chiusa chiede un clic prima ancora
 * di poter guardare.
 */
export function apertiAllInizio(progetti: Progetto[], tetto: number): Set<string> {
  const aperti = new Set<string>()
  let righe = 0
  for (const p of progetti) {
    if (aperti.size > 0 && righe + p.chat.length > tetto) break
    aperti.add(p.percorso)
    righe += p.chat.length
  }
  return aperti
}

export type Progetto = {
  /** L'ultima parte del percorso: è il nome con cui l'utente chiama il lavoro. */
  nome: string
  /** Il percorso intero, che distingue due cartelle chiamate allo stesso modo. */
  percorso: string
  /** Le chat di questo progetto, dalla più recente. */
  chat: GruppoSessioni[]
}

function pezzi(percorso: string): string[] {
  return percorso.split(/[\\/]/).filter((x) => x.trim() !== '')
}

/**
 * Vero se `figlia` è una sottocartella **diretta** di `padre`.
 *
 * Il confronto è pezzo per pezzo del percorso e non sul testo, altrimenti
 * `progetto-vecchio` — che è un altro lavoro — finirebbe dentro
 * `progetto`.
 *
 * Un solo livello di distanza, e non «sta da qualche parte sotto»: visto sui
 * dati veri, una singola sessione girata in `C:\Users\utente` faceva diventare
 * quella la radice di 203 chat su 205, tutte sotto una sezione chiamata
 * «utente». Un progetto è una cartella di lavoro, non l'antenato comune di mezzo
 * disco; e ciò che sta due livelli più giù è quasi sempre un altro progetto che
 * si trova lì sotto per come è organizzato il disco, non per parentela.
 */
function staDentro(figlia: string, padre: string): boolean {
  const a = pezzi(figlia.toLowerCase())
  const b = pezzi(padre.toLowerCase())
  if (a.length !== b.length + 1) return false
  return b.every((p, i) => a[i] === p)
}

/**
 * Raccoglie le chat sotto il progetto a cui appartengono.
 *
 * Le chat non stanno per conto loro: fanno parte di un lavoro, e chi cerca una
 * conversazione parte da lì — «quella cosa del Progetto», non «la terza riga
 * dall'alto».
 *
 * **Le sottocartelle tornano al progetto.** Sui dati veri
 * `…\progetto\_analysis` è lavoro fatto dentro `progetto`: come
 * sezione a sé spezzava in due un progetto solo. Il confronto è pezzo per
 * pezzo del percorso e non sul testo, altrimenti `progetto-vecchio`
 * — che è un altro lavoro — finirebbe dentro `progetto`. Il pezzo in più
 * resta scritto accanto alla chat: è ciò che la distingue dalle altre.
 */
export function perProgetto(gruppi: GruppoSessioni[]): Progetto[] {
  const cartelle = [...new Set(gruppi.map((g) => g.cartella))]

  // Quante cartelle di lavoro ha ciascuna sotto di sé, una sola generazione.
  const figlie = new Map<string, number>()
  for (const c of cartelle) {
    for (const forse of cartelle) {
      if (staDentro(forse, c)) figlie.set(c, (figlie.get(c) ?? 0) + 1)
    }
  }

  const per = new Map<string, GruppoSessioni[]>()
  for (const g of gruppi) {
    // Il padre diretto, se è a sua volta una cartella in cui si è lavorato e
    // non è un contenitore. Un solo passo e non una risalita: risalendo, la
    // catena `_analysis → progetto → Documents → utente` finirebbe per
    // mettere tutto sotto la cartella dell'utente.
    const padre = cartelle.find((c) => staDentro(g.cartella, c))
    const radice = padre !== undefined && (figlie.get(padre) ?? 0) < CONTENITORE ? padre : g.cartella
    const sotto = pezzi(g.cartella).slice(pezzi(radice).length).join('\\')
    const voce = sotto === '' ? g : { ...g, sottocartella: sotto }
    const esistenti = per.get(radice)
    if (esistenti === undefined) per.set(radice, [voce])
    else esistenti.push(voce)
  }

  const ultimoTocco = (p: Progetto): number => {
    const prima = p.chat[0]
    return prima === undefined ? 0 : quando(prima.principale)
  }

  return [...per.entries()]
    .map(([percorso, chat]) => ({
      nome: pezzi(percorso).at(-1) ?? percorso,
      percorso,
      chat: [...chat].sort((a, b) => quando(b.principale) - quando(a.principale))
    }))
    // Per primo il progetto toccato più di recente: è quello su cui si stava
    // lavorando, ed è quasi sempre quello che si vuole riaprire.
    .sort((a, b) => ultimoTocco(b) - ultimoTocco(a))
}
