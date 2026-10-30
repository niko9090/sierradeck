import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ePesante } from './criteri-veloci'
import type { GuardiaPc } from './guardia-pc'
import type { Esecutore } from './verifiche'

/**
 * **I comandi lunghi uno alla volta per PC, mai durante un'unione** (0.82.1).
 *
 * Il 21/10 il registro del servizio contava 452 criteri lanciati in mezza
 * giornata, e decine di `vitest run` e `gradle` **insieme**: ogni chat che si
 * fermava faceva partire la sua suite. Il PC andava al 100%, le suite scadevano
 * («rosso per tempo scaduto») e scadeva anche il supervisore, che è un altro
 * `claude` sullo stesso PC. Le chat si fermavano per questo.
 *
 * Qui due regole, per tutto il servizio (che è uno per PC):
 * - un comando pesante (vedi `ePesante`) parte solo quando nessun altro
 *   pesante sta girando, nell'ordine in cui sono arrivati;
 * - un pesante non parte in una cartella dove si sta unendo un ramo, e
 *   un'unione aspetta che finisca il pesante che gira nella sua cartella: una
 *   suite che misura file cambiati a metà strada dà un esito che non vale per
 *   nessun commit.
 */
export type TurniCriteri = {
  /** Esegue `fai` quando tocca a lui: nessun altro pesante, nessuna unione in `cwd`. */
  pesante: <T>(cwd: string, fai: () => Promise<T>) => Promise<T>
  /** Esegue l'unione quando nella cartella non gira nessun pesante né un'altra unione; intanto non ne parte nessuno lì. */
  unione: <T>(cwd: string, fai: () => T | Promise<T>) => Promise<T>
  /**
   * **Il turno di un comando pesante lanciato da una chat** (0.85.2). Non
   * aspetta: o il turno è libero e la chat lo prende subito, per al più
   * `durataMs` (il comando gira fuori dal servizio e la sua fine non si vede:
   * il turno scade da solo, o lo rende `rilascia`), oppure la risposta dice
   * più o meno quanto manca. Chi tiene già il turno lo rinnova.
   */
  prenota: (chi: string, cwd: string, durataMs: number, inSottofondo?: boolean) =>{ ok: true } | { ok: false; attesaMs: number; occupato: string }
  /** Rende il turno preso con `prenota`, se è ancora di `chi`. */
  rilascia: (chi: string) => void
  /** Chi tiene il turno preso con `prenota`, da quando e fino a quando (ms). */
  prenotato: () => { chi: string; dal: number; fino: number; inSottofondo: boolean } | undefined
  /** Per il registro e le prove: chi gira adesso e quanti aspettano. */
  stato: () => { inCorso: string | undefined; inFila: number; unioni: number }
}

/** Quanto si stima un pesante in fila, per dire alla chat «riprova fra N minuti». */
export const STIMA_PESANTE_MS = 4 * 60_000

const normale = (cwd: string): string => cwd.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

