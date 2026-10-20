import { readFileSync } from 'node:fs'
import { request } from 'node:https'
import type { Autopilota } from '@shared/autopilota'

export type ConfigurazioneTelegram = { token: string; chat: string }

export type TipoAvviso = 'finito' | 'stallo' | 'domanda' | 'sospeso' | 'pronto'

/** Avvisi più vicini di così partono insieme in un messaggio solo (0.81.0), come sulla pagina e nell'app. */
export const AVVISI_VICINI_MS = 20_000

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

/**
 * Il testo dell'utente, reso innocuo dentro un messaggio `parse_mode: 'HTML'`.
 *
 * Telegram legge il messaggio come HTML: un `<`, un `>` o una `&` nel nome,
 * nell'obiettivo o nella domanda gli fanno rifiutare **l'intero** messaggio con
 * «can't parse entities», e allora non arriva nessun avviso — nemmeno la domanda
 * a cui l'utente doveva rispondere. Un obiettivo come «usa `Promise<void>`»
 * bastava. I tag che vogliamo davvero — `<b>`, `<code>` — li mettiamo noi qui
 * attorno, attorno al testo già sfuggito.
 */
function esc(testo: string): string {
  return testo.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function componiAvviso(tipo: TipoAvviso, a: Autopilota, domanda?: string): string {
  const testa = `🤖 <b>${esc(tronca(a.nome, 60))}</b>`
  const obiettivo = `Obiettivo: ${esc(tronca(a.obiettivo, 300))}`

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
        a.strategia !== undefined ? `Ora provo a: ${esc(a.strategia)}` : 'Cerco un altro approccio.'
      )
      break
    case 'sospeso':
      righe.push(`${testa} — sospeso ⏸`, obiettivo, esc(tronca(a.motivoSospensione ?? '', 800)))
      break
    case 'pronto':
      // Si è preparato e aspetta il via. Va detto anche a chi non è davanti
      // allo schermo, altrimenti il lavoro delegato resta fermo per ore senza
      // che nessuno sappia che bastava un clic.
      righe.push(
        `${testa} — pronto, aspetto il tuo via 🚦`,
        obiettivo,
        'Finisce quando:',
        ...a.criteri.slice(0, 8).map((c) => `• ${esc(tronca(c.descrizione, 120))}`)
      )
      break
    default:
      righe.push(
        `${testa} — ho bisogno di te ❓`,
        obiettivo,
        '',
        esc(tronca(domanda ?? '', 1500)),
        '',
        // Senza questa riga l'utente riceve una domanda e non sa come si
        // risponde: il comando è l'unica strada da telefono.
        `Rispondi con: <code>/rispondi ${esc(a.id)} la tua risposta</code>`
      )
  }

  if (tipo === 'finito' && a.decisioni.length > 0) {
    righe.push('', 'Decisioni prese al posto tuo:')
    for (const d of a.decisioni.slice(-DECISIONI_MOSTRATE)) righe.push(`• ${esc(tronca(d.cosa, 200))}`)
  }

  return tronca(righe.join('\n'), MESSAGGIO_MAX)
}

/** Oltre questo l'invio si considera perso: meglio un avviso mancato che una
 * promessa che non si risolve mai e blocca chi la aspetta. */
const TIMEOUT_INVIO_MS = 10_000

/** L'invio vero, isolato perché i test non parlino con Telegram. */
export function invioReale(url: string, corpo: unknown): Promise<boolean> {
  return new Promise((risolvi) => {
    const dati = JSON.stringify(corpo)
    const req = request(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(dati) },
        timeout: TIMEOUT_INVIO_MS
      },
      (res) => {
        res.resume()
        risolvi((res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300)
      }
    )
    req.on('error', () => risolvi(false))
    // `timeout` arma il contatore ma non chiude niente da solo: senza questo, una
    // rete che apre la connessione e poi tace terrebbe la promise pendente.
    req.on('timeout', () => { req.destroy(); risolvi(false) })
    req.write(dati)
    req.end()
  })
}

