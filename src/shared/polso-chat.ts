/**
 * Il polso di una chat: quello che Claude Code racconta alla sua riga di stato.
 *
 * Nicholas (22/09/2026): «importa anche qui i limiti se puoi e emetti avvisi
 * in basso nel pop up per aiutare a capire l'utente». I limiti del piano (la
 * finestra di cinque ore e quella settimanale, con la percentuale usata e
 * quando si azzerano) non stanno in nessun file locale: Claude Code li riceve
 * dall'API e li passa **solo** al comando della riga di stato, insieme al
 * costo della sessione e al contesto usato (documentato in
 * code.claude.com/docs/en/statusline). SierraDeck registra per ogni chat una
 * riga di stato che rimanda quel JSON al proprio server locale
 * (`POST /api/polso`, solo da 127.0.0.1) e riceve in cambio il testo da
 * mostrare in fondo al terminale.
 *
 * Questo modulo e' puro: legge il JSON, decide la riga, somma i costi, sceglie
 * gli avvisi. Chi lo chiama porta l'orologio.
 */

export type Finestra = {
  /** Percentuale usata, 0-100. */
  percento: number
  /** Quando si azzera, in millisecondi dall'epoca. */
  resettaIl?: number
}

export type Polso = {
  sessione: string
  /** Quando e' arrivato l'ultimo polso, ms. */
  quando: number
  modello?: string
  /** Il costo della sessione secondo Claude Code, in dollari, cumulativo. */
  costoUsd?: number
  contesto?: { percento: number; usati: number; dimensione: number }
  limiti?: { cinqueOre?: Finestra; settimana?: Finestra }
}

function numero(x: unknown): number | undefined {
  return typeof x === 'number' && Number.isFinite(x) ? x : undefined
}
function oggetto(x: unknown): Record<string, unknown> | undefined {
  return typeof x === 'object' && x !== null ? (x as Record<string, unknown>) : undefined
}
function finestra(x: unknown): Finestra | undefined {
  const o = oggetto(x)
  const p = numero(o?.used_percentage)
  if (o === undefined || p === undefined) return undefined
  const reset = numero(o.resets_at)
  // `resets_at` e' in secondi dall'epoca (Unix); i millisecondi non arrivano.
  return { percento: Math.max(0, Math.min(100, p)), ...(reset !== undefined ? { resettaIl: reset < 1e12 ? reset * 1000 : reset } : {}) }
}

/** Il JSON della riga di stato, letto con prudenza: manca tutto cio' che manca. */
export function leggiPolso(raw: unknown, adesso: number): Polso | undefined {
  const o = oggetto(raw)
  const sessione = typeof o?.session_id === 'string' ? o.session_id : ''
  if (o === undefined || sessione === '') return undefined
  const modello = oggetto(o.model)
  const costo = oggetto(o.cost)
  const ctx = oggetto(o.context_window)
  const limiti = oggetto(o.rate_limits)
  const nome = typeof modello?.display_name === 'string' ? modello.display_name : typeof modello?.id === 'string' ? modello.id : undefined
  const costoUsd = numero(costo?.total_cost_usd)
  const percento = numero(ctx?.used_percentage)
  const dimensione = numero(ctx?.context_window_size)
  const uso = oggetto(ctx?.current_usage)
  const usati = uso === undefined ? undefined
    : (numero(uso.input_tokens) ?? 0) + (numero(uso.cache_creation_input_tokens) ?? 0) + (numero(uso.cache_read_input_tokens) ?? 0) + (numero(uso.output_tokens) ?? 0)
  const cinqueOre = finestra(limiti?.five_hour)
  const settimana = finestra(limiti?.seven_day)
  return {
    sessione,
    quando: adesso,
    ...(nome !== undefined ? { modello: nome } : {}),
    ...(costoUsd !== undefined ? { costoUsd } : {}),
    ...(percento !== undefined ? { contesto: { percento: Math.round(percento), usati: usati ?? 0, dimensione: dimensione ?? 0 } } : {}),
    ...(cinqueOre !== undefined || settimana !== undefined
      ? { limiti: { ...(cinqueOre !== undefined ? { cinqueOre } : {}), ...(settimana !== undefined ? { settimana } : {}) } }
      : {})
  }
}

/** «14:20», o «dom 09:00» se non e' oggi. */
export function oraDi(ms: number, adesso: number): string {
  const d = new Date(ms)
  const hh = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const oggi = new Date(adesso)
  if (d.toDateString() === oggi.toDateString()) return hh
  const giorni = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab']
  return `${giorni[d.getDay()]} ${hh}`
}

/**
 * La riga che Claude Code mostra in fondo al terminale: corta, con quello
 * che serve a decidere se continuare. Sostituisce la riga di stato
 * dell'utente solo nelle chat aperte da SierraDeck.
 */
export function rigaDiStato(p: Polso, adesso: number): string {
  const pezzi: string[] = []
  if (p.modello !== undefined) pezzi.push(p.modello)
  if (p.contesto !== undefined) pezzi.push(`contesto ${p.contesto.percento}%`)
  const c = p.limiti?.cinqueOre
  if (c !== undefined) pezzi.push(`5 ore ${Math.round(c.percento)}%${c.resettaIl !== undefined ? ` (azzera ${oraDi(c.resettaIl, adesso)})` : ''}`)
  const s = p.limiti?.settimana
  if (s !== undefined) pezzi.push(`settimana ${Math.round(s.percento)}%`)
  if (p.costoUsd !== undefined) pezzi.push(`${p.costoUsd.toFixed(2)} $`)
  return pezzi.join(' · ')
}

