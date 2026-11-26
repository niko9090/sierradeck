import type { Coda } from '@shared/coda-richieste'
import type { Piano } from '@shared/piano-orchestratore'

/**
 * **Il lavoro fermo** (0.89.4). Nicholas, 02/11: «non porta a termine gli
 * obbiettivi, vedo chat ferme». L'autopilota si muove solo quando arriva un
 * messaggio o un evento: se chiudeva un turno con «non lancio altro, dimmi
 * tu», o se uno specialista finiva senza che lui unisse, il lavoro restava
 * fermo per ore con i compiti pronti nel piano.
 *
 * Qui il programma guarda il piano e la coda e dice cosa potrebbe muoversi e
 * non si muove. Il servizio lo controlla ogni minuto e, se nessuno lavora da
 * qualche minuto, lo manda all'autopilota come evento (`servizio-orchestratore`).
 */

export type LavoroFermo = {
  /** Cosa è fermo, in ordine: uguale finché non cambia niente. */
  firma: string
  /** Le righe per l'autopilota. */
  righe: string[]
}

/** La coda della firma dei compiti già in fila per un posto: non c'è niente da spingere finché i posti sono pieni. */
export const FIRMA_IN_FILA_PER_POSTO = ':in-fila-posto'

/** Solo compiti che aspettano un posto: spingere l'autopilota non serve, si muove da solo quando un posto si libera. */
export const soloAttesaDiPosti = (firma: string): boolean => firma !== '' && firma.split('|').every((t) => t.endsWith(FIRMA_IN_FILA_PER_POSTO))

const corto =(t: string, n: number): string => {
  const x = t.replace(/\s+/gu, ' ').trim()
  return x.length > n ? `${x.slice(0, n - 1)}…` : x
}

/**
 * Quello che potrebbe muoversi: compiti pronti da affidare, compiti in corso
 * senza nessuno che ci lavori, compiti finiti e non uniti, criteri rossi,
 * richieste aperte senza piano. `alLavoro`: gli id degli specialisti vivi.
 * `inUnione`: i compiti la cui unione è in corso o in fila (non sono fermi).
 */
/** Al massimo tanti caratteri per il motivo di un rifiuto nelle righe del registro. */
export const MOTIVO_RIFIUTO_MAX = 80

/**
 * Il motivo breve dell'ultimo rifiuto dell'Agent deciso dalla guardia («tetto pieno, in fila», «aspetta l'unione di k-N»,
 * «nessun PC ha i requisiti»): dal testo lungo scritto per l'autopilota, per le righe del registro.
 */
