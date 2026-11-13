/**
 * **La finestra degli aggiornamenti** (13/11). Nicholas: la comunicazione
 * dell'aggiornamento (novità, avanzamento, «pronta da installare») deve stare
 * in una finestra vera, in basso a destra dello schermo, come fanno tanti
 * programmi: non dentro la faccia del programma e non come notifica di
 * Windows. Si chiude, e si richiama da una voce in alto.
 *
 * Qui solo regole pure, provate senza Electron: dove sta, quando si mostra da
 * sola, quando c'è qualcosa di non letto (il pallino in alto).
 */

export type Area = { x: number; y: number; width: number; height: number }
export type Grandezza = { width: number; height: number }

/** Lo spazio fra la finestra e i bordi dell'area di lavoro (la barra delle applicazioni è già fuori). */
export const MARGINE_NOVITA = 12

/** Che cosa mostra la finestra: lo stato dell'aggiornamento, le novità installate, o cosa cambia prima di installare. */
export type VistaNovita =
  | { tipo: 'aggiornamento' }
  | { tipo: 'novita' }
  | { tipo: 'installa'; versione: string }

/** Le grandezze: piccola per lo stato, più alta per leggere le note. */
export const GRANDEZZA_NOVITA: Record<VistaNovita['tipo'], Grandezza> = {
  aggiornamento: { width: 400, height: 300 },
  novita: { width: 460, height: 560 },
  installa: { width: 460, height: 600 }
}

/**
 * In basso a destra dell'area di lavoro, con il margine. Se l'area è più
 * piccola della finestra, la finestra si stringe: mai fuori dallo schermo.
 */
export function posizioneInBassoADestra(area: Area, grandezza: Grandezza, margine = MARGINE_NOVITA): Area {
  const width = Math.max(1, Math.min(Math.round(grandezza.width), area.width - 2 * margine))
  const height = Math.max(1, Math.min(Math.round(grandezza.height), area.height - 2 * margine))
  return {
    x: Math.round(area.x + area.width - margine - width),
    y: Math.round(area.y + area.height - margine - height),
    width,
    height
  }
}

/** Quello che serve sapere dello stato dell'aggiornamento (lo stesso di `StatoAggiornamento`). */
export type StatoPerNovita = {
  fase: string
  versione?: string
  errore?: string
  daTelefono?: boolean
  tentativoFallito?: { titolo: string }
}

/**
 * La chiave della «notizia» che lo stato porta, o `undefined` se non c'è
 * niente da dire. Due stati con la stessa chiave sono la stessa notizia: la
 * percentuale dello scaricamento non cambia la chiave, quindi la finestra non
 * ricompare a ogni passo. «Sto cercando» è una notizia solo se l'ha chiesto il
 * telefono (la ricerca automatica ogni 10 minuti non disturba); «già
 * aggiornato» non lo è mai (è la risposta a chi ha premuto ⟳, e lui la
 * finestra l'ha già aperta).
 */
export function chiaveNotizia(s: StatoPerNovita): string | undefined {
  const v = s.versione ?? ''
  let fase: string | undefined
  switch (s.fase) {
    case 'disponibile': fase = `disponibile:${v}`; break
    case 'scarico': fase = `scarico:${v}`; break
    case 'pronto': fase = `pronto:${v}:${s.errore ?? ''}`; break
    case 'errore': fase = `errore:${s.errore ?? ''}`; break
    case 'attendo': fase = `attendo:${v}`; break
    case 'installo': fase = `installo:${v}`; break
    case 'cerco': fase = s.daTelefono === true ? 'cerco:telefono' : undefined; break
    default: fase = undefined
  }
  // L'installazione non riuscita (0.39.2) resta in ogni stato finché la versione non cambia: è una notizia una volta.
  const fallito = s.tentativoFallito !== undefined && s.fase !== 'installo' && s.fase !== 'attendo' ? `fallito:${s.tentativoFallito.titolo}` : undefined
  if (fallito === undefined) return fase
  return `${fase ?? ''}|${fallito}`
}

/** Lo stato della finestra che serve alla voce in alto: aperta, e se c'è qualcosa di non letto. */
export type LetturaNovita = {
  /** L'ultima notizia annunciata (mostrata o messa da parte). */
  ultima?: string
  /** C'è una notizia che nessuno ha ancora guardato: il pallino in alto. */
  nonLetto: boolean
}

export const LETTURA_INIZIALE: LetturaNovita = { nonLetto: false }

/**
 * Arriva uno stato nuovo: c'è da mostrare la finestra? Solo per una notizia
 * **nuova** rispetto all'ultima: chiusa con la ×, ricompare solo per una
 * notizia diversa. L'ultima notizia si ricorda anche quando lo stato torna
 * tranquillo, così «pronta» → «cerco» → «pronta» (stessa versione) non la
 * riapre.
 */
export function suStato(l: LetturaNovita, s: StatoPerNovita): { lettura: LetturaNovita; mostra: boolean } {
  const k = chiaveNotizia(s)
  if (k === undefined || k === l.ultima) return { lettura: l, mostra: false }
  return { lettura: { ultima: k, nonLetto: true }, mostra: true }
}

/** Chi la usa l'ha guardata: aperta dalla voce in alto, toccata, o chiusa con la ×. */
export function segnaLetto(l: LetturaNovita): LetturaNovita {
  return l.nonLetto ? { ...l, nonLetto: false } : l
}

/** Il titolo della testa della finestra, per vista. */
export function titoloNovita(v: VistaNovita): string {
  if (v.tipo === 'novita') return 'Cosa c’è di nuovo'
  if (v.tipo === 'installa') return `Cosa cambia con la ${v.versione}`
  return 'Aggiornamento'
}

/** Legge una vista arrivata dall'IPC: tutto quello che non si riconosce torna allo stato dell'aggiornamento. */
export function leggiVista(x: unknown): VistaNovita {
  if (typeof x === 'object' && x !== null) {
    const t = (x as { tipo?: unknown }).tipo
    if (t === 'novita') return { tipo: 'novita' }
    if (t === 'installa') {
      const v = (x as { versione?: unknown }).versione
      return { tipo: 'installa', versione: typeof v === 'string' ? v.slice(0, 64) : '' }
    }
  }
  return { tipo: 'aggiornamento' }
}
