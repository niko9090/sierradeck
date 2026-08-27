export type StatoChat = {
  id: string
  /** Il pezzo di lavoro affidato a questa chat. */
  compito: string
  stato: 'lavoro' | 'bloccata' | 'finita'
  cicli: number
}

export type PianoFlotta = {
  /** I compiti per cui aprire una chat adesso. */
  daAprire: string[]
  /** Le chat che hanno finito e vanno chiuse. */
  daChiudere: string[]
  /** Vero quando non resta niente da fare né da aspettare. */
  concluso: boolean
}

/**
 * Le chat che stanno davvero lavorando.
 *
 * Una chat `bloccata` — ferma in attesa di una risposta — **non** conta come
 * attiva: se contasse, un solo bivio in sospeso terrebbe in ostaggio tutti gli
 * altri compiti, occupando un posto senza usarlo.
 */
export function chiatteAttive(chats: StatoChat[]): StatoChat[] {
  return chats.filter((c) => c.stato === 'lavoro')
}

/**
 * Decide quante chat aprire e quali chiudere.
 *
 * Il tetto sulle chat contemporanee non è prudenza generica: ogni chat è un
 * `claude.exe` che consuma, e più chat sulla stessa cartella si pestano i piedi
 * sugli stessi file. Meglio tre che lavorano davvero che sei che si annullano.
 *
 * Funzione pura: la decisione su quanto lavoro parallelo aprire è esattamente
 * ciò che va potuto provare senza avviare nessun processo.
 */
export function pianificaFlotta(p: {
  chats: StatoChat[]
  compitiDaFare: string[]
  tetto: number
}): PianoFlotta {
  const attive = chiatteAttive(p.chats)
  const posti = Math.max(0, p.tetto - attive.length)

  return {
    daAprire: p.compitiDaFare.slice(0, posti),
    daChiudere: p.chats.filter((c) => c.stato === 'finita').map((c) => c.id),
    // Concluso solo quando nessuna chat lavora o aspetta **e** non restano
    // compiti in coda: dichiararlo prima chiuderebbe un lavoro a metà.
    concluso:
      p.compitiDaFare.length === 0 && p.chats.every((c) => c.stato === 'finita')
  }
}

/**
 * Quante volte un compito è già stato tentato.
 *
 * Le chat non si tolgono mai dall'elenco — nemmeno quando finiscono — quindi
 * l'elenco *è* la storia dei tentativi, e non serve un campo nuovo su disco per
 * contarli.
 */
export function tentativiDi(chats: StatoChat[], compito: string): number {
  return chats.filter((c) => c.compito === compito).length
}

/**
 * Oltre questo, un compito che non riesce ad avviarsi non si ritenta.
 *
 * Non è prudenza generica: se la causa è stabile — claude.exe che non parte, una
 * cartella sparita — ritentare all'infinito aprirebbe una chat al secondo, per
 * sempre, senza che niente lo dica.
 */
export const TENTATIVI_AVVIO_MAX = 3

export type DopoFallimento = {
  chats: StatoChat[]
  compitiDaFare: string[]
  /** Vero quando il compito è stato abbandonato invece che rimesso in coda. */
  abbandonato: boolean
}

/**
 * Rimette a posto la flotta quando l'avvio di una chat **fallisce**.
 *
 * È il difetto per cui i compiti sparivano. `apriChatMancanti` toglie i compiti
 * dalla coda e registra le chat **prima** di avviare i processi — ed è la scelta
 * giusta, perché una chat viva e non registrata resterebbe orfana per sempre.
 * Ma se poi l'avvio falliva, il `catch` si limitava a scriverlo nel log: il
 * compito era già uscito dalla coda, e restava una chat in stato `lavoro` che
 * non girava e non sarebbe mai girata.
 *
 * Il danno peggiore non era il compito perduto ma **il posto occupato**:
 * `chiatteAttive` conta proprio le chat in `lavoro`, quindi quel fantasma
 * teneva un posto della flotta per sempre. Con il tetto a tre, tre avvii
 * falliti e l'autopilota non apriva più niente — vivo, «al lavoro», fermo.
 *
 * Qui la chat fantasma viene chiusa (`finita`, così libera il posto) e il suo
 * compito torna in coda, in fondo: ritentarlo subito significherebbe ritentarlo
 * contro la stessa causa che l'ha appena fatto fallire. Dopo
 * `TENTATIVI_AVVIO_MAX` tentativi si smette e lo si dice a chi chiama, che è
 * l'unico modo perché un fallimento stabile non diventi un ciclo infinito.
 */
export function dopoAvvioFallito(
  p: { chats: StatoChat[]; compitiDaFare: string[] },
  chatId: string
): DopoFallimento {
  const rotta = p.chats.find((c) => c.id === chatId)
  if (rotta === undefined) {
    return { chats: p.chats, compitiDaFare: p.compitiDaFare, abbandonato: false }
  }
  // «finita» e non «bloccata»: bloccata vuol dire che aspetta una risposta, e
  // questa non aspetta niente — non è mai partita.
  const chats = p.chats.map((c) => (c.id === chatId ? { ...c, stato: 'finita' as const } : c))
  const abbandonato = tentativiDi(p.chats, rotta.compito) >= TENTATIVI_AVVIO_MAX
  return {
    chats,
    compitiDaFare: abbandonato ? p.compitiDaFare : [...p.compitiDaFare, rotta.compito],
    abbandonato
  }
}
