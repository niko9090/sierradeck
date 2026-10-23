import type { Autopilota } from './autopilota'
import { adessoDi, COLORE_ADESSO, type RigaAdesso, type SegniDalVivo } from './adesso'
import { compitoBreve, nomeChi, senzaSigle } from './chat-autopilota'
import { pianoAutopilota } from './panoramica'
import { parolaSegnale, type TipoSegnale } from './segnali-flotta'
import { COLORE_RICHIESTA, giornoDi, parolaStato, statoRichiesta, type StatoRichiesta } from './richieste-nicholas'
import { velocitaDi } from './velocita-richieste'
import { indicatoreDi, type Indicatore, type SegniVeri, type SupervisoreMuto } from './indicatore-autopilota'
import type { PcCarico } from './guardia-pc'

export { senzaSigle }

/**
 * **Il Punto** (0.84.3) in cima alla conversazione dell'autopilota.
 *
 * Nicholas (22/10 sera): l'autopilota è l'unico interlocutore. In cima alla
 * sua conversazione, su PC, pagina e app, un punto sempre aggiornato: il passo
 * in corso, ogni chat al lavoro con il compito in parole semplici (senza
 * sigle), cosa è finito, cosa viene dopo, cosa serve da lui, e la percentuale
 * dei limiti del piano solo come informazione (il freno è spento dalla 0.84.2:
 * ai consumi pensa lui).
 *
 * Pura: la calcola il PC, la pagina e l'app mostrano le righe come sono.
 */

/** Il colore del segnale di una chat: gli stessi nomi di `COLORE_ADESSO`, uguali su PC, pagina e app. */
export const COLORE_SEGNALE: Record<TipoSegnale, 'rosso' | 'ambra' | 'quieto' | 'verde' | 'blu'> = {
  parto: 'blu',
  avanti: 'verde',
  fatto: 'verde',
  bloccata: 'rosso',
  aspetto: 'ambra'
}

/** Il simbolo del segnale, per chi non distingue i colori. */
export const SIMBOLO_SEGNALE: Record<TipoSegnale, string> = { parto: '▶', avanti: '●', fatto: '✓', bloccata: '■', aspetto: '◆' }

export type ChatNelPunto = RigaAdesso & {
  /** L'ultimo segnale della chat all'autopilota, in parole e con il suo colore. */
  segnale?: { tipo: TipoSegnale; parola: string; colore: string; simbolo: string }
  /** Il colore della riga (`COLORE_ADESSO`), già deciso: la pagina e l'app non rifanno la tabella. */
  colore: string
}

export type Punto = {
  /** Sopra tutto (0.85.0): le tre righe a colpo d'occhio, dai soli segnali veri. */
  indicatore: Indicatore
  /**
   * In cima (0.85.0): le richieste di Nicholas ancora aperte, o fatte da poco,
   * con lo stato. Vuoto: nessuna richiesta registrata.
   */
  richieste: RichiestaNelPunto[]
  /** Quante in tutto (per «e altre N»). */
  richiesteTotale: number
  /** «Lavora: 3 di 7 criteri soddisfatti». */
  passo: string
  /** Una riga per chat aperta, prima le ferme. */
  chat: ChatNelPunto[]
  /** Quante chat sono finite (non hanno una riga). */
  finite: number
  /** Gli ultimi compiti finiti, dal più recente. */
  fatto: string[]
  /** Quanti compiti finiti in tutto (per «e altri N»). */
  fattoTotale: number
  /** Cosa viene dopo: in revisione, poi in coda. */
  dopo: string[]
  dopoTotale: number
  /** Cosa serve da Nicholas; vuoto: niente, va avanti da solo. */
  daTe: string[]
  /** I limiti del piano, solo informazione. Assente se non ancora letti. */
  limiti?: string
  /**
   * La velocità misurata (0.85.0): dalla richiesta alla versione pubblicata e
   * dove si perde il tempo, con la spiegazione per il «?». Assente finché
   * nessuna richiesta è uscita in una versione.
   */
  velocita?: { testo: string; aiuto: string }
}

export type RichiestaNelPunto = {
  id: string
  /** «23/10». */
  giorno: string
  titolo: string
  stato: StatoRichiesta
  /** «da fare», «in corso», «fatta nella versione 0.85.0». */
  parola: string
  colore: string
}

