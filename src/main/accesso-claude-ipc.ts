import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { ipcMain } from 'electron'
import { ambientePulito } from '@shared/ambiente-figli'
import { fileAccesso, statoAccesso, type StatoAccesso } from '@shared/accesso-claude'
import { avviaRinnovaAccesso } from '@shared/rinnova-accesso'
import { trovaClaude } from './preparazione'

/**
 * **«Accesso a Claude» nel programma** (16/11): lo stato del gettone di un
 * anno e il tasto che apre la finestra per rinnovarlo.
 *
 * Lo stato si legge dal file senza decifrare (gratis, il pannello lo chiede
 * ogni tanto). Il rinnovo apre una finestra di PowerShell **visibile**, come
 * «Collega Claude» dell'Aiutante: lì Nicholas approva nel browser, il resto lo
 * fa lo script (`rinnova-accesso.ts`). Il servizio vede il file nuovo da solo
 * e fa ripartire le chat ferme: qui non serve avvisarlo.
 */

export type EsitoRinnovo = { ok: true } | { ok: false; messaggio: string }

/** Dove sta `claude.exe`: lo stesso giro della preparazione, poi il PATH. */
function percorsoClaude(env: NodeJS.ProcessEnv = process.env): string {
  const dallAmbiente = env.GESTORE_CLAUDE_PATH
  if (dallAmbiente !== undefined && dallAmbiente.trim() !== '') return dallAmbiente
  return trovaClaude({ env, casa: homedir(), esiste: (p) => existsSync(p) }) ?? 'claude.exe'
}

/** Apre la finestra del rinnovo (lo spawn lo fa `avviaRinnovaAccesso`). Non solleva: un avvio mancato torna come esito. */
export function apriRinnovoAccesso(log: (riga: string) => void, nomePc?: () => string | undefined): EsitoRinnovo {
  let esito: EsitoRinnovo
  try {
    const nome = (() => { try { return nomePc?.() } catch { return undefined } })()
    esito = avviaRinnovaAccesso(percorsoClaude(), fileAccesso(), { env: ambientePulito(process.env), ...(nome !== undefined ? { nomePc: nome } : {}) })
  } catch (err) {
    esito = { ok: false, messaggio: err instanceof Error ? err.message : String(err) }
  }
  log(esito.ok ? '[accesso-claude] aperta la finestra per rinnovare l’accesso' : `[accesso-claude] finestra per rinnovare l’accesso non aperta: ${esito.messaggio}`)
  return esito
}

export function registraAccessoClaudeIpc(log: (riga: string) => void, nomePc?: () => string | undefined): void {
  ipcMain.handle('accessoClaude:stato', (): StatoAccesso => {
    try { return statoAccesso() } catch (err) { return { stato: 'illeggibile', perche: err instanceof Error ? err.message : String(err) } }
  })
  ipcMain.handle('accessoClaude:rinnova', (): EsitoRinnovo => apriRinnovoAccesso(log, nomePc))
}
