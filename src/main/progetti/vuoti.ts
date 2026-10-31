import { lstatSync, readdirSync, rmdirSync } from 'node:fs'
import { join } from 'node:path'
import { progettiVuotiDaTogliere, rimuoviProgetto, type RegistroProgetti } from './registro'

/**
 * Il giro dei progetti vuoti (0.88.9): toglie dal registro, con la lapide, i
 * progetti di questo PC che non hanno un file né qui né sul Drive, e la loro
 * cartella vuota. Vedi `progettiVuotiDaTogliere` per le regole.
 */

/** Ogni quanto gira, dopo il primo giro poco dopo l'avvio. */
export const GIRO_VUOTI_MS = 6 * 60 * 60_000

/**
 * Vera se nella cartella non c'è nemmeno un file (solo cartelle vuote), o se
 * non c'è. Un collegamento (giunzione, link) conta come pieno: non lo si segue.
 */
export function cartellaVuota(cartella: string): boolean {
  let st
  try { st = lstatSync(cartella) } catch { return true }
  if (!st.isDirectory() || st.isSymbolicLink()) return false
  let voci
  try { voci = readdirSync(cartella, { withFileTypes: true }) } catch { return false }
  return voci.every((v) => v.isDirectory() && !v.isSymbolicLink() && cartellaVuota(join(cartella, v.name)))
}

/** Toglie una cartella vuota dal fondo, con `rmdir` (mai una cancellazione ricorsiva). */
export function togliCartellaVuota(cartella: string): boolean {
  if (!cartellaVuota(cartella)) return false
  let voci
  try { voci = readdirSync(cartella, { withFileTypes: true }) } catch { return true }
  for (const v of voci) togliCartellaVuota(join(cartella, v.name))
  try { rmdirSync(cartella); return true } catch { return false }
}

export async function giroProgettiVuoti(d: {
  registro: { leggi: () => RegistroProgetti; scrivi: (r: RegistroProgetti) => void }
  pcId: () => string
  conFileSulDrive: () => Promise<Set<string> | undefined>
  adesso: () => number
  log: (riga: string) => void
}): Promise<number> {
  const sulDrive = await d.conFileSulDrive()
  if (sulDrive === undefined) return 0
  const vuoti = progettiVuotiDaTogliere(d.registro.leggi(), { pcId: d.pcId(), adesso: d.adesso(), conFileSulDrive: sulDrive, cartellaVuota })
  if (vuoti.length === 0) return 0
  const quando = new Date(d.adesso()).toISOString()
  let reg = d.registro.leggi()
  for (const p of vuoti) reg = rimuoviProgetto(reg, p.id, quando)
  d.registro.scrivi(reg)
  for (const p of vuoti) {
    const tolta = p.percorso !== undefined && togliCartellaVuota(p.percorso)
    d.log(`[progetti] «${p.nome}» tolto dall’elenco: nessun file né qui né sul Drive${tolta ? ', cartella vuota tolta' : ''}`)
  }
  return vuoti.length
}
