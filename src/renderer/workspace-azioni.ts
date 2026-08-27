import type { LayoutSalvato } from '@shared/workspace'
import type { StatoWorkspace } from '../main/ipc'
import { terminaliDi, type MemoriaWorkspace } from './memoria-workspace'

export type AzioniDeps = {
  stato: () => Promise<StatoWorkspace>
  crea: (nome: string) => Promise<StatoWorkspace>
  elimina: (nome: string) => Promise<StatoWorkspace>
  cambia: (nome: string, layout: LayoutSalvato) => Promise<LayoutSalvato>
  migra: (da: string, nome: string, layout: LayoutSalvato) => Promise<LayoutSalvato>
  /**
   * Il workspace attivo secondo questa finestra, adesso.
   *
   * Serve a sapere **sotto quale nome** ricordare i riquadri vivi che si stanno
   * lasciando: l'archivio, quando la risposta torna, racconta già il nome nuovo.
   */
  attivo: () => string
  /** Il layout di questa finestra, così com'è adesso. */
  esporta: () => LayoutSalvato
  /**
   * Sostituisce ciò che si vede **senza uccidere** i terminali che escono di
   * scena: è `cambiaVista` dello store, non `carica`. Passare `carica` qui
   * rimetterebbe in piedi il difetto 0-quinquies — cambiare workspace
   * ucciderebbe di nuovo il claude.exe di ogni chat — e nessun errore lo direbbe.
   */
  cambiaVista: (l: LayoutSalvato) => void
  /**
   * Dichiara dove la finestra si trova adesso, **prima** di `cambiaVista`.
   *
   * Non è un dettaglio di interfaccia: `cambiaVista` fa un `set` sullo store, i
   * sottoscritti vengono avvisati nello stesso istante e la persistenza manda
   * subito `layout:salva` col nome del workspace che la finestra dichiara di
   * mostrare. Se quel nome è ancora quello di prima — ed era sempre così, perché
   * lo stato di React si aggiorna solo dopo che la promessa rientra — il Core
   * scrive **il layout nuovo sotto il workspace vecchio**: creando un workspace
   * si svuotava quello che si lasciava, cambiandone uno le sue chat venivano
   * portate via all'altro dall'invariante «una chat, un workspace».
   *
   * Deve essere sincrona e avere effetto immediato: è l'unica ragione per cui
   * `workspace-corrente` esiste fuori da React.
   */
  annunciaAttivo: (nome: string) => void
  /** I riquadri tenuti vivi in questa finestra, uno per workspace. */
  memoria: MemoriaWorkspace
  /** Chiude i terminali elencati: è tutto ciò che «spegnere» significa. */
  chiudiTerminali: (ptyIds: string[]) => void
  /** Toglie dai ceduti dei riquadri i cui terminali sono ormai chiusi. */
  dimenticaCeduti: (paneIds: string[]) => void
  /**
   * Se le chat che si lasciano devono andare a dormire invece di restare
   * accese. Assente vuol dire no: il ritorno istantaneo è il predefinito.
   */
  ibernaLasciando?: () => boolean
  /**
   * Manda a dormire tutte le chat a schermo e dice quali terminali chiudere.
   *
   * Arriva da fuori perché parla con lo store, che questo modulo non conosce —
   * ed è la ragione per cui l'ordine qui dentro resta verificabile.
   */
  ibernaTutte?: () => string[]
}

export type AzioniWorkspace = {
  stato: () => Promise<StatoWorkspace>
  cambia: (nome: string) => Promise<void>
  crea: (nome: string) => Promise<StatoWorkspace>
  elimina: (nome: string) => Promise<StatoWorkspace>
  /** Applica un cambio deciso da un'altra finestra. */
  segui: (precedente: string, attivo: string) => Promise<void>
  /** Dice se quel workspace sta tenendo vivi dei terminali in questa finestra. */
  acceso: (nome: string) => boolean
  /**
   * Spegne un workspace che non è in primo piano e dice quanti terminali ha
   * chiuso. Solleva se gli si chiede quello attivo.
   */
  spegni: (nome: string) => number
}

/**
 * Le operazioni sui workspace, viste dal renderer.
 *
 * Stanno qui e non dentro il componente per la stessa ragione per cui ci sta
 * `persistenza-layout`: la parte che può sbagliare non è il disegno della barra
 * ma **l'ordine** — ricordare prima di chiedere, salvare sotto il workspace che
 * si lascia e non sotto quello che si prende, applicare anche un layout vuoto.
 * Dentro un componente quell'ordine sarebbe provabile solo montando React.
 *
 * Due principi percorrono tutto:
 *
 * 1. ogni operazione che sposta il workspace attivo **deve** finire con un
 *    `cambiaVista`, anche di un layout vuoto. Lasciare a schermo i riquadri di
 *    prima li farebbe sembrare del workspace nuovo, e il primo salvataggio li
 *    scriverebbe davvero lì;
 * 2. la vista di destinazione si prende dalla **memoria** quando c'è, e dal file
 *    solo quando non c'è. Il file racconta com'erano le cose all'ultimo
 *    salvataggio; la memoria conserva i riquadri con i loro terminali ancora
 *    vivi, ed è l'unico modo perché cambiare vista non costi una sessione di
 *    lavoro.
 */
