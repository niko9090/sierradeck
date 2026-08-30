/**
 * Aprire un file che sta sul server, modificarlo, e vederlo risalire da solo.
 *
 * È la funzione per cui si tiene aperto un client SFTP tutto il giorno. Senza,
 * cambiare una riga in un file di configurazione remoto è una liturgia in
 * cinque passi — scarica, trova dove è finito, apri, salva, ricarica — e i due
 * passi in mezzo sono quelli in cui si sbaglia cartella e si ricarica il file
 * di ieri.
 *
 * Qui il gesto è uno: doppio clic, si apre nel programma con cui apriresti
 * quel file sul tuo computer, e ogni volta che salvi risale. Finché la finestra
 * dell'editor resta aperta, quel file è **collegato**.
 *
 * ## Le tre trappole, tutte pagate da chi ha scritto questa roba prima di noi
 *
 * **Si guarda la cartella, non il file.** Quasi nessun editor salva scrivendo
 * dentro il file che hai aperto: scrive un file temporaneo accanto e poi lo
 * rinomina sopra. Chi sorveglia il file per nome perde di vista l'inode al
 * primo salvataggio e non vede più niente — senza un errore, perché non è un
 * errore: il file che stava guardando esiste ancora, è solo diventato un altro.
 *
 * **Un salvataggio è più di un evento.** Una sola pressione di Ctrl+S produce
 * `rename`, `change`, spesso un secondo `change` per i metadati. Caricare a
 * ogni evento vuol dire tre trasferimenti dello stesso file, e sul terzo il
 * server ha già in mano il primo.
 *
 * **Non si risale se non è cambiato.** Aprire un file e chiuderlo senza
 * toccarlo, su molti editor, tocca comunque la data. Ricaricarlo sovrascrive
 * sul server una versione identica, che sarebbe innocuo — se non fosse che la
 * data del file remoto cambia, e da quel momento il confronto fra i due lati
 * dice «più nuovo di là» per un file che nessuno ha modificato.
 */

export type FileInModifica = {
  /** La destinazione a cui appartiene. */
  destinazione: string
  /** Dove sta sul server. */
  remoto: string
  /** La copia su cui stai lavorando. */
  locale: string
  nome: string
  /** Quante volte è già risalito. */
  risalite: number
  /** Quando è risalito l'ultima volta, in millisecondi. Assente: mai. */
  ultimaRisalita?: number
  /** Cosa è andato storto nell'ultima risalita, se è andato storto. */
  errore?: string
}

/**
 * Quanto si aspetta dopo l'ultimo movimento prima di caricare.
 *
 * Mezzo secondo copre la raffica di eventi di un salvataggio — scrittura,
 * rinomina, metadati — senza farsi sentire da chi ha appena premuto Ctrl+S. Più
 * corto rimanda lo stesso file due volte; più lungo e il salvataggio sembra non
 * essere arrivato.
 */
export const QUIETE_SALVATAGGIO_MS = 500

export type Impronta = { dimensione: number; quando: number }

/**
 * Se quello che c'è sul disco è diverso da quello che avevamo mandato.
 *
 * La dimensione da sola non basta — correggere una lettera non la cambia — e la
 * data da sola nemmeno, perché alcuni editor la toccano aprendo. Insieme
 * bastano: un salvataggio vero cambia sempre almeno la data, e la coppia
 * identica significa che quel file non è stato riscritto.
 */
export function daRisalire(prima: Impronta | undefined, adesso: Impronta): boolean {
  if (prima === undefined) return true
  return prima.dimensione !== adesso.dimensione || prima.quando !== adesso.quando
}

export type DipendenzeModifiche = {
  /** Porta giù il file e torna dove l'ha messo. */
  scarica: (destinazione: string, remoto: string, locale: string) => Promise<void>
  carica: (destinazione: string, locale: string, remoto: string) => Promise<void>
  /** Apre il file col programma predefinito del sistema. */
  apriFuori: (locale: string) => Promise<void>
  /** Dove mettere le copie di lavoro. La cartella deve esistere. */
  cartellaDiLavoro: (destinazione: string, remoto: string) => string
  /**
   * Sorveglia **la cartella** e chiama `quando` a ogni movimento che riguarda
   * quel nome. Torna la funzione per smettere.
   */
  sorveglia: (cartella: string, nome: string, quando: () => void) => () => void
  impronta: (locale: string) => Impronta | undefined
  /** Il ritardo, iniettabile perché i test non aspettino mezzo secondo. */
  attendi?: (ms: number, cosa: () => void) => () => void
  adesso?: () => number
  /** Per dirlo a chi guarda: l'elenco è cambiato. */
  cambiato?: (aperti: FileInModifica[]) => void
}