/** Quante righe al più in cima al Punto. */
export const RICHIESTE_NEL_PUNTO = 5
/** Una richiesta fatta resta in cima finché non è pubblicata, e poi ancora per un giorno. */
const FATTA_IN_VISTA_MS = 24 * 3_600_000

/**
 * Le richieste per il Punto: prima quelle in corso, poi da fare, poi le fatte
 * non ancora pubblicate o pubblicate da meno di un giorno; dentro ogni gruppo
 * la più recente prima. `totale` per «e altre N».
 */
export function richiesteNelPunto(
  a: Pick<Autopilota, 'criteri' | 'chats' | 'richieste'>,
  ora: number
): { righe: RichiestaNelPunto[]; totale: number } {
  const ordine: Record<StatoRichiesta, number> = { 'in-corso': 0, 'da-fare': 1, fatta: 2 }
  const tutte = (a.richieste ?? [])
    .map((r) => ({ r, stato: statoRichiesta(r, a) }))
    .filter(({ r, stato }) => {
      if (stato !== 'fatta') return true
      if (r.versione === undefined) return true
      const il = Date.parse(r.fattaIl ?? r.quando)
      return Number.isNaN(il) || ora - il < FATTA_IN_VISTA_MS
    })
    .sort((x, y) => ordine[x.stato] - ordine[y.stato] || Date.parse(y.r.quando) - Date.parse(x.r.quando))
  return {
    righe: tutte.slice(0, RICHIESTE_NEL_PUNTO).map(({ r, stato }) => ({
      id: r.id,
      giorno: giornoDi(r.quando),
      titolo: senzaSigle(compitoBreve(r.titolo, 80)),
      stato,
      parola: parolaStato(stato, r.versione),
      colore: COLORE_RICHIESTA[stato]
    })),
    totale: tutte.length
  }
}

/** Quante righe al più in «Finito» e «Dopo»: il Punto sta in cima, non è un elenco. */
export const RIGHE_PUNTO_MAX = 4

/** Il passo in corso, in una riga. */
function passoDi(a: Autopilota): string {
  const fatti = a.criteri.filter((c) => c.soddisfatto).length
  const criteri = a.criteri.length === 0 ? '' : `${fatti} di ${a.criteri.length} criteri soddisfatti`
  const motivo = a.motivoSospensione !== undefined && a.motivoSospensione.trim() !== '' ? senzaSigle(a.motivoSospensione) : undefined
  switch (a.stato) {
    case 'intervista': return motivo !== undefined ? `Prepara: ${motivo}` : 'Prepara: guarda il progetto e si dà i criteri di fine'
    case 'pronto': return 'Pronto: aspetta il tuo via'
    case 'lavoro': return `Lavora${criteri !== '' ? `: ${criteri}` : ''}${a.strategia !== undefined ? ` · prova un’altra strada: ${senzaSigle(a.strategia)}` : ''}`
    case 'attesa': return `Lavora${criteri !== '' ? `: ${criteri}` : ''} · aspetta una tua risposta`
    case 'finito': return `Finito${criteri !== '' ? `: ${criteri}` : ''}`
    default: return `Fermo${motivo !== undefined ? `: ${motivo}` : ''}${criteri !== '' ? ` · ${criteri}` : ''}`
  }
}

/** Il segnale di una chat in parole semplici: la sorella che aspetta si dice col suo ruolo e il suo compito. */
function parolaDelSegnale(a: Autopilota, s: NonNullable<Autopilota['chats'][number]['segnale']>): string {
  if (s.tipo === 'aspetto' && s.di !== undefined) {
    const sorella = a.chats.find((c) => c.id === s.di)
    return sorella !== undefined ? `aspetta ${nomeChi(sorella)} («${senzaSigle(compitoBreve(sorella.compito, 40))}»)` : 'aspetta un’altra chat'
  }
  return senzaSigle(parolaSegnale(s))
}

function percento(x: number | undefined): number | undefined {
  return typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.min(100, Math.round(x))) : undefined
}

/** La riga dei limiti: solo informazione, il freno non c'è più. */
export function rigaLimiti(l: { cinqueOre?: number; settimana?: number } | undefined): string | undefined {
  const cinque = percento(l?.cinqueOre)
  const sett = percento(l?.settimana)
  if (cinque === undefined && sett === undefined) return undefined
  const parti = [cinque !== undefined ? `5 ore ${cinque}%` : '', sett !== undefined ? `settimana ${sett}%` : ''].filter((x) => x !== '')
  return `Limiti del piano: ${parti.join(', ')}. Solo per informazione: le chat non si fermano per questo.`
}

