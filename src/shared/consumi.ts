import type { SessionSummary } from './types'
import type { Costo, Limiti } from './polso-chat'

export type Quota = {
  ingresso: number
  uscita: number
  /** Letture e scritture della cache messe insieme: costano meno e vanno lette a parte. */
  cache: number
  chat: number
}

export type Consumi = {
  oggi: Quota
  settimana: Quota
  totale: Quota
  /** I progetti che consumano di più, dal primo. */
  perProgetto: { progetto: string; token: number }[]
  /** I modelli usati negli ultimi 7 giorni, dal più pesante: i grandi pesano di più sui limiti. */
  perModello?: { modello: string; token: number }[]
  /** I limiti del piano (finestra di 5 ore, settimana), letti dal polso delle chat. */
  limiti?: Limiti
  /** La spesa che Claude Code stima per le sue sessioni, sommata per periodo. */
  costo?: Costo
  /** Le chat aperte adesso, con modello, contesto occupato e costo. */
  chatAperte?: { sessione: string; titolo?: string; modello?: string; contestoPercento?: number; costoUsd?: number }[]
}

const GIORNO_MS = 24 * 60 * 60 * 1000
/** Oltre questo numero, l'elenco dei progetti smette di essere una lettura rapida. */
const PROGETTI_MOSTRATI = 6

function vuota(): Quota {
  return { ingresso: 0, uscita: 0, cache: 0, chat: 0 }
}

function aggiungi(q: Quota, s: SessionSummary): void {
  q.ingresso += s.inputTokens
  q.uscita += s.outputTokens
  q.cache += s.cacheReadTokens + s.cacheWriteTokens
}

/**
 * I consumi, ricavati dall'indice delle sessioni.
 *
 * I numeri esistono già: ogni `.jsonl` porta i token di quella sessione, e
 * l'indice li ha registrati. Qui si sommano soltanto.
 *
 * **Token e non denaro.** Con un abbonamento il costo di una chat non è una
 * moltiplicazione, e inventare un prezzo darebbe una cifra falsa con l'aria di
 * essere vera. I token invece sono ciò che si consuma davvero, e sono
 * confrontabili fra un giorno e l'altro.
 */
export function riassumiConsumi(sessioni: SessionSummary[], adesso: number): Consumi {
  const oggi = vuota()
  const settimana = vuota()
  const totale = vuota()
  const perProgetto = new Map<string, number>()
  const perModello = new Map<string, number>()

  // Le chat, non i file: due sessioni della stessa conversazione sono una sola.
  const chatOggi = new Set<string>()
  const chatSettimana = new Set<string>()
  const chatTotali = new Set<string>()

  const inizioOggi = new Date(adesso)
  inizioOggi.setHours(0, 0, 0, 0)

  for (const s of sessioni) {
    const quando = Date.parse(s.lastTimestamp ?? '')
    const chiaveChat = s.aiTitle === undefined ? `${s.projectSlug} ${s.uuid}` : `${s.projectSlug} ${s.aiTitle}`

    aggiungi(totale, s)
    chatTotali.add(chiaveChat)

    // L'ultima parte non vuota del percorso: uno che finisce con la barra
    // darebbe una riga senza etichetta, e una barra senza nome non si legge.
    const parti = s.projectPath.split(/[\\/]/).filter((x) => x.trim() !== '')
    const nomeProgetto = parti[parti.length - 1] ?? s.projectPath
    perProgetto.set(
      nomeProgetto,
      (perProgetto.get(nomeProgetto) ?? 0) + s.inputTokens + s.outputTokens
    )

    if (Number.isNaN(quando)) continue
    if (quando >= adesso - 7 * GIORNO_MS) {
      aggiungi(settimana, s)
      chatSettimana.add(chiaveChat)
      const modello = nomeModello(s.model)
      perModello.set(modello, (perModello.get(modello) ?? 0) + s.inputTokens + s.outputTokens)
    }
    if (quando >= inizioOggi.getTime()) {
      aggiungi(oggi, s)
      chatOggi.add(chiaveChat)
    }
  }

  oggi.chat = chatOggi.size
  settimana.chat = chatSettimana.size
  totale.chat = chatTotali.size

  return {
    oggi,
    settimana,
    totale,
    perProgetto: [...perProgetto.entries()]
      .map(([progetto, token]) => ({ progetto, token }))
      .sort((a, b) => b.token - a.token)
      .slice(0, PROGETTI_MOSTRATI),
    perModello: [...perModello.entries()]
      .map(([modello, token]) => ({ modello, token }))
      .sort((a, b) => b.token - a.token)
      .slice(0, PROGETTI_MOSTRATI)
  }
}

