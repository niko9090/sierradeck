import type { Autopilota } from '@shared/autopilota'

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
 */
export function daRiprendere(tutti: Autopilota[]): Autopilota[] {
  return tutti.filter(
    (a) => a.stato === 'lavoro' && (a.limiti.cicliMax === 0 || a.cicli < a.limiti.cicliMax)
  )
}
