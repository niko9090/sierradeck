import type { Autopilota, ChatGovernata, Traguardo } from './autopilota'
import { FERMA_DA_DIRE_MS, SILENZIO_DA_DIRE_MS } from './autopilota'
import { vociDecisioni } from './diario-autopilota'
import { RUOLI } from './ruoli-agenti'
import { leggiRigaRisposta } from './risposte-in-viaggio'

/**
 * Una riga della chat con l'autopilota.
 *
 * `tu` e `lui` sono le battute vere — quello che gli hai scritto, quello che
 * ti ha risposto o chiesto. `nota` è la sua voce di lavoro: ha deciso, ha
 * corretto, si è configurato. Le note stanno nello stesso flusso perché è così
 * che una chat si legge — in ordine, senza cercare in due posti — ma sono
 * disegnate più quiete, per non coprire le domande e le risposte.
 */
export type Battuta = {
  quando: string
  da: 'tu' | 'lui' | 'nota'
  testo: string
  /** Cosa ne ha fatto (dialogo), o il resto di una nota. */
  dettaglio?: string
  /**
   * Il colore della riga. `domanda` è una sua domanda ancora aperta, `fine` e
   * `fermo` chiudono la conversazione; gli altri sono i tipi del diario.
   */
  tono?: 'domanda' | 'decisione' | 'correzione' | 'preparazione' | 'lavoro' | 'pronto' | 'fine' | 'fermo' | 'traguardo'
  /** Quante volte di fila la stessa nota: dieci riprese uguali sono una riga. */
  volte?: number
}

/**
 * La chat con l'autopilota, dal principio a oggi, nell'ordine in cui è successa.
 *
 * Nicholas (18/09): «io posso dialogare con lui e lui con me attraverso la
 * chat, così rimangono ben visibili domande e risposte». Prima le sue domande
 * stavano in un riquadro ambra, le tue risposte nel diario, il dialogo in fondo
 * alla scheda: tre posti per una conversazione sola. Qui è una: quello che gli
 * hai chiesto all'inizio, le domande dell'intervista con le tue risposte, le
 * sue decisioni come note, il dialogo, la domanda che ha aperta adesso.
 *
 * Pura: si prova senza servizio.
 */
