/**
 * L'ultima riga viva di ogni terminale, per chi guarda da lontano.
 *
 * Dal telefono si vede il titolo di una chat e niente altro: si manda un
 * messaggio e si resta a fissare lo stesso titolo di prima, senza sapere se è
 * successo qualcosa. Una riga sola cambia tutto — dice se il lavoro procede, se
 * si è fermato, se sta chiedendo.
 *
 * Non è lo scrollback e non vuole esserlo: è il **battito**, quello che si
 * guarda passando.
 */

/** Oltre questo non è più un colpo d'occhio: è una lettura. */
const RIGA_MAX = 160

/**
 * Toglie i codici con cui il terminale colora e sposta il cursore.
 *
 * Il flusso di un terminale è pieno di sequenze di controllo: mostrate così
 * come sono riempirebbero lo schermo del telefono di parentesi quadre e
 * numeri, e la riga che conta sparirebbe dentro il rumore.
 */
export function senzaColori(grezzo: string): string {
  return grezzo
    // Le sequenze CSI per intero: parametri (cifre, `;`, `:`, `?`, `>`, `<`,
    // `=`), eventuali intermedi (spazio … `/`) e la lettera finale. La forma
    // di prima accettava solo cifre, `;` e `?`: le sequenze private che Claude
    // Code usa per la modalita' del terminale (`ESC[>4;2m`, `ESC[?2026h`, gli
    // stili `ESC[4:3m`) restavano a meta', e dal telefono si leggevano
    // «[>4;2m» e «[?2026h» in mezzo alle parole — i caratteri a caso.
    .replace(/\x1b\[[0-9:;<=>?]*[ -/]*[@-~]/g, '')
    // La stessa cosa nella forma a 8 bit.
    .replace(/\x9b[0-9:;<=>?]*[ -/]*[@-~]/g, '')
    // Quelle che chiudono con BEL o ST: titoli di finestra, collegamenti,
    // e le stringhe DCS/APC/PM.
    .replace(/\x1b[\]PX^_][^\x07\x1b]*(\x07|\x1b\\)/g, '')
    // La scelta del set di caratteri e le sequenze ESC a un carattere.
    .replace(/\x1b[()*+][A-Za-z0-9]/g, '')
    .replace(/\x1b[@-Z\\-_]/g, '')
    // Un ESC rimasto solo: una sequenza spezzata fra due pezzi del flusso.
    .replace(/\x1b\[[0-9:;<=>?]*$/g, '')
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')
}

/**
 * Le righe dell'interfaccia di Claude Code che non raccontano niente.
 *
 * Il campo di scrittura vuoto, la riga degli scorciatoie, quella dei
 * permessi: sono sempre le stesse, e da un telefono «? for shortcuts» come
 * ultima riga di una chat non dice se sta lavorando o ha finito.
 */
const RUMORE_DI_INTERFACCIA =
  /^(\? for shortcuts|[›>]\s*|.*bypass permissions.*|.*shift\+tab.*|.*to cycle.*|.*accept edits.*|.*plan mode.*|.*auto-accept.*)$/i

/** Una cornice: solo caratteri di riquadro e spazi. */
const SOLO_CORNICE = /^[\u2500-\u257f\s]+$/

/**
 * L'ultima riga che dice qualcosa, letta dallo **schermo disegnato**.
 *
 * Il flusso non basta: Claude Code e' un'interfaccia a tutto schermo che si
 * riscrive in posizione, e l'ultimo pezzo arrivato e' un frammento di
 * ridisegno — mezza riga, uno spinner, il resto di una sequenza spezzata.
 * Dal telefono, nelle notifiche, si leggevano caratteri a caso. Lo schermo
 * invece e' lo stato: si risale dal fondo saltando le cornici e le righe
 * fisse dell'interfaccia, e la prima riga di testo vero e' il battito.
 */
export function ultimaRigaDalloSchermo(righe: string[] | undefined): string {
  if (righe === undefined) return ''
  for (let i = righe.length - 1; i >= 0; i -= 1) {
    const riga = (righe[i] ?? '')
      .replace(/^[\u2502\u2503]\s?/, '')
      .replace(/\s?[\u2502\u2503]\s*$/, '')
      .trim()
    if (riga === '' || SOLO_CORNICE.test(riga) || RUMORE_DI_INTERFACCIA.test(riga)) continue
    return riga.slice(0, RIGA_MAX)
  }
  return ''
}

/**
 * L'ultima riga con dentro qualcosa.
 *
 * Le righe vuote sono la maggioranza di quello che un terminale scrive —
 * spaziature, ridisegni, cornici — e mostrarne una vuota equivale a non
 * mostrare niente. Si risale finché non si trova qualcosa da leggere.
 */
export function ultimaRigaUtile(testo: string): string {
  const righe = senzaColori(testo).split(/\r?\n/)
  for (let i = righe.length - 1; i >= 0; i -= 1) {
    const riga = (righe[i] ?? '').trim()
    // Le cornici disegnate con i caratteri di riquadro non dicono niente: sono
    // decorazione, e da lontano contano meno di una riga di testo vero.
    if (riga === '' || /^[─-╿\s]+$/.test(riga)) continue
    return riga.slice(0, RIGA_MAX)
  }
  return ''
}

/**
 * I segni che Claude Code ha finito di nascere ed è pronto a ricevere.
 *
 * Uno qualunque basta: il prompt disegnato, la riga dei permessi in fondo, o
 * l'avviso che si può interrompere — che compare quando sta già lavorando.
 */
const SEGNI_DI_PROMPT = /❯|bypass permissions|esc to interrupt/

/**
 * Quanto silenzio serve, dopo il prompt, perché il terminale stia davvero
 * ascoltando. Claude Code disegna la sua interfaccia in più riprese: scrivere
 * durante un ridisegno significa vedersi il testo accettato e l'invio perso.
 */
const QUIETE_MS = 700

export type AttivitaTerminale = {
  /** Quando è arrivato l'ultimo dato, in millisecondi. */
  ultimoDato: number
  /** Se il prompt si è mai visto: prima di allora non c'è nessuno che ascolti. */
  prontoVisto: boolean
  /**
   * Se il suo processo è finito.
   *
   * Senza questo, un terminale morto sembra **il più pronto di tutti**: ha
   * visto il prompt tempo fa e da allora tace. Ci si scriveva dentro, e il
   * compito spariva con un «terminale inesistente: 10965 caratteri non
   * consegnati» — un errore che l'autopilota non poteva nemmeno leggere.
   */
  morto?: boolean
}

/**
 * Se si può scrivere in quel terminale **adesso**.
 *
 * Provato sul campo, con un PTY vero: scrivendo dopo due secondi il messaggio
 * entra nel campo e l'invio si perde: Claude Code sta ancora nascendo. Un
 * tempo fisso non basta — quattro secondi bastavano su un progetto e non su un
 * altro, dove gli hook e la memoria allungano l'avvio — e nemmeno il solo
 * silenzio, perché i primi secondi sono muti proprio perché non è cominciato
 * niente. Serve il prompt, e poi la quiete.
 */
export function terminalePronto(a: AttivitaTerminale, adesso: number): boolean {
  return a.prontoVisto && a.morto !== true && adesso - a.ultimoDato >= QUIETE_MS
}

/**
 * I segni che sta lavorando **adesso**, letti dallo schermo disegnato.
 *
 * Claude Code lo scrive sotto il campo per tutto il tempo in cui sta
 * rispondendo, e sparisce quando ha finito: è l'unica cosa che, guardando un
 * terminale fermo, distingue «sta pensando in silenzio» da «ha finito».
 */
const LAVORA_SULLO_SCHERMO = /esc to interrupt|interrupt to stop/i

/** I segni del campo di scrittura: c'è, è disegnato, e non ci scrive nessuno. */
const CAMPO_SULLO_SCHERMO = /❯|bypass permissions|shift\+tab/i

/**
 * Se aspetta te, giudicato **dallo schermo** invece che dal flusso.
 *
 * `undefined` quando lo schermo non dice né una cosa né l'altra.
 */
export function aspettaDalloSchermo(righe: string[] | undefined): boolean | undefined {
  if (righe === undefined || righe.length === 0) return undefined
  const testo = righe.join('\n')
  if (LAVORA_SULLO_SCHERMO.test(testo)) return false
  if (CAMPO_SULLO_SCHERMO.test(testo)) return true
  return undefined
}

/**
 * Se quella chat ha finito e aspetta te — con due fonti, non una.
 *
 * Il flusso da solo non basta, e il prezzo si è pagato aggiornando: dopo un
 * riavvio il riquadro riaggancia un terminale **che tace perché ha già
 * finito**, e da quel flusso non arriva più niente. `prontoVisto` resta falso
 * per sempre, la chat risulta «con qualcosa in mano», e l'aggiornamento le
 * scriveva dentro «finisci quello che stai facendo» — a una chat ferma da ore.
 *
 * Lo schermo disegnato invece c'è comunque: è lo stato, non il racconto di come
 * ci si è arrivati. Si guarda lui quando il flusso non ha niente da dire, e
 * resta il flusso a comandare quando ce l'ha (è più preciso sui millisecondi,
 * che è quello che serve per non scrivere in mezzo a un ridisegno).
 */
export function chatAspetta(
  a: AttivitaTerminale,
  schermo: string[] | undefined,
  adesso: number
): boolean {
  if (a.morto === true) return false
  // **Lo schermo ha il veto.** Il flusso tace anche mentre la chat lavora: un
  // comando lungo — una compilazione, una pubblicazione — puo' non scrivere
  // niente per secondi, e per il solo flusso quella chat «aspettava te». E'
  // cosi' che un aggiornamento e' partito sopra una shell che stava operando:
  // la quiete del flusso l'ha dichiarata ferma, e si e' chiuso tutto. Finche'
  // sullo schermo c'e' «esc to interrupt», sta lavorando, e basta.
  const dalloSchermo = aspettaDalloSchermo(schermo)
  if (dalloSchermo === false) return false
  if (a.prontoVisto) return terminalePronto(a, adesso)
  return dalloSchermo ?? false
}

/** Quante righe si tengono per chi vuole guardare dentro: uno sguardo, non un log. */
const CODA_RIGHE = 14

/**
 * Tiene l'ultima riga di ogni terminale, e le ultime poche.
 *
 * Non tutto il flusso: conservarlo vorrebbe dire tenere in memoria tutto quello
 * che ogni chat ha scritto da quando è aperta. Una riga per il colpo d'occhio,
 * quattordici per capire cosa sta succedendo senza aprire il computer.
 */
export function creaUltimeRighe(): {
  aggiorna: (ptyId: string, dati: string) => void
  di: (ptyId: string) => string
  /** Le ultime righe, per chi vuole guardare dentro la chat da lontano. */
  codaDi: (ptyId: string) => string[]
  /**
   * Le stesse righe **come le ha scritte il terminale**, colori compresi.
   *
   * Dal telefono si vedevano ripulite: il testo giusto, senza niente di quello
   * che al computer fa capire a colpo d'occhio com'e' andata. I codici costano
   * pochi byte in piu' e li interpreta la pagina.
   */
  codaGrezzaDi: (ptyId: string) => string[]
  /** Cosa dice il flusso di quel terminale: se ha un prompt, e da quando tace. */
  attivitaDi: (ptyId: string) => AttivitaTerminale
  /** Il suo processo e' finito: da adesso non e' piu' un posto dove scrivere. */
  segnaMorto: (ptyId: string) => void
  dimentica: (ptyId: string) => void
  /**
   * Tiene solo i terminali ancora vivi, scorda tutti gli altri.
   *
   * Il flusso `pty:evento` scrive per **ogni** terminale che passa, compresi
   * quelli chiusi, ibernati, spostati, e i rilanci — che a ogni `--resume` hanno
   * un id nuovo. Senza una potatura, le cinque mappe accumulano una voce per ogni
   * terminale mai visto, per tutta la vita del processo: un'app che sta giorni
   * nell'area di notifica, con apri/chiudi/rilancia a ripetizione, cresce senza
   * un tetto. `vivi` sono gli id dei terminali che un riquadro aperto tiene ancora
   * in mano: solo quelli restano, il resto e' peso morto e se ne va.
   */
  pota: (vivi: Set<string>) => void
} {
  const righe = new Map<string, string>()
  const ultime = new Map<string, string[]>()
  const ultimeGrezze = new Map<string, string[]>()
  const attivita = new Map<string, AttivitaTerminale>()
  // La coda di ciò che è arrivato spezzato: un terminale manda i dati a
  // pezzetti, e una riga può arrivare in tre volte.
  const code = new Map<string, string>()

  return {
    aggiorna(ptyId, dati) {
      // Il battito del terminale: quando ha parlato l'ultima volta, e se si è
      // mai visto il suo prompt. È ciò che dice se sta ascoltando.
      const prima = attivita.get(ptyId)
      attivita.set(ptyId, {
        ultimoDato: Date.now(),
        prontoVisto: prima?.prontoVisto === true || SEGNI_DI_PROMPT.test(dati),
        // Morto una volta, morto per sempre: un terminale puo' sputare i suoi
        // ultimi dati **dopo** l'exit (coda del PTY, o eventi riordinati), e
        // ricostruire `attivita` senza conservare `morto` lo farebbe tornare
        // «pronto» — proprio il terminale morto che sembra il piu' pronto di
        // tutti, dove il compito dell'autopilota finiva perduto.
        ...(prima?.morto === true ? { morto: true } : {})
      })
      const insieme = (code.get(ptyId) ?? '') + dati
      const ultimoACapo = insieme.lastIndexOf('\n')
      if (ultimoACapo === -1) {
        // Niente a capo: si conserva, ma non all'infinito — un terminale che
        // scrive senza mai andare a capo non deve far crescere la memoria.
        code.set(ptyId, insieme.slice(-4000))
        const parziale = ultimaRigaUtile(insieme)
        if (parziale !== '') righe.set(ptyId, parziale)
        return
      }
      const completo = insieme.slice(0, ultimoACapo)
      code.set(ptyId, insieme.slice(ultimoACapo + 1))
      const trovata = ultimaRigaUtile(completo)
      if (trovata !== '') righe.set(ptyId, trovata)
      // E la coda delle ultime: da un telefono, una riga dice che si muove,
      // dieci dicono **cosa** sta facendo.
      const pulite = senzaColori(completo)
        .split(/\r?\n/)
        .map((r) => r.trimEnd())
        .filter((r) => r.trim() !== '')
      if (pulite.length > 0) {
        const prima = ultime.get(ptyId) ?? []
        ultime.set(ptyId, [...prima, ...pulite].slice(-CODA_RIGHE))
      }
      // Le stesse righe, intatte. Si scartano solo quelle che una volta
      // ripulite non conterrebbero niente: sono ridisegni e spaziature, e da
      // un telefono riempirebbero lo schermo di righe vuote colorate.
      const grezze = completo
        .split(/\r?\n/)
        .filter((r) => senzaColori(r).trim() !== '')
      if (grezze.length > 0) {
        const prima = ultimeGrezze.get(ptyId) ?? []
        ultimeGrezze.set(ptyId, [...prima, ...grezze].slice(-CODA_RIGHE))
      }
    },

    di: (ptyId) => righe.get(ptyId) ?? '',

    codaDi: (ptyId) => ultime.get(ptyId) ?? [],

    codaGrezzaDi: (ptyId) => ultimeGrezze.get(ptyId) ?? [],

    attivitaDi: (ptyId) => attivita.get(ptyId) ?? { ultimoDato: 0, prontoVisto: false },

    segnaMorto(ptyId) {
      const prima = attivita.get(ptyId)
      attivita.set(ptyId, {
        ultimoDato: prima?.ultimoDato ?? 0,
        prontoVisto: prima?.prontoVisto === true,
        morto: true
      })
    },

    dimentica(ptyId) {
      righe.delete(ptyId)
      code.delete(ptyId)
      ultime.delete(ptyId)
      ultimeGrezze.delete(ptyId)
      attivita.delete(ptyId)
    },

    pota(vivi) {
      // `attivita` ha sempre la chiave di ogni terminale visto: `aggiorna` e
      // `segnaMorto` la scrivono per primi, prima di ogni altra mappa. Basta lei
      // per l'elenco degli id. Si raccoglie prima e si cancella dopo, per non
      // modificarla mentre la si scorre.
      const daScordare: string[] = []
      for (const ptyId of attivita.keys()) if (!vivi.has(ptyId)) daScordare.push(ptyId)
      for (const ptyId of daScordare) {
        righe.delete(ptyId)
        code.delete(ptyId)
        ultime.delete(ptyId)
        ultimeGrezze.delete(ptyId)
        attivita.delete(ptyId)
      }
    }
  }
}
