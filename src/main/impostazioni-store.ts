import { join } from 'node:path'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'

export const VERSIONE_IMPOSTAZIONI = 1

const NOME_FILE = 'impostazioni.json'

export type Impostazioni = {
  /** L'ultima versione di cui l'utente ha letto le novità. */
  ultimaVersioneVista?: string
}

export type ImpostazioniStore = {
  percorso: string
  leggi: () => Impostazioni
  /** Registra che le novità di quella versione sono state mostrate. */
  segnaNovitaViste: (versione: string) => void
}

/**
 * Le preferenze minute che non appartengono a nessuno degli altri file.
 *
 * Un file a parte e non un campo dentro `workspaces.json`: quello contiene i
 * layout composti a mano dall'utente, e un dato di servizio che vive lì dentro
 * diventa un motivo in più per riscriverlo — cioè un rischio in più per l'unica
 * cosa che nessuna sorgente può rigenerare.
 *
 * Un file illeggibile non ferma niente e non viene messo da parte: qui dentro
 * c'è solo il ricordo di una finestrella già letta, e ricominciare da zero
 * costa che la si rilegga una volta.
 */
export function apriImpostazioniStore(dir: string): ImpostazioniStore {
  mkdirSync(dir, { recursive: true })
  const percorso = join(dir, NOME_FILE)

  const leggiGrezzo = (): Record<string, unknown> => {
    if (!existsSync(percorso)) return {}
    try {
      const letto: unknown = JSON.parse(readFileSync(percorso, 'utf8'))
      if (typeof letto !== 'object' || letto === null || Array.isArray(letto)) {
        console.warn(`[impostazioni] ${percorso} non contiene un oggetto: riparto da vuoto`)
        return {}
      }
      return letto as Record<string, unknown>
    } catch (err) {
      console.warn(`[impostazioni] ${percorso} non leggibile:`, err)
      return {}
    }
  }

  return {
    percorso,

    leggi(): Impostazioni {
      const o = leggiGrezzo()
      const vista = o.ultimaVersioneVista
      return typeof vista === 'string' && vista.trim() !== ''
        ? { ultimaVersioneVista: vista }
        : {}
    },

    segnaNovitaViste(versione: string): void {
      // Leggi-modifica-scrivi conservando ciò che non conosciamo: una versione
      // più recente può aver scritto qui campi suoi, e tornare indietro con un
      // aggiornamento annullato non deve cancellarglieli.
      scriviJsonAtomico(
        percorso,
        { ...leggiGrezzo(), versione: VERSIONE_IMPOSTAZIONI, ultimaVersioneVista: versione },
        'impostazioni'
      )
    }
  }
}
