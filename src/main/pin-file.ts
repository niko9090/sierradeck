import { copyFileSync, readFileSync } from 'node:fs'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'

/**
 * Il file del PIN delle chat (`pin-chat.json`), letto e scritto senza perderlo.
 *
 * Prima (analisi 0.81.0): una lettura fallita un istante valeva «nessun PIN», e
 * il salvataggio dopo lo riscriveva senza; la scrittura non era atomica, quindi
 * una chiusura a metà lasciava un troncone. Ora la lettura si riprova; se il
 * file resta illeggibile se ne mette una copia accanto prima che qualcuno lo
 * riscriva, e lo si dice nel registro. La scrittura passa da `scriviJsonAtomico`.
 */
export function apriFilePin(percorso: string, deps: {
  log: (m: string) => void
  leggi?: (p: string) => string
  copia?: (da: string, a: string) => void
  adesso?: () => Date
}): { leggi: () => unknown; scrivi: (p: unknown) => void } {
  const leggiTesto = deps.leggi ?? ((p: string): string => readFileSync(p, 'utf8'))
  const copia = deps.copia ?? copyFileSync
  return {
    leggi: () => {
      let ultimo: unknown
      for (let i = 0; i < 3; i += 1) {
        try {
          return JSON.parse(leggiTesto(percorso)) as unknown
        } catch (e) {
          if ((e as { code?: string }).code === 'ENOENT') return undefined
          ultimo = e
          if (i < 2) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
        }
      }
      const accanto = `${percorso}.illeggibile-${(deps.adesso?.() ?? new Date()).toISOString().replace(/[:.]/g, '-')}`
      try {
        copia(percorso, accanto)
        deps.log(`[pin] pin-chat.json non si legge (${String(ultimo)}): messo da parte in ${accanto}; il PIN va reimpostato`)
      } catch (e) {
        deps.log(`[pin] pin-chat.json non si legge (${String(ultimo)}) e non si copia da parte (${String(e)})`)
      }
      return undefined
    },
    scrivi: (p) => { scriviJsonAtomico(percorso, p, 'pin') }
  }
}