export function conversazione(a: Autopilota): Battuta[] {
  const righe: { b: Battuta; ordine: number }[] = []
  let n = 0
  const metti = (b: Battuta): void => { righe.push({ b, ordine: n++ }) }

  // P4: l'autopilota del workspace non ha un obiettivo scritto da te né
  // un'intervista: la conversazione comincia dal tuo primo messaggio.

  // Le domande e risposte della linguetta «Domande» (0.38.0) stanno nel
  // dialogo come traccia: la risposta scritta anche nel diario non va ripetuta.
  const tracce = a.dialogo.filter((s) => s.traccia === true && s.da === 'tu').map((s) => s.testo.replace(/\s+/g, ' ').trim().slice(0, 60))
  for (const v of vociDecisioni(a)) {
    // La domanda del supervisore non sta nella chat (0.38.0): sta nella
    // linguetta «Domande», e dopo la risposta entra qui come traccia.
    if (/^Ha deciso: chiedi(Utente)?$/.test(v.titolo)) continue
    if (v.tipo === 'tu' && tracce.some((t) => t !== '' && (v.dettaglio ?? v.titolo).replace(/\s+/g, ' ').trim().startsWith(t.slice(0, 50)))) continue
    if (v.tipo === 'tu') {
      // Una tua risposta arrivata a una sua domanda: è una battuta tua.
      const testo = v.dettaglio ?? v.titolo
      metti({ quando: v.quando, da: 'tu', testo: haiRisposto(testo), dettaglio: esitoRisposta(a, v.quando, testo) })
      continue
    }
    metti({
      quando: v.quando,
      da: 'nota',
      // 0.84.3 (collaudo c-96, D4): la nota si legge anche senza la Panoramica:
      // le chat per nome, non per sigla.
      testo: conNomiDelleChat(a, v.titolo),
      ...(v.dettaglio !== undefined ? { dettaglio: v.dettaglio } : {}),
      ...(v.tipo !== undefined ? { tono: v.tipo } : {})
    })
  }

  // Uno specialista ha finito, la Revisione ha approvato o rimandato (0.79.0):
  // una riga corta nella conversazione, scritta dai dati del servizio. La riga
  // tecnica resta in «Cosa è successo».
  for (const d of a.decisioni) {
    if (d.traguardo === undefined) continue
    const testo = rigaTraguardo(a, d.traguardo)
    if (testo !== undefined) metti({ quando: d.quando, da: 'nota', testo, tono: 'traguardo' })
  }

  for (const s of a.dialogo) {
    // 0.81.0 (Nicholas, 20/10: «non mi sento partecipe»): la tua risposta a una
    // sua domanda si legge come tale, con sotto cosa ne è stato fatto.
    if (s.da === 'tu' && s.traccia === true) {
      metti({ quando: s.quando, da: 'tu', testo: haiRisposto(s.testo), dettaglio: esitoRisposta(a, s.quando, s.testo) })
      continue
    }
    // 0.83.0: una risposta scritta a mano a una sua domanda. La domanda intera
    // sta sopra, se non è già la battuta appena prima (il via non lo è).
    if (s.da === 'tu' && s.risponde !== undefined) {
      const prima = righe[righe.length - 1]?.b
      if (prima?.da !== 'lui' || prima.testo.trim() !== s.risponde) metti({ quando: s.quando, da: 'lui', testo: s.risponde, tono: 'domanda' })
      metti({ quando: s.quando, da: 'tu', testo: haiRisposto(s.testo) })
      continue
    }
    metti({
      quando: s.quando,
      da: s.da,
      testo: s.testo,
      ...(s.da === 'lui' && s.esito !== undefined && s.esito !== 'nessun cambio' ? { dettaglio: s.esito } : {})
    })
  }

  // La domanda aperta e il via **non** stanno nella chat (0.38.0, Nicholas):
  // stanno nella linguetta «Domande», una per volta. Qui resta una nota
  // quieta che dice dove andare; dopo la risposta, domanda e risposta entrano
  // nella chat come traccia (dal dialogo).
  const chiede = a.stato === 'attesa' || (a.stato === 'intervista' && a.motivoSospensione !== undefined)
  if (chiede || a.stato === 'pronto') {
    metti({
      quando: a.ultimoEvento,
      da: 'nota',
      testo: a.stato === 'pronto' ? 'Aspetta il tuo via: è nella linguetta «Domande» qui sotto.' : 'Ti ha fatto una domanda: è nella linguetta «Domande» qui sotto.'
    })
  } else if (a.stato === 'finito') {
    metti({ quando: a.ultimoEvento, da: 'nota', testo: 'Ha finito.', tono: 'fine' })
  } else if (a.stato === 'sospeso') {
    metti({
      quando: a.ultimoEvento,
      da: 'nota',
      testo: 'Si è fermato.',
      ...(a.motivoSospensione !== undefined ? { dettaglio: a.motivoSospensione } : {}),
      tono: 'fermo'
    })
  }

  // In ordine di tempo; a parità, nell'ordine in cui sono state messe — è così
  // che l'intervista resta domanda-risposta-domanda-risposta.
  righe.sort((x, y) => x.b.quando.localeCompare(y.b.quando) || x.ordine - y.ordine)
  return comprimiNote(righe.map((r) => r.b))
}

/** «Hai risposto: …» (0.81.0): la tua risposta si riconosce a colpo d'occhio. */
export function haiRisposto(testo: string): string {
  return `Hai risposto: ${testo.trim()}`
}

/** Quanto dopo una risposta si cerca la riga del servizio che l'ha usata. */
const RISPOSTA_USATA_ENTRO_MS = 30 * 60_000

/**
 * Cosa ne è stato fatto della tua risposta (0.81.0), in una riga, dalle righe
 * del servizio scritte dopo: chi l'ha ricevuta, se ha pubblicato o no. Se
 * ancora niente l'ha usata, lo dice: è la differenza fra «l'ha letta» e «è
 * caduta nel vuoto».
 */
