import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import { aggiungiErrore, leggiStorico, unisciStorici, voceDaTesto, type DoveErrore, type StoricoErrori } from '@shared/storico-errori'
import type { Registro } from './registro'

/**
 * Lo storico degli errori su file (0.81.0): uno per processo, perché il
 * programma e il servizio degli autopiloti scrivono insieme e un file solo
 * si perderebbe le voci dell'altro. Chi legge li unisce (`leggiStoricoDi`).
 *
 * Vive in `<dati>/errori/`, fuori dal registro: il registro dei giorni passati
 * si toglie dopo due settimane, lo storico resta finché non lo si svuota.
 */

export type StoricoSuFile = {
  /** Un errore: il testo come va nel registro (con lo stack sotto, se c'è). */
  aggiungi: (testo: string, cosa?: string) => void
  leggi: () => StoricoErrori
  /** Scrive subito quello che aspetta (all'uscita). */
  scriviOra: () => void
  file: string
}

export const CARTELLA_ERRORI = 'errori'

const fileDi = (dati: string, chi: string): string => join(dati, CARTELLA_ERRORI, `errori-${chi}.json`)

function leggiFile(file: string): StoricoErrori {
  try { return leggiStorico(JSON.parse(readFileSync(file, 'utf8')) as unknown) } catch { return { voci: [] } }
}

export function apriStoricoErrori(dati: string, chi: 'app' | 'servizio', p: {
  versione: string
  /** Parole da coprire in più: il nome di questo PC e dell'utente. */
  nomi?: () => readonly string[]
  ora?: () => Date
  /** Quanto aspettare prima di scrivere: dieci errori in un secondo sono una scrittura sola. */
  ritardoMs?: number
}): StoricoSuFile {
  const file = fileDi(dati, chi)
  const dove: DoveErrore = chi === 'app' ? 'pc' : 'servizio'
  const ora = p.ora ?? (() => new Date())
  let storico = leggiFile(file)
  let timer: ReturnType<typeof setTimeout> | undefined
  const scriviOra = (): void => {
    if (timer !== undefined) { clearTimeout(timer); timer = undefined }
    try { mkdirSync(join(dati, CARTELLA_ERRORI), { recursive: true }) } catch { /* lo dice la scrittura */ }
    scriviJsonAtomico(file, storico, 'errori')
  }
  return {
    file,
    aggiungi: (testo, cosa) => {
      let nomi: readonly string[] = []
      try { nomi = p.nomi?.() ?? [] } catch { nomi = [] }
      storico = aggiungiErrore(storico, voceDaTesto({ testo, dove, quando: ora().toISOString(), versione: p.versione, nomi, ...(cosa !== undefined ? { cosa } : {}) }))
      if (timer === undefined) {
        timer = setTimeout(scriviOra, p.ritardoMs ?? 1000)
        timer.unref?.()
      }
    },
    leggi: () => storico,
    scriviOra
  }
}

/**
 * Lo storico di questo PC: quello del programma e quello del servizio, insieme.
 * `app` è lo storico del programma già in memoria, con gli errori non ancora scritti.
 */
export function leggiStoricoDi(dati: string, app?: StoricoErrori): StoricoErrori {
  return unisciStorici(app ?? leggiFile(fileDi(dati, 'app')), leggiFile(fileDi(dati, 'servizio')))
}

/** Per quanto l'ultima riga del registro racconta ancora «cosa si stava facendo». */
const COSA_RECENTE_MS = 2 * 60_000

/**
 * Il registro che mette anche ogni errore nello storico, con «cosa si stava
 * facendo»: l'ultima riga normale del registro, se è di poco prima.
 *
 * La guardia `dentro`: il registro, scrivendo un errore, lo ripete con
 * `console.error`, che `consoleNelRegistro` riporta qui. Senza, ogni errore
 * entrerebbe due volte (la seconda con «[registro]» davanti).
 */
export function conStorico(registro: Registro, storico: Pick<StoricoSuFile, 'aggiungi'>, ora: () => number = Date.now): Registro {
  let ultima: { riga: string; quando: number } | undefined
  let dentro = false
  return {
    ...registro,
    info: (m) => {
      // La stessa riga ripetuta dalla console («[registro] …») non è un passo nuovo.
      if (!m.startsWith('[registro] ')) ultima = { riga: m, quando: ora() }
      registro.info(m)
    },
    errore: (m) => {
      if (!dentro) {
        dentro = true
        try {
          const cosa = ultima !== undefined && ora() - ultima.quando <= COSA_RECENTE_MS ? ultima.riga : undefined
          storico.aggiungi(m, cosa)
        } catch { /* lo storico non ferma il registro */ }
        try { registro.errore(m) } finally { dentro = false }
        return
      }
      registro.errore(m)
    }
  }
}
