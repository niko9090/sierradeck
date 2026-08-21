/**
 * Il magazzino: dove finisce il blocco cifrato della cassaforte.
 *
 * L'app non sa **dove** stanno i dati — parla solo con questa interfaccia. Oggi
 * l'adattatore sarà il **Google Drive dell'utente** (bring-your-own-storage: noi
 * gestiamo gli accessi, i dati restano suoi e cifrati); un domani, senza cambiare
 * una riga di chi la usa, potremo aggiungere un adattatore che li tiene sul
 * **nostro** storage, per chi non vuole collegare un cloud. È la ragione per cui
 * questa è un'interfaccia e non una chiamata a Google diretta.
 *
 * Un solo blocco per utente, sovrascritto a ogni sincronizzazione: non è uno
 * storico di versioni (quello è dentro il pacchetto, semmai), è «l'ultimo stato».
 *
 * **Concorrenza ottimista.** `carica` porta `seVersione`, l'ultima versione che
 * questo PC ha visto. Se sul magazzino nel frattempo ne è comparsa una più nuova
 * — l'altro PC ha sincronizzato — `carica` **rifiuta** con `ConflittoMagazzino`
 * invece di sovrascrivere quel lavoro. Chi chiama allora riscarica, fonde, e
 * riprova. È la rete che rende sicuro l'uso da due PC senza inventare un
 * protocollo di sincronizzazione in tempo reale.
 */

export type Contenuto = {
  blocco: Buffer
  /** L'etichetta della versione sul magazzino (l'etag di Drive, un contatore, ecc.). */
  versione: string
}

export interface Magazzino {
  /** Il blocco più recente, o `undefined` se questo utente non ha ancora caricato niente. */
  scarica: () => Promise<Contenuto | undefined>
  /**
   * Carica il blocco. `seVersione` è l'ultima versione vista da questo PC: se sul
   * magazzino ce n'è una diversa, si rifiuta con `ConflittoMagazzino`. Omesso (o
   * `undefined`) vuol dire «primo caricamento»: si rifiuta se invece qualcosa c'è
   * già, così due primi-avvii non si cancellano a vicenda.
   */
  carica: (blocco: Buffer, seVersione?: string) => Promise<{ versione: string }>
}

/** Sollevato quando il magazzino ha una versione più nuova di quella attesa: non si sovrascrive. */
export class ConflittoMagazzino extends Error {
  constructor(readonly versioneAttuale: string | undefined) {
    super('il magazzino è cambiato da un altro dispositivo: riscarica e riprova')
    this.name = 'ConflittoMagazzino'
  }
}

/**
 * Un magazzino tenuto in memoria: per i test e per lo sviluppo prima che ci sia
 * Google Drive. Implementa la stessa concorrenza ottimista di un magazzino vero,
 * così la logica che ci si appoggia si prova per davvero.
 */
export function magazzinoInMemoria(): Magazzino & { versioneCorrente: () => string | undefined } {
  let contenuto: Contenuto | undefined
  let contatore = 0
  const prossimaVersione = (): string => {
    contatore += 1
    return `v${contatore}`
  }

  return {
    scarica: () =>
      Promise.resolve(
        contenuto === undefined
          ? undefined
          : { blocco: Buffer.from(contenuto.blocco), versione: contenuto.versione }
      ),

    carica: (blocco, seVersione) => {
      const attuale = contenuto?.versione
      // Deve combaciare con quello che c'è: `seVersione` con la versione presente,
      // oppure entrambi assenti (primo caricamento su un magazzino ancora vuoto).
      if (seVersione !== attuale) return Promise.reject(new ConflittoMagazzino(attuale))
      const versione = prossimaVersione()
      contenuto = { blocco: Buffer.from(blocco), versione }
      return Promise.resolve({ versione })
    },

    versioneCorrente: () => contenuto?.versione
  }
}