export function esitoRisposta(a: Pick<Autopilota, 'decisioni' | 'chats' | 'stato'>, quando: string, risposta: string): string {
  const da = Date.parse(quando)
  if (Number.isNaN(da)) return 'Ricevuta.'
  const pulito = (t: string): string => t.replace(/\s+/g, ' ').trim()
  const inizio = pulito(risposta).slice(0, 20)
  // È la sua solo se il servizio ripete le stesse parole: due risposte vicine
  // non si scambiano l'esito.
  const suo = (testo: string): boolean => inizio === '' || pulito(testo).startsWith(inizio)
  const vicine = a.decisioni
    .map((d) => ({ d, t: Date.parse(d.quando) }))
    .filter(({ t }) => !Number.isNaN(t) && t >= da - 5_000 && t - da <= RISPOSTA_USATA_ENTRO_MS)
    .sort((x, y) => Math.abs(x.t - da) - Math.abs(y.t - da))
  // 0.84.4: conta solo quando la chat la riceve. Vale l'ultima riga del
  // viaggio della risposta: presa, non presa (riconsegna), al supervisore.
  const chiDi = (id: string): string => {
    const chat = a.chats.find((c) => c.id === id)
    return chat !== undefined ? `${chat.ruolo !== undefined ? nomeChi(chat) : chat.id} («${compitoBreve(chat.compito, 40)}»)` : 'La chat'
  }
  const viaggio = vicine
    .map(({ d, t }) => ({ r: leggiRigaRisposta(d.cosa), t }))
    .filter((x): x is { r: NonNullable<ReturnType<typeof leggiRigaRisposta>>; t: number } => x.r !== undefined && suo(x.r.resto))
    .sort((x, y) => y.t - x.t)[0]?.r
  if (viaggio?.esito === 'presa') return `Presa: ${chiDi(viaggio.chi)} l’ha ricevuta e riprende il lavoro.`
  if (viaggio?.esito === 'non-presa') return `Non presa da ${chiDi(viaggio.chi)} al primo invio: la riconsegno.`
  if (viaggio?.esito === 'al-supervisore') return `Non presa da ${chiDi(viaggio.chi)}: l’ho data al supervisore come istruzione, non va persa.`
  for (const { d } of vicine) {
    const cosa = d.cosa
    const si = /^pubblicazione: hai detto sì \((.*)\)$/s.exec(cosa)
    if (si !== null && suo(si[1] ?? '')) return 'Pubblica.'
    const no = /^non pubblico: hai risposto «(.*)»$/s.exec(cosa)
    if (no !== null && suo(no[1] ?? '')) return 'Non pubblica, come hai detto.'
    // L'hook la aspettava: la chat l'ha ricevuta subito.
    const subito = /^risposta dell utente(?: \(([^)]+)\))?:\s*(.*)$/s.exec(cosa)
    if (subito !== null && suo(subito[2] ?? '')) return 'Presa: la chat la aspettava e l’ha ricevuta subito.'
    // Arrivata dopo l'attesa: è partita verso la chat, ma che l'abbia presa
    // non risulta ancora (0.84.4: prima qui si diceva già «l’ha ricevuta»).
    const tardiva = /^risposta tardiva(?: \(([^)]+)\))?:\s*(.*)$/s.exec(cosa)
    if (tardiva === null || !suo(tardiva[2] ?? '')) continue
    return `Ricevuta: la sto portando a ${tardiva[1] !== undefined ? chiDi(tardiva[1]).replace(/^La chat$/, 'la chat') : 'la chat'}, ti dico quando l’ha presa.`
  }
  // Nessuna traccia, ma il lavoro è andato avanti oltre la finestra: non si
  // promette niente che non risulti.
  const oltre = a.decisioni.some((d) => Date.parse(d.quando) - da > RISPOSTA_USATA_ENTRO_MS)
  if (oltre) return 'Ricevuta.'
  return a.stato === 'lavoro' || a.stato === 'attesa'
    ? 'Ricevuta: la porto alla chat che l’aveva chiesta.'
    : 'Ricevuta. L’autopilota è fermo: la userà quando riparte.'
}

/**
 * Le note consecutive identiche diventano una sola con il numero delle volte.
 *
 * Le battute vere non si comprimono mai: due «sì» tuoi di fila sono due
 * risposte, non una ripetizione.
 */
export function comprimiNote(battute: Battuta[]): Battuta[] {
  const uscita: Battuta[] = []
  for (const b of battute) {
    const ultima = uscita[uscita.length - 1]
    if (
      ultima !== undefined && ultima.da === 'nota' && b.da === 'nota' &&
      ultima.testo === b.testo && ultima.dettaglio === b.dettaglio
    ) {
      ultima.volte = (ultima.volte ?? 1) + 1
      ultima.quando = b.quando
      continue
    }
    uscita.push({ ...b })
  }
  return uscita
}

