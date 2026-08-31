/**
 * Chi ha ricevuto quale layout, e con che diritto lo può risalvare.
 *
 * Per tre volte il lavoro di una giornata è finito in un file sbagliato o non è
 * finito da nessuna parte, e tutte e tre le volte la forma del guasto è stata la
 * stessa: **una finestra ha scritto sul disco uno stato che non discendeva da
 * niente.** Non aveva ancora ricevuto il suo layout, o ne aveva ricevuto un
 * altro, o ne mostrava uno di un workspace che nel frattempo era cambiato. Il
 * Core non poteva accorgersene perché `layout:salva` era una dettatura: arrivava
 * un layout e un nome, e non c'era modo di sapere su cosa fossero stati
 * calcolati.
 *
 * Qui il salvataggio diventa la **risposta a una consegna**. Ogni volta che un
 * layout arriva a una finestra — l'avvio, un cambio di workspace, un ripristino,
 * un rifiuto rimandato indietro — resta una ricevuta con un numero progressivo e
 * il workspace per cui valeva. Chi salva rimanda il numero. Se non combacia, il
 * layout descrive un mondo che non c'è più e non si scrive.
 *
 * Due conseguenze che da sole valgono il modulo:
 *
 * - una finestra che non ha **mai** ricevuto un layout non ha ricevuta, quindi
 *   non può salvare. Muore lì la classe intera dei salvataggi «basati sul
 *   nulla», che è quella che azzerava i workspace all'avvio;
 * - il workspace sotto cui si scrive lo dice la ricevuta, non la finestra. Non
 *   c'è più niente da dichiarare, e quindi niente da sbagliare.
 *
 * Sta fuori da `ipc.ts` perché è la decisione che ha sbagliato tre volte, e una
 * decisione così si deve poter verificare senza avviare Electron.
 */

/** Quanto vale una ricevuta. */
export type Consegna = {
  /** Progressivo, unico per tutta la sessione: due consegne non lo condividono. */
  numero: number
  /** Per quale workspace valeva. È questo che finisce sul disco, non ciò che la finestra dichiara. */
  workspace: string
  /** Sotto quale slot va archiviata la disposizione di questa finestra. */
  slot: string
}

/**
 * Il primo slot libero, come numero scritto in decimale.
 *
 * **Il più basso**, non il successivo: chiudendo la seconda finestra e
 * riaprendone una, quella nuova deve ritrovare la disposizione della vecchia
 * invece di inaugurare una terza casella che nessuno chiederà più. È la stessa
 * ragione per cui gli slot esistono — una casella che nessuno chiede è lavoro
 * che c'è e non si vede.
 */
export function primoSlotLibero(presi: Iterable<string>): string {
  const occupati = new Set(presi)
  let n = 1
  while (occupati.has(String(n))) n += 1
  return String(n)
}

export type RegistroConsegne = {
  /**
   * Lo slot di una finestra, deciso **una volta sola** e non più cambiato finché
   * quella finestra vive. `viveOra` sono gli id delle finestre ancora aperte:
   * serve a non dare a due finestre vive lo stesso slot.
   */
  slotDi: (winId: number, viveOra: number[]) => string
  /** Registra una consegna e restituisce lo scontrino da dare alla finestra. */
  consegna: (winId: number, workspace: string, viveOra: number[]) => number
  /**
   * La ricevuta valida per questo scontrino, o `undefined` se non ce n'è.
   *
   * `undefined` vuol dire **non scrivere**: né perché la finestra è nuova, né
   * perché è rimasta indietro — le due cose si distinguono guardando `ricevuta`,
   * e servono a decidere se rimandarle la verità o lasciarla finire l'avvio.
   */
  verifica: (winId: number, scontrino: unknown) => Consegna | undefined
  /** L'ultima ricevuta di una finestra, valida o no: serve solo a raccontare. */
  ricevuta: (winId: number) => Consegna | undefined
  /**
   * Una finestra che si chiude libera il suo slot e la sua ricevuta.
   *
   * Gli id delle finestre si riciclano: senza questa pulizia una finestra nuova
   * erediterebbe lo slot di una morta — e con lui la sua disposizione, mentre la
   * finestra viva che quello slot ce l'ha davvero se lo vedrebbe riscrivere.
   */
  dimentica: (winId: number) => void
}

export function creaRegistroConsegne(): RegistroConsegne {
  const slot = new Map<number, string>()
  const consegne = new Map<number, Consegna>()
  let prossimo = 1

  const slotDi = (winId: number, viveOra: number[]): string => {
    const gia = slot.get(winId)
    if (gia !== undefined) return gia
    const presi = viveOra
      .filter((id) => id !== winId)
      .map((id) => slot.get(id))
      .filter((s): s is string => s !== undefined)
    const scelto = primoSlotLibero(presi)
    slot.set(winId, scelto)
    return scelto
  }

  return {
    slotDi,

    consegna(winId, workspace, viveOra) {
      const numero = prossimo
      prossimo += 1
      consegne.set(winId, { numero, workspace, slot: slotDi(winId, viveOra) })
      return numero
    },

    verifica(winId, scontrino) {
      const c = consegne.get(winId)
      if (c === undefined || c.numero !== scontrino) return undefined
      return c
    },

    ricevuta: (winId) => consegne.get(winId),

    dimentica(winId) {
      slot.delete(winId)
      consegne.delete(winId)
    }
  }
}
