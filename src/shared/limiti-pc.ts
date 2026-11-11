/**
 * **I limiti del PC li decide Nicholas** (11/11). Fino a oggi erano costanti
 * nel codice: quanti autopiloti hanno il turno insieme, quante domande all'ora,
 * quanto si aspetta un PC carico, quanto può durare una prova o un'unione,
 * quanti secondi di sleep passano; e due interruttori, la guardia del PC e «un
 * comando pesante alla volta». I valori di serie sono quelli di prima; il
 * programma non mette un massimo (solo il minimo che dà senso al numero).
 *
 * Stanno in un file del servizio (`limiti.json`), valgono per tutto il PC e
 * si leggono a ogni uso: cambiarli non chiede un riavvio.
 */

export type LimitiPc = {
  /** Specialisti insieme su tutto il PC. `null`: lo decide il PC da processori, memoria e carico (di serie). */
  specialistiPc: number | null
  /** Quanti autopiloti (uno per workspace) possono avere un turno aperto insieme. */
  turniAutopilota: number
  /** Quante domande all'ora può fare un autopilota. */
  domandeOra: number
  /** Quanti secondi un comando pesante aspetta che il PC carico si liberi, prima di partire lo stesso. */
  attesaPcCaricoS: number
  /** Minuti, al più, di un'unione di prova. */
  provaMaxMin: number
  /** Minuti, al più, di un'unione intera (prova compresa). */
  unioneMaxMin: number
  /** Secondi di attesa a mano (sleep) che passano in un comando di uno specialista. */
  sleepMaxS: number
  /** La guardia del PC: con il PC al limite i comandi pesanti aspettano. */
  guardiaPc: boolean
  /** Le suite complete, le compilazioni e tsc intero di chat e specialisti girano uno alla volta. */
  unPesanteAllaVolta: boolean
}

export const LIMITI_DI_SERIE: LimitiPc = {
  specialistiPc: null,
  turniAutopilota: 3,
  domandeOra: 4,
  attesaPcCaricoS: 90,
  provaMaxMin: 45,
  unioneMaxMin: 60,
  sleepMaxS: 30,
  guardiaPc: true,
  unPesanteAllaVolta: true
}

export type ChiaveNumero = 'specialistiPc' | 'turniAutopilota' | 'domandeOra' | 'attesaPcCaricoS' | 'provaMaxMin' | 'unioneMaxMin' | 'sleepMaxS'
export type ChiaveInterruttore = 'guardiaPc' | 'unPesanteAllaVolta'

/** Il minimo che dà senso a ogni numero. Un massimo non c'è: lo decide Nicholas. */
export const MINIMO: Record<ChiaveNumero, number> = { specialistiPc: 1, turniAutopilota: 1, domandeOra: 1, attesaPcCaricoS: 0, provaMaxMin: 1, unioneMaxMin: 1, sleepMaxS: 0 }

/** Per la pagina delle impostazioni: il nome corto, l'unità, e la spiegazione intera (dietro il «?»). */
export const VOCI_NUMERI: { chiave: ChiaveNumero; nome: string; unita: string; spiega: string }[] = [
  { chiave: 'specialistiPc', nome: 'Specialisti insieme sul PC', unita: 'specialisti', spiega: 'Quanti specialisti di tutti gli autopiloti lavorano insieme su questo PC. Vuoto: lo decide il PC da processori, memoria libera e carico (fra 2 e 4). Un numero tuo vale così com’è, senza un massimo: troppi insieme rallentano il PC e si ostacolano sulla stessa cartella.' },
  { chiave: 'turniAutopilota', nome: 'Autopiloti che pensano insieme', unita: 'autopiloti', spiega: 'Quanti autopiloti (uno per workspace) possono avere un turno aperto nello stesso momento. Gli altri aspettano che uno finisca il suo turno, anche per risponderti.' },
  { chiave: 'domandeOra', nome: 'Domande all’ora', unita: 'domande', spiega: 'Quante domande ti può fare un autopilota in un’ora. Oltre, decide lui con la scelta più prudente e te lo scrive. Non conta le domande dei permessi: quelle non le decide mai nessuno al posto tuo.' },
  { chiave: 'attesaPcCaricoS', nome: 'Attesa con il PC carico', unita: 'secondi', spiega: 'Quanto un comando pesante di una chat o di uno specialista aspetta che il PC si liberi, prima di partire lo stesso. Zero: non aspetta. Oltre cinque minuti non serve: è il tempo che la CLI concede all’attesa.' },
  { chiave: 'provaMaxMin', nome: 'Durata massima di una prova', unita: 'minuti', spiega: 'Quanto può durare l’unione di prova di un ramo (unire, misurare, confermare). Scaduta, si chiude, la cartella si ripulisce e l’unione riprova da sola più tardi.' },
  { chiave: 'unioneMaxMin', nome: 'Durata massima di un’unione', unita: 'minuti', spiega: 'Quanto può durare un’unione intera, prova compresa. Conviene tenerla più lunga della prova. Scaduta, torna in fila e riprova da sola.' },
  { chiave: 'sleepMaxS', nome: 'Sleep degli specialisti', unita: 'secondi', spiega: 'Quanti secondi di attesa a mano passano in un comando di uno specialista (per esempio aspettare che un server parta). Oltre, serve il tuo sì («comandi in sottofondo e attese lunghe»). Zero: ogni sleep chiede il permesso.' }
]

