/**
 * Aggiornare senza buttare via il lavoro in corso.
 *
 * Un aggiornamento **non è una chiusura per fine lavori**: è la stessa
 * scrivania, con sopra le stesse cose, che si spegne e si riaccende cinque
 * minuti dopo. Chi la stava usando deve ritrovarla com'era.
 *
 * Fino a ieri non era così. Premere «Installa» chiudeva il PTY host e con lui
 * ogni `claude.exe`, dovunque fosse arrivato: a metà di una risposta, a metà di
 * una compilazione, a metà di una pubblicazione. Il danno peggiore non era il
 * testo perduto — quello è sul disco e si riprende — ma **l'azione lasciata a
 * metà nel mondo**, che nessun riavvio rimette a posto.
 *
 * La soluzione non è aspettare che il lavoro finisca: un mandato dura ore, e
 * aspettarlo vorrebbe dire non aggiornare mai proprio le macchine che lavorano
 * di più. È aspettare che **non ci sia niente in volo**, che è una cosa
 * diversa e arriva di continuo: un turno dura minuti, e alla sua fine quello
 * che c'era da fare è stato fatto e quello che c'era da scrivere è scritto.
 *
 * Quindi: si avvisa, si aspetta il punto d'appoggio, si installa, e al ritorno
 * si riprende da soli. Nessuna domanda a nessuno — chi ha interrotto un lavoro
 * ha il dovere di rimetterlo in moto, non di chiedere il permesso di farlo.
 */

/** Quel poco che serve sapere di una chat per decidere se aspettarla. */
export type ChatInVolo = {
  id: string
  titolo?: string
  sessione?: string
  /** Ha finito di scrivere e aspetta te: allora non ha niente in mano. */
  aspetta?: boolean
  /** Ha un terminale acceso. Senza, non c'è nulla da finire né a cui scrivere. */
  viva?: boolean
  /** La governa un autopilota: a fermarla ci pensa il servizio, non noi. */
  governata?: boolean
}

/**
 * Chi ha qualcosa in mano adesso.
 *
 * Due condizioni. **Un terminale acceso**: un riquadro ibernato, o appena
 * aperto e ancora senza processo, non sta facendo niente — aspettarlo
 * significherebbe aspettare per sempre qualcosa che non è mai cominciato.
 * **E non sta aspettando te**: `aspetta` è vero quando il prompt si è visto e
 * poi è sceso il silenzio, ed è lo stesso giudizio con cui l'autopilota decide
 * quando può parlare a una chat. Se è vero, il turno è chiuso.
 */
export function inVolo(chats: ChatInVolo[]): ChatInVolo[] {
  return chats.filter((c) => c.viva === true && c.aspetta !== true)
}

/** Se si può installare adesso senza interrompere niente. */
export function siPuoInstallare(chats: ChatInVolo[]): boolean {
  return inVolo(chats).length === 0
}

/**
 * Quanto si aspetta prima di arrendersi.
 *
 * Non è il tempo di un lavoro: è il tempo di **un'azione**. Un turno lungo —
 * una compilazione, una pubblicazione con tre caricamenti — sta dentro i
 * dieci minuti; un mandato di sei ore non c'entra, perché non lo stiamo
 * aspettando.
 *
 * Scaduto, non si installa di nascosto: si torna indietro, si tolgono le chat
 * dalla pausa e lo si dice. Un aggiornamento rimandato costa un giorno; un
 * aggiornamento che interrompe una pubblicazione a metà costa molto di più.
 */
export const ATTESA_QUIETE_MS = 10 * 60_000

/** Ogni quanto si torna a guardare se sono ferme. */
export const CONTROLLO_QUIETE_MS = 2000