export type ModificheRemote = {
  /** Scarica, apre, e da quel momento sorveglia. */
  apri: (destinazione: string, remoto: string, nome: string) => Promise<FileInModifica>
  /** Smette di sorvegliare quel file. La copia locale resta dov'è. */
  chiudi: (destinazione: string, remoto: string) => void
  aperti: () => FileInModifica[]
  /** Smette di sorvegliare tutto: a programma che si chiude, o pannello chiuso. */
  chiudiTutto: () => void
}

export function creaModificheRemote(d: DipendenzeModifiche): ModificheRemote {
  const attendi = d.attendi ?? ((ms, cosa): (() => void) => {
    const t = setTimeout(cosa, ms)
    return () => clearTimeout(t)
  })
  const adesso = d.adesso ?? ((): number => Date.now())

  type Aperto = {
    stato: FileInModifica
    smettiDiGuardare: () => void
    annullaAttesa?: () => void
    /** Com'era quando gliel'abbiamo dato, o quando è risalito l'ultima volta. */
    ultima?: Impronta
    /** Una risalita è in corso: gli eventi che arrivano adesso non ne aprono un'altra. */
    inVolo: boolean
  }

  const aperti = new Map<string, Aperto>()
  const chiave = (destinazione: string, remoto: string): string => `${destinazione}::${remoto}`

  const annuncia = (): void => {
    d.cambiato?.([...aperti.values()].map((a) => a.stato))
  }

  const risali = (k: string): void => {
    const a = aperti.get(k)
    if (a === undefined || a.inVolo) return
    const ora = d.impronta(a.stato.locale)
    if (ora === undefined) return
    // Non è cambiato: risalire sovrascriverebbe sul server una copia identica,
    // e cambierebbe la data — da lì in poi il confronto fra i due lati direbbe
    // «più nuovo di là» per un file che nessuno ha toccato.
    if (!daRisalire(a.ultima, ora)) return
    a.inVolo = true
    d.carica(a.stato.destinazione, a.stato.locale, a.stato.remoto)
      .then(() => {
        a.ultima = d.impronta(a.stato.locale) ?? ora
        a.stato = {
          ...a.stato,
          risalite: a.stato.risalite + 1,
          ultimaRisalita: adesso(),
          errore: undefined
        }
      })
      .catch((e: unknown) => {
        // **Non si smette di sorvegliare.** Un server che rifiuta una scrittura
        // per un istante — permessi cambiati, disco pieno, connessione caduta —
        // non deve staccare il collegamento: il prossimo salvataggio riprova, e
        // nel frattempo l'errore si vede.
        a.stato = { ...a.stato, errore: String(e) }
      })
      .finally(() => { a.inVolo = false; annuncia() })
  }

  return {
    async apri(destinazione, remoto, nome) {
      const k = chiave(destinazione, remoto)
      const gia = aperti.get(k)
      // Già aperto: si riapre e basta. Riscaricarlo butterebbe via le modifiche
      // non salvate di chi lo ha ancora davanti.
      if (gia !== undefined) {
        await d.apriFuori(gia.stato.locale)
        return gia.stato
      }

      const locale = d.cartellaDiLavoro(destinazione, remoto)
      await d.scarica(destinazione, remoto, locale)

      const cartella = locale.slice(0, Math.max(locale.lastIndexOf('/'), locale.lastIndexOf('\\')))
      const stato: FileInModifica = { destinazione, remoto, locale, nome, risalite: 0 }
      const voce: Aperto = {
        stato,
        inVolo: false,
        ...(d.impronta(locale) !== undefined ? { ultima: d.impronta(locale) as Impronta } : {}),
        smettiDiGuardare: () => {}
      }
      aperti.set(k, voce)

      // Si guarda **la cartella**: quasi nessun editor riscrive il file che hai
      // aperto, ne scrive uno accanto e lo rinomina sopra. Guardando il file
      // per nome si perde di vista al primo salvataggio, in silenzio.
      voce.smettiDiGuardare = d.sorveglia(cartella, nome, () => {
        // Ogni movimento rimanda l'appuntamento: un salvataggio è una raffica
        // di eventi, e caricare a ognuno manda lo stesso file tre volte.
        voce.annullaAttesa?.()
        voce.annullaAttesa = attendi(QUIETE_SALVATAGGIO_MS, () => risali(k))
      })

      await d.apriFuori(locale)
      annuncia()
      return stato
    },

    chiudi(destinazione, remoto) {
      const k = chiave(destinazione, remoto)
      const a = aperti.get(k)
      if (a === undefined) return
      a.annullaAttesa?.()
      a.smettiDiGuardare()
      aperti.delete(k)
      annuncia()
    },

    aperti: () => [...aperti.values()].map((a) => a.stato),

    chiudiTutto() {
      for (const a of aperti.values()) { a.annullaAttesa?.(); a.smettiDiGuardare() }
      aperti.clear()
      annuncia()
    }
  }
}
