import { diciTelegramAssente, leggiConfigurazione, percorsiConfigTelegram, type ConfigurazioneTelegram } from '../autopilot-host/telegram'
import type { Avviso } from '@shared/avvisi-telefono'
import type { RegistroAvvisi } from './avvisi'

/**
 * **Telegram dal registro degli avvisi** (11/11). Prima lo mandava il
 * servizio degli autopiloti con le sue regole; adesso è un'altra uscita dello
 * stesso registro dell'app e della pagina: gli stessi avvisi, gli stessi
 * testi, lo stesso suono (silenzioso quando l'avviso non suona). Un avviso
 * spento nelle impostazioni non nasce, quindi non arriva nemmeno qui.
 */

/** Telegram taglia a 4096 caratteri: si sta sotto, con margine. */
const MESSAGGIO_MAX = 4000

function esc(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Il messaggio di un avviso: titolo in grassetto, la cosa, la riga sotto. `undefined`: niente da mandare. */
export function messaggioTelegram(a: Avviso): string | undefined {
  if (a.chiuso !== undefined) {
    // Solo «ho scelto io»: è l'unica chiusura che dice qualcosa di nuovo.
    if (a.chiuso.come !== 'programma') return undefined
    return `<b>${esc(a.titolo)}</b>\n${esc(a.testo)}\n\nHo scelto io${a.chiuso.testo !== undefined ? `: ${esc(a.chiuso.testo)}` : ' la strada più prudente'}.`.slice(0, MESSAGGIO_MAX)
  }
  const righe = [`<b>${esc(a.titolo)}</b>`, esc(a.testo)]
  if (a.sotto !== undefined) righe.push(`<i>${esc(a.sotto)}</i>`)
  // La risposta da Telegram passa dal bot che gira già su questo PC, con il comando di sempre.
  if (a.tipo === 'domanda' && a.bersaglio.autopilota !== undefined && a.bersaglio.pc === undefined) {
    righe.push('', `Rispondi con: <code>/rispondi ${esc(a.bersaglio.autopilota)} la tua risposta</code>`)
  }
  return righe.join('\n').slice(0, MESSAGGIO_MAX)
}

export type InvioTelegram = (url: string, corpo: unknown) => Promise<boolean>

/**
 * Da qui in poi ogni avviso che nasce (e ogni «ho scelto io») va anche su
 * Telegram, se c'è la configurazione. Restituisce come smettere.
 */
export function avviaTelegram(registro: RegistroAvvisi, deps: { configurazione: ConfigurazioneTelegram | undefined; manda: InvioTelegram; log?: (riga: string) => void }): () => void {
  const c = deps.configurazione
  if (c === undefined) return () => undefined
  const log = (r: string): void => { try { deps.log?.(r) } catch { /* il registro non ferma Telegram */ } }
  return registro.quandoCambia((a) => {
    const testo = messaggioTelegram(a)
    if (testo === undefined) return
    void deps.manda(`https://api.telegram.org/bot${c.token}/sendMessage`, { chat_id: c.chat, text: testo, parse_mode: 'HTML', disable_notification: !a.suona })
      .then((ok) => { log(ok ? `[notifica] Telegram: avviso n=${a.n} ${a.tipo}` : `[notifica] Telegram: avviso n=${a.n} non recapitato`) })
      .catch((err: unknown) => { log(`[notifica] Telegram: avviso n=${a.n} non mandato: ${err instanceof Error ? err.message : String(err)}`) })
  })
}

/** La configurazione dal solito posto (variabile d'ambiente, o la cartella dei dati); se manca lo dice una volta. */
export function configurazioneTelegram(ambiente: Record<string, string | undefined>, cartellaDati: string, log: (riga: string) => void): ConfigurazioneTelegram | undefined {
  const c = leggiConfigurazione(percorsiConfigTelegram(ambiente, cartellaDati))
  diciTelegramAssente(c, log)
  return c
}
