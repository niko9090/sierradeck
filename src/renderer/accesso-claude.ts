import { useEffect, useState } from 'react'
import type { StatoAccesso } from '@shared/accesso-claude'
import { chiaveStatoAccesso, DURATA_GIRO_VELOCE_MS, GIRO_ACCESSO_MS, GIRO_VELOCE_MS } from '@shared/accesso-claude-vista'

/**
 * Lo stato dell'accesso a Claude di un anno, uno solo per finestra (16/11):
 * lo leggono la banda degli avvisi, le impostazioni e il tasto nelle righe di
 * chat. Si rilegge ogni 10 minuti finché qualcuno lo guarda; dopo «Rinnova»
 * ogni 5 secondi per 2 minuti, finché cambia (la finestra di PowerShell scrive
 * il file, il servizio fa ripartire le chat da solo).
 */

let attuale: StatoAccesso | undefined
const ascoltatori = new Set<(s: StatoAccesso | undefined) => void>()
let giroLento: ReturnType<typeof setInterval> | undefined
let giroVeloce: ReturnType<typeof setInterval> | undefined

function api(): Window['gestore']['accessoClaude'] | undefined {
  // Nelle prove (e in una finestra senza ponte) può mancare: niente stato, niente guasti.
  return typeof window === 'undefined' ? undefined : (window.gestore as Partial<Window['gestore']> | undefined)?.accessoClaude
}

export function rileggiAccessoClaude(): Promise<StatoAccesso | undefined> {
  const a = api()
  if (a === undefined) return Promise.resolve(attuale)
  return a.stato()
    .then((s) => {
      attuale = s
      for (const f of ascoltatori) f(s)
      return s
    })
    .catch(() => attuale)
}

export function useAccessoClaude(): StatoAccesso | undefined {
  const [s, setS] = useState<StatoAccesso | undefined>(attuale)
  useEffect(() => {
    ascoltatori.add(setS)
    if (giroLento === undefined) giroLento = setInterval(() => { void rileggiAccessoClaude() }, GIRO_ACCESSO_MS)
    void rileggiAccessoClaude()
    return () => {
      ascoltatori.delete(setS)
      if (ascoltatori.size === 0 && giroLento !== undefined) { clearInterval(giroLento); giroLento = undefined }
    }
  }, [])
  return s
}

/** Dopo il tasto: si guarda spesso finché lo stato cambia, al più per 2 minuti. */
function sorvegliaDopoRinnovo(): void {
  const prima = chiaveStatoAccesso(attuale)
  const fine = Date.now() + DURATA_GIRO_VELOCE_MS
  if (giroVeloce !== undefined) clearInterval(giroVeloce)
  const g = setInterval(() => {
    void rileggiAccessoClaude().then((s) => {
      if (chiaveStatoAccesso(s) !== prima || Date.now() >= fine) {
        clearInterval(g)
        if (giroVeloce === g) giroVeloce = undefined
      }
    })
  }, GIRO_VELOCE_MS)
  giroVeloce = g
}

/** «Rinnova l'accesso a Claude»: apre la finestra di PowerShell sul PC. */
export function rinnovaAccessoClaude(): Promise<{ ok: true } | { ok: false; messaggio: string }> {
  const a = api()
  if (a === undefined) return Promise.resolve({ ok: false, messaggio: 'non disponibile qui' })
  return a.rinnova()
    .then((e) => { if (e.ok) sorvegliaDopoRinnovo(); return e })
    .catch((err: unknown) => ({ ok: false as const, messaggio: err instanceof Error ? err.message : String(err) }))
}
