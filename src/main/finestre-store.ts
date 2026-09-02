import { existsSync, readFileSync } from 'node:fs'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import { join } from 'node:path'

/**
 * Dove stavano le finestre l'ultima volta: su quale monitor, quanto grandi, e
 * come (finestra, ingrandita, o a schermo intero).
 *
 * All'inizio si teneva **solo la chiave del monitor**, per prudenza: una
 * finestra ripristinata alle coordinate di uno schermo scollegato è una
 * finestra invisibile. Ma la chiave del monitor (`display-key`) codifica
 * posizione, risoluzione e scalatura: se una chiave salvata combacia con un
 * monitor **presente ora**, quel monitor ha esattamente la stessa geometria, e
 * allora le coordinate salvate sono di nuovo valide. Così si può ridare alla
 * finestra la sua dimensione e il suo stato — riaprendola com'era, dov'era —
 * senza il rischio di prima: se il monitor non c'è più, la chiave non combacia
 * e si torna al comportamento predefinito.
 */

export type StatoFinestra = 'normale' | 'ingrandita' | 'schermo-intero'

export type GeometriaFinestra = {
  /** La chiave del monitor su cui stava (vedi `chiaveMonitor`). */
  chiave: string
  /**
   * Quale finestra era: lo slot (`1`, `2`, …).
   *
   * Prima si ricordava solo il monitor, e riaprendo si cercava «uno schermo
   * dove c'era del lavoro». Ma una finestra non è uno schermo: chi ne teneva una
   * sola sul monitor di destra se la ritrovava a sinistra, perché a sinistra
   * c'erano dei ricordi più vecchi. Con lo slot, la finestra numero 1 torna dove
   * stava **la finestra numero 1**, e non dove stava una qualunque.
   *
   * Assente nei file scritti prima: allora vale il vecchio comportamento.
   */
  slot?: string
  /** La dimensione «da finestra» (non quella da ingrandita): è quella a cui
   * tornare quando si de-ingrandisce, e la base su cui poi si ri-ingrandisce. */
  bounds: { x: number; y: number; width: number; height: number }
  stato: StatoFinestra
}

export type FinestreStore = {
  /** Le chiavi dei monitor, dalla finestra chiusa più di recente. */
  leggi: () => string[]
  /** La geometria ricordata per un monitor, se c'è. */
  geometria: (chiave: string) => GeometriaFinestra | undefined
  /**
   * Le finestre della sessione scorsa, in ordine: la prima è la prima.
   *
   * `ricorda` accumula un ricordo per volta e non si accorge di quelli vecchi:
   * dopo settimane il file contiene finestre che non esistono più da giorni, e
   * riaprendo se ne pesca una a caso. È lo stesso guasto dell'archivio dei
   * workspace — *dedurre lo stato invece di registrarlo* — e la cura è la
   * stessa: si riscrive **tutta** la fotografia quando la scena cambia.
   */
  fotografa: (finestre: GeometriaFinestra[]) => void
  /** La n-esima finestra della fotografia (da 0). */
  nesima: (i: number) => GeometriaFinestra | undefined
}

/** Più di così non servono: nessuno tiene otto finestre e se le ritrova tutte. */
const QUANTE = 4

function boundsValidi(b: unknown): b is GeometriaFinestra['bounds'] {
  if (b === null || typeof b !== 'object') return false
  const o = b as Record<string, unknown>
  return ['x', 'y', 'width', 'height'].every((k) => typeof o[k] === 'number' && Number.isFinite(o[k]))
    && (o.width as number) > 0 && (o.height as number) > 0
}

function normalizza(v: unknown): GeometriaFinestra | undefined {
  if (v === null || typeof v !== 'object') return undefined
  const o = v as Record<string, unknown>
  if (typeof o.chiave !== 'string' || o.chiave === '') return undefined
  if (!boundsValidi(o.bounds)) return undefined
  const stato: StatoFinestra = o.stato === 'ingrandita' || o.stato === 'schermo-intero' ? o.stato : 'normale'
  const b = o.bounds as GeometriaFinestra['bounds']
  const slot = typeof o.slot === 'string' && o.slot !== '' ? o.slot : undefined
  return {
    chiave: o.chiave,
    ...(slot !== undefined ? { slot } : {}),
    bounds: { x: b.x, y: b.y, width: b.width, height: b.height },
    stato
  }
}

export function apriFinestreStore(cartellaDati: string): FinestreStore {
  const file = join(cartellaDati, 'finestre.json')

  const tutte = (): GeometriaFinestra[] => {
    if (!existsSync(file)) return []
    try {
      const dati: unknown = JSON.parse(readFileSync(file, 'utf8'))
      if (typeof dati !== 'object' || dati === null) return []
      const raccolta = (dati as { finestre?: unknown }).finestre
      if (Array.isArray(raccolta)) {
        return raccolta.map(normalizza).filter((g): g is GeometriaFinestra => g !== undefined).slice(0, QUANTE)
      }
      // Formato vecchio: solo le chiavi dei monitor, senza geometria. Si legge
      // ancora — così chi aggiorna non perde di colpo il ricordo di dov'erano —
      // ma senza dimensione: la finestra torna sul monitor giusto, centrata.
      const schermi = (dati as { schermi?: unknown }).schermi
      if (Array.isArray(schermi)) {
        return schermi
          .filter((s): s is string => typeof s === 'string' && s !== '')
          .slice(0, QUANTE)
          .map((chiave) => ({ chiave, bounds: { x: 0, y: 0, width: 0, height: 0 }, stato: 'normale' as const }))
      }
      return []
    } catch {
      // Un file rovinato non deve impedire al programma di aprirsi: al massimo
      // la finestra torna dove tornava prima, sul primo schermo libero.
      return []
    }
  }

  const leggi = (): string[] => tutte().map((g) => g.chiave)

  return {
    leggi,
    geometria(chiave) {
      const g = tutte().find((x) => x.chiave === chiave)
      // Una geometria «vuota» (dal formato vecchio) non è una geometria: dice
      // solo il monitor, e il chiamante deve poterlo distinguere dal caso con
      // dimensione vera.
      if (g === undefined || (g.bounds.width === 0 && g.bounds.height === 0)) return undefined
      return g
    },
    fotografa(finestre) {
      scriviJsonAtomico(file, { finestre: finestre.slice(0, QUANTE) }, 'finestre')
    },

    nesima(i) {
      const g = tutte()[i]
      if (g === undefined || (g.bounds.width === 0 && g.bounds.height === 0)) return undefined
      return g
    }
  }
}
