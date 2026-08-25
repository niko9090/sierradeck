import { existsSync, readFileSync, writeFileSync } from 'node:fs'
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
  /** Ricorda dov'era, quanto grande e come stava una finestra. */
  ricorda: (g: GeometriaFinestra) => void
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
  return { chiave: o.chiave, bounds: { x: b.x, y: b.y, width: b.width, height: b.height }, stato }
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
    ricorda(g) {
      if (g.chiave === '') return
      // La più recente davanti, e una sola volta per monitor: due finestre
      // chiuse sullo stesso monitor non devono occuparne due posti in memoria.
      const prima = tutte().filter((x) => x.chiave !== g.chiave)
      try {
        writeFileSync(file, JSON.stringify({ finestre: [g, ...prima].slice(0, QUANTE) }, null, 2))
      } catch (err) {
        console.error('[finestre] non ho potuto ricordare dov era la finestra:', err)
      }
    }
  }
}
