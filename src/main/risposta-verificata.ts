import { firmaScelte, type Scelta } from '@shared/scelte-terminale'

/**
 * Una risposta data dal riquadro delle domande conta solo se il PC della chat
 * l'ha premuta davvero e la chat è andata avanti (0.84.1, Nicholas 21/10).
 *
 * Prima i tasti partivano e la rotta diceva «fatto» subito: se un tasto si
 * perdeva (finestra che stava ridisegnando, chat in sottofondo appena
 * sveglia) la domanda restava lì e nessuno lo sapeva. Adesso il PC della chat
 * riguarda lo schermo dopo i tasti: se la domanda è sparita o è cambiata la
 * risposta è presa; se è ancora uguale riprova **una** volta, con i tasti
 * ricalcolati sullo schermo di adesso (le frecce possono essere già arrivate).
 * Ogni pressione e il suo esito vanno nel registro.
 */

/** Ogni quanto si riguarda lo schermo dopo i tasti. */
export const RILETTURA_MS = 200
/** Quanto si aspetta, dopo l'ultimo tasto, che la domanda sparisca. */
export const ATTESA_PRESA_MS = 3500
/** La pausa fra un pezzo e l'altro dei tasti (come `suTasti` e il sottofondo). */
export const PAUSA_FRA_PEZZI_MS = 150
/** Un solo nuovo tentativo: due pressioni in tutto, mai di più. */
export const TENTATIVI_MAX = 2
/**
 * Il tempo massimo di tutta la verifica, letture comprese (0.84.3). Chi ha
 * toccato aspetta 15 s sull'app e 14 s sul ponte, e prima l'altro PC chiede
 * lo stato (fino a 4 s): oltre i 9 s Nicholas leggeva «non so se è arrivato»
 * mentre questo PC stava ancora premendo.
 */
export const LIMITE_VERIFICA_MS = 9000
/** Il secondo tentativo parte solo se resta almeno questo tempo per vederlo. */
const MARGINE_TENTATIVO_MS = 1000

export type EsitoPressione =
  | { esito: 'presa'; tentativi: number }
  | { esito: 'non-presa'; tentativi: number }
  /** Prima del nuovo tentativo l'opzione non torna più: non si preme. */
  | { esito: 'cambiata'; tentativi: number; errore: string }

export type DipendenzePressione = {
  /** Le scelte sullo schermo di adesso, `undefined` se la domanda non c'è più. */
  leggi: () => Promise<Scelta | undefined>
  /** I tasti per rispondere, calcolati su quello schermo. */
  tasti: (s: Scelta) => { pezzi: string[] } | { errore: string }
  manda: (pezzi: string[]) => void
  pausa: (ms: number) => Promise<void>
  log: (riga: string) => void
  /** ««Blu» nella chat «Prova» (p-1), chiesto da tel:abc»: per il registro. */
  cosa: string
  attesaMs?: number
  rileggiMs?: number
  /** L'orologio (ms): il tempo si misura qui, letture lente comprese. */
  ora?: () => number
  limiteMs?: number
}

/** Quanto ci mettono i pezzi a partire tutti. */
export function durataTasti(pezzi: string[]): number {
  return Math.max(0, pezzi.length - 1) * PAUSA_FRA_PEZZI_MS
}

/** La chat è andata avanti: la domanda non c'è più, o è un'altra (spunta compresa). */
export function andataAvanti(prima: Scelta, adesso: Scelta | undefined): boolean {
  return adesso === undefined || firmaScelte(adesso) !== firmaScelte(prima)
}

/**
 * Preme e verifica. `scelte` è lo schermo già controllato dalla rotta
 * (l'opzione c'è, non è già stata mandata). Basta una lettura senza la
 * domanda per dire «presa»: un permesso uguale che ricompare dopo il comando
 * non deve far premere di nuovo.
 */