export function creaTurni(opz: { ora?: () => number } = {}): TurniCriteri {
  const ora = opz.ora ?? (() => Date.now())
  let inCorso: string | undefined
  /** Il turno di una chat (`prenota`): chi lo tiene, fino a quando, e il timer che lo rende. */
  let prenotazione: { chi: string; dal: number; fino: number; inSottofondo: boolean; timer?: ReturnType<typeof setTimeout> } | undefined
  /** Quando è partito il pesante del servizio che gira adesso. */
  let partitoIl = 0
  const fila: { n: number; dove: string }[] = []
  let numero = 0
  const unioni = new Map<string, number>()
  /** Le cartelle dove un'unione sta girando adesso (0.84.0): una alla volta per cartella. */
  const unendo = new Set<string>()
  const attese = new Set<() => void>()
  const sveglia = (): void => { for (const f of [...attese]) f() }
  const aspetta = async (pronto: () => boolean): Promise<void> => {
    while (!pronto()) {
      await new Promise<void>((risolvi) => {
        const f = (): void => { attese.delete(f); risolvi() }
        attese.add(f)
      })
    }
  }

  return {
    async pesante(cwd, fai) {
      const dove = normale(cwd)
      const mio = ++numero
      fila.push({ n: mio, dove })
      // Tocca al primo della fila che può partire: chi aspetta un'unione nella
      // sua cartella non ferma quelli dietro di lui, che lavorano altrove.
      const tocca = (): boolean => inCorso === undefined && fila.find((f) => (unioni.get(f.dove) ?? 0) === 0)?.n === mio
      await aspetta(tocca)
      fila.splice(fila.findIndex((f) => f.n === mio), 1)
      inCorso = dove
      partitoIl = ora()
      try {
        return await fai()
      } finally {
        inCorso = undefined
        sveglia()
      }
    },
    async unione(cwd, fai) {
      const dove = normale(cwd)
      unioni.set(dove, (unioni.get(dove) ?? 0) + 1)
      try {
        // **Una sola unione per cartella** (Revisione 0.84.0). Con git
        // sincrono un'unione era atomica; da asincrona cede il passo a ogni
        // comando, e due `git merge` nella stessa cartella si pestavano
        // (index.lock, e il `merge --abort` del secondo annullava il primo).
        // Il posto si prende dentro il controllo: fra un `await` e l'altro
        // un'altra unione vedrebbe la cartella ancora libera.
        await aspetta(() => {
          if (inCorso === dove || unendo.has(dove)) return false
          unendo.add(dove)
          return true
        })
        try {
          return await fai()
        } finally {
          unendo.delete(dove)
        }
      } finally {
        const resto = (unioni.get(dove) ?? 1) - 1
        if (resto > 0) unioni.set(dove, resto)
        else unioni.delete(dove)
        sveglia()
      }
    },
    prenota(chi, cwd, durataMs, inSottofondo = false) {
      const dove = normale(cwd)
      const t = ora()
      if (prenotazione !== undefined && prenotazione.fino <= t) libera(prenotazione.chi)
      // Chi lo tiene già (la stessa chat, il comando dopo) lo rinnova, ma non
      // con dei criteri in fila (0.86.1): rinnovo dopo rinnovo, una chat che
      // lancia una suite dopo l'altra li lasciava aspettare per sempre.
      const mio = prenotazione?.chi === chi
      if ((mio && fila.length === 0) || (inCorso === undefined && fila.length === 0 && (unioni.get(dove) ?? 0) === 0)) {
        if (prenotazione?.timer !== undefined) clearTimeout(prenotazione.timer)
        inCorso = dove
        const p: NonNullable<typeof prenotazione> = { chi, dal: t, fino: t + durataMs, inSottofondo }
        // Il comando gira fuori dal servizio: il turno scade da solo.
        p.timer = setTimeout(() => { libera(chi) }, Math.max(0, durataMs))
        p.timer.unref?.()
        prenotazione = p
        return { ok: true }
      }
      // Quanto manca: il resto di chi gira adesso, più una stima per ognuno in fila.
      const resto = prenotazione !== undefined
        ? Math.max(0, prenotazione.fino - t)
        : inCorso !== undefined ? Math.max(60_000, STIMA_PESANTE_MS - (t - partitoIl)) : 60_000
      return {
        ok: false,
        attesaMs: resto + fila.length * STIMA_PESANTE_MS,
        occupato: mio
          ? 'i criteri dell\'autopilota in fila dopo il tuo comando di prima'
          : prenotazione !== undefined
          ? 'un comando pesante di un\'altra chat'
          : inCorso !== undefined ? 'un criterio dell\'autopilota (test o compilazione)' : 'un\'unione di rami in questa cartella'
      }
    },
    rilascia(chi) { libera(chi) },
    prenotato: () => (prenotazione !== undefined ? { chi: prenotazione.chi, dal: prenotazione.dal, fino: prenotazione.fino, inSottofondo: prenotazione.inSottofondo } : undefined),
    stato: () => ({ inCorso, inFila: fila.length, unioni: [...unioni.values()].reduce((s, n) => s + n, 0) })
  }

  function libera(chi: string): void {
    if (prenotazione === undefined || prenotazione.chi !== chi) return
    if (prenotazione.timer !== undefined) clearTimeout(prenotazione.timer)
    prenotazione = undefined
    inCorso = undefined
    sveglia()
  }
}

/** Quanti processi di test si concedono a una suite dei criteri. */
export const LAVORATORI_TEST = 2

