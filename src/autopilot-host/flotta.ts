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