export const VOCI_INTERRUTTORI: { chiave: ChiaveInterruttore; nome: string; spiega: string }[] = [
  { chiave: 'guardiaPc', nome: 'Guardia del PC', spiega: 'Con processore o memoria al limite, i comandi pesanti (suite complete, compilazioni) aspettano che il PC si liberi. Spenta: partono sempre subito, e il PC può diventare lento o restare senza memoria.' },
  { chiave: 'unPesanteAllaVolta', nome: 'Un comando pesante alla volta', spiega: 'Le suite complete, le compilazioni e tsc sull’intero progetto di chat e specialisti girano uno dopo l’altro. Spento: partono insieme. Le unioni e le misure dei criteri del programma restano comunque una alla volta: è quello che tiene pulita la cartella principale.' }
]

const intero = (x: unknown, minimo: number): number | undefined => (typeof x === 'number' && Number.isFinite(x) && Math.round(x) >= minimo ? Math.round(x) : undefined)

/** Dal disco o dalla pagina: ogni valore che non si capisce resta quello di serie. */
export function leggiLimiti(x: unknown): LimitiPc {
  const o = (typeof x === 'object' && x !== null && !Array.isArray(x) ? x : {}) as Record<string, unknown>
  const n = (k: Exclude<ChiaveNumero, 'specialistiPc'>): number => intero(o[k], MINIMO[k]) ?? LIMITI_DI_SERIE[k]
  return {
    specialistiPc: intero(o.specialistiPc, MINIMO.specialistiPc) ?? null,
    turniAutopilota: n('turniAutopilota'),
    domandeOra: n('domandeOra'),
    attesaPcCaricoS: n('attesaPcCaricoS'),
    provaMaxMin: n('provaMaxMin'),
    unioneMaxMin: n('unioneMaxMin'),
    sleepMaxS: n('sleepMaxS'),
    guardiaPc: o.guardiaPc !== false,
    unPesanteAllaVolta: o.unPesanteAllaVolta !== false
  }
}

/** Un cambio dalla pagina: solo le chiavi date, il resto resta com'è. `null` (o un valore che non si capisce) rimette il valore di serie. */
export function conLimiti(prima: LimitiPc, cambio: unknown): LimitiPc {
  const c = (typeof cambio === 'object' && cambio !== null && !Array.isArray(cambio) ? cambio : {}) as Record<string, unknown>
  const dati = Object.fromEntries(Object.entries(c).filter(([k]) => k in LIMITI_DI_SERIE))
  return leggiLimiti({ ...prima, ...dati })
}

/**
 * Quello che la pagina delle impostazioni riceve dal servizio: i limiti, se
 * sono fissi (un servizio senza il suo file), e i progetti dove Nicholas ha
 * tolto una classe di permessi con «Sì, sempre».
 */
export type VistaLimiti = { limiti: LimitiPc; fissi?: boolean; sempre: { ws: string; nome: string; permessi: import('./permessi-nicholas').PermessiScelti }[] }

/** Quello che Nicholas ha cambiato rispetto ai valori di serie (per dirlo in una riga). */
export function limitiCambiati(l: LimitiPc): (ChiaveNumero | ChiaveInterruttore)[] {
  return (Object.keys(LIMITI_DI_SERIE) as (ChiaveNumero | ChiaveInterruttore)[]).filter((k) => l[k] !== LIMITI_DI_SERIE[k])
}
