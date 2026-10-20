import { somiglianza as somiglianzaRisposte, type RispostaRicordata } from './memoria'
import { somiglianza as somiglianzaAperte } from './coordinatore'

/**
 * Le domande che **non** devono arrivare a Nicholas (0.81.0).
 *
 * Nicholas (20/10): «se ti rispondo non vedi le risposte, mi fai la stessa
 * domanda più volte». Quella mattina «Installi tu la 0.80.0?» gli è arrivata
 * due volte, la seconda in inglese, quando la 0.80.1 era già installata da
 * due minuti. I filtri che c'erano (stessa frase, o parole quasi tutte uguali)
 * non potevano vederlo: due chat, due lingue, nessuna parola in comune.
 *
 * Qui si guarda **l'argomento** (installare quale versione), lo **stato vero**
 * (la versione in uso) e **chi chiede** (la stessa chat che richiede la stessa
 * cosa). Il confronto per argomento vale solo per i casi riconosciuti con
 * certezza: scartare una domanda vera è peggio che farla due volte.
 */

/**
 * Una versione del programma: «la 0.80.0», «versione 0.80.0», «v0.80.0»,
 * «SierraDeck 0.80.0», «the 0.80.0». Un numero qualunque no: «installo vitest
 * 0.34.6?» parla di un pacchetto, e non va confusa (Revisione 0.81.0).
 * Dal 0.82.0 anche «una 0.81.1» e «pubblico (adesso) la 0.81.1».
 */
const VERSIONE = /(?:(?<![\p{L}])(?:la|alla|della|una|versione|release|sierradeck|the|pubblic[\p{L}]*|publish[\p{L}]*|rilasci[\p{L}]*)\s+(?:(?:adesso|ora|subito|now)\s+)?(?:(?:una|la|the|a)\s+)?v?|(?<![\p{L}\d.])v)(\d+\.\d+\.\d+)(?![\d.])/giu
/** Installare (non disinstallare): «installi», «installo», «install», «installa». */
const INSTALLA = /(?<![\p{L}])install/iu
/** Pubblicare (0.82.0): «pubblico», «pubblicata», «publish», «rilascio», «release». */
const PUBBLICA = /(?<![\p{L}])(?:pubblic|publish|rilasc|release)/iu
/** Unire un ramo (0.82.0): «unisco», «unire», «merge». */
const UNISCI = /(?<![\p{L}])(?:unisc|unir|merg)/iu
/** Chiudere una chat (0.82.0): «chiudo», «chiudere», «close». */
const CHIUDI = /(?<![\p{L}])(?:chiud|close)/iu

export type Argomento = { installa: boolean; pubblica: boolean; versioni: string[] }

export function argomentoDi(testo: string): Argomento {
  const versioni = [...new Set([...testo.matchAll(VERSIONE)].map((m) => m[1]!))]
  return { installa: INSTALLA.test(testo), pubblica: PUBBLICA.test(testo), versioni }
}

/**
 * Due domande sullo stesso argomento riconosciuto: installare **le stesse**
 * versioni. «La 0.80.0 o la 0.80.1?» non è «la 0.80.1?».
 */
export function stessoArgomento(a: string, b: string): boolean {
  const x = argomentoDi(a)
  const y = argomentoDi(b)
  return x.installa && y.installa && x.versioni.length > 0 &&
    x.versioni.length === y.versioni.length && x.versioni.every((v) => y.versioni.includes(v))
}

/** -1, 0, 1 come un comparatore; le parti mancanti valgono 0. */
export function confrontaVersioni(a: string, b: string): number {
  const x = a.replace(/^v/, '').split(/[.-]/).map((n) => Number.parseInt(n, 10) || 0)
  const y = b.replace(/^v/, '').split(/[.-]/).map((n) => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(x.length, y.length, 3); i += 1) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  return 0
}

/**
 * Quello che il servizio sa davvero, adesso (0.82.0: anche le release, i rami
 * e le chat). Ogni parte manca quando non si è potuta leggere, e allora non
 * scarta niente: scartare una domanda vera è peggio che farla due volte.
 */
export type StatoVero = {
  /** La versione in uso su questo PC: solo quando il progetto è il programma stesso. */
  versioneInstallata?: string
  /** Le versioni già pubblicate (gh release list, senza bozze), senza la «v». */
  releasePubblicate?: string[]
  /** Le chat di questo autopilota: «c-310» è una di loro solo se è qui. */
  chat?: { id: string; ramo?: string; finita: boolean }[]
  /** Se il ramo è già nel ramo principale; `undefined` se non si sa. */
  ramoUnito?: (ramo: string) => boolean | undefined
}

/** Le chat nominate nella domanda, per id («c-310») o per ramo. */
function chatNominate(testo: string, chat: NonNullable<StatoVero['chat']>): { trovate: NonNullable<StatoVero['chat']>; ignote: boolean } {
  const ids = [...new Set([...testo.matchAll(/(?<![\p{L}\d/-])c-\d+(?![\d])/giu)].map((m) => m[0].toLowerCase()))]
  const trovate = chat.filter((c) => ids.includes(c.id.toLowerCase()) || (c.ramo !== undefined && testo.includes(c.ramo)))
  const ignote = ids.some((id) => !chat.some((c) => c.id.toLowerCase() === id))
  return { trovate, ignote }
}

const elenco = (v: string[]): string => v.map((x) => `la ${x}`).join(' e ')

