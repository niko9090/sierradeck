import { createHash } from 'node:crypto'
import { statSync } from 'node:fs'
import { join } from 'node:path'
import type { Criterio } from '@shared/autopilota'
import type { EsitoVerifica } from './decisione'
import { eseguiCriteri, type Esecutore } from './verifiche'
import type { Git } from './worktree'

/**
 * I criteri misurati senza rifare il lavoro già fatto (0.71.0).
 *
 * Misurato sul PC vero (9–13/10): fra la fine di un turno e la risposta
 * dell'hook Stop passavano **155 s** di mediana, e il supervisore ne pesava 17.
 * Il resto erano i criteri rilanciati **in fila a ogni fermata**, anche quando
 * dal giro prima non era cambiato un byte: npm test, typecheck, gradle.
 *
 * Tre regole:
 * 1. **Cache sull'impronta del codice.** Se HEAD, lo stato e il diff della
 *    cartella sono quelli dell'ultima misura, l'esito si riusa (fino a
 *    `VALIDITA_MS`). I comandi che guardano fuori dal progetto (gh, rete) non
 *    si mettono mai in cache: il loro esito cambia senza che cambi il codice.
 * 2. **I pesanti a turni alterni.** Le suite intere e gradle si misurano ogni
 *    `OGNI_TURNI` turni, e sempre prima di accettare «finito». Negli altri
 *    turni vale l'ultimo esito, segnato come tale nel quadro del supervisore.
 * 3. **In parallelo, ma poco.** Al massimo `PARALLELI` comandi insieme: di più
 *    si contendono il disco e la CPU e il tempo non scende.
 */

export const VALIDITA_MS = 10 * 60_000
export const OGNI_TURNI = 3
export const PARALLELI = 2

/** Comandi il cui esito dipende da qualcosa fuori dal progetto: mai in cache. */
export function guardaFuori(comando: string): boolean {
  return /\bgh\s|\bcurl\b|\bwget\b|https?:\/\/|\bgit\s+(fetch|ls-remote|pull|push)\b|\bnpm\s+view\b|\bInvoke-WebRequest\b|\bping\b/i.test(comando)
}

/** Comandi lunghi: suite intere, build Android, ecc. */
export function ePesante(comando: string): boolean {
  return /\bgradle(w)?\b|\bnpm\s+(run\s+)?test\b|\bvitest\s+run\b|\bnpx\s+vitest\b|\bplaywright\b|\bcargo\s+test\b|\bmvn\b|\bpytest\b|\bdotnet\s+test\b|\bnpm\s+run\s+(build|pacchetto|dist)\b/i.test(comando)
}

/**
 * L'impronta del codice di una cartella git: HEAD, lo stato (anche i file non
 * tracciati) e il diff, più dimensione e data dei file non tracciati (il diff
 * non li vede). `undefined` se non è git: allora niente cache.
 */
export function improntaCodice(git: Git, cwd: string): string | undefined {
  const head = git(['rev-parse', 'HEAD'], cwd)
  if (head.codice !== 0) return undefined
  const stato = git(['status', '--porcelain', '-uall'], cwd)
  if (stato.codice !== 0) return undefined
  const diff = git(['diff', 'HEAD'], cwd)
  const h = createHash('sha256').update(head.uscita).update('\0').update(stato.uscita).update('\0').update(diff.uscita)
  for (const riga of stato.uscita.split(/\r?\n/)) {
    if (!riga.startsWith('?? ')) continue
    try { const s = statSync(join(cwd, riga.slice(3).replace(/^"|"$/g, ''))); h.update(`${riga}:${s.size}:${s.mtimeMs}`) } catch { h.update(riga) }
  }
  return h.digest('hex').slice(0, 24)
}

export type MemoriaCriteri = Map<string, { impronta: string | undefined; quando: number; esito: EsitoVerifica }>

export type Misura = {
  esiti: EsitoVerifica[]
  /** Criteri il cui esito viene dalla cache (codice invariato). */
  daCache: string[]
  /** Criteri pesanti non rimisurati in questo turno: vale l'ultimo esito. */
  rimandati: string[]
  /** Quanto ci ha messo ogni comando eseguito davvero. */
  durate: { descrizione: string; ms: number }[]
}

const chiave = (cwd: string, c: { descrizione: string; comando?: string }): string => `${cwd}\0${c.descrizione}\0${c.comando ?? ''}`

export async function misuraCriteri(criteri: Criterio[], cwd: string, esegui: Esecutore, opz: {
  memoria: MemoriaCriteri
  adesso: () => number
  /** L'impronta del codice adesso; assente = niente cache. */
  impronta?: string
  /** `true` per misurare anche i pesanti (turno multiplo di OGNI_TURNI, o prima di «finito»). */
  tutti: boolean
  paralleli?: number
}): Promise<Misura> {
  const ora = opz.adesso()
  const daCache: string[] = []
  const rimandati: string[] = []
  const daEseguire: Criterio[] = []
  const pronti = new Map<string, EsitoVerifica>()
  for (const c of criteri) {
    if (c.comando === undefined) continue
    const m = opz.memoria.get(chiave(cwd, c))
    const fresca = m !== undefined && ora - m.quando < VALIDITA_MS
    if (m !== undefined && fresca && opz.impronta !== undefined && m.impronta === opz.impronta && !guardaFuori(c.comando)) {
      pronti.set(c.descrizione, m.esito); daCache.push(c.descrizione); continue
    }
    if (!opz.tutti && m !== undefined && ePesante(c.comando)) {
      // Si dice nel quadro che è l'esito di prima (`rimandatoDal`): il supervisore non deve crederlo fresco.
      pronti.set(c.descrizione, { ...m.esito, rimandatoDal: new Date(m.quando).toISOString() }); rimandati.push(c.descrizione); continue
    }
    daEseguire.push(c)
  }
  const durate: { descrizione: string; ms: number }[] = []
  const quanti = Math.max(1, opz.paralleli ?? PARALLELI)
  let i = 0
  const lavoratore = async (): Promise<void> => {
    while (i < daEseguire.length) {
      const c = daEseguire[i++]
      if (c === undefined) continue
      const t0 = opz.adesso()
      const [e] = await eseguiCriteri([c], cwd, esegui)
      durate.push({ descrizione: c.descrizione, ms: opz.adesso() - t0 })
      if (e === undefined) continue
      pronti.set(c.descrizione, e)
      opz.memoria.set(chiave(cwd, c), { impronta: opz.impronta, quando: opz.adesso(), esito: e })
    }
  }
  await Promise.all(Array.from({ length: Math.min(quanti, daEseguire.length) }, () => lavoratore()))
  // Nell'ordine dei criteri, come prima.
  const esiti = criteri.flatMap((c) => { const e = pronti.get(c.descrizione); return e === undefined ? [] : [e] })
  return { esiti, daCache, rimandati, durate }
}

/** Turno in cui misurare anche i pesanti: il primo, e poi ogni `OGNI_TURNI`. */
export function turnoCompleto(cicliChat: number): boolean {
  return cicliChat <= 1 || cicliChat % OGNI_TURNI === 0
}
