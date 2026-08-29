import type { Autopilota } from '@shared/autopilota'

/**
 * Chi non chiude più un turno, **chat per chat**.
 *
 * Il guardiano c'era già, e guardava l'autopilota nel suo insieme: bastava che
 * *una* chat chiudesse i suoi turni perché tutte le altre risultassero vive.
 * Con una flotta è il caso normale — cinque chat su pezzi diversi, una si
 * impianta su un comando che non finisce — e quella restava appesa per sempre,
 * con il pannello che diceva «al lavoro» perché le sorelle rispondevano.
 *
 * Il silenzio si misura dall'ultimo **turno chiuso**, non dall'ultimo
 * salvataggio: quello si muove anche quando è il servizio a lavorare, e
 * misurerebbe la nostra attività invece della sua.
 */

export type ChatMuta = {
  /** Assente quando l'autopilota governa una chat sola: non c'è niente da nominare. */
  chatId?: string
  compito?: string
  /** Da quanti millisecondi non si sente niente. */
  da: number
}

/**
 * La chiave con cui si ricorda l'ultimo turno.
 *
 * Autopilota **e** chat: con la sola id dell'autopilota, il turno di una chat
 * teneva vive tutte le altre — che è esattamente il difetto.
 */
export function chiaveTurno(autopilotaId: string, chatId?: string): string {
  return chatId === undefined || chatId === '' ? autopilotaId : `${autopilotaId}::${chatId}`
}

export function chiTace(
  a: Autopilota,
  quandoHaParlato: (chiave: string) => number | undefined,
  ora: number,
  limite: number
): ChatMuta[] {
  const ripiego = Date.parse(a.ultimoEvento)
  /**
   * Dopo un riavvio del servizio la memoria è vuota: si ricade sull'ultimo
   * evento, che è una stima prudente — sbaglia al più una volta, e per eccesso
   * di pazienza.
   */
  const quando = (chiave: string): number => quandoHaParlato(chiave) ?? ripiego

  if (a.chats.length === 0) {
    const da = ora - quando(chiaveTurno(a.id))
    return da > limite ? [{ da }] : []
  }

  const mute: ChatMuta[] = []
  for (const chat of a.chats) {
    // Una chat finita ha smesso di parlare perché ha finito: contarla fra le
    // mute sospenderebbe le flotte proprio quando cominciano a concludere.
    if (chat.stato === 'finita') continue
    /**
     * Il ripiego a due passi: prima il turno di **questa** chat, poi quello
     * dell'autopilota. Il secondo serve alle flotte nate prima di questa
     * misura, che hanno segnato i turni sotto la sola id dell'autopilota:
     * senza, al primo giro dopo l'aggiornamento risulterebbero tutte mute.
     */
    const suo = quandoHaParlato(chiaveTurno(a.id, chat.id))
    const riferimento = suo ?? quando(chiaveTurno(a.id))
    const da = ora - riferimento
    if (da > limite) mute.push({ chatId: chat.id, compito: chat.compito, da })
  }
  return mute
}

/**
 * Il motivo che legge chi guarda il pannello.
 *
 * Dice **quale** chat tace e da quanto, e si ferma lì. Prima aggiungeva «forse
 * è ferma su un comando che non finisce»: è una delle due spiegazioni possibili
 * — l'altra è un turno lungo e vivo — presentata come se fosse la sola. Un
 * messaggio che indovina la causa manda a cercare il guasto dalla parte
 * sbagliata, e costa più del silenzio.
 */
export function motivoSilenzio(mute: ChatMuta[]): string {
  const minuti = (ms: number): number => Math.round(ms / 60_000)
  const coda =
    ' Può essere ferma su un comando che non finisce, o dentro un turno molto' +
    ' lungo: guarda com’è messa, poi riprendi o ferma.'
  const sola = mute.length === 1 ? mute[0] : undefined
  if (sola !== undefined && sola.chatId === undefined) {
    return `nessun segnale dalla chat da ${minuti(sola.da)} minuti.${coda}`
  }
  const elenco = mute
    .map((m) => `«${m.compito ?? m.chatId ?? '?'}» (${minuti(m.da)} min)`)
    .join(', ')
  return (
    `${mute.length === 1 ? 'una chat non dà segnali' : `${mute.length} chat non danno segnali`}: ` +
    `${elenco}.${coda}`
  )
}
