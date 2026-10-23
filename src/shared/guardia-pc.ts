import type { MisuraPc } from './posti-chat'

/**
 * La Guardia del PC (0.85.1, richiesta di Nicholas del 23/10 sera).
 *
 * Prima di aprire una chat o di lanciare compilazioni e test pesanti,
 * l'autopilota guarda il PC: se il processore resta sopra l'85% per un minuto,
 * o la memoria libera è sotto il 15%, il passo si rimanda e l'indicatore dice
 * «PC carico: aspetto», con il programma che consuma di più. Non si chiude mai
 * niente: si aspetta che il PC si liberi da solo.
 */

/** Sopra questa percentuale il processore è «carico». */
export const SOGLIA_PROCESSORE = 85
/** Per quanto deve restarci prima di rimandare: un picco di qualche secondo non conta. */
export const PROCESSORE_PER_MS = 60_000
/** Sotto questa percentuale di memoria libera si rimanda subito. */
export const SOGLIA_MEMORIA = 15

export type PcCarico = {
  per: 'processore' | 'memoria'
  /** La misura che l'ha deciso, in parole: «processore al 92%», «memoria libera al 9%». */
  misura: string
  /** Da quando (ISO). */
  dal: string
  /** Il programma che consuma di più, se si è riusciti a leggerlo: «chrome (40% del processore)». */
  programma?: string
}

export type StatoGuardia = {
  /** Da quando il processore è sopra la soglia, in ms; assente se non lo è. */
  processoreSopraDal?: number
  carico?: PcCarico
}

const percento = (n: number): string => `${Math.round(n)}%`

/** Il prossimo stato della guardia, da una misura nuova. */
export function prossimaGuardia(prima: StatoGuardia, m: MisuraPc, ora: number): StatoGuardia {
  const sopra = m.caricoPercento > SOGLIA_PROCESSORE
  const processoreSopraDal = sopra ? (prima.processoreSopraDal ?? ora) : undefined
  const liberaPercento = m.memoriaTotaleMb > 0 ? (m.memoriaLiberaMb / m.memoriaTotaleMb) * 100 : 100
  let per: PcCarico['per'] | undefined
  let misura = ''
  if (liberaPercento < SOGLIA_MEMORIA) { per = 'memoria'; misura = `memoria libera al ${percento(liberaPercento)}` }
  else if (processoreSopraDal !== undefined && ora - processoreSopraDal >= PROCESSORE_PER_MS) { per = 'processore'; misura = `processore al ${percento(m.caricoPercento)}` }
  const base: StatoGuardia = processoreSopraDal !== undefined ? { processoreSopraDal } : {}
  if (per === undefined) return base
  // Lo stesso episodio tiene il suo «dal» e il programma già letto, se il motivo non cambia.
  const stesso = prima.carico !== undefined && prima.carico.per === per ? prima.carico : undefined
  return {
    ...base,
    carico: {
      per,
      misura,
      dal: stesso?.dal ?? new Date(ora).toISOString(),
      ...(stesso?.programma !== undefined ? { programma: stesso.programma } : {})
    }
  }
}

/** La riga dell'indicatore e del motivo: «PC carico: aspetto · processore al 92% · consuma di più chrome (40% del processore)». */
export function rigaPcCarico(c: PcCarico): string {
  return `PC carico: aspetto · ${c.misura}${c.programma !== undefined ? ` · consuma di più ${c.programma}` : ''}`
}

/** Una riga di `Get-Process` letta dallo script: nome e valore (secondi di processore, o byte di memoria). */
export type LetturaProcesso = { nome: string; valore: number }

/** Righe «nome|valore» dello script, una per processo. */
export function leggiProcessi(testo: string): LetturaProcesso[] {
  const fuori: LetturaProcesso[] = []
  for (const riga of testo.split(/\r?\n/)) {
    const i = riga.lastIndexOf('|')
    if (i <= 0) continue
    const nome = riga.slice(0, i).trim()
    const valore = Number(riga.slice(i + 1).trim().replace(',', '.'))
    if (nome === '' || !Number.isFinite(valore)) continue
    fuori.push({ nome, valore })
  }
  return fuori
}

/** Processi del sistema che non sono «un programma» da nominare. */
const DEL_SISTEMA = new Set(['idle', 'system', '_total', 'memory compression', 'registry'])

const gb = (byte: number): string => (byte / 1024 ** 3).toLocaleString('it-IT', { maximumFractionDigits: 1 })

/**
 * Il programma che consuma di più, sommando i processi con lo stesso nome (un
 * browser ne ha decine). Per il processore servono due letture dei secondi
 * usati, a `intervalloMs` di distanza; per la memoria ne basta una.
 */
export function piuPesante(
  per: PcCarico['per'],
  letture: { prima?: LetturaProcesso[]; dopo: LetturaProcesso[]; intervalloMs?: number; processori?: number }
): string | undefined {
  const somma = (l: LetturaProcesso[]): Map<string, number> => {
    const m = new Map<string, number>()
    for (const p of l) {
      if (DEL_SISTEMA.has(p.nome.toLowerCase())) continue
      m.set(p.nome, (m.get(p.nome) ?? 0) + p.valore)
    }
    return m
  }
  const dopo = somma(letture.dopo)
  let valori: Map<string, number>
  if (per === 'memoria') valori = dopo
  else {
    const prima = somma(letture.prima ?? [])
    valori = new Map([...dopo].map(([n, v]) => [n, Math.max(0, v - (prima.get(n) ?? v))]))
  }
  const [nome, valore] = [...valori].sort((x, y) => y[1] - x[1])[0] ?? []
  if (nome === undefined || valore === undefined || valore <= 0) return undefined
  if (per === 'memoria') return `${nome} (${gb(valore)} GB)`
  const secondi = (letture.intervalloMs ?? 1000) / 1000
  const quota = (valore / (secondi * Math.max(1, letture.processori ?? 1))) * 100
  return `${nome} (${percento(Math.min(100, quota))} del processore)`
}
