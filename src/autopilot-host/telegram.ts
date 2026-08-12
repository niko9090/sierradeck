import { readFileSync } from 'node:fs'
import { request } from 'node:https'
import type { Autopilota } from '@shared/autopilota'

export type ConfigurazioneTelegram = { token: string; chat: string }

export type TipoAvviso = 'finito' | 'stallo' | 'domanda' | 'ripreso' | 'sospeso'

/** Telegram taglia a 4096 caratteri: si sta sotto, con margine. */
const MESSAGGIO_MAX = 4000
/** Quante decisioni entrano nel riepilogo finale. */
const DECISIONI_MOSTRATE = 8

/**
 * Legge la configurazione del bot dal primo file leggibile.
 *
 * Si riusa il bot che gira già su questa macchina invece di crearne uno nuovo:
 * Telegram ammette **un solo** consumatore di `getUpdates` per bot, e un secondo
 * poller ruberebbe i messaggi al primo. Inviare messaggi, invece, non ha vincoli
 * di esclusività: è la parte che questo modulo fa.
 *
 * Restituisce `undefined` se non trova niente — Telegram è un di più, e senza
 * l'autopilota lavora comunque.
 */
export function leggiConfigurazione(percorsi: string[]): ConfigurazioneTelegram | undefined {
  for (const percorso of percorsi) {
    let grezzo: unknown
    try {
      grezzo = JSON.parse(readFileSync(percorso, 'utf8'))
    } catch {
      continue
    }
    if (typeof grezzo !== 'object' || grezzo === null) continue
    const o = grezzo as Record<string, unknown>
    const token = typeof o.bot_token === 'string' && o.bot_token.trim() !== '' ? o.bot_token : undefined
    const chat =
      typeof o.chat_id === 'string' && o.chat_id.trim() !== ''
        ? o.chat_id
        : typeof o.chat_id === 'number'
          ? String(o.chat_id)
          : undefined
    if (token === undefined || chat === undefined) continue
    return { token, chat }
  }
  return undefined
}

function tronca(testo: string, quanto: number): string {
  return testo.length > quanto ? `${testo.slice(0, quanto)}…` : testo
}

export function componiAvviso(tipo: TipoAvviso, a: Autopilota, domanda?: string): string {
  const testa = `🤖 <b>${tronca(a.nome, 60)}</b>`
  const obiettivo = `Obiettivo: ${tronca(a.obiettivo, 300)}`

  const righe: string[] = []
  switch (tipo) {
    case 'finito':
      righe.push(`${testa} — lavoro finito ✅`, obiettivo, `Interventi: ${a.cicli}`)
      break
    case 'stallo':
      // Non e' un addio: l'autopilota sta ancora lavorando, ma ha capito di
      // essere in un cerchio e sta cambiando strada. Dirlo evita che l'utente
      // scopra il problema solo a lavoro finito.
      righe.push(
        `${testa} — sono bloccato, provo un'altra strada ⚠️`,
        obiettivo,
        a.strategia !== undefined ? `Ora provo a: ${a.strategia}` : 'Cerco un altro approccio.'
      )
      break
    case 'sospeso':
      righe.push(`${testa} — sospeso ⏸`, obiettivo, tronca(a.motivoSospensione ?? '', 800))
      break
    case 'ripreso':
      righe.push(`${testa} — ripreso dopo un riavvio ▶️`, obiettivo, `Interventi finora: ${a.cicli}`)
      break
    default:
      righe.push(
        `${testa} — ho bisogno di te ❓`,
        obiettivo,
        '',
        tronca(domanda ?? '', 1500),
        '',
        // Senza questa riga l'utente riceve una domanda e non sa come si
        // risponde: il comando è l'unica strada da telefono.
        `Rispondi con: <code>/rispondi ${a.id} la tua risposta</code>`
      )
  }

  if (tipo === 'finito' && a.decisioni.length > 0) {
    righe.push('', 'Decisioni prese al posto tuo:')
    for (const d of a.decisioni.slice(-DECISIONI_MOSTRATE)) righe.push(`• ${tronca(d.cosa, 200)}`)
  }

  return tronca(righe.join('\n'), MESSAGGIO_MAX)
}

/** L'invio vero, isolato perché i test non parlino con Telegram. */
export function invioReale(url: string, corpo: unknown): Promise<boolean> {
  return new Promise((risolvi) => {
    const dati = JSON.stringify(corpo)
    const req = request(
      url,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(dati) } },
      (res) => {
        res.resume()
        risolvi((res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300)
      }
    )
    req.on('error', () => risolvi(false))
    req.write(dati)
    req.end()
  })
}

export function creaAvvisatore(deps: {
  configurazione: ConfigurazioneTelegram | undefined
  manda: (url: string, corpo: unknown) => Promise<boolean>
}): (tipo: TipoAvviso, a: Autopilota, domanda?: string) => Promise<void> {
  return async (tipo, a, domanda) => {
    const c = deps.configurazione
    if (c === undefined) return
    try {
      const inviato = await deps.manda(`https://api.telegram.org/bot${c.token}/sendMessage`, {
        chat_id: c.chat,
        text: componiAvviso(tipo, a, domanda),
        parse_mode: 'HTML'
      })
      if (!inviato) console.error(`[autopilota] avviso Telegram non recapitato (${tipo}, ${a.id})`)
    } catch (err) {
      // Il lavoro non dipende da Telegram: un guasto di rete costa un avviso,
      // non il lavoro in corso.
      console.error('[autopilota] invio Telegram fallito:', err)
    }
  }
}
