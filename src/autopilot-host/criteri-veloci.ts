import { createHash } from 'node:crypto'
import { statSync } from 'node:fs'
import { join } from 'node:path'
import type { Criterio } from '@shared/autopilota'
import type { EsitoVerifica } from './decisione'
import { eseguiCriteri, type Esecutore } from './verifiche'
import type { Git } from './worktree'
import { problemaDiAmbiente } from './ambiente-copia'

/**
 * I criteri misurati senza rifare il lavoro già fatto (0.71.0, 0.82.1).
 *
 * Misurato sul PC vero (9–13/10): fra la fine di un turno e la risposta
 * dell'hook Stop passavano **155 s** di mediana, e il supervisore ne pesava 17.
 * Il resto erano i criteri rilanciati **in fila a ogni fermata**, anche quando
 * dal giro prima non era cambiato un byte: npm test, typecheck, gradle.
 *
 * Le regole:
 * 1. **L'esito si ricorda per commit e comando** (0.82.1). Si rimisura solo se
 *    è cambiato il commit della cartella (main, o il ramo della chat). Fino
 *    alla 0.82.0 l'impronta era HEAD più lo stato e il diff, e scadeva dopo 10
 *    minuti: nella cartella principale le consegne e i file del programma
 *    cambiano di continuo senza un commit, e il 21/10 si sono contati 452
 *    criteri lanciati in mezza giornata. Gli esiti «non misurato» e «scaduto
 *    per tempo» non si ricordano: non dicono niente sul commit.
 *    I comandi che guardano fuori dal progetto (gh, rete) non si mettono mai
 *    in cache: il loro esito cambia senza che cambi il codice.
 * 2. **Una misura sola per commit e comando**: se due chat chiedono la stessa
 *    nello stesso momento, la seconda aspetta l'esito della prima.
 * 3. **I pesanti a turni alterni.** Le suite intere e gradle si misurano ogni
 *    `OGNI_TURNI` turni, e sempre prima di accettare «finito». Negli altri
 *    turni vale l'ultimo esito, segnato come tale nel quadro del supervisore.
 *    Uno alla volta per PC e mai durante un'unione: `turni-criteri`.
 * 4. **In parallelo, ma poco.** Al massimo `PARALLELI` comandi insieme.
 */

export const OGNI_TURNI = 3
export const PARALLELI = 2

/** Comandi il cui esito dipende da qualcosa fuori dal progetto: mai in cache. */
export function guardaFuori(comando: string): boolean {
  return /\bgh\s|\bcurl\b|\bwget\b|https?:\/\/|\bgit\s+(fetch|ls-remote|pull|push)\b|\bnpm\s+view\b|\bInvoke-WebRequest\b|\bping\b/i.test(comando)
}

/** Comandi lunghi: suite intere, build Android, ecc. */
export function ePesante(comando: string): boolean {
  return /\bgradle(w)?\b|\bnpm\s+(run\s+)?test\b|\bvitest(\.mjs)?\s+run\b|\bnpx\s+vitest\b|\bplaywright\b|\bcargo\s+test\b|\bmvn\b|\bpytest\b|\bdotnet\s+test\b|\bnpm\s+run\s+(build|pacchetto|dist)\b|\belectron-builder\b/i.test(comando)
}

/**
 * L'impronta del codice di una cartella git: il suo commit (0.82.1), più le
 * modifiche non salvate ai file **tracciati**, se ce ne sono. Non contano i
 * file non tracciati né `.sierradeck/` (consegne, quaderno): li scrive il
 * programma di continuo, e sono loro che facevano rimisurare a vuoto. Le
 * modifiche ai file tracciati invece contano: senza, una chat che lavora nella
 * cartella principale senza fare commit vedrebbe sempre l'esito di prima.
 * `undefined` se non è git: allora niente cache.
 */
export function improntaCodice(git: Git, cwd: string): string | undefined {
  const head = git(['rev-parse', 'HEAD'], cwd)
  if (head.codice !== 0) return undefined
  const commit = head.uscita.trim()
  if (!/^[0-9a-f]{7,64}$/i.test(commit)) return undefined
  const diff = git(['diff', 'HEAD', '--', '.', ':(exclude).sierradeck'], cwd)
  if (diff.codice !== 0 || diff.uscita.trim() === '') return commit
  return `${commit}+${createHash('sha256').update(diff.uscita).digest('hex').slice(0, 16)}`
}

/**
 * L'impronta del **lavoro** in una cartella git: HEAD, lo stato (anche i file
 * non tracciati) e il diff, più dimensione e data dei file non tracciati (il
 * diff non li vede). Era l'impronta della cache fino alla 0.82.0; adesso serve
 * solo all'antiloop, che deve vedere anche il lavoro non ancora salvato di una
 * chat che lavora nella cartella principale.
 */
const STORICO_FUORI = ':(exclude).sierradeck' // 29/10: tutte le note (quaderno, consegne, rapporti), non solo lo storico

export function improntaLavoro(git: Git, cwd: string): string | undefined {
  const head = git(['rev-parse', 'HEAD'], cwd)
  if (head.codice !== 0) return undefined
  // Lo storico nel quaderno (0.84.0) lo scrive l'autopilota, non la chat: una
  // sua riga nuova non è lavoro fatto e non deve sembrarlo all'antiloop.
  const stato = git(['status', '--porcelain', '-uall', '--', '.', STORICO_FUORI], cwd)
  if (stato.codice !== 0) return undefined
  const diff = git(['diff', 'HEAD', '--', '.', STORICO_FUORI], cwd)
  const h = createHash('sha256').update(head.uscita).update('\0').update(stato.uscita).update('\0').update(diff.uscita)
  for (const riga of stato.uscita.split(/\r?\n/)) {
    if (!riga.startsWith('?? ')) continue
    try { const s = statSync(join(cwd, riga.slice(3).replace(/^"|"$/g, ''))); h.update(`${riga}:${s.size}:${s.mtimeMs}`) } catch { h.update(riga) }
  }
  return h.digest('hex').slice(0, 24)
}


