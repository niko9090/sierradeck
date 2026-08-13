import type { Autopilota, ChatGovernata } from '@shared/autopilota'

/**
 * Quali autopiloti far ripartire quando il servizio torna su.
 *
 * Il criterio è uno solo: risultavano **al lavoro** quando tutto si è
 * interrotto. Nessuno li ha fermati, quindi l'interruzione non è una decisione
 * ma un incidente — uno spegnimento, un riavvio, un servizio ucciso — e l'utente
 * si aspetta di ritrovarli dove li aveva lasciati.
 *
 * Gli altri stati restano fermi, ognuno per una ragione precisa:
 *
 * - `sospeso`, `finito`, `fallito`: qualcuno o qualcosa ha già deciso che si
 *   fermassero. Riprenderli sarebbe disfare quella decisione.
 * - `attesa`: stanno aspettando una risposta. Rimandarli a lavorare senza
 *   averla significherebbe farli tornare a fare la stessa domanda.
 * - chi ha esaurito un tetto di cicli che si era dato: farlo ripartire
 *   aggirerebbe una protezione voluta. Senza tetto — il caso normale — non c'è
 *   niente da aggirare e si riprende.
 * - chi è stato messo da parte con `riprendiAlRiavvio: false`: è una scelta
 *   per singolo autopilota, perché uno che lavora tutta la notte deve
 *   ripartire da solo e un altro che stava provando qualcosa no.
 */
export function daRiprendere(tutti: Autopilota[]): Autopilota[] {
  return tutti.filter(
    (a) =>
      a.stato === 'lavoro' &&
      a.riprendiAlRiavvio !== false &&
      (a.limiti.cicliMax === 0 || a.cicli < a.limiti.cicliMax)
  )
}

/**
 * Quali chat rimettere in moto di un autopilota che riprende.
 *
 * Chi governa una chat sola ha `undefined`: quella chat non ha un id suo,
 * perché non c'è nessun'altra da cui distinguerla. Una flotta ha invece le sue,
 * e vanno riprese **tutte**.
 *
 * Riprendere una flotta come se avesse una chat sola era il difetto peggiore
 * della ripresa: le chat vere restavano orfane — vive nel mosaico ma senza
 * nessuno che le governasse — e se ne apriva una terza con l'obiettivo intero,
 * cioè un lavoro già diviso in due rifatto da capo in parallelo.
 *
 * Le chat che hanno finito non tornano: il loro pezzo è fatto, e riaprirle
 * significherebbe rifarlo.
 */
export function chatDaRiprendere(a: Autopilota): (ChatGovernata | undefined)[] {
  if (a.chats.length === 0) return [undefined]
  return a.chats.filter((c) => c.stato !== 'finita')
}

/**
 * Quali **preparazioni** far ripartire quando il servizio torna su.
 *
 * Chi si stava preparando non è al lavoro, ma è altrettanto interrotto: la sua
 * intervista viveva in un processo che non c'è più. Restava «sta preparando»
 * per sempre — e senza nemmeno una domanda aperta a cui rispondere, perché le
 * domande stanno in memoria e con il processo se ne vanno, non c'era alcun
 * modo di sbloccarlo. Riprendere l'intervista è indolore: le risposte già date
 * sono negli atti, quindi non si ricomincia da capo e non si richiede due volte
 * la stessa cosa.
 */
export function intervisteDaRiprendere(tutti: Autopilota[]): Autopilota[] {
  return tutti.filter((a) => a.stato === 'intervista' && a.riprendiAlRiavvio !== false)
}