/** Sta ancora pensando alla tua ultima battuta: l'ultima cosa detta è tua. */
export function staPensando(a: Autopilota): boolean {
  const ultima = a.dialogo[a.dialogo.length - 1]
  return ultima?.da === 'tu' && ultima.traccia !== true
}

/** C'è una sua domanda aperta: quello che scrivi adesso è la risposta. */
export function haDomandaAperta(a: Autopilota): boolean {
  return a.stato === 'attesa' || (a.stato === 'intervista' && a.motivoSospensione !== undefined)
}

/**
 * Il compito di una chat in poche parole, per le righe corte (0.79.0): la
 * prima frase, al più `max` caratteri tagliati su una parola.
 */
export function compitoBreve(compito: string, max = 60): string {
  const prima = compito.split(/\r?\n/).map((r) => r.trim()).find((r) => r !== '') ?? ''
  const frase = (/^(.+?[.!?;])(\s|$)/.exec(prima)?.[1] ?? prima).replace(/[.;]$/, '').trim()
  if (frase.length <= max) return frase
  const taglio = frase.slice(0, max - 1)
  const spazio = taglio.lastIndexOf(' ')
  return `${(spazio > max / 2 ? taglio.slice(0, spazio) : taglio).replace(/[\s,:;–-]+$/, '')}…`
}

/** Una sigla interna («c-12», «gruppo 3») e un elenco di sigle («c-90 e c-91»). */
const SIGLA = '(?:\\bc-\\d+[a-z0-9-]*\\b|\\bgrupp[oi] \\d+\\b)'
const LISTA_SIGLE = `${SIGLA}(?:\\s*(?:,|\\be\\b|\\bed\\b|\\bo\\b)\\s*${SIGLA})*`
/** Le preposizioni che reggono una sigla e che, tolta lei, resterebbero sole. */
const PREPOSIZIONI = '(?:di|del|dello|della|dei|degli|delle|da|dal|dallo|dalla|dai|a|al|allo|alla|ai|in|nel|nello|nella|nei|su|sul|sulla|sui|per|con|tra|fra)'

/**
 * Il testo senza le sigle interne: «c-12», «(c-3)», «gruppo 3», i nomi dei
 * rami e degli autopiloti. Nicholas (22/10): le sigle non dicono niente a chi
 * legge; il compito si dice con le sue parole.
 */