/**
 * Il primo avviso parte subito; quelli che arrivano entro `AVVISI_VICINI_MS`
 * dall'ultimo invio aspettano la fine della finestra e partono insieme, in un
 * messaggio solo (0.81.0: «mille notifiche quando un autopilota lavora»).
 * Ogni avviso, mandato da solo o insieme, ha la sua riga `[notifica]`.
 */
/** Manda un avviso; `svuotaOra` manda subito quelli in attesa (allo spegnimento). */
export type Avvisatore = ((tipo: TipoAvviso, a: Autopilota, domanda?: string) => Promise<void>) & { svuotaOra: () => Promise<void> }

export function creaAvvisatore(deps: {
  configurazione: ConfigurazioneTelegram | undefined
  manda: (url: string, corpo: unknown) => Promise<boolean>
  /** Per le prove: l'orologio e il timer. */
  adesso?: () => number
  dopo?: (ms: number, f: () => void) => void
}): Avvisatore {
  const adesso = deps.adesso ?? Date.now
  const dopo = deps.dopo ?? ((ms: number, f: () => void) => { setTimeout(f, ms).unref?.() })
  let ultimoInvio = Number.NEGATIVE_INFINITY
  let inAttesa: { testo: string; riga: string }[] = []
  let attesaArmata = false

  const invia = async (testo: string, righe: string[]): Promise<void> => {
    const c = deps.configurazione
    if (c === undefined) return
    ultimoInvio = adesso()
    try {
      const inviato = await deps.manda(`https://api.telegram.org/bot${c.token}/sendMessage`, {
        chat_id: c.chat,
        text: testo,
        parse_mode: 'HTML'
      })
      if (!inviato) console.error(`[autopilota] avviso Telegram non recapitato (${righe.join('; ')})`)
      else for (const r of righe) console.log(`[notifica] Telegram: ${r}${righe.length > 1 ? ` (insieme ad altri ${righe.length - 1})` : ''}`)
    } catch (err) {
      // Il lavoro non dipende da Telegram: un guasto di rete costa un avviso,
      // non il lavoro in corso.
      console.error('[autopilota] invio Telegram fallito:', err)
    }
  }

  const svuota = async (): Promise<void> => {
    attesaArmata = false
    const pronti = inAttesa
    inAttesa = []
    if (pronti.length === 0) return
    const insieme = [`<b>${pronti.length} avvisi da SierraDeck</b>`, ...pronti.map((p) => p.testo)].join('\n\n— — —\n\n')
    // Troncare un gruppo può tagliare a metà un tag HTML, e Telegram lo
    // rifiuterebbe tutto: se non ci sta, un messaggio per avviso (la revisione).
    if (pronti.length === 1 || insieme.length > MESSAGGIO_MAX) {
      for (const p of pronti) await invia(p.testo, [p.riga])
      return
    }
    await invia(insieme, pronti.map((p) => p.riga))
  }

  const avvisa = async (tipo: TipoAvviso, a: Autopilota, domanda?: string): Promise<void> => {
    if (deps.configurazione === undefined) return
    const testo = componiAvviso(tipo, a, domanda)
    const riga = `${tipo} di «${a.nome}» (${a.id})`
    const ora = adesso()
    if (!attesaArmata && ora - ultimoInvio >= AVVISI_VICINI_MS) {
      await invia(testo, [riga])
      return
    }
    inAttesa.push({ testo, riga })
    if (!attesaArmata) {
      attesaArmata = true
      dopo(Math.max(0, ultimoInvio + AVVISI_VICINI_MS - ora), () => { void svuota() })
    }
  }
  // Il timer, se scatta dopo, trova la coda vuota e non manda niente due volte.
  return Object.assign(avvisa, { svuotaOra: svuota })
}
