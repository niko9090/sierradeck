import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Quanti giorni Claude Code tiene le trascrizioni sul disco, prima di
 * cancellarle da solo.
 *
 * Claude Code, una volta al giorno all'avvio di una chat, toglie da
 * `~/.claude/projects` i `.jsonl` fermi da piu' di `cleanupPeriodDays`
 * (predefinito 30, in `~/.claude/settings.json`). L'arrivo dal Drive rimette
 * le chat degli altri PC con la LORO data (serve alla firma), quindi una chat
 * ferma da 40 giorni scesa oggi sparisce al prossimo giro di pulizia e il
 * giorno dopo scende di nuovo: 1.700 chat, dodici minuti, ogni giorno, per
 * niente. Da qui la regola: quelle piu' vecchie della ritenzione restano sul
 * Drive (catalogo, «Porta qui»), e l'arrivo automatico non le tocca.
 */
export const GIORNI_RITENZIONE_PREDEFINITI = 30

/** I giorni di ritenzione letti dalle impostazioni di Claude Code (utente, poi locali): un intero positivo, altrimenti il predefinito. */
export function giorniDiRitenzione(radiceClaude: string): number {
  let giorni = GIORNI_RITENZIONE_PREDEFINITI
  for (const nome of ['settings.json', 'settings.local.json']) {
    const f = join(radiceClaude, nome)
    if (!existsSync(f)) continue
    try {
      const v = (JSON.parse(readFileSync(f, 'utf8')) as { cleanupPeriodDays?: unknown }).cleanupPeriodDays
      if (typeof v === 'number' && Number.isInteger(v) && v >= 1) giorni = v
    } catch {
      // impostazioni illeggibili: vale quello trovato finora
    }
  }
  return giorni
}

/** Vero se una chat con quella data (ms) verrebbe tolta da Claude Code al prossimo giro: ferma da piu' di `giorni`. */
export function fuoriRitenzione(mtime: number, giorni: number, adessoMs: number): boolean {
  return adessoMs - mtime > giorni * 86_400_000
}
