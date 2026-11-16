import { statSync } from 'node:fs'
import { fileAccesso, fileCredenzialiClaude } from '@shared/accesso-claude'

/**
 * **L'accesso a Claude cambiato: si riparte subito** (16/11).
 *
 * Il 16/11 Nicholas ha rifatto il login alle 13:57, ma la chat SierraDeck
 * aspettava il suo tentativo «fra 5 minuti»: per lui il login «non cambiava
 * niente». Qui il servizio guarda due file, ogni 15 secondi (gratis: solo la
 * data del file):
 * - le credenziali di Claude Code (`~/.claude/.credentials.json`): cambiano a
 *   ogni login → chi aspettava riprova subito;
 * - il gettone di un anno (`accesso-claude.json`): salvato, rinnovato o
 *   rifiutato → anche i processi fermi si spengono, perché il gettone sta
 *   nell'ambiente e un processo già acceso non lo vede.
 */

export const SORVEGLIA_ACCESSO_MS = 15_000

export type CambioAccesso = { riavvia: boolean; perche: string }

/** L'impronta di un file (data e dimensione), `''` se non c'è. */
export function impronta(file: string, stat: (f: string) => { mtimeMs: number; size: number } = statSync): string {
  try { const s = stat(file); return `${s.mtimeMs}|${s.size}` } catch { return '' }
}

/** Il confronto di un giro: cosa è cambiato rispetto a prima. Puro. */
export function confrontaAccesso(prima: { credenziali: string; gettone: string }, ora: { credenziali: string; gettone: string }): CambioAccesso | undefined {
  if (ora.gettone !== prima.gettone) return { riavvia: true, perche: ora.gettone === '' ? 'gettone di un anno tolto' : 'gettone di un anno salvato o cambiato' }
  // Credenziali sparite (logout) non sono un motivo per riprovare.
  if (ora.credenziali !== prima.credenziali && ora.credenziali !== '') return { riavvia: false, perche: 'login di Claude rifatto' }
  return undefined
}

/** Avvia la sorveglianza; restituisce come fermarla. */
export function sorvegliaAccesso(cambiato: (c: CambioAccesso) => void, p: { ogniMs?: number; fileGettone?: string; fileCredenziali?: string } = {}): () => void {
  const fg = p.fileGettone ?? fileAccesso()
  const fc = p.fileCredenziali ?? fileCredenzialiClaude()
  let prima = { credenziali: impronta(fc), gettone: impronta(fg) }
  const t = setInterval(() => {
    const ora = { credenziali: impronta(fc), gettone: impronta(fg) }
    const c = confrontaAccesso(prima, ora)
    prima = ora
    if (c !== undefined) { try { cambiato(c) } catch (err) { console.error('[accesso-claude] ripartenza non riuscita:', err) } }
  }, p.ogniMs ?? SORVEGLIA_ACCESSO_MS)
  t.unref?.()
  return () => clearInterval(t)
}
