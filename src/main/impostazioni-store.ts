import { join } from 'node:path'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import { normalizzaPreferenze, type Preferenze } from '@shared/preferenze'

export const VERSIONE_IMPOSTAZIONI = 1

const NOME_FILE = 'impostazioni.json'

export type Impostazioni = {
  /** L'ultima versione di cui l'utente ha letto le novità. */
  ultimaVersioneVista?: string
  /** Quello che l'utente ha scelto: colori, porte, comportamenti. */
  preferenze?: Preferenze
}

export type ImpostazioniStore = {
  percorso: string
  leggi: () => Impostazioni
  /** Registra che le novità di quella versione sono state mostrate. */
  segnaNovitaViste: (versione: string) => void
  /** Le preferenze, sempre complete: i buchi li riempiono i predefiniti. */
  preferenze: () => Preferenze
  /** Non solleva: se il disco non si lascia scrivere, il valore vale in memoria e si riprova da solo. */
  impostaPreferenze: (raw: unknown) => EsitoPreferenze
}

/** `salvato: false` = la scelta vale (è in memoria) ma il file non è ancora scritto: il ritentativo è già in corso. */
export type EsitoPreferenze = { preferenze: Preferenze; salvato: boolean }

/** Attese dei ritentativi asincroni dopo una scrittura fallita; poi si ripete l'ultima. */
export const ATTESE_RITENTATIVO_MS = [1_000, 5_000, 30_000, 120_000]

export type OpzioniImpostazioniStore = { scrivi?: typeof scriviJsonAtomico }

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
export function apriImpostazioniStore(dir: string, opzioni: OpzioniImpostazioniStore = {}): ImpostazioniStore {
  const scrivi = opzioni.scrivi ?? scriviJsonAtomico
  mkdirSync(dir, { recursive: true })
  const percorso = join(dir, NOME_FILE)

  /** L'ultimo valore che il disco non ha accettato: finché c'è, prevale su quello del file. */
  let inAttesa: Preferenze | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let tentativi = 0

  const fermaRitentativo = (): void => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }
  const pianifica = (): void => {
    fermaRitentativo()
    const attesa = ATTESE_RITENTATIVO_MS[Math.min(tentativi, ATTESE_RITENTATIVO_MS.length - 1)]
    tentativi += 1
    timer = setTimeout(() => {
      timer = undefined
      if (inAttesa === undefined) return
      const ok = scrivi(percorso, { ...leggiDisco(), versione: VERSIONE_IMPOSTAZIONI, preferenze: inAttesa }, 'impostazioni')
      if (ok) { inAttesa = undefined; tentativi = 0 } else pianifica()
    }, attesa)
    // Un ritentativo non deve tenere in vita il programma che si chiude.
    if (typeof timer === 'object' && 'unref' in timer) timer.unref()
  }

  const leggiDisco = (): Record<string, unknown> => {
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

  /** Il file com'è, con sopra il valore ancora da scrivere (se c'è): chi riscrive altri campi non lo fa tornare indietro. */
  const leggiGrezzo = (): Record<string, unknown> => {
    const o = leggiDisco()
    return inAttesa === undefined ? o : { ...o, preferenze: inAttesa }
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
      scrivi(
        percorso,
        { ...leggiGrezzo(), versione: VERSIONE_IMPOSTAZIONI, ultimaVersioneVista: versione },
        'impostazioni'
      )
    },

    preferenze(): Preferenze {
      // Sempre complete: chi legge non deve chiedersi se un campo c'è. I buchi
      // — un file di una versione più vecchia, un valore scritto male a mano —
      // li riempiono i predefiniti, uno per uno.
      return inAttesa ?? normalizzaPreferenze(leggiDisco().preferenze)
    },

    impostaPreferenze(raw: unknown): EsitoPreferenze {
      const preferenze = normalizzaPreferenze(raw)
      // Il salvataggio fallito non si perde e non si finge riuscito: il valore
      // resta in memoria (così `preferenze()` dice la verità), e un ritentativo
      // asincrono lo riscrive appena il disco lo permette (antivirus, sync che
      // tiene il file, disco pieno). Una scrittura nuova rimpiazza la vecchia.
      const scritto = scrivi(
        percorso,
        { ...leggiDisco(), versione: VERSIONE_IMPOSTAZIONI, preferenze },
        'impostazioni'
      )
      fermaRitentativo()
      if (scritto) {
        inAttesa = undefined
        tentativi = 0
        return { preferenze, salvato: true }
      }
      inAttesa = preferenze
      tentativi = 0
      pianifica()
      return { preferenze, salvato: false }
    }
  }
}
