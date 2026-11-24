import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import type { Specialista } from '@shared/flusso-orchestratore'

/**
 * Gli specialisti **al lavoro** e i rilanci già fatti, in `autopiloti/servizio/specialisti-aperti.json`.
 *
 * Il flusso dei subagenti sta in memoria: un riavvio del servizio li faceva sparire senza
 * passare per «fermato», e il recupero dipendeva da un testo mandato al modello. Qui resta
 * quanto basta per rimetterli in strada dal programma: compito, ruolo, prompt, ramo,
 * cartella e stato.
 */

export const MOTIVO_RIAVVIO = 'riavvio del programma'

export type StatoAperti = {
  /** Per workspace, gli specialisti `avviato`/`lavoro` all'ultima scrittura. */
  specialisti: Record<string, Specialista[]>
  /** Quanti rilanci da solo ha avuto ogni compito (`workspace|compito`): il limite vale anche fra un riavvio e l'altro. */
  rilanci: Record<string, number>
}

export type ArchivioAperti = {
  leggi: () => StatoAperti
  scrivi: (s: StatoAperti) => void
}

export const apertiVuoti = (): StatoAperti => ({ specialisti: {}, rilanci: {} })

const testo = (x: unknown): x is string => typeof x === 'string' && x !== ''

function specialistaValido(v: unknown): Specialista | undefined {
  if (typeof v !== 'object' || v === null) return undefined
  const o = v as Record<string, unknown>
  if (!testo(o.id) || !testo(o.ruolo) || typeof o.descrizione !== 'string' || !testo(o.inizio)) return undefined
  if (o.stato !== 'avviato' && o.stato !== 'lavoro') return undefined
  return o as unknown as Specialista
}

export function apriAperti(file: string): ArchivioAperti {
  let stato: StatoAperti | undefined
  return {
    leggi() {
      if (stato !== undefined) return stato
      try {
        const o = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as { specialisti?: unknown; rilanci?: unknown } : {}
        const specialisti: Record<string, Specialista[]> = {}
        if (typeof o.specialisti === 'object' && o.specialisti !== null && !Array.isArray(o.specialisti)) {
          for (const [ws, l] of Object.entries(o.specialisti as Record<string, unknown>)) {
            const lista = Array.isArray(l) ? l.map(specialistaValido).filter((s): s is Specialista => s !== undefined) : []
            if (lista.length > 0) specialisti[ws] = lista
          }
        }
        const rilanci: Record<string, number> = {}
        if (typeof o.rilanci === 'object' && o.rilanci !== null && !Array.isArray(o.rilanci)) {
          for (const [k, n] of Object.entries(o.rilanci as Record<string, unknown>)) if (typeof n === 'number' && Number.isInteger(n) && n > 0) rilanci[k] = n
        }
        stato = { specialisti, rilanci }
      } catch (err) {
        console.error(`[specialisti-aperti] ${file} illeggibile:`, err)
        stato = apertiVuoti()
      }
      return stato
    },
    scrivi(s) {
      stato = s
      try { mkdirSync(dirname(file), { recursive: true }) } catch { /* lo dice la scrittura */ }
      scriviJsonAtomico(file, { versione: 1, ...s }, 'specialisti-aperti')
    }
  }
}