export type MemoriaCriteri = Map<string, { impronta: string | undefined; quando: number; esito: EsitoVerifica }>

/** Le misure in corso, per commit e comando: chi arriva dopo aspetta questa. */
const inVolo = new Map<string, Promise<EsitoVerifica | undefined>>()

/** Un esito che vale per il suo commit: misurato, e non fermato dal tempo. */
export function daRicordare(e: EsitoVerifica): boolean {
  // Né un fallimento per l'ambiente della copia (0.84.4): rimesso node_modules,
  // lo stesso commit va rimisurato, non ricordato rosso.
  return e.misurato !== false && !/\[comando interrotto dopo \d+s\]/.test(e.uscita) && problemaDiAmbiente(e) === undefined
}

export type Misura = {
  esiti: EsitoVerifica[]
  /** Criteri il cui esito viene dalla cache (codice invariato). */
  daCache: string[]
  /** Criteri pesanti non rimisurati in questo turno: vale l'ultimo esito. */
  rimandati: string[]
  /** Quanto ci ha messo ogni comando eseguito davvero. */
  durate: { descrizione: string; ms: number }[]
}

/** Quanti esiti si ricordano al massimo: il servizio gira per giorni, e un commit nuovo è una voce in più. */
export const ESITI_RICORDATI = 600

/** Scrive in memoria tenendo le ultime `ESITI_RICORDATI` voci (le più vecchie escono per prime). */
function ricorda(memoria: MemoriaCriteri, k: string, v: { impronta: string | undefined; quando: number; esito: EsitoVerifica }): void {
  memoria.delete(k)
  memoria.set(k, v)
  for (const vecchia of memoria.keys()) {
    if (memoria.size <= ESITI_RICORDATI) break
    memoria.delete(vecchia)
  }
}

const chiaveCommit = (impronta: string, comando: string): string => `commit\0${impronta}\0${comando}`
const chiaveUltimo = (cwd: string, comando: string): string => `ultimo\0${cwd}\0${comando}`

export async function misuraCriteri(criteri: Criterio[], cwd: string, esegui: Esecutore, opz: {
  memoria: MemoriaCriteri
  adesso: () => number
  /** Il commit della cartella adesso; assente = niente cache. */
  impronta?: string
  /** `true` per misurare anche i pesanti (turno multiplo di OGNI_TURNI, o prima di «finito»). */
  tutti: boolean
  paralleli?: number
}): Promise<Misura> {
  const daCache: string[] = []
  const rimandati: string[] = []
  const daEseguire: Criterio[] = []
  const pronti = new Map<string, EsitoVerifica>()
  const conNome = (e: EsitoVerifica, c: Criterio): EsitoVerifica => ({ ...e, descrizione: c.descrizione })
  for (const c of criteri) {
    if (c.comando === undefined) continue
    const ricordato = opz.impronta !== undefined && !guardaFuori(c.comando) ? opz.memoria.get(chiaveCommit(opz.impronta, c.comando)) : undefined
    if (ricordato !== undefined) {
      pronti.set(c.descrizione, conNome(ricordato.esito, c)); daCache.push(c.descrizione); continue
    }
    const ultimo = opz.memoria.get(chiaveUltimo(cwd, c.comando))
    if (!opz.tutti && ultimo !== undefined && ePesante(c.comando)) {
      // Si dice nel quadro che è l'esito di prima (`rimandatoDal`): il supervisore non deve crederlo fresco.
      pronti.set(c.descrizione, { ...conNome(ultimo.esito, c), rimandatoDal: new Date(ultimo.quando).toISOString() }); rimandati.push(c.descrizione); continue
    }
    daEseguire.push(c)
  }
  const durate: { descrizione: string; ms: number }[] = []
  const misuraUno = async (c: Criterio, comando: string): Promise<EsitoVerifica | undefined> => {
    const t0 = opz.adesso()
    const [e] = await eseguiCriteri([c], cwd, esegui)
    durate.push({ descrizione: c.descrizione, ms: opz.adesso() - t0 })
    if (e === undefined) return undefined
    const quando = opz.adesso()
    ricorda(opz.memoria, chiaveUltimo(cwd, comando), { impronta: opz.impronta, quando, esito: e })
    if (opz.impronta !== undefined && !guardaFuori(comando) && daRicordare(e)) {
      ricorda(opz.memoria, chiaveCommit(opz.impronta, comando), { impronta: opz.impronta, quando, esito: e })
    }
    return e
  }
  const quanti = Math.max(1, opz.paralleli ?? PARALLELI)
  let i = 0
  const lavoratore = async (): Promise<void> => {
    while (i < daEseguire.length) {
      const c = daEseguire[i++]
      if (c === undefined || c.comando === undefined) continue
      const comando = c.comando
      let e: EsitoVerifica | undefined
      if (opz.impronta !== undefined && !guardaFuori(comando)) {
        const k = chiaveCommit(opz.impronta, comando)
        const gia = inVolo.get(k)
        if (gia !== undefined) {
          // Un'altra chat la sta misurando adesso, sullo stesso commit: si aspetta quella.
          e = await gia
          if (e !== undefined) daCache.push(c.descrizione)
        } else {
          const p = misuraUno(c, comando)
          inVolo.set(k, p)
          try { e = await p } finally { inVolo.delete(k) }
        }
      } else e = await misuraUno(c, comando)
      if (e !== undefined) pronti.set(c.descrizione, conNome(e, c))
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
