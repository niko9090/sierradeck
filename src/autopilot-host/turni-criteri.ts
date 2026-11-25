import { AsyncLocalStorage } from 'node:async_hooks'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ePesante } from './criteri-veloci'
import type { GuardiaPc } from './guardia-pc'
import { conWorkspaceDiLog, segnoDiLog, workspaceDiLog } from './contesto-log'
import { RIGA_ANNULLATO_PRIMA, type Esecutore } from './verifiche'

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
  /**
   * Esegue `fai` quando tocca a lui: nessun altro pesante, nessuna unione in `cwd`.
   * 25/11: con `segnale`, se scatta mentre aspetta il turno esce dalla fila con `TurnoFermato` (`fai` non parte).
   */
  pesante: <T>(cwd: string, fai: () => Promise<T>, segnale?: AbortSignal) => Promise<T>
  /** Esegue l'unione quando nella cartella non gira nessun pesante né un'altra unione; intanto non ne parte nessuno lì. */
  /** 25/11: `per.segnale`, quando scatta (l'unione sopra è scaduta), fa scadere il turno subito: il git in corso si ferma. */
  /**
   * 25/11: `per.vaVia`, quando scatta mentre il passo **aspetta ancora** il suo turno (chi lo ha chiesto se n'è andato:
   * prova scaduta o fermata), il passo lascia la fila subito con `TurnoLasciato` e non parte. Partito, non lo ferma:
   * un commit o un annullo a metà lascerebbe la cartella peggio (per quello c'è `segnale`).
   */
  unione: <T>(cwd: string, fai: (segnale: AbortSignal) => T | Promise<T>, per?: { piuTempo?: number; segnale?: AbortSignal; vaVia?: AbortSignal }) => Promise<T>
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
  /** 24/11: il codice che gira ha già il turno pesante (una misura di prova): un pesante non aspetta nessuno. */
  giaDentro?: () => boolean
}

/**
 * 24/11: dentro la misura di una prova di unione, le attese che non sono la prova (la guardia del PC,
 * fino a due minuti per comando pesante) passano da qui e fermano la scadenza della prova (`inFila`).
 * Il 23/11 una prova è scaduta a 330 s con la scadenza ferma a 5 minuti, avendo contato anche quelle attese.
 */
export type AttesaDellaProva = <R>(fai: () => Promise<R>) => Promise<R>
export const attesaDellaProva = new AsyncLocalStorage<AttesaDellaProva>()

/**
 * 11/11: «un comando pesante alla volta» spento da Nicholas (`@shared/limiti-pc`).
 * I comandi pesanti di chat e specialisti non prendono più il turno: partono
 * insieme. Le unioni e le misure dei criteri del servizio restano quelle vere,
 * una alla volta: è quello che tiene pulita la cartella principale.
 */
export function turniSenzaFila(veri: TurniCriteri): TurniCriteri {
  return { ...veri, prenota: () => ({ ok: true }), rilascia: () => {}, prenotato: () => undefined }
}

/** Quanto si stima un pesante in fila, per dire alla chat «riprova fra N minuti». */
export const STIMA_PESANTE_MS = 4 * 60_000

const normale = (cwd: string): string => cwd.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

/**
 * 06/11: il tempo massimo di un singolo passo git dell'unione nel turno del PC (attesa compresa).
 * Voluto più corto della prova (45 min, `tempi-unione.ts`): il turno copre solo inizio e chiusura della prova, non le misure,
 * e se scade prima la prova esce con lo stesso esito (`scaduta`, cartella ripulita, unione rimessa in fila).
 */
export const UNIONE_TURNO_MAX_MS = 12 * 60_000

/** L'unione, o l'attesa del suo turno, ha superato il tempo massimo. */
export class TurnoScaduto extends Error {
  constructor() { super('l’unione ha superato il tempo massimo nel turno del PC') }
}

/**
 * 25/11: il passo git ha lasciato la fila prima di partire, perché chi lo aveva chiesto se n'è andato (`vaVia`).
 * È un `TurnoScaduto`: chi chiama lo tratta come una scadenza (la prova esce «scaduta», l'unione torna in fila).
 */
export class TurnoLasciato extends TurnoScaduto {
  constructor() { super(); this.message = 'il passo git ha lasciato la fila del turno: chi lo aveva chiesto si è fermato' }
}

/** 25/11: l'attesa del turno pesante fermata dal segnale di chi aspettava (un'unione scaduta): il comando non è partito. */
export class TurnoFermato extends Error {
  constructor() { super('l’attesa del turno pesante è stata fermata') }
}