/**
 * **I criteri del servizio con le risorse contenute** (0.85.2). Il 27/10 il
 * processore è rimasto fra il 92 e il 100% per 17 minuti: una suite vitest
 * prende di serie un processo per core. Qui, prima di lanciarlo:
 * - `vitest run` (o `npx vitest`) senza un numero di processi riceve
 *   `--maxWorkers=2`; così anche `npm test` quando lo script del progetto è vitest;
 * - `gradle --no-daemon` perde `--no-daemon`: ogni volta una JVM nuova da
 *   scaldare costa più processore del demone che resta.
 * La chiave della cache dei criteri resta il comando scritto nei criteri.
 */
export function conRisorseContenute(comando: string, scriptTest?: string): string {
  let c = comando
  if (/\bgradle(w)?\b/i.test(c)) c = c.replace(/\s+--no-daemon\b/g, '')
  if (/--max-?workers|--pool[= ]|--threads|--no-file-parallelism/i.test(c)) return c
  if (/\bvitest(\.mjs)?\s+run\b/i.test(c)) return c.replace(/\b(vitest(?:\.mjs)?\s+run)\b/i, `$1 --maxWorkers=${LAVORATORI_TEST}`)
  if (/\bnpx\s+vitest\b/i.test(c)) return c.replace(/\b(npx\s+vitest)\b/i, `$1 --maxWorkers=${LAVORATORI_TEST}`)
  if (scriptTest !== undefined && /\bvitest\b/.test(scriptTest) && !/max-?workers/i.test(scriptTest)) {
    const m = /\bnpm\s+(?:run\s+)?test\b(\s+--(?=\s|$))?/i.exec(c)
    if (m !== null) {
      const fine = m.index + m[0].length
      return m[1] !== undefined
        ? `${c.slice(0, fine)} --maxWorkers=${LAVORATORI_TEST}${c.slice(fine)}`
        : `${c.slice(0, fine)} -- --maxWorkers=${LAVORATORI_TEST}${c.slice(fine)}`
    }
  }
  return c
}

/** Lo script `test` del package.json della cartella, se c'è. */
function scriptTestDi(cwd: string): string | undefined {
  try {
    const p = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')) as { scripts?: Record<string, unknown> }
    return typeof p.scripts?.test === 'string' ? p.scripts.test : undefined
  } catch { return undefined }
}

/** L'esecutore che lancia i pesanti con le risorse contenute (vedi `conRisorseContenute`). */
export function conRisorse(esegui: Esecutore): Esecutore {
  return (comando, cwd, timeoutMs) => {
    const c = ePesante(comando) ? conRisorseContenute(comando, /\bnpm\s+(run\s+)?test\b/i.test(comando) ? scriptTestDi(cwd) : undefined) : comando
    return timeoutMs !== undefined ? esegui(c, cwd, timeoutMs) : esegui(c, cwd)
  }
}

/** I turni di questo PC: il servizio è uno per PC, e così i suoi turni. */
export const TURNI_PC: TurniCriteri = creaTurni()

/**
 * L'esecutore che rispetta i turni: i pesanti passano da `turni.pesante`, gli
 * altri (typecheck, grep, test -s) partono subito come prima.
 *
 * 0.85.1: con la guardia del PC, un pesante aspetta anche che il PC non sia
 * al limite. 0.86.1: la guardia si aspetta **prima** di mettersi in fila, non
 * tenendo il turno: un criterio fermo dalla guardia (fino a mezz'ora) teneva
 * fermi anche i comandi delle chat e gli altri criteri, e dentro la fermata di
 * una chat la faceva scadere.
 */
export function conTurni(esegui: Esecutore, turni: TurniCriteri = TURNI_PC, guardia?: GuardiaPc): Esecutore {
  return async (comando, cwd, timeoutMs) => {
    const lancia = (): ReturnType<Esecutore> => (timeoutMs !== undefined ? esegui(comando, cwd, timeoutMs) : esegui(comando, cwd))
    if (!ePesante(comando)) return lancia()
    if (guardia !== undefined) await guardia.attendi(`«${comando.slice(0, 80)}»`)
    const s = turni.stato()
    const davanti = s.inFila + (s.inCorso !== undefined ? 1 : 0)
    if (davanti > 0) console.info(`[criterio] aspetta il suo turno dietro ${davanti} comandi lunghi: ${comando.slice(0, 120)}`)
    return turni.pesante(cwd, lancia)
  }
}
