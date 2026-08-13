import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Su quali monitor stavano le finestre l'ultima volta.
 *
 * Serviva a saperlo l'archivio dei layout, che teneva le chat **per monitor**:
 * dov'erano le chat era anche dov'era la finestra, e una memoria sola
 * raccontava una storia sola. Poi i layout sono stati uniti in uno per
 * workspace — era il difetto per cui le chat sparivano — e con loro se n'è
 * andata l'unica traccia di dove fossero le finestre. Da allora la finestra si
 * riapre sul primo schermo libero: su due monitor, quello che capita.
 *
 * Qui si conserva **solo la chiave del monitor**, non la geometria. È la stessa
 * prudenza di prima: una finestra ripristinata alle coordinate di uno schermo
 * scollegato è una finestra invisibile, e la chiave permette di accorgersi che
 * quel monitor non c'è più invece di aprirla nel nulla.
 */
export type FinestreStore = {
  /** Le chiavi dei monitor, dalla finestra chiusa più di recente. */
  leggi: () => string[]
  /** Ricorda che una finestra stava su quel monitor. */
  ricorda: (chiave: string) => void
}

/** Più di così non servono: nessuno tiene otto finestre e se le ritrova tutte. */
const QUANTE = 4

export function apriFinestreStore(cartellaDati: string): FinestreStore {
  const file = join(cartellaDati, 'finestre.json')

  const leggi = (): string[] => {
    if (!existsSync(file)) return []
    try {
      const dati: unknown = JSON.parse(readFileSync(file, 'utf8'))
      if (typeof dati !== 'object' || dati === null) return []
      const schermi = (dati as { schermi?: unknown }).schermi
      if (!Array.isArray(schermi)) return []
      return schermi.filter((s): s is string => typeof s === 'string' && s !== '').slice(0, QUANTE)
    } catch {
      // Un file rovinato non deve impedire al programma di aprirsi: al massimo
      // la finestra torna dove tornava prima, sul primo schermo libero.
      return []
    }
  }

  return {
    leggi,
    ricorda(chiave) {
      if (chiave === '') return
      // La più recente davanti, e una sola volta: due finestre chiuse sullo
      // stesso monitor non devono occuparne due posti in memoria.
      const prima = leggi().filter((c) => c !== chiave)
      try {
        writeFileSync(file, JSON.stringify({ schermi: [chiave, ...prima].slice(0, QUANTE) }, null, 2))
      } catch (err) {
        console.error('[finestre] non ho potuto ricordare dov era la finestra:', err)
      }
    }
  }
}