/**
 * Quello che si scrive dentro una chat prima di aggiornare.
 *
 * Non «fermati»: **«finisci quello che hai in mano, poi fermati»**. La
 * differenza è tutta qui — un'azione interrotta a metà è il danno che stiamo
 * cercando di evitare, e chiederle di smettere adesso lo farebbe da capo, solo
 * più educatamente.
 *
 * E le si chiede di **annotare dove è arrivata**. È la parte che il programma
 * non può fare al posto suo: SierraDeck sa rimettere in piedi le finestre, le
 * cartelle e le conversazioni, ma cosa stesse facendo e perché lo sa soltanto
 * lei. Due righe scritte adesso valgono più di qualunque cosa possiamo salvare
 * noi.
 */
export const AVVISO_PAUSA = [
  'SierraDeck sta per installare un aggiornamento e si riavvierà fra poco.',
  '',
  'Non è la fine del lavoro: è solo un riavvio, e fra qualche minuto torni qui',
  'dentro con questa stessa conversazione.',
  '',
  'Porta a termine l’azione che hai in mano adesso — non lasciarla a metà —',
  'salva quello che c’è da salvare, e scrivi in due righe a che punto sei',
  'arrivato e qual è la prossima cosa da fare. Poi fermati e non cominciare',
  'niente di nuovo: al ritorno riprenderai da lì.'
].join('\n')

/**
 * Quello che si scrive dentro una chat **non governata** quando si torna.
 *
 * Le chat di un autopilota le rimette in moto il servizio, che sa cosa stavano
 * facendo. Queste no: è una conversazione tua, e l'unica cosa vera che si può
 * dire è che l'interruzione è finita. Il resto lo ha già scritto lei, un
 * momento prima di fermarsi.
 */
export const AVVISO_RIPRESA = [
  'Il riavvio è finito: SierraDeck è tornato su con la versione nuova.',
  '',
  'Ti eri fermato per farmi aggiornare, non perché il lavoro fosse finito.',
  'Guarda qui sopra a che punto eri arrivato e riprendi da lì: non ricominciare',
  'da capo e non rifare quello che risulta già fatto.'
].join('\n')

/**
 * Le chat da rimettere in moto al ritorno.
 *
 * **Va scritto su disco prima di uscire**, e non è un dettaglio: fra il
 * momento in cui si sa chi era a metà e il momento in cui lo si può avvisare
 * c'è di mezzo la morte del processo. Tenuto in memoria, questo elenco muore
 * con chi lo tiene — che è l'inciampo più frequente di tutta questa
 * architettura — e al ritorno nessuno saprebbe più chi era stato fermato.
 *
 * Solo le **non governate**: quelle di un autopilota le riprende il servizio,
 * che sopravvive a noi e sa molto meglio di noi cosa stavano facendo.
 */
export type PausaSalvata = {
  quando: string
  versione?: string
  /** Le sessioni delle chat che erano a metà di un turno. */
  sessioni: string[]
}

export function pausaDaSalvare(chats: ChatInVolo[], versione?: string, quando = new Date().toISOString()): PausaSalvata {
  const sessioni = inVolo(chats)
    .filter((c) => c.governata !== true)
    .map((c) => c.sessione)
    .filter((s): s is string => typeof s === 'string' && s !== '')
  return { quando, ...(versione !== undefined ? { versione } : {}), sessioni }
}

/**
 * Legge l'elenco senza mai sollevare.
 *
 * Il file lo abbiamo scritto noi, ma lo rilegge un programma **diverso** — la
 * versione nuova, appena installata — e in mezzo c'è stato un aggiornamento.
 * Trattarlo come sicuro significherebbe che un giorno un file di una versione
 * vecchia impedisce l'avvio di quella nuova, cioè che l'aggiornamento rompe il
 * programma nel momento esatto in cui doveva ripararlo.
 */
export function leggiPausa(raw: unknown): PausaSalvata | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const o = raw as Record<string, unknown>
  const sessioni = Array.isArray(o.sessioni)
    ? o.sessioni.filter((s): s is string => typeof s === 'string' && s !== '')
    : []
  if (sessioni.length === 0) return undefined
  return {
    quando: typeof o.quando === 'string' ? o.quando : '',
    ...(typeof o.versione === 'string' ? { versione: o.versione } : {}),
    sessioni
  }
}

