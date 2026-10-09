import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import type { Autopilota } from '@shared/autopilota'

/**
 * «Parte da solo» (0.55.0): l'autopilota fa la sua preparazione come sempre —
 * legge il progetto, fa le sue domande, si scrive i criteri — e quando è
 * `pronto` il PC gli dà il «Vai» al posto tuo.
 *
 * Il servizio non lo sa e non deve saperlo: per lui è un «Vai» come quello del
 * tasto. L'elenco sta su disco (`partenze-subito.json`), così un riavvio del
 * programma a metà preparazione non lo fa dimenticare.
 */
export type PartenzeSubito = {
  segna: (id: string) => void
  /** Un giro: chi è pronto parte; chi non c'è più, o lavora già, esce dall'elenco. */
  giro: () => Promise<string[]>
  elenco: () => string[]
}

/** Gli stati in cui il «Vai» non serve più: lavora, ha finito, o si è fermato da sé. */
const NON_SERVE: ReadonlySet<string> = new Set(['lavoro', 'attesa', 'finito', 'fallito', 'sospeso'])

export function apriPartenzeSubito(cartella: string, deps: {
  elenca: () => Promise<Pick<Autopilota, 'id' | 'stato'>[]>
  vai: (id: string) => Promise<unknown>
  log?: (m: string) => void
}): PartenzeSubito {
  const file = join(cartella, 'partenze-subito.json')
  let ids: string[] = []
  try {
    if (existsSync(file)) {
      const o = JSON.parse(readFileSync(file, 'utf8')) as { ids?: unknown }
      ids = Array.isArray(o.ids) ? o.ids.filter((x): x is string => typeof x === 'string') : []
    }
  } catch {
    ids = []
  }
  const salva = (): void => { scriviJsonAtomico(file, { versione: 1, ids }, 'partenze-subito') }
  let inGiro = false
  return {
    segna(id) {
      if (ids.includes(id)) return
      ids = [...ids, id]
      salva()
    },
    elenco: () => [...ids],
    async giro() {
      if (inGiro || ids.length === 0) return []
      inGiro = true
      const partiti: string[] = []
      try {
        const tutti = await deps.elenca()
        // Si tolgono quelli da togliere, non si riscrive l'elenco: un `segna`
        // arrivato durante il giro non deve sparire.
        const tolti = new Set<string>()
        for (const id of [...ids]) {
          const a = tutti.find((x) => x.id === id)
          if (a === undefined || NON_SERVE.has(a.stato)) { tolti.add(id); continue }
          if (a.stato !== 'pronto') continue
          try {
            await deps.vai(id)
            partiti.push(id)
            tolti.add(id)
            deps.log?.(`[autopilota] ${id} era pronto e doveva partire da solo: gli ho dato il via`)
          } catch (e) {
            deps.log?.(`[autopilota] ${id} doveva partire da solo, ma il via non è andato: ${String(e)} — riprovo al prossimo giro`)
          }
        }
        if (tolti.size > 0) { ids = ids.filter((id) => !tolti.has(id)); salva() }
      } finally {
        inGiro = false
      }
      return partiti
    }
  }
}
