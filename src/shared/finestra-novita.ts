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

/**
 * La grandezza della finestra (13/11, rifatta): una sola per tutte le viste,
 * abbastanza grande da leggere il registro delle versioni senza scorrere
 * subito. Chi la usa la può allargare o stringere dal bordo, e la grandezza
 * scelta si ricorda **solo su questo PC** (un file accanto ai dati, mai nelle
 * impostazioni che vanno anche al telefono).
 */
export const GRANDEZZA_PREDEFINITA: Grandezza = { width: 520, height: 640 }
export const GRANDEZZA_MINIMA: Grandezza = { width: 420, height: 400 }
export const GRANDEZZA_MASSIMA: Grandezza = { width: 1600, height: 1400 }

/** Il nome del file, nella cartella dei dati di questo PC. */
export const FILE_GRANDEZZA_NOVITA = 'finestra-aggiornamenti.json'

/** Tiene una grandezza fra la minima e la massima, in pixel interi. */
export function grandezzaNeiLimiti(g: Grandezza): Grandezza {
  const tieni = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, Math.round(v)))
  return {
    width: tieni(g.width, GRANDEZZA_MINIMA.width, GRANDEZZA_MASSIMA.width),
    height: tieni(g.height, GRANDEZZA_MINIMA.height, GRANDEZZA_MASSIMA.height)
  }
}

/** La grandezza salvata, letta dal file: quello che non si capisce torna alla predefinita. */
export function leggiGrandezzaSalvata(x: unknown): Grandezza {
  if (typeof x === 'object' && x !== null) {
    const { width, height } = x as { width?: unknown; height?: unknown }
    if (typeof width === 'number' && typeof height === 'number' && Number.isFinite(width) && Number.isFinite(height)) {
      return grandezzaNeiLimiti({ width, height })
    }
  }
  return GRANDEZZA_PREDEFINITA
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

/** Quello che serve dello stato per la testa della finestra. */
export type StatoPerTesta = { fase: string; versione?: string; percento?: number; daTelefono?: boolean }

/**
 * C'è qualcosa in corso nell'aggiornamento (una versione in arrivo, pronta,
 * in attesa delle chat, un errore)? Allora il numero di versione in alto apre
 * lo stato nella finestra, e ha un pallino quieto. La ricerca automatica da
 * sola non conta.
 */
export function aggiornamentoInCorso(a?: { fase: string }): boolean {
  return a !== undefined && ['disponibile', 'scarico', 'pronto', 'attendo', 'installo', 'errore'].includes(a.fase)
}

/** Le fasi in cui c'è una versione nuova in arrivo o pronta. */
export function conVersioneNuova(s: StatoPerTesta): boolean {
  return s.versione !== undefined && s.versione !== '' && ['disponibile', 'scarico', 'pronto', 'attendo', 'installo'].includes(s.fase)
}

/**
 * La testa della finestra: la frase dello stato, grande, e sotto le versioni
 * («da 0.106.0 → a 0.106.2», o «versione 0.106.1»).
 */
export function testaNovita(s: StatoPerTesta, installata: string, v: VistaNovita): { titolo: string; versioni: string } {
  const nuova = conVersioneNuova(s) ? s.versione : undefined
  const versioni = nuova !== undefined
    ? (installata !== '' ? `da ${installata} → a ${nuova}` : `versione ${nuova}`)
    : (installata !== '' ? `versione ${installata}` : '')
  let titolo: string
  switch (s.fase) {
    case 'disponibile': titolo = nuova !== undefined ? `Nuova versione ${nuova}` : 'Nuova versione'; break
    case 'scarico': titolo = `Sto scaricando… ${s.percento ?? 0}%`; break
    case 'pronto': titolo = nuova !== undefined ? `Nuova versione ${nuova} pronta` : 'Nuova versione pronta'; break
    case 'attendo': titolo = 'Installo appena le chat finiscono'; break
    case 'installo': titolo = `Sto installando la ${nuova ?? 'versione nuova'}`; break
    // Sulle novità appena installate la ricerca automatica dell'avvio non cambia la frase.
    case 'cerco': titolo = v.tipo === 'novita' && s.daTelefono !== true ? 'Installata: ecco cosa cambia' : 'Cerco aggiornamenti…'; break
    case 'errore': titolo = 'Aggiornamento non riuscito'; break
    default: titolo = v.tipo === 'novita' ? 'Installata: ecco cosa cambia' : 'Sei aggiornato'
  }
  return { titolo, versioni }
}

/**
 * **Il primo avvio dopo un'installazione** (13/11): la finestra si apre da
 * sola su «Installata: ecco cosa cambia». Il file di questo PC
 * (`FILE_VERSIONE_VISTA`) ricorda l'ultima versione di cui si sono mostrate le
 * novità: se quella che gira è più nuova, è appena stata installata. Senza il
 * file (primo avvio di questa regola) vale il segno dell'installazione fatta
 * dal programma (`tentativo-installazione.json` riuscito). Una versione più
 * vecchia (ritorno indietro) non apre niente.
 */
export const FILE_VERSIONE_VISTA = 'finestra-aggiornamenti-versione.json'

/** `a` viene prima di `b` (numeri x.y.z; quello che non è un numero vale 0). */
export function versionePrima(a: string, b: string): boolean {
  const x = a.split('.').map((n) => Number.parseInt(n, 10) || 0)
  const y = b.split('.').map((n) => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i += 1) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0)
  return false
}

/** La versione scritta nel file, o `undefined` se manca o non si capisce. */
export function leggiVersioneVista(x: unknown): string | undefined {
  if (typeof x !== 'object' || x === null) return undefined
  const v = (x as { versione?: unknown }).versione
  return typeof v === 'string' && /^\d+\.\d+\.\d+/.test(v) ? v : undefined
}

export function installataDaMostrare(p: { vista: string | undefined; attuale: string; tentativoRiuscito: boolean }): boolean {
  if (p.attuale === '') return false
  if (p.vista !== undefined) return versionePrima(p.vista, p.attuale)
  return p.tentativoRiuscito
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