/** `claude-opus-5-20260301` → «Opus 5»: il nome che si legge, non l'id. */
export function nomeModello(id: string | undefined): string {
  if (id === undefined || id.trim() === '') return 'sconosciuto'
  const m = /^(?:claude-)?([a-z]+)-(\d+)(?:-(\d+))?/i.exec(id.trim())
  if (m === null) return id
  const famiglia = (m[1] ?? '').charAt(0).toUpperCase() + (m[1] ?? '').slice(1)
  const versione = m[3] !== undefined && m[3].length <= 2 ? `${m[2]}.${m[3]}` : m[2]
  return `${famiglia} ${versione}`
}

/**
 * I token in forma leggibile.
 *
 * `12,4k` invece di `12400`: in una riga di stato conta la grandezza, non la
 * cifra esatta, e undici caratteri di numero si leggono peggio di quattro.
 */
export function formattaToken(n: number): string {
  if (n < 1000) return String(n)
  // La soglia si guarda **dopo** l'arrotondamento, non prima: 999.950 sta
  // sotto il milione, ma arrotondato a un decimale fa `1000,0k` — un numero
  // che nella riga dei consumi non si legge come niente.
  const migliaia = (n / 1000).toFixed(1)
  if (Number(migliaia) < 1000) return `${migliaia.replace('.', ',')}k`.replace(',0k', 'k')
  return `${(n / 1_000_000).toFixed(1).replace('.', ',')}M`.replace(',0M', 'M')
}

/**
 * Quanto vale un consumo, in parole.
 *
 * I numeri di token non dicono niente a nessuno: «847k» è tanto o poco? La
 * risposta utile non è un altro numero — è il confronto con quello che si fa di
 * solito. Una giornata sopra la media si nota, e questo è ciò che serve sapere
 * a colpo d'occhio.
 */
export type Andamento = 'sotto' | 'normale' | 'sopra'

export function andamentoOggi(c: Consumi): Andamento {
  const oggi = c.oggi.ingresso + c.oggi.uscita
  // La media del periodo, non il totale: confrontare un giorno con una
  // settimana direbbe sempre «poco», che è vero e inutile.
  const media = (c.settimana.ingresso + c.settimana.uscita) / 7
  if (media === 0) return 'normale'
  if (oggi > media * 1.4) return 'sopra'
  if (oggi < media * 0.6) return 'sotto'
  return 'normale'
}

/** Quanto pesa la cache sul totale: è la parte che costa meno, e vederla consola. */
export function quotaCache(q: Quota): number {
  const tutto = q.ingresso + q.uscita + q.cache
  return tutto === 0 ? 0 : Math.round((q.cache / tutto) * 100)
}

/**
 * Il consumo di una quota in una riga sola.
 *
 * Ingresso e uscita separati perché costano diversamente, e il numero di chat
 * perché è l'unica misura che una persona ha davvero in testa.
 */
export function descriviQuota(q: Quota): string {
  const totale = formattaToken(q.ingresso + q.uscita)
  const chat = q.chat === 1 ? '1 chat' : `${q.chat} chat`
  return `${totale} in ${chat}`
}