export function creaAzioniWorkspace(deps: AzioniDeps): AzioniWorkspace {
  /**
   * Porta il layout di questa finestra da un workspace all'altro.
   *
   * `migra` nomina esplicitamente il workspace lasciato perché quando questa
   * chiamata parte l'archivio ha già cambiato l'attivo — l'ha cambiato `crea`,
   * `elimina`, o un'altra finestra.
   */
  const trasloca = async (da: string, a: string): Promise<void> => {
    if (da === a) return
    // Come `cambia`: chi vuole la memoria libera lascia dormire le chat che
    // lascia. Prima mancava qui — e siccome `crea`, `elimina` e il seguire il
    // cambio di un'altra finestra passano tutti da `trasloca`, l'interruttore
    // «manda a dormire le chat che lasci» non aveva effetto su nessuna di queste
    // strade. Prima di `esporta`, così il layout ricordato è già quello ibernato.
    if (deps.ibernaLasciando?.() === true) {
      deps.chiudiTerminali(deps.ibernaTutte?.() ?? [])
    }
    const corrente = deps.esporta()
    deps.memoria.ricorda(da, corrente)
    const dalDisco = await deps.migra(da, a, corrente)
    // Prima si dichiara dove si è arrivati, poi si mette a schermo: fra le due
    // righe c'è il salvataggio sincrono del layout, e invertirle significa
    // scrivere il layout nuovo sotto il workspace appena lasciato.
    deps.annunciaAttivo(a)
    deps.cambiaVista(deps.memoria.recupera(a, dalDisco))
  }

  /**
   * Il workspace da cui questa finestra sta partendo.
   *
   * Se non lo sa ancora — avvio, prima che `workspace:stato` risponda — si
   * ripiega sull'archivio: e' un'ipotesi, ma e' meglio di una stringa vuota, che
   * nel Core non corrisponde a nessun workspace e farebbe perdere il layout
   * appena lasciato.
   */
  const daDove = async (): Promise<string> => {
    const suo = deps.attivo().trim()
    return suo !== '' ? suo : (await deps.stato()).attivo
  }

  const spegni = (nome: string): number => {
    const vivo = deps.memoria.spegni(nome)
    if (vivo === undefined) return 0
    const terminali = terminaliDi(vivo)
    deps.chiudiTerminali(terminali)
    // I loro riquadri non torneranno: toglierli dai ceduti è ciò che impedisce
    // all'insieme di crescere per tutta la sessione.
    deps.dimenticaCeduti(vivo.panes.map((p) => p.id))
    return terminali.length
  }

  return {
    stato: () => deps.stato(),

    async cambia(nome) {
      const da = deps.attivo()
      // Chi vuole la memoria libera lascia dormire quello che si sta lasciando.
      // Non è il comportamento predefinito: tenere i terminali vivi rende il
      // ritorno istantaneo, e per due workspace è la scelta giusta. Per sei
      // non lo è più — sono sei `claude.exe` accesi per guardarne uno.
      if (deps.ibernaLasciando?.() === true) {
        deps.chiudiTerminali(deps.ibernaTutte?.() ?? [])
      }
      const corrente = deps.esporta()
      // Ricordare **prima** di chiedere: la richiesta attraversa due processi, e
      // una finestra che si chiudesse nel frattempo porterebbe via con sé
      // l'unica copia dei riquadri vivi che sta lasciando.
      deps.memoria.ricorda(da, corrente)
      // Un solo giro: il layout corrente parte e quello nuovo torna. Con due
      // chiamate distinte esisterebbe un istante in cui il lavoro non è salvato
      // da nessuna parte, e una chiusura lì in mezzo lo perderebbe.
      const dalDisco = await deps.cambia(nome, corrente)
      // Dichiarare **prima** di mostrare: `cambiaVista` fa scattare il
      // salvataggio del layout nello stesso istante, e con il nome vecchio
      // quel salvataggio riscrive il workspace che si sta lasciando con le
      // chat di quello che si sta prendendo.
      deps.annunciaAttivo(nome)
      deps.cambiaVista(deps.memoria.recupera(nome, dalDisco))
    },

    async crea(nome) {
      // Da dove si parte lo dice **questa finestra**, non l'archivio: l'attivo
      // dell'archivio e' dell'applicazione, e con due finestre su workspace
      // diversi e' quello dell'altra. Il layout di qui verrebbe salvato sotto un
      // workspace che questa finestra non sta mostrando — cioe' sopra le chat di
      // qualcun altro. Si ripiega sull'archivio solo se la finestra non sa
      // ancora dove si trova (avvio).
      const precedente = await daDove()
      const stato = await deps.crea(nome)
      await trasloca(precedente, stato.attivo)
      return stato
    },

    async elimina(nome) {
      const precedente = await daDove()
      const stato = await deps.elimina(nome)
      // Se il workspace eliminato era l'attivo, il layout viene salvato sotto un
      // nome che non esiste più: è un no-op voluto lato Core, non un caso
      // particolare da trattare qui.
      await trasloca(precedente, stato.attivo)
      // Dopo il trasloco, non prima: eliminando il workspace in primo piano è
      // `trasloca` a ricordarne i riquadri, e solo da lì in poi la memoria sa
      // quali terminali chiudere. Chiuderli è obbligatorio — un workspace
      // eliminato non ha più né una vista da cui raggiungerlo né un tasto
      // «spegni» da premere, quindi i suoi claude.exe sarebbero immortali.
      spegni(nome)
      return stato
    },

    segui: (precedente, attivo) => trasloca(precedente, attivo),

    acceso: (nome) => deps.memoria.acceso(nome),

    spegni(nome) {
      if (nome === deps.attivo()) {
        // Togliere i riquadri dalla vista e chiuderne i processi sono due gesti
        // diversi: quelli a schermo si chiudono uno per uno, e confonderli qui
        // vorrebbe dire svuotare il layout salvato senza che nessuno l'abbia
        // chiesto.
        throw new Error(
          'Il workspace in primo piano non si spegne da qui: le sue chat sono a schermo e si chiudono una per una.'
        )
      }
      return spegni(nome)
    }
  }
}