/** 22/11: oltre questo tempo dalla scadenza, una corsa che non si chiude più lascia comunque libera la cartella (e si registra). */
export const UNIONE_LIBERA_DOPO_MS = 5 * 60_000

export function creaTurni(opz: { ora?: () => number; unioneMaxMs?: number; liberaDopoMs?: number; registra?: (testo: string) => void } = {}): TurniCriteri {
  const ora = opz.ora ?? (() => Date.now())
  const liberaDopoMs = opz.liberaDopoMs ?? UNIONE_LIBERA_DOPO_MS
  const registra = opz.registra ?? ((testo: string): void => { console.warn(testo) })
  let inCorso: string | undefined
  /** Dice se il codice che gira ha già il turno pesante di questi turni (vedi `pesante`). */
  const dentro = new AsyncLocalStorage<object>()
  const chiaveTurni = {}
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
    async pesante(cwd, fai, segnale) {
      // k-197c: chi ha già il turno pesante (la misura di una prova di unione) e lancia un comando
      // che lo chiede ancora (`conTurni`) non si mette in fila dietro a se stesso: sarebbe un'attesa circolare.
      if (dentro.getStore() === chiaveTurni) return fai()
      // Si rilegge ogni volta: il segnale scatta mentre si aspetta.
      const fermato = (): boolean => segnale?.aborted === true
      if (fermato()) throw new TurnoFermato()
      const dove = normale(cwd)
      const mio = ++numero
      fila.push({ n: mio, dove })
      // Tocca al primo della fila che può partire: chi aspetta un'unione nella
      // sua cartella non ferma quelli dietro di lui, che lavorano altrove.
      const tocca = (): boolean => fermato() || (inCorso === undefined && fila.find((f) => (unioni.get(f.dove) ?? 0) === 0)?.n === mio)
      // 25/11: il segnale sveglia l'attesa (prima un'unione scaduta restava in fila qui per sempre, e teneva il posto).
      const alSegnale = (): void => { sveglia() }
      segnale?.addEventListener('abort', alSegnale, { once: true })
      try { await aspetta(tocca) } finally { segnale?.removeEventListener('abort', alSegnale) }
      fila.splice(fila.findIndex((f) => f.n === mio), 1)
      if (fermato()) { sveglia(); throw new TurnoFermato() }
      inCorso = dove
      partitoIl = ora()
      try {
        return await dentro.run(chiaveTurni, fai)
      } finally {
        inCorso = undefined
        sveglia()
      }
    },
    async unione(cwd, fai, per) {
      const dove = normale(cwd)
      unioni.set(dove, (unioni.get(dove) ?? 0) + 1)
      // 06/11: né l'attesa del turno né l'unione stessa durano per sempre: scaduto il tempo il
      // posto si libera e chi chiama riceve `TurnoScaduto` (l'unione si rimette in fila, senza riavvii).
      const stop = { scaduto: false }
      let preso = false
      let avviata: Promise<unknown> | undefined
      const controllo = new AbortController()
      const controlloScattato = (): boolean => controllo.signal.aborted
      let timer: ReturnType<typeof setTimeout> | undefined
      let scadiOra = (_e?: TurnoScaduto): void => {}
      const scaduta = new Promise<never>((_, no) => {
        scadiOra = (e) => { if (stop.scaduto) return; stop.scaduto = true; no(e ?? new TurnoScaduto()) }
        timer = setTimeout(scadiOra, (opz.unioneMaxMs ?? UNIONE_TURNO_MAX_MS) * Math.max(1, per?.piuTempo ?? 1))
        timer.unref?.()
      })
      scaduta.catch(() => {})
      // 25/11: l'unione sopra è scaduta: il turno scade adesso, come al suo tempo massimo (prima il git appeso restava fino a 12 minuti).
      const fuori = per?.segnale
      const alFuori = (): void => { scadiOra(); sveglia() }
      if (fuori?.aborted === true) alFuori()
      else fuori?.addEventListener('abort', alFuori, { once: true })
      // 25/11: chi ha chiesto il passo se n'è andato mentre il passo aspettava: lascia la fila adesso (prima restava fino a 12 minuti,
      // e intanto teneva ferme la cartella ai comandi pesanti e ai turni delle chat). Preso il posto, il passo finisce.
      const via = per?.vaVia
      const alVaVia = (): void => { if (preso) return; scadiOra(new TurnoLasciato()); sveglia() }
      if (via?.aborted === true) alVaVia()
      else via?.addEventListener('abort', alVaVia, { once: true })
      try {
        // **Una sola unione per cartella** (Revisione 0.84.0). Con git
        // sincrono un'unione era atomica; da asincrona cede il passo a ogni
        // comando, e due `git merge` nella stessa cartella si pestavano
        // (index.lock, e il `merge --abort` del secondo annullava il primo).
        // Il posto si prende dentro il controllo: fra un `await` e l'altro
        // un'altra unione vedrebbe la cartella ancora libera.
        await Promise.race([aspetta(() => {
          if (stop.scaduto) return true
          if (inCorso === dove || unendo.has(dove)) return false
          unendo.add(dove)
          preso = true
          return true
        }), scaduta])
        // 25/11: scaduto o lasciato prima di prendere il posto (anche già al primo controllo): il passo non parte.
        if (!preso) await scaduta
        // 22/11: alla scadenza chi chiama riceve subito `TurnoScaduto` e il segnale ferma i git figli,
        // ma il posto della cartella si libera solo quando `fai()` si è chiuso davvero: un secondo
        // `git merge` non parte mentre il primo gira ancora.
        const lavoro = (async () => fai(controllo.signal))()
        lavoro.catch(() => {})
        avviata = lavoro
        try {
          return await Promise.race([lavoro, scaduta])
        } catch (err) {
          if (err instanceof TurnoScaduto) controllo.abort()
          throw err
        }
      } finally {
        if (timer !== undefined) clearTimeout(timer)
        fuori?.removeEventListener('abort', alFuori)
        via?.removeEventListener('abort', alVaVia)
        let chiusa = false
        let sicurezza: ReturnType<typeof setTimeout> | undefined
        // Il lucchetto sulla cartella si rende una volta sola: alla fine della corsa o, per sicurezza, dopo il tempo massimo.
        const chiudi = (): void => {
          if (chiusa) return
          chiusa = true
          if (sicurezza !== undefined) clearTimeout(sicurezza)
          if (preso) unendo.delete(dove)
          const resto = (unioni.get(dove) ?? 1) - 1
          if (resto > 0) unioni.set(dove, resto)
          else unioni.delete(dove)
          sveglia()
        }
        if (avviata !== undefined) {
          // 22/11 (k-178m): scaduta l'unione, il lucchetto resta finché la corsa vecchia è viva; se muore si libera subito.
          // Se non si chiude entro il tempo di sicurezza lo si libera lo stesso, e il fatto si registra: la fila non resta ferma per sempre.
          if (stop.scaduto || controlloScattato()) {
            sicurezza = setTimeout(() => {
              if (chiusa) return
              try { registra(`[unioni] la corsa scaduta in ${dove} non si è chiusa entro ${Math.round(liberaDopoMs / 1000)} s: libero la cartella principale per non fermare la fila`) } catch { /* il registro non ferma la fila */ }
              chiudi()
            }, liberaDopoMs)
            sicurezza.unref?.()
          }
          void avviata.then(chiudi, chiudi)
        } else chiudi()
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
    stato: () => ({ inCorso, inFila: fila.length, unioni: [...unioni.values()].reduce((s, n) => s + n, 0) }),
    giaDentro: () => dentro.getStore() === chiaveTurni
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
 * 25/11: dentro un'unione di prova (che tiene il turno pesante del PC, nessun altro pesante gira)
 * vitest ne ha di più, come le prove della release. Le chat restano a `LAVORATORI_TEST`.
 */
export const LAVORATORI_PROVA = 4

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
export function conRisorseContenute(comando: string, scriptTest?: string, lavoratori: number = LAVORATORI_TEST): string {
  let c = comando
  if (/\bgradle(w)?\b/i.test(c)) c = c.replace(/\s+--no-daemon\b/g, '')
  if (/--max-?workers|--pool[= ]|--threads|--no-file-parallelism/i.test(c)) return c
  if (/\bvitest(\.mjs)?\s+run\b/i.test(c)) return c.replace(/\b(vitest(?:\.mjs)?\s+run)\b/i, `$1 --maxWorkers=${lavoratori}`)
  if (/\bnpx\s+vitest\b/i.test(c)) return c.replace(/\b(npx\s+vitest)\b/i, `$1 --maxWorkers=${lavoratori}`)
  if (scriptTest !== undefined && /\bvitest\b/.test(scriptTest) && !/max-?workers/i.test(scriptTest)) {
    const m = /\bnpm\s+(?:run\s+)?test\b(\s+--(?=\s|$))?/i.exec(c)
    if (m !== null) {
      const fine = m.index + m[0].length
      return m[1] !== undefined
        ? `${c.slice(0, fine)} --maxWorkers=${lavoratori}${c.slice(fine)}`
        : `${c.slice(0, fine)} -- --maxWorkers=${lavoratori}${c.slice(fine)}`
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
  return (comando, cwd, timeoutMs, segnale) => {
    // 25/11: dentro la misura di un'unione di prova (`attesaDellaProva`) più processi di test.
    const lavoratori = attesaDellaProva.getStore() !== undefined ? LAVORATORI_PROVA : LAVORATORI_TEST
    const c = ePesante(comando) ? conRisorseContenute(comando, /\bnpm\s+(run\s+)?test\b/i.test(comando) ? scriptTestDi(cwd) : undefined, lavoratori) : comando
    return segnale !== undefined ? esegui(c, cwd, timeoutMs, segnale) : timeoutMs !== undefined ? esegui(c, cwd, timeoutMs) : esegui(c, cwd)
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
 *
 * 11/11: con il `segnale` della prova di unione. Scattato mentre il comando
 * aspetta la guardia o il turno, il comando non parte più; scattato mentre
 * gira, lo ferma l'esecutore e il turno torna libero subito.
 */
export function conTurni(esegui: Esecutore, turni: TurniCriteri = TURNI_PC, guardia?: GuardiaPc): Esecutore {
  return async (comando, cwd, timeoutMs, segnale) => {
    const annullatoPrima = { codice: 1, uscita: RIGA_ANNULLATO_PRIMA }
    // k-193e: il workspace si prende qui, a chi chiede: il turno può partire dal contesto di un altro.
    const ws = workspaceDiLog()
    // Si rilegge ogni volta: il segnale scatta mentre si aspetta.
    const scattato = (): boolean => segnale?.aborted === true
    const lancia = (): ReturnType<Esecutore> => {
      if (scattato()) return Promise.resolve(annullatoPrima)
      const parti = (): ReturnType<Esecutore> => segnale !== undefined ? esegui(comando, cwd, timeoutMs, segnale) : timeoutMs !== undefined ? esegui(comando, cwd, timeoutMs) : esegui(comando, cwd)
      return ws !== undefined ? conWorkspaceDiLog(ws, parti) : parti()
    }
    if (scattato()) return annullatoPrima
    if (!ePesante(comando, cwd)) return lancia()
    // 25/11: chi tiene già il turno pesante (la misura di una prova) non aspetta la guardia: il carico
    // è quello della prova stessa (il suo vitest), e ogni comando aspettava fino a 2 minuti + 60 s di calma.
    if (guardia !== undefined && turni.giaDentro?.() !== true) {
      const cosa = `«${comando.slice(0, 80)}»`
      // 24/11: dentro una prova di unione l'attesa della guardia non conta nella sua scadenza.
      const fuoriDallaProva = attesaDellaProva.getStore()
      if (fuoriDallaProva !== undefined) await fuoriDallaProva(() => guardia.attendi(cosa))
      else await guardia.attendi(cosa)
    }
    if (scattato()) return annullatoPrima
    const s = turni.stato()
    // 24/11: chi ha già il turno (la misura di una prova) non aspetta dietro nessuno: niente riga che dice il falso.
    const davanti = turni.giaDentro?.() === true ? 0 : s.inFila + (s.inCorso !== undefined ? 1 : 0)
    if (davanti > 0) console.info(`[criterio] ${segnoDiLog(ws)}aspetta il suo turno dietro ${davanti} comandi lunghi: ${comando.slice(0, 120)}`)
    const fermato = (err: unknown): Awaited<ReturnType<Esecutore>> => { if (err instanceof TurnoFermato) return annullatoPrima; throw err }
    const fuori = attesaDellaProva.getStore()
    if (fuori === undefined || turni.giaDentro?.() === true) return turni.pesante(cwd, lancia, segnale).catch(fermato)
    // 25/11: dentro un'unione (o una prova) l'attesa del turno non conta nella sua scadenza: si ferma finché il comando non parte.
    let via = (): void => {}
    const partito = new Promise<void>((ris) => { via = ris })
    const girata = turni.pesante(cwd, () => { via(); return lancia() }, segnale)
    girata.catch(() => {})
    await fuori(() => Promise.race([partito, girata.then(() => {}, () => {})]))
    return girata.catch(fermato)
  }
}