export function senzaSigle(testo: string): string {
  return testo
    .replace(/\bap\/[\w./-]+/g, '')
    .replace(/\bap-[0-9a-f]{6,}\b/gi, '')
    .replace(new RegExp(`\\(\\s*(?:chat\\s+)?${LISTA_SIGLE}\\s*\\)`, 'gi'), '')
    .replace(new RegExp(`\\b(?:la |della |alla |dalla |nella )?chat ${LISTA_SIGLE}`, 'gi'), (m) => (/^(la|della|alla|dalla|nella) /i.test(m) ? m.replace(/\s+chat\s.*$/i, ' chat') : 'chat'))
    // 0.84.3 (collaudo c-96, D3): la sigla se ne va con la preposizione che la
    // regge e con le sorelle dell'elenco: «di c-90 e c-91» non lascia «di e»,
    // «del gruppo 3» non lascia «del».
    .replace(new RegExp(`(?:\\b${PREPOSIZIONI}\\s+)?${LISTA_SIGLE}`, 'gi'), '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+([,.;:)])/g, '$1')
    .replace(/([(])\s+/g, '$1')
    .replace(/^[\s,;:—–-]+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * Le sigle delle chat dette col loro nome (0.84.3, collaudo c-96 D4): «la chat
 * c-2 non dà segnali» → «Sviluppo non dà segnali», «c-2: nessun segnale» →
 * «Sviluppo: nessun segnale». I nomi dei rami (`ap/…/c-2`) restano: sono la
 * riga tecnica di «Cosa è successo», e lì servono per ritrovare il lavoro.
 */
export function conNomiDelleChat(a: Pick<Autopilota, 'chats'>, testo: string): string {
  const ruoli = Object.values(RUOLI).map((r) => r.nome).join('|')
  return testo.replace(new RegExp(`(?<![/\\w-])(?:(?:la|una) )?(?:chat )?(?:(?:${ruoli}) )?(c-\\d+)\\b`, 'gi'), (intero, id: string) => {
    const c = a.chats.find((x) => x.id === id.toLowerCase())
    if (c === undefined) return intero
    return c.ruolo !== undefined ? nomeChi(c) : `la chat «${compitoBreve(c.compito, 40)}»`
  })
}

/** «Sviluppo», «Revisione»… o «Una chat» per una chat senza ruolo. */
export function nomeChi(c: Pick<ChatGovernata, 'ruolo'> | undefined): string {
  return c?.ruolo !== undefined ? RUOLI[c.ruolo].nome : 'Una chat'
}

/**
 * La riga corta di un traguardo, dalle chat dell'autopilota (mai dalle loro
 * parole): «Revisione: ha approvato «il motore» di Sviluppo, unito.».
 * Niente se la chat non si trova più.
 */
export function rigaTraguardo(a: Pick<Autopilota, 'chats'>, t: Traguardo): string | undefined {
  const chi = a.chats.find((c) => c.id === t.chat)
  // 0.80.1: la chat che tace è messa da parte, l'autopilota no. Anche la chat
  // singola, che non sta fra le `chats`.
  // 0.81.0: anche queste valgono per la chat singola, che non sta fra le `chats`.
  const sola = (): string => `${chi !== undefined ? nomeChi(chi) : 'La chat'}${chi !== undefined ? ` («${senzaSigle(compitoBreve(chi.compito))}»)` : ''}`
  if (t.esito === 'da-parte') return `${sola()} non chiude un turno da troppo: la metto da parte, le altre continuano. Torna da sola appena risponde.`
  if (t.esito === 'mai-partita') return `${sola()} non è partita: nessuna finestra l'ha aperta. Rimetto il compito in coda e riprovo.`
  if (t.esito === 'muta') return `${sola()} non dà segnali da ${Math.round(SILENZIO_DA_DIRE_MS / 60_000)} minuti: aspetto. Se tace ancora a ${Math.round(FERMA_DA_DIRE_MS / 60_000)} minuti la rimetto al lavoro io e te lo dico.`
  // 0.84.3 (il Punto): una riga quando si blocca e quando resta ferma, con l'azione presa.
  if (t.esito === 'bloccata') return `${sola()} si è bloccata${t.nota !== undefined ? `: ${senzaSigle(t.nota)}` : ''}. Decido io come sbloccarla; se serve qualcosa che sai solo tu, te lo chiedo.`
  if (t.esito === 'ferma') return `${sola()} ${t.nota !== undefined ? senzaSigle(t.nota) : `è ferma da più di ${Math.round(FERMA_DA_DIRE_MS / 60_000)} minuti`}.`
  if (t.esito === 'unito' && chi === undefined) return 'Lavoro unito.'
  // 0.82.0: una domanda che non ti arriva perché è già successo.
  if (t.esito === 'gia-fatto') return `Già fatto: ${t.nota ?? 'la domanda era già risolta'}. Non te lo chiedo.`
  const di = t.di !== undefined ? a.chats.find((c) => c.id === t.di) : undefined
  if (chi === undefined) return undefined
  const lavoro = di ?? chi
  const cosa = `«${senzaSigle(compitoBreve(lavoro.compito))}»`
  const diChi = di !== undefined ? ` di ${nomeChi(di)}` : ''
  switch (t.esito) {
    case 'finito': return `${nomeChi(chi)}: ha finito ${cosa}.`
    case 'in-revisione': return `${nomeChi(chi)}: ha finito ${cosa}, ora lo rilegge la Revisione.`
    case 'approvato': return `${nomeChi(chi)}: ha approvato ${cosa}${diChi}, unito.`
    case 'da-rifare': return `${nomeChi(chi)}: rimanda ${cosa}${diChi} da correggere.`
    case 'chiede-te': return `${nomeChi(chi)}: rimanda di nuovo ${cosa}${diChi}, decidi tu come andare avanti.`
    case 'aperta': return `${nomeChi(chi)}: comincia ${cosa}.`
    case 'unito': return `${nomeChi(chi)}: ${cosa} unito.`
    // 0.84.0: l'agente finito esce dall'elenco, la conversazione resta 30 giorni.
    case 'nel-recupero': return `${nomeChi(chi)}: ha finito ${cosa}. La chiudo; la conversazione resta 30 giorni nel recupero e si rimette con «Ripristina».`
    default: return undefined
  }
}
