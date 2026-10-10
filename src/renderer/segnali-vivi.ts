import { useLayoutStore } from './state/layout'
import { lavoraDaSegnali, partitaDaSegnali, prontaDaSegnali, type FaseSessione } from '@shared/segnali-chat'

/**
 * Lo stato delle chat dai segnali di Claude Code (0.45.0), come lo manda il
 * main a ogni hook: per sessione, la fase e da quando. Le consegne degli
 * autopiloti lo usano prima dello schermo; senza segnali resta lo schermo.
 */
const fasi = new Map<string, FaseSessione>()
let collegato = false

export function ascoltaSegnali(): void {
  if (collegato) return
  collegato = true
  try { window.gestore.segnali.suStato((f) => { fasi.set(f.sessione, f) }) } catch { collegato = false }
}

function faseDiPty(ptyId: string): FaseSessione | undefined {
  const p = Object.values(useLayoutStore.getState().panes).find((x) => x.ptyId === ptyId)
  return p?.sessionUuid === undefined ? undefined : fasi.get(p.sessionUuid)
}

/** Pronta per una consegna: dai segnali se lo sanno, altrimenti dallo schermo. */
export function prontaConSegnali(ptyId: string, dalloSchermo: () => boolean, adesso = Date.now()): boolean {
  return prontaDaSegnali(faseDiPty(ptyId), adesso) ?? dalloSchermo()
}

/** Sta lavorando (0.57.1): lo schermo se lo mostra, altrimenti i segnali. */
export function lavoraConSegnali(ptyId: string, dalloSchermo: () => boolean, adesso = Date.now()): boolean {
  return dalloSchermo() || lavoraDaSegnali(faseDiPty(ptyId), adesso) === true
}

/** Partita: i segnali la dicono con certezza; altrimenti lo schermo. */
export function partitaConSegnali(ptyId: string, dalloSchermo: () => boolean | undefined, adesso = Date.now()): boolean | undefined {
  return partitaDaSegnali(faseDiPty(ptyId), adesso) ?? dalloSchermo()
}