/**
 * La domanda è già risolta dai fatti? Restituisce il perché, da mostrare e da
 * dire alla chat, o `undefined` se va chiesta.
 *
 * - «installi la X?» quando sul PC gira già la X o una più nuova (0.81.0);
 * - «pubblico la X?» quando la X è già fra le release pubblicate (0.82.0, il
 *   caso vero del 20/10: «Pubblico adesso una 0.81.1?» a 0.81.1 già fuori);
 * - senza versioni: «unisco c-310?» col ramo già nel principale, «chiudo la
 *   c-15?» con la chat già finita.
 *
 * Se la domanda parla di installare **e** pubblicare, devono essere vere
 * tutte e due. Una chat nominata che non è di questo autopilota la lascia
 * passare: non si sa niente di lei.
 */
export function risoltaDalloStato(testo: string, stato: StatoVero): string | undefined {
  const arg = argomentoDi(testo)
  if (arg.versioni.length > 0 && (arg.installa || arg.pubblica)) {
    const perche: string[] = []
    if (arg.pubblica) {
      const fuori = stato.releasePubblicate
      if (fuori === undefined || !arg.versioni.every((x) => fuori.some((r) => confrontaVersioni(r, x) === 0))) {
        // «La 0.81.1 è pubblicata: la installi?» parla di installare.
        if (!arg.installa) return undefined
      } else {
        perche.push(`${elenco(arg.versioni)} ${arg.versioni.length > 1 ? 'sono già pubblicate' : 'è già pubblicata'}`)
      }
    }
    if (arg.installa) {
      const v = stato.versioneInstallata
      if (v === undefined || v === '' || !arg.versioni.every((x) => confrontaVersioni(x, v) <= 0)) return undefined
      perche.push(`su questo PC è già installata la ${v}`)
    }
    return perche.length > 0 ? perche.join(', e ') : undefined
  }
  if (arg.versioni.length > 0 || stato.chat === undefined) return undefined
  const unisci = UNISCI.test(testo)
  const chiudi = CHIUDI.test(testo)
  if (!unisci && !chiudi) return undefined
  const { trovate, ignote } = chatNominate(testo, stato.chat)
  if (trovate.length === 0 || ignote) return undefined
  const perche: string[] = []
  if (unisci) {
    const unite = trovate.every((c) => c.ramo !== undefined && stato.ramoUnito?.(c.ramo) === true)
    if (!unite) return undefined
    perche.push(trovate.length > 1 ? `i rami di ${trovate.map((c) => c.id).join(' e ')} sono già nel ramo principale` : `il ramo di ${trovate[0]!.id} è già nel ramo principale`)
  }
  if (chiudi) {
    if (!trovate.every((c) => c.finita)) return undefined
    perche.push(trovate.length > 1 ? `le chat ${trovate.map((c) => c.id).join(' e ')} sono già chiuse` : `la chat ${trovate[0]!.id} è già chiusa`)
  }
  return perche.join(', e ')
}

/**
 * Quanto vale una risposta per una domanda ripetuta. Per argomento poco: lo
 * stato cambia (una versione pronta oggi non lo era ieri). Dalla stessa chat
 * un giorno: è lei che richiede la stessa cosa nello stesso lavoro.
 */
export const VALIDA_PER_ARGOMENTO_MS = 6 * 3_600_000
export const VALIDA_STESSA_CHAT_MS = 24 * 3_600_000
/**
 * Una risposta che rimanda o dice di no non chiude l'argomento: riproposta da
 * sola diventerebbe un «no» per sempre (Revisione 0.81.0).
 */
const RINVIO = /^\s*(no\b|non\b|aspetta|dopo\b|più tardi|piu tardi|domani|ancora no|non ancora|lascia stare|per ora no)/i
/** Dalla stessa chat basta meno somiglianza: è lei che richiede. */
export const SIMILE_STESSA_CHAT = 0.5

/**
 * Una risposta già data alla stessa domanda: stesso argomento riconosciuto,
 * oppure la stessa chat che chiede di nuovo una cosa molto simile.
 */
export function rispostaGiaData(
  risposte: RispostaRicordata[],
  domanda: string,
  chat: string | undefined,
  adesso: number
): (RispostaRicordata & { perche: 'argomento' | 'stessa chat' }) | undefined {
  for (const r of [...risposte].reverse()) {
    const t = Date.parse(r.quando)
    const eta = Number.isFinite(t) ? adesso - t : 0
    if (RINVIO.test(r.risposta)) continue
    if (eta <= VALIDA_PER_ARGOMENTO_MS && stessoArgomento(r.domanda, domanda)) return { ...r, perche: 'argomento' }
    if (eta <= VALIDA_STESSA_CHAT_MS && chat !== undefined && r.chat === chat && somiglianzaRisposte(r.domanda, domanda) >= SIMILE_STESSA_CHAT) return { ...r, perche: 'stessa chat' }
  }
  return undefined
}

/**
 * Le domande ancora aperte che chiedono la stessa cosa di `domanda`: per
 * argomento o per parole (la soglia di `domandaGemella`). Servono due volte:
 * prima di aprirne una nuova, e quando Nicholas risponde a una di loro.
 */
export function aperteSulloStesso<D extends { id: string; autopilotaId: string; testo: string }>(
  aperte: D[],
  autopilotaId: string,
  domanda: string
): D[] {
  return aperte.filter((d) => d.autopilotaId === autopilotaId && (stessoArgomento(d.testo, domanda) || somiglianzaAperte(d.testo, domanda) >= 0.6))
}