export async function premiEVerifica(scelte: Scelta, d: DipendenzePressione): Promise<EsitoPressione> {
  const attesa = d.attesaMs ?? ATTESA_PRESA_MS
  const ogni = Math.max(1, d.rileggiMs ?? RILETTURA_MS)
  const ora = d.ora ?? ((): number => Date.now())
  // Prima il tempo si contava sommando le pause: una lettura da 3 s (nessuna
  // finestra disegna la chat) non contava, e la verifica durava 2 minuti.
  // Adesso conta tutto: ogni pausa (almeno quanto chiesto) e ogni lettura.
  const limite = d.limiteMs ?? LIMITE_VERIFICA_MS
  let speso = 0
  const misura = async <T>(fai: () => Promise<T>, almeno = 0): Promise<T> => {
    const da = ora()
    try { return await fai() } finally { speso += Math.max(almeno, ora() - da) }
  }
  let schermo = scelte
  let premute = 0
  for (let n = 1; n <= TENTATIVI_MAX; n += 1) {
    if (n > 1 && limite - speso < MARGINE_TENTATIVO_MS) {
      d.log(`[risposta] ${d.cosa}: tempo della verifica finito, non riprovo`)
      break
    }
    const k = d.tasti(schermo)
    if ('errore' in k) {
      d.log(`[risposta] ${d.cosa}: tentativo ${n} non premuto, ${k.errore}`)
      return { esito: 'cambiata', tentativi: n - 1, errore: k.errore }
    }
    d.manda(k.pezzi)
    premute = n
    d.log(`[risposta] ${d.cosa}: tentativo ${n} di ${TENTATIVI_MAX}, premo ${k.pezzi.length === 1 ? '1 tasto' : `${k.pezzi.length} pezzi`}`)
    const inizio = speso
    const fine = Math.min(inizio + durataTasti(k.pezzi) + attesa, limite)
    while (speso + ogni <= fine) {
      await misura(() => d.pausa(ogni), ogni)
      const letta = await misura(() => entro(d.leggi(), Math.max(0, limite - speso)).catch(() => schermo))
      if (andataAvanti(scelte, letta)) {
        d.log(`[risposta] ${d.cosa}: presa al tentativo ${n}, la chat è andata avanti`)
        return { esito: 'presa', tentativi: n }
      }
      if (letta !== undefined) schermo = letta
    }
    if (n < TENTATIVI_MAX) d.log(`[risposta] ${d.cosa}: dopo ${((speso - inizio) / 1000).toFixed(1)} s la domanda è ancora lì, riprovo`)
  }
  d.log(`[risposta] ${d.cosa}: NON presa dopo ${premute === 1 ? '1 tentativo' : `${premute} tentativi`}, la domanda è ancora lì`)
  return { esito: 'non-presa', tentativi: premute }
}

/** Una lettura che non arriva entro `ms` vale come «schermo uguale» (rifiuta). */
function entro<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((ok, no) => {
    const t = setTimeout(() => no(new Error('lettura lenta')), ms)
    p.then((v) => { clearTimeout(t); ok(v) }, (e: unknown) => { clearTimeout(t); no(e) })
  })
}

/**
 * Quello che dice il PC della chat dopo una risposta da un altro PC: `esito`
 * c'è solo se quel PC sa verificare; uno più vecchio risponde soltanto «fatto».
 */
export type EsitoAltroPc = { ok: true; esito?: EsitoPressione['esito']; tentativi?: number; frase?: string }

/** Il corpo della risposta di quel PC, letto senza fidarsi della forma. */
export function leggiEsitoAltroPc(corpo: unknown): EsitoAltroPc {
  const c = (typeof corpo === 'object' && corpo !== null ? corpo : {}) as Record<string, unknown>
  return {
    ok: true,
    ...(c.esito === 'presa' ? { esito: 'presa' as const } : {}),
    ...(typeof c.tentativi === 'number' ? { tentativi: c.tentativi } : {}),
    ...(typeof c.frase === 'string' ? { frase: c.frase.slice(0, 400) } : {})
  }
}

/** La frase per chi ha risposto, la stessa su PC, pagina e app. */
export function fraseEsito(e: EsitoPressione, risposta: string): string {
  if (e.esito === 'presa') return e.tentativi === 1 ? `Presa: «${risposta}», la chat è andata avanti.` : `Presa al secondo tentativo: «${risposta}», la chat è andata avanti.`
  if (e.esito === 'cambiata') return `Non premuta: ${e.errore}`
  return `Non presa: il PC della chat ha premuto «${risposta}» ${e.tentativi === 1 ? 'una volta' : 'due volte'} ma la domanda è ancora lì. Guarda la chat e rispondi di nuovo.`
}