export function motivoBreveRifiuto(motivo: string): string {
  const m = motivo.replace(/\s+/gu, ' ').trim()
  const unione = /aspetta l[’']unione di ([^:]+?):/iu.exec(m)
  if (unione !== null) return corto(`aspetta l'unione di ${unione[1]!}`, MOTIVO_RIFIUTO_MAX)
  if (/troppi specialisti attivi|posto libero è già prenotato/iu.test(m)) return /in fila/iu.test(m) ? 'tetto pieno, in fila' : 'tetto pieno'
  if (/requisiti/iu.test(m)) return 'nessun PC ha i requisiti'
  return corto(m.split(/(?<=[.:;])\s/u, 1)[0]!.replace(/[.:;]$/u, ''), MOTIVO_RIFIUTO_MAX)
}

export function lavoroFermo(p: { coda: Coda; piano: Piano; alLavoro: ReadonlySet<string>; inUnione?: ReadonlySet<string>; unioniFerme?: ReadonlyMap<string, string>; inFilaPerPosto?: ReadonlySet<string>; rifiuti?: ReadonlyMap<string, string> }): LavoroFermo | undefined {
  const aperte = new Set(p.coda.richieste.filter((r) => r.stato !== 'fatta').map((r) => r.id))
  // 11/11: un compito chiuso senza unirlo non è fermo, e chi veniva dopo di lui non lo aspetta.
  const compiti = p.piano.compiti.filter((c) => aperte.has(c.richiesta) && c.chiuso === undefined)
  const verde = new Set(p.piano.compiti.filter((c) => (c.stato === 'unito' && c.criterioVerde === true) || c.chiuso !== undefined).map((c) => c.id))
  const firma: string[] = []
  const righe: string[] = []
  // k-178a: un «dopo» che nel piano non c'è più non aspetta niente: il compito è pronto lo stesso.
  const nelPiano = new Set(p.piano.compiti.map((c) => c.id))
  for (const c of compiti) {
    if (c.stato === 'da-fare' && p.inFilaPerPosto?.has(c.id) === true) {
      // k-330a: il suo Agent è già in fila per un posto (tetto pieno): riprovarlo viene rifiutato di nuovo, lo lancia il programma
      // quando un posto si libera. Non è «pronto da affidare»: spingere l'autopilota qui dava 3 spinte a vuoto e la sospensione.
      firma.push(`${c.id}${FIRMA_IN_FILA_PER_POSTO}`)
      righe.push(`- ${c.id} è già in fila per un posto libero (tetto di specialisti pieno): non rilanciarlo, il programma ti avvisa quando tocca a lui`)
    } else if (c.stato === 'da-fare' && c.dopo.every((d) => verde.has(d) || !nelPiano.has(d))) {
      firma.push(`${c.id}:pronto`)
      const rifiuto = p.rifiuti?.get(c.id)
      righe.push(`- ${c.id} pronto da affidare: ${corto(c.titolo, 100)}${rifiuto !== undefined ? ` (ultimo rifiuto: ${corto(rifiuto, MOTIVO_RIFIUTO_MAX)})` : ''}`)
    } else if (c.stato === 'in-corso' && (c.chat === undefined || !p.alLavoro.has(c.chat))) {
      firma.push(`${c.id}:orfano`)
      righe.push(`- ${c.id} risulta in corso ma nessuno specialista ci lavora più: rilancialo o uniscilo`)
    } else if (c.stato === 'in-revisione' && p.inUnione?.has(c.id) === true) {
      // 10/11: l'unione è in corso o in fila, il programma la sta facendo: non è fermo.
      continue
    } else if (c.stato === 'in-revisione' && p.unioniFerme?.has(c.id) === true) {
      // 12/11: la sua unione è ferma: non lo si rilancia, ma il resto va avanti (e lo si dice).
      firma.push(`${c.id}:unione-ferma`)
      righe.push(`- ${c.id} finito, unione ${p.unioniFerme.get(c.id)}: non rilanciarlo, intanto affida gli altri compiti pronti`)
    } else if (c.stato === 'in-revisione') {
      firma.push(`${c.id}:revisione:${c.esito ?? ''}`)
      righe.push(`- ${c.id} finito e non unito${c.esito !== undefined ? ` (${corto(c.esito, 160)})` : ''}`)
    } else if (c.stato === 'unito' && c.criterioVerde !== true) {
      firma.push(`${c.id}:rosso:${c.esito ?? ''}`)
      righe.push(`- ${c.id} unito con il criterio rosso${c.esito !== undefined ? `: ${corto(c.esito, 160)}` : ''}: affida la correzione`)
    }
  }
  for (const r of p.coda.richieste) {
    if (r.stato === 'fatta') continue
    const suoi = p.piano.compiti.filter((c) => c.richiesta === r.id)
    if (r.compiti.length === 0 && suoi.length === 0) {
      firma.push(`${r.id}:senza-piano`)
      righe.push(`- ${r.id} senza piano: «${corto(r.titolo, 100)}» — pianificala, o chiudila con coda_chiudi se non è lavoro`)
    } else if (suoi.length > 0 && suoi.every((c) => verde.has(c.id))) {
      // k-178a: tutti i compiti uniti (o chiusi) e la richiesta ancora aperta: nessuno la chiude, resterebbe così per sempre.
      firma.push(`${r.id}:da-chiudere`)
      righe.push(`- ${r.id} ha tutti i compiti uniti ma è ancora aperta: «${corto(r.titolo, 100)}» — verifica che sia davvero finita e chiudila con coda_chiudi`)
    }
  }
  return righe.length === 0 ? undefined : { firma: firma.join('|'), righe }
}

/**
 * **Le spinte non finiscono** (11/11). Prima erano due, a 3 e 6 minuti, e poi
 * il lavoro restava fermo in silenzio finché Nicholas non scriveva. Adesso
 * l'intervallo raddoppia a ogni spinta (3, 6, 12, 24, 48 minuti) fino a
 * un'ora; con domande aperte a Nicholas fino a quattro ore, perché forse
 * l'autopilota sta proprio aspettando lui.
 */
export const SPINTA_MASSIMA_MS = 60 * 60_000
export const SPINTA_MASSIMA_CON_DOMANDE_MS = 4 * 60 * 60_000
/** Da questa spinta in poi lo si dice anche a Nicholas: una riga, una volta per stato. */
export const SPINTE_PRIMA_DI_DIRLO = 3
/** k-199d: dopo tante spinte senza che la firma cambi si smette, finché la firma non cambia o Nicholas non scrive. */
export const SPINTE_SENZA_EFFETTO_MAX = 3

/** Quanta quiete serve prima della prossima spinta: `gia` sono quelle già date per questo stato. */
export function intervalloSpinta(gia: number, base: number, domandeAperte: boolean): number {
  const tetto = domandeAperte ? SPINTA_MASSIMA_CON_DOMANDE_MS : SPINTA_MASSIMA_MS
  // Oltre la ventesima il raddoppio non serve più: il tetto è già passato da un pezzo.
  return Math.min(tetto, base * 2 ** Math.min(20, Math.max(0, gia)))
}

/** La riga per Nicholas, corta e senza domande: il lavoro è fermo e il programma continua a provarci. */
export function rigaFermoPerNicholas(f: LavoroFermo, minuti: number, spinte: number): string {
  const durata = minuti >= 120 ? `${Math.round(minuti / 60)} ore` : `${minuti} minuti`
  const cose = f.righe.length === 1 ? 'una cosa in sospeso' : `${f.righe.length} cose in sospeso`
  return `Lavoro fermo da ${durata} (${cose}): ho svegliato l’autopilota ${spinte} volte e non è ripartito. Se non cambia niente smetto di insistere, finché non cambia qualcosa o mi scrivi.`
}

/** Il testo dell'evento per l'autopilota. */
export function testoLavoroFermo(f: LavoroFermo, minuti: number, domandeAperte: number): string {
  return [
    `Il lavoro è fermo da ${minuti} minuti: nessuno specialista lavora e nel piano c'è da fare.`,
    ...f.righe,
    'Vai avanti adesso, nello stesso turno: affida i compiti pronti, rilancia o unisci quelli rimasti a metà, chiudi quello che non è lavoro.',
    domandeAperte > 0
      ? `Ci sono ${domandeAperte} domande aperte a Nicholas: aspetta la risposta solo per i compiti che dipendono davvero da quella, e dillo in una riga. Il resto va avanti.`
      : 'Non chiedere «procedo?»: se un compito aspetta davvero una decisione di Nicholas, chiedila con chiedi_utente e intanto porta avanti il resto.'
  ].join('\n')
}

/**
 * k-178h: Nicholas chiede di restare fermi? Solo messaggi brevi che sono quel comando («resta fermo», «fermati», «stop»,
 * «ok stop», «aspetta»): una frase lunga che contiene «stop» per altro non mette in pausa. Restituisce la frase, o niente.
 */
export function chiedeDiFermarsi(testo: string): string | undefined {
  const t = testo.trim().replace(/\s+/gu, ' ')
  if (t.length <= 40 && /^(ok[, ]+|per ora[, ]+|adesso[, ]+)?(resta(re)? fermo|restate fermi|fermati|fermatevi|stop|basta|aspetta|pausa|fermo cos[iì])([ ,]+(per ora|adesso|un attimo|che ti dico io))?[\s.!]*$/iu.test(t)) return t
  return ordineDiPausa(testo)
}

const FERMO = String.raw`(?:rest(?:a|are|o|ate)|riman(?:i|ere|go|ete)) (?:fermo|ferma|fermi)`
const COMANDO_PAUSA = String.raw`(?:${FERMO}|fermati|fermatevi|fermo cos[iì]|non (?:fare|toccare) (?:niente|nulla)|lascia stare (?:per ora|per il momento|adesso|un attimo|fino a nuovo ordine)|aspetta (?:la mia risposta|mie notizie|un mio (?:via|ok|segnale|messaggio)|il mio (?:via|ok|segnale|ordine|messaggio)|che (?:ti )?(?:scriva|dica|dico|scrivo|avvisi|avviso)(?: io)?))`
const CODA_PAUSA = String.raw`(?:per ora|per il momento|adesso|un attimo|qui|subito|così|cosi|ok|che ti dico io|finch[eé] non (?:ti (?:scrivo|dico|avviso|faccio sapere|richiamo|do (?:il via|l'ok))|te lo (?:dico|scrivo)(?: io)?|torno|arrivo)|fino a (?:nuovo ordine|nuovi ordini|mio ordine|mio via|mio ok|domani|mio ritorno)|non (?:fare|toccare) (?:niente|nulla))`
const ORDINE_PAUSA = new RegExp(String.raw`^(?:(?:ok|sì|si|va bene|allora|per ora|adesso)[, ]+)?${COMANDO_PAUSA}(?:(?:[, ]+e |[, ]+)${CODA_PAUSA})*[\s.!]*$`, 'iu')
/** Parole che dicono «ma il resto va avanti»: con una di queste non è mai una pausa (nel dubbio non si ferma il lavoro). */
const RESTO_VA_AVANTI = /\b(ma|poi|tranne|escluso|vai avanti|continua|prosegui|procedi)\b/iu

/**
 * k-310c: un ordine esplicito di restare fermi («Resta fermo», «Rimani fermo finché non ti scrivo», «Fermati qui»,
 * «Non fare niente», «Lascia stare per ora», «Aspetta la mia risposta»). Vale anche per le risposte a una domanda:
 * lì «aspetta», «stop», «basta» da soli NON bastano (vogliono dire «aspetta quella cosa»). Frasi che continuano
 * («resta fermo il ramo X ma vai avanti col resto», «aspetta che finisca la prova e poi unisci») non sono pausa.
 * Restituisce la frase, o niente.
 */
export function ordineDiPausa(testo: string): string | undefined {
  const t = testo.trim().replace(/\s+/gu, ' ').replace(/[’‘]/gu, "'")
  if (t === '' || t.length > 90 || RESTO_VA_AVANTI.test(t)) return undefined
  return ORDINE_PAUSA.test(t) ? t : undefined
}