/**
 * Quanto è vecchio l'elenco oltre il quale non lo si usa più.
 *
 * Un'installazione che non è mai andata a buon fine lascia il file lì. Trovarlo
 * tre giorni dopo e scrivere «riprendi da dove eri» dentro chat che nel
 * frattempo hanno fatto altro sarebbe peggio che non dire niente.
 */
export const PAUSA_SCADUTA_MS = 6 * 60 * 60_000

export function pausaAncoraValida(p: PausaSalvata, adesso = Date.now()): boolean {
  const quando = Date.parse(p.quando)
  if (Number.isNaN(quando)) return false
  return adesso - quando < PAUSA_SCADUTA_MS
}

/**
 * Aspetta che nessuna chat abbia niente in mano, e dice se si può installare.
 *
 * Nell'ordine, e l'ordine conta:
 *
 * 1. **Si mettono in pausa gli autopiloti.** Non si fermano adesso: da questo
 *    momento, alla fine del turno che hanno in mano, il servizio non dirà loro
 *    di proseguire. Prima di avvisare le chat, o una chat avvisata finirebbe
 *    il turno e l'autopilota le darebbe subito il compito successivo — e si
 *    ricomincerebbe ad aspettare da capo, per sempre.
 * 2. **Si avvisa ogni chat che sta lavorando**, una volta sola. Ripetere
 *    l'avviso a ogni giro sarebbe assillare qualcuno che sta già facendo
 *    quello che gli hai chiesto.
 * 3. **Si aspetta guardando**, non contando: la quiete la dichiara il
 *    terminale, non l'orologio.
 * 4. **Si annota chi era a metà**, perché al ritorno vada rimesso in moto.
 *
 * Se la quiete non arriva si torna indietro davvero — gli autopiloti escono
 * dalla pausa — e non si installa. Lasciarli fermi ad aspettare un riavvio che
 * non arriva sarebbe il peggiore dei due errori.
 */
export async function attendiQuiete(p: {
  chat: () => ChatInVolo[]
  pausaAutopiloti: (attiva: boolean) => Promise<number>
  scriviInChat: (idChat: string, testo: string) => void
  annota: (pausa: PausaSalvata) => void
  avvisa: (chatOccupate: number) => void
  versione?: string
  adesso?: () => number
  aspetta?: (ms: number) => Promise<void>
}): Promise<boolean> {
  const adesso = p.adesso ?? ((): number => Date.now())
  const aspetta = p.aspetta ?? ((ms: number): Promise<void> => new Promise((r) => { setTimeout(r, ms) }))
  const allInizio = inVolo(p.chat())

  try {
    await p.pausaAutopiloti(true)
  } catch (err) {
    // Senza servizio non c'è nessun autopilota da mettere in pausa: si va
    // avanti ad aspettare le chat, che è comunque la parte che conta.
    console.warn('[aggiornamenti] autopiloti non messi in pausa:', err)
  }

  const avvisate = new Set<string>()
  const avvisaLeOccupate = (): void => {
    for (const c of inVolo(p.chat())) {
      if (avvisate.has(c.id)) continue
      avvisate.add(c.id)
      p.scriviInChat(c.id, AVVISO_PAUSA)
    }
  }
  avvisaLeOccupate()

  const scade = adesso() + ATTESA_QUIETE_MS
  while (adesso() < scade) {
    const restano = inVolo(p.chat())
    if (restano.length === 0) {
      p.annota(pausaDaSalvare(allInizio, p.versione))
      return true
    }
    p.avvisa(restano.length)
    avvisaLeOccupate()
    await aspetta(CONTROLLO_QUIETE_MS)
  }

  console.warn(
    `[aggiornamenti] non installo: ${inVolo(p.chat()).length} chat hanno ancora qualcosa in mano`
  )
  try {
    await p.pausaAutopiloti(false)
  } catch (err) {
    console.error('[aggiornamenti] autopiloti non tolti dalla pausa:', err)
  }
  return false
}
