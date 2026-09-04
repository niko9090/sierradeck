import type { LayoutSalvato } from '@shared/workspace'

export type PersistenzaDeps = {
  /** Legge il layout dell'avvio precedente. */
  carica: () => Promise<LayoutSalvato>
  /** Scrive il layout. Senza risposta: chi salva non aspetta il disco. */
  salva: (l: LayoutSalvato) => void
  /** Lo stato corrente, nella forma che si salva. */
  esporta: () => LayoutSalvato
  /** Porta un layout letto dentro lo store. */
  applica: (l: LayoutSalvato) => void
  /** Si iscrive ai cambiamenti dello store; restituisce come disiscriversi. */
  sottoscrivi: (cb: () => void) => () => void
}

export type Persistenza = {
  avvia: () => void
  /** Scrive lo stato corrente adesso: l'ultima parola alla chiusura. */
  salvaSubito: () => void
  /**
   * Porta nello store un layout che arriva **dal Core** — un ripristino che
   * riempie questa finestra, la verita' rimandata dopo un rifiuto — senza
   * risalvarlo.
   *
   * E' gia' la verita' del disco: riscrivergliela non aggiunge niente, e per
   * un pomeriggio intero ha fatto un giro senza fine. La finestra applicava
   * il layout spinto, lo store notificava, il salvataggio partiva con lo
   * scontrino di un attimo prima, il Core rifiutava e rispingeva, e da capo:
   * cinquecento giri al secondo, sette gigabyte di registro.
   */
  applicaDaFuori: (l: LayoutSalvato) => void
  chiudi: () => void
}

/**
 * Carica il layout all'avvio e lo riscrive a ogni cambiamento, subito.
 *
 * Il salvataggio aspettava mezzo secondo abbondante dall'ultima modifica, per
 * il trascinamento di un divisore che produce un evento per pixel. Il prezzo
 * era sproporzionato: quella frazione di secondo è ciò che un blackout porta
 * via, e con lei l'ultimo riquadro aperto — la perdita più fastidiosa
 * possibile, perché è proprio l'ultima cosa fatta. Peggio: il rinvio si
 * perdeva anche in un cambio di workspace, dove il timer poteva scattare a
 * workspace già cambiato e scrivere il layout vecchio sotto il nome nuovo. Il
 * prezzo di toglierlo è qualche scrittura in più di un file piccolo, per
 * giunta atomica.
 *
 * Il salvataggio non parte prima che il caricamento sia finito. Senza quella
 * guardia il primo rirender salverebbe lo stato vuoto **sopra** il layout appena
 * letto, cancellandolo — e sarebbe un difetto che si manifesta solo al secondo
 * avvio, quindi difficile da attribuire. Vale anche per `applica`, che notifica
 * i sottoscritti sincronamente: è per questo che `caricato` viene alzato
 * **dopo** l'applicazione, non prima.
 *
 * Sta fuori da React perché la logica che conta è tutta di ordine — chi arriva
 * prima fra il caricamento e il primo cambiamento — e quella si verifica meglio
 * senza montare un albero di componenti.
 */
export function creaPersistenza(deps: PersistenzaDeps): Persistenza {
  let caricato = false
  let chiuso = false
  let applicando = false
  let disiscrivi: (() => void) | undefined

  const salvaOra = (): void => {
    if (!caricato || chiuso || applicando) return
    deps.salva(deps.esporta())
  }

  return {
    avvia() {
      // L'iscrizione precede il caricamento: i cambiamenti che arrivano nel
      // frattempo li ferma `caricato`, non l'assenza di un ascoltatore.
      disiscrivi = deps.sottoscrivi(salvaOra)

      void deps.carica().then(
        (l) => {
          if (chiuso) return
          // Un layout vuoto non si applica: sarebbe un `set` che non cambia
          // niente, e lo store è già vuoto all'avvio.
          if (l.root !== undefined) deps.applica(l)
          caricato = true
        },
        (err: unknown) => {
          // Un layout non caricato non deve restare muto, e soprattutto non deve
          // bloccare i salvataggi successivi: si riparte da vuoto.
          console.error('[layout] caricamento fallito:', err)
          caricato = true
        }
      )
    },

    // Con la scrittura immediata non c'è più niente in sospeso da svuotare, ma
    // un'uscita è l'unico momento in cui vale la pena di essere ridondanti.
    salvaSubito: salvaOra,

    applicaDaFuori(l) {
      // Lo store notifica i sottoscritti in modo sincrono: la bandiera copre
      // esattamente la notifica che questa applicazione provoca, e niente altro.
      applicando = true
      try {
        deps.applica(l)
      } finally {
        applicando = false
      }
    },

    chiudi() {
      chiuso = true
      disiscrivi?.()
      disiscrivi = undefined
    }
  }
}