export type Limiti = {
  cinqueOre?: Finestra
  settimana?: Finestra
  /** Quando sono stati letti, ms, e da quale chat/modello. */
  letti: number
  modello?: string
}

/** I limiti piu' recenti fra tutti i polsi: sono del piano, non della chat, quindi l'ultimo letto vale per tutti. */
export function limitiAggiornati(polsi: Polso[], adesso: number): Limiti | undefined {
  const con = polsi.filter((p) => p.limiti !== undefined).sort((a, b) => b.quando - a.quando)
  const ultimo = con[0]
  if (ultimo === undefined || ultimo.limiti === undefined) return undefined
  // Una finestra gia' azzerata non si mostra piu' come piena.
  const viva = (f: Finestra | undefined): Finestra | undefined =>
    f === undefined ? undefined : f.resettaIl !== undefined && f.resettaIl <= adesso ? { percento: 0, resettaIl: f.resettaIl } : f
  const cinqueOre = viva(ultimo.limiti.cinqueOre)
  const settimana = viva(ultimo.limiti.settimana)
  return {
    ...(cinqueOre !== undefined ? { cinqueOre } : {}),
    ...(settimana !== undefined ? { settimana } : {}),
    letti: ultimo.quando,
    ...(ultimo.modello !== undefined ? { modello: ultimo.modello } : {})
  }
}

export type Costo = { oggi: number; settimana: number; totale: number; chat: number }

/**
 * La spesa che Claude Code stima, sommata per periodo.
 *
 * Il costo di una sessione e' cumulativo e va tutto al giorno dell'ultimo
 * polso: una chat lunga due giorni conta nel secondo. E' un'approssimazione
 * detta nel pannello; con un abbonamento e' comunque un'indicazione, non una
 * fattura.
 */
export function costoPerPeriodo(polsi: Polso[], adesso: number): Costo {
  const inizioOggi = new Date(adesso); inizioOggi.setHours(0, 0, 0, 0)
  const settimanaFa = adesso - 7 * 24 * 60 * 60 * 1000
  const c: Costo = { oggi: 0, settimana: 0, totale: 0, chat: 0 }
  for (const p of polsi) {
    if (p.costoUsd === undefined) continue
    c.totale += p.costoUsd; c.chat += 1
    if (p.quando >= settimanaFa) c.settimana += p.costoUsd
    if (p.quando >= inizioOggi.getTime()) c.oggi += p.costoUsd
  }
  return c
}

export type AvvisoConsumi = {
  /** Uguale per lo stesso fatto: chi lo ha gia' mostrato non lo ripete. */
  chiave: string
  tono: 'attesa' | 'errore'
  testo: string
}

const SOGLIE = [80, 95] as const

/**
 * Gli avvisi da mettere in un fumetto: le soglie dei limiti e il contesto
 * di una chat quasi pieno. Ogni avviso ha una chiave che cambia con la
 * finestra (l'ora di azzeramento) e con la soglia: dopo l'azzeramento
 * l'avviso puo' tornare, prima no.
 */
export function avvisiConsumi(p: {
  limiti?: Limiti
  chatAperte: { sessione: string; titolo?: string; contestoPercento?: number }[]
  adesso: number
}): AvvisoConsumi[] {
  const fuori: AvvisoConsumi[] = []
  const finestra = (nome: '5 ore' | 'settimana', f: Finestra | undefined): void => {
    if (f === undefined) return
    for (const soglia of SOGLIE) {
      if (f.percento < soglia) continue
      const quando = f.resettaIl !== undefined ? ` Si azzera ${nome === '5 ore' ? 'alle' : 'il'} ${oraDi(f.resettaIl, p.adesso)}.` : ''
      const chiave = `${nome}:${soglia}:${f.resettaIl ?? 'x'}`
      fuori.push({
        chiave,
        tono: soglia >= 95 ? 'errore' : 'attesa',
        testo: soglia >= 95
          ? `Limite del piano quasi raggiunto: la finestra di ${nome} è al ${Math.round(f.percento)}%.${quando} Oltre il 100% le chat si fermano fino all’azzeramento.`
          : `La finestra di ${nome} del piano è al ${Math.round(f.percento)}%.${quando} Se hai lavori lunghi da far partire, meglio saperlo ora.`
      })
    }
  }
  finestra('5 ore', p.limiti?.cinqueOre)
  finestra('settimana', p.limiti?.settimana)
  for (const c of p.chatAperte) {
    if (c.contestoPercento === undefined || c.contestoPercento < 90) continue
    fuori.push({
      chiave: `ctx:${c.sessione}:90`,
      tono: 'attesa',
      testo: `La chat «${c.titolo ?? c.sessione.slice(0, 8)}» ha il contesto al ${c.contestoPercento}%: Claude Code lo compatterà da solo a breve, e in quel passaggio può perdere dettagli. Se stai per chiederle qualcosa di lungo, prima falle riassumere dove è arrivata.`
    })
  }
  // La soglia piu' alta vince sulla piu' bassa per la stessa finestra.
  const perFinestra = new Map<string, AvvisoConsumi>()
  for (const a of fuori) {
    const radice = a.chiave.split(':').filter((_x, i) => i !== 1).join(':')
    perFinestra.set(radice, a)
  }
  return [...perFinestra.values()]
}
