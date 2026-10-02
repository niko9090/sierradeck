import { join } from 'node:path'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import {
  aggiungiIstruzione, istruzioniRecenti, leggiIstruzioni, nuovaIstruzione, segnaEsito,
  type EsitoIstruzione, type Istruzione
} from '@shared/istruzioni-autopilota'
import type { Consegna } from './consegne'

/**
 * Le istruzioni consegnate, salvate dal servizio (0.41.0): un file per
 * autopilota in `istruzioni/<id>.json`, accanto al suo stato ma **fuori** dal
 * suo file. Lo stato si riscrive a ogni ciclo partendo da una copia letta
 * prima: un campo dentro lo stato perderebbe le istruzioni scritte nel
 * frattempo. Qui scrive solo questo modulo.
 *
 * Il testo è quello intero, salvato quando l'autopilota la decide: i file
 * `.sierradeck/consegne/c-N.md` nella cartella della chat si puliscono dopo
 * sette giorni.
 */

const ID_VALIDO = /^[A-Za-z0-9_-]{1,64}$/

export type RegistroIstruzioni = {
  /** Una consegna appena messa in coda. */
  registra: (c: Consegna) => void
  esito: (consegna: string, esito: EsitoIstruzione) => void
  elenca: (autopilotaId: string) => Istruzione[]
}

export function apriRegistroIstruzioni(cartella: string, adesso: () => string = () => new Date().toISOString()): RegistroIstruzioni {
  const dir = join(cartella, 'istruzioni')
  /** Di chi è ogni consegna: l'esito arriva con il solo id. */
  const diChi = new Map<string, string>()
  const file = (id: string): string | undefined => (ID_VALIDO.test(id) ? join(dir, `${id}.json`) : undefined)
  const leggi = (id: string): Istruzione[] => {
    const f = file(id)
    if (f === undefined || !existsSync(f)) return []
    try { return leggiIstruzioni(JSON.parse(readFileSync(f, 'utf8'))) } catch { return [] }
  }
  const scrivi = (id: string, lista: Istruzione[]): void => {
    const f = file(id)
    if (f === undefined) return
    try {
      mkdirSync(dir, { recursive: true })
      scriviJsonAtomico(f, { istruzioni: lista }, 'istruzioni')
    } catch (err) {
      console.error(`[autopilota] istruzioni di ${id} non salvate:`, err)
    }
  }
  return {
    registra(c) {
      if (c.autopilotaId === '') return
      diChi.set(c.id, c.autopilotaId)
      const nuova = nuovaIstruzione({
        consegna: c.id, autopilotaId: c.autopilotaId, chatId: c.chatId, titolo: c.titolo, testo: c.testo, cosa: c.cosa,
        ...(c.perche !== undefined ? { perche: c.perche } : {})
      }, adesso())
      scrivi(c.autopilotaId, aggiungiIstruzione(leggi(c.autopilotaId), nuova))
    },
    esito(consegna, esito) {
      const id = diChi.get(consegna)
      if (id === undefined) return
      const prima = leggi(id)
      const dopo = segnaEsito(prima, consegna, esito, adesso())
      if (dopo !== prima) scrivi(id, dopo)
    },
    elenca: (id) => istruzioniRecenti(leggi(id))
  }
}
