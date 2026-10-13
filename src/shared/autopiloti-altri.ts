/**
 * **Gli autopiloti degli altri PC** (0.59.0, la richiesta più importante di
 * Nicholas): da questo PC, dal telefono e dalla pagina si vedono e si
 * governano anche gli autopiloti che girano su un altro PC della stessa
 * chiave di casa.
 *
 * Niente logica doppia: i dati e le azioni sono le rotte di sempre **del PC
 * dove gira l'autopilota** (`/api/stato`, `/api/autopilota`,
 * `/api/autopilota/dialogo`, `/ferma`, `/riprendi`, `/api/rispondi`),
 * chiamate con la firma di casa (dal PC) o attraverso il ponte (dal telefono e
 * dalla pagina, 0.48.0/0.55.0). Qui ci sono solo le forme, le rotte permesse
 * e i testi.
 */

/** Un autopilota come lo elenca `/api/stato` del suo PC (i campi che servono a una riga). */
export type AutopilotaRiga = {
  id: string
  nome: string
  stato: string
  obiettivo?: string
  [altro: string]: unknown
}

/** Gli autopiloti di un altro PC, o il perché non si sono potuti leggere. */
export type AutopilotiDiPc = {
  pcId: string
  nome: string
  autopiloti: AutopilotaRiga[]
  /** La strada con cui ha risposto (rete di casa, Tailscale, WebRTC, Drive). */
  strada?: string
  /** Non ha risposto: il perché, per esteso, con le strade provate. */
  errore?: string
  motivo?: string
}

/** Le rotte che da qui si chiamano sul PC dove gira l'autopilota. */
export const ROTTE_AUTOPILOTA_ALTRO_PC: readonly string[] = [
  '/api/autopilota', '/api/autopilota/dialogo', '/api/autopilota/ferma', '/api/autopilota/riprendi',
  '/api/autopilota/vai', '/api/autopilota/istruzioni', '/api/autopilota/file', '/api/rispondi', '/api/autopilota/manda-adesso'
]

export function rottaAutopilotaAltroPc(percorso: string): boolean {
  return ROTTE_AUTOPILOTA_ALTRO_PC.includes(percorso)
}

/** La scritta accanto al nome: dove gira. */
export function giraSu(nomePc: string): string {
  return `gira su ${nomePc}`
}

/**
 * Il perché quel PC non risponde, con le strade provate. Mai un errore secco:
 * chi guarda deve sapere cosa è stato tentato e cosa può fare.
 */
export function erroreAltroPc(nome: string, messaggio: string, prove: string[]): string {
  const strade = 'Strade provate, in quest’ordine: la rete di casa, Tailscale, il collegamento diretto via Internet (WebRTC) e il Drive (lento: solo lettura e messaggi).'
  const dettaglio = prove.length > 0 ? ` Ultimo tentativo, indirizzo per indirizzo: ${prove.join('; ')}.` : ''
  return `${nome} non risponde: ${messaggio.replace(/\.\s*$/, '')}. ${strade}${dettaglio} I suoi autopiloti continuano a lavorare là: qui li rivedi appena risponde (il controllo si ripete da solo).`
}

/** L'elenco da una risposta di `/api/stato` di quel PC (campi storti scartati). */
export function autopilotiDaStato(stato: unknown): AutopilotaRiga[] {
  const a = (stato as { autopiloti?: unknown } | null)?.autopiloti
  if (!Array.isArray(a)) return []
  return a.filter((x): x is AutopilotaRiga => typeof x === 'object' && x !== null && typeof (x as AutopilotaRiga).id === 'string')
    .map((x) => ({
      ...x,
      nome: typeof x.nome === 'string' && x.nome !== '' ? x.nome : (typeof x.obiettivo === 'string' ? x.obiettivo : x.id),
      stato: typeof x.stato === 'string' ? x.stato : '',
      // In `/api/stato` i criteri sono un **numero** (con `fatti`), non l'elenco:
      // la riga li ridisegna come elenco, o «criteri.filter is not a function»
      // faceva cadere tutto il pannello Autopiloti (0.70.0, 13/10).
      criteri: criteriDa(x.criteri, x.fatti),
      chats: Array.isArray(x.chats) ? x.chats : [],
      compitiDaFare: Array.isArray(x.compitiDaFare) ? x.compitiDaFare : []
    }))
}

/** I criteri di una riga: l'elenco se c'è, altrimenti `n` criteri di cui `fatti` soddisfatti. */
export function criteriDa(criteri: unknown, fatti: unknown): { soddisfatto: boolean }[] {
  if (Array.isArray(criteri)) return criteri.filter((c): c is { soddisfatto: boolean } => typeof c === 'object' && c !== null).map((c) => ({ ...c, soddisfatto: c.soddisfatto === true }))
  const n = typeof criteri === 'number' && Number.isFinite(criteri) ? Math.max(0, Math.min(200, Math.floor(criteri))) : 0
  const f = typeof fatti === 'number' && Number.isFinite(fatti) ? Math.max(0, Math.floor(fatti)) : 0
  return Array.from({ length: n }, (_, i) => ({ soddisfatto: i < f }))
}