/**
 * Il Punto dell'autopilota. `domandeAperte`: le sue domande che aspettano
 * Nicholas (le sa il PC, non l'autopilota). `limiti`: le percentuali lette.
 */
export function puntoDi(
  a: Autopilota & SegniDalVivo & SegniVeri & { supervisoreMuto?: SupervisoreMuto; pcCarico?: PcCarico },
  ora: number,
  p: { domandeAperte?: number; limiti?: { cinqueOre?: number; settimana?: number } } = {}
): Punto {
  const adesso = adessoDi(a, ora)
  const chat: ChatNelPunto[] = adesso.righe.map((r) => {
    const c = a.chats.find((x) => x.id === r.id)
    const s = c?.segnale
    return {
      ...r,
      // La chat senza ruolo si chiamava col suo numero («c-14»): qui «Una chat».
      chi: c !== undefined ? nomeChi(c) : r.chi,
      compito: senzaSigle(r.compito),
      testo: senzaSigle(r.testo),
      colore: COLORE_ADESSO[r.tono],
      ...(s !== undefined ? { segnale: { tipo: s.tipo, parola: parolaDelSegnale(a, s), colore: COLORE_SEGNALE[s.tipo], simbolo: SIMBOLO_SEGNALE[s.tipo] } } : {})
    }
  })

  const piano = pianoAutopilota(a)
  const breve = (t: string): string => senzaSigle(compitoBreve(t))
  const finiti = piano.filter((x) => x.fase === 'fatto').reverse()
  const inRevisione = piano.filter((x) => x.fase === 'in-revisione').map((x) => `${breve(x.testo)}: lo rilegge la Revisione`)
  const inCoda = piano.filter((x) => x.fase === 'da-fare').map((x) => breve(x.testo))
  const dopo = [...inRevisione, ...inCoda]

  const daTe: string[] = []
  const domande = p.domandeAperte ?? 0
  if (a.stato === 'pronto') daTe.push('Il tuo via, per cominciare.')
  if (domande > 0) daTe.push(domande === 1 ? 'Una risposta: la domanda è nella linguetta «Domande».' : `${domande} risposte: le domande sono nella linguetta «Domande».`)
  else if (a.stato === 'attesa' || (a.stato === 'intervista' && a.motivoSospensione !== undefined)) daTe.push('Una risposta: la domanda è nella linguetta «Domande».')
  if ((a.stato === 'sospeso' || a.stato === 'fallito') && daTe.length === 0) daTe.push('Si è fermato: dimmi se riprendere, scrivendogli qui sotto.')

  const limiti = rigaLimiti(p.limiti)
  const richieste = richiesteNelPunto(a, ora)
  const velocita = velocitaDi(a, ora)
  return {
    indicatore: indicatoreDi(a, ora),
    richieste: richieste.righe,
    richiesteTotale: richieste.totale,
    passo: passoDi(a),
    chat,
    finite: adesso.finite,
    fatto: finiti.slice(0, RIGHE_PUNTO_MAX).map((x) => breve(x.testo)),
    fattoTotale: finiti.length,
    dopo: dopo.slice(0, RIGHE_PUNTO_MAX),
    dopoTotale: dopo.length,
    daTe,
    ...(limiti !== undefined ? { limiti } : {}),
    ...(velocita !== undefined ? { velocita } : {})
  }
}

/** «e altri 3», o niente. */
export function altri(totale: number, mostrati: number): string {
  const n = totale - mostrati
  return n <= 0 ? '' : n === 1 ? 'e un altro' : `e altri ${n}`
}

/** Il «?» del Punto, uguale dappertutto. */
export const AIUTO_PUNTO = 'Il punto della situazione, sempre aggiornato: in cima le tue richieste con lo stato (da fare, in corso, fatta nella versione X), poi a che passo è l’autopilota, cosa fa ogni sua chat (con il segnale che gli ha mandato l’ultima volta), cosa è finito, cosa viene dopo e cosa serve da te. I limiti del piano sono solo un’informazione: le chat non si fermano per quelli. Sotto, la conversazione ha una riga quando una chat parte, finisce, si blocca, viene unita o resta ferma più di 15 minuti, con quello che l’autopilota ha fatto.'
