import { AsyncLocalStorage } from 'node:async_hooks'
import { execFile } from 'node:child_process'
import { durata } from '@shared/adesso'
import type { MisuraPc } from '@shared/posti-chat'
import { rigaPcCarico, type PcCarico } from '@shared/indicatore-autopilota'
import { ePesante } from './criteri-veloci'
import type { Giudizio, RichiestaStrumento } from './divieti'
import { TURNI_PC, type TurniCriteri } from './turni-criteri'

export { rigaPcCarico }

/**
 * **La guardia del PC** (0.85.1, 0.85.2).
 *
 * Il 23/10 sera il processore era al 100%, con 15 processi `claude` e un
 * programma esterno pesante: i posti delle chat (0.82.0) scendevano, ma ogni
 * chat che si fermava faceva comunque partire la sua suite, e quelle aperte
 * lanciavano gradle e vitest per conto loro. Adesso, prima di aprire una chat
 * nuova, di far girare un comando pesante dei criteri (gradle, vitest,
 * electron-builder…) o di lasciarlo lanciare a una chat, l'autopilota guarda
 * il PC.
 *
 * 0.85.2: il 27/10 il processore è rimasto fra il 92 e il 100% per 17 minuti
 * con la guardia «attiva». Misurava solo quando qualcuno chiedeva (un giro al
 * minuto), entrava solo dopo un minuto sopra l'85%, si liberava alla prima
 * misura sotto soglia e dopo 15 minuti lasciava partire tutto lo stesso.
 * Adesso:
 * - misura da sola ogni `CAMPIONE_MS` (5 s, `avvia`);
 * - **carico** con il processore sopra il 75% per 20 s di fila, o la memoria
 *   libera sotto il 15%;
 * - **libero** solo dopo un minuto intero sotto il 60% (e memoria a posto):
 *   una misura bassa da sola non libera niente, una alta rimette il conto a zero;
 * - appena liberato parte **un** comando pesante solo, per `QUIETE_DOPO_MS`:
 *   se il PC torna pieno, gli altri non si accodano sopra;
 * - un passo che aspetta parte comunque dopo `ATTESA_MASSIMA_MS` (mezz'ora;
 *   dentro un hook `ATTESA_IN_UN_HOOK_MS`, un quarto d'ora): il tetto c'è
 *   perché un programma esterno sempre acceso non fermi l'autopilota per sempre.
 *
 * 0.86.1: carico per più di `CARICO_MASSIMO_MS` (10 minuti) di fila, il PC si
 * libera già sotto il 75% (un minuto intero): fra il 60 e il 75% la guardia
 * restava «carico» per sempre. E un criterio aspetta la guardia **prima** di
 * prendere il turno dei pesanti, non tenendolo.
 * Il motivo va nell'indicatore, «PC carico: aspetto», con il programma che
 * consuma di più.
 *
 * **Guarda e basta**: non chiude, non abbassa, non tocca nessun programma
 * (meno che mai quelli di Nicholas). Il programma più pesante si legge solo
 * per dirlo.
 */

/** Sopra questa occupazione del processore, per `PROCESSORE_PER_MS`, il PC è carico. */
export const SOGLIA_PROCESSORE = 75
export const PROCESSORE_PER_MS = 20_000
/** Il PC carico si libera solo sotto questa occupazione, per `RILASCIO_PER_MS` di fila. */
export const SOGLIA_RILASCIO = 60
export const RILASCIO_PER_MS = 60_000
export const MEMORIA_LIBERA_MIN = 0.15
/** Ogni quanto la guardia misura da sola. */
export const CAMPIONE_MS = 5_000
/** Ogni quanto si rimisura mentre un passo aspetta. */
export const RIPROVA_MS = 15_000
/**
 * Il tetto documentato dell'attesa: oltre così un passo che aspetta parte lo
 * stesso, detto nel registro. Era 15 minuti, poi un'ora (0.85.2); 0.86.1:
 * mezz'ora. Un'ora era il tetto dell'hook (`TIMEOUT_HOOK_S`): un criterio che
 * aspettava tanto faceva scadere la fermata della chat.
 */
export const ATTESA_MASSIMA_MS = 30 * 60_000
/**
 * Il tetto dell'attesa dentro un hook (0.86.1), ben sotto `TIMEOUT_HOOK_S`
 * (un'ora): dopo l'attesa vengono ancora i criteri e il supervisore.
 */
export const ATTESA_IN_UN_HOOK_MS = 15 * 60_000
/**
 * Carico da così tanto di fila (0.86.1), il PC si libera già sotto
 * `SOGLIA_PROCESSORE` invece che sotto `SOGLIA_RILASCIO`: un PC che resta fra
 * il 60 e il 75% non è al limite, e l'isteresi lo teneva «carico» per sempre.
 */
export const CARICO_MASSIMO_MS = 10 * 60_000

/**
 * Le richieste che girano dentro un hook di una chat (0.86.1): lì un'attesa
 * della guardia ha il tetto più corto, `ATTESA_IN_UN_HOOK_MS`. Lo segna chi
 * risponde all'hook (`dentroUnHook`), lo legge `attendi`.
 */
const inUnHook = new AsyncLocalStorage<true>()
export function dentroUnHook<T>(fai: () => T): T { return inUnHook.run(true, fai) }
export function eDentroUnHook(): boolean { return inUnHook.getStore() === true }
/** Appena liberato il PC, per così tanto parte un solo comando pesante. */
export const QUIETE_DOPO_MS = 60_000
/** Il programma più pesante si rilegge al più così spesso. */
const PROGRAMMA_OGNI_MS = 2 * 60_000

export type Risorsa = 'processore' | 'memoria'

/** Lo stato della guardia fra una misura e l'altra. */
export type StatoGuardia = {
  /** Il PC è carico: perché, per cosa, e da quando (ms). */
  carico?: { motivo: string; risorsa: Risorsa; dal: number }
  /** Da quando il processore è sopra `SOGLIA_PROCESSORE` (PC non ancora carico). */
  sopraDal?: number
  /** Da quando il PC carico è sotto `SOGLIA_RILASCIO` (ancora carico). */
  sottoDal?: number
}

const memoriaBassa = (m: MisuraPc): boolean => m.memoriaTotaleMb > 0 && m.memoriaLiberaMb / m.memoriaTotaleMb < MEMORIA_LIBERA_MIN
const motivoMemoria = (m: MisuraPc): string =>
  `memoria libera al ${Math.round((m.memoriaLiberaMb / m.memoriaTotaleMb) * 100)}% (${m.memoriaLiberaMb} MB su ${m.memoriaTotaleMb})`

/**
 * Un passo della guardia, con l'isteresi: si entra in fretta (20 s sopra il
 * 75%, o subito per la memoria), si esce piano (un minuto intero sotto il 60%).
 */
export function giudicaMisura(m: MisuraPc, prec: StatoGuardia, ora: number): StatoGuardia {
  if (prec.carico === undefined) {
    const sopraDal = m.caricoPercento > SOGLIA_PROCESSORE ? (prec.sopraDal ?? ora) : undefined
    if (memoriaBassa(m)) return { carico: { motivo: motivoMemoria(m), risorsa: 'memoria', dal: ora } }
    if (sopraDal !== undefined && ora - sopraDal >= PROCESSORE_PER_MS) {
      return { carico: { motivo: `processore al ${m.caricoPercento}% da ${durata(ora - sopraDal)}`, risorsa: 'processore', dal: sopraDal } }
    }
    return sopraDal !== undefined ? { sopraDal } : {}
  }
  const c = prec.carico
  if (memoriaBassa(m)) return { carico: { motivo: motivoMemoria(m), risorsa: 'memoria', dal: c.dal } }
  // Carico da troppo (0.86.1): per liberarsi basta stare sotto la soglia d'entrata.
  const soglia = ora - c.dal >= CARICO_MASSIMO_MS ? SOGLIA_PROCESSORE : SOGLIA_RILASCIO
  if (m.caricoPercento >= soglia) {
    // Ancora pieno: il conto per liberarsi riparte da zero.
    return { carico: { motivo: `processore al ${m.caricoPercento}% da ${durata(ora - c.dal)}`, risorsa: 'processore', dal: c.dal } }
  }
  const sottoDal = prec.sottoDal ?? ora
  if (ora - sottoDal >= RILASCIO_PER_MS) return {}
  // Sotto soglia ma non da abbastanza: resta carico, con il motivo di prima.
  return { carico: c, sottoDal }
}

export type Programma = { nome: string; processore?: number; memoriaMb?: number }
export type CercaProgramma = (per: 'processore' | 'memoria') => Promise<Programma | undefined>

/** Come si dice il programma che consuma di più. */
export function rigaProgramma(p: Programma, per: 'processore' | 'memoria'): string {
  if (per === 'processore' && p.processore !== undefined) return `${p.nome} (${p.processore}% del processore)`
  if (p.memoriaMb !== undefined) return `${p.nome} (${p.memoriaMb} MB)`
  return p.nome
}

/**
 * L'elenco dei processi di Windows con processore e memoria, come lo stampa
 * `Get-CimInstance Win32_PerfFormattedData_PerfProc_Process` in CSV: righe
 * `"Name","PercentProcessorTime","WorkingSetPrivate"`. Il processore è la
 * somma sui core: si divide per i processori. `_Total` e `Idle` non sono
 * programmi; più istanze dello stesso (`chrome#3`) si sommano.
 */
export function leggiProcessi(csv: string, processori: number): Programma[] {
  const somme = new Map<string, { cpu: number; mem: number }>()
  for (const riga of csv.split(/\r?\n/)) {
    const campi = [...riga.matchAll(/"([^"]*)"/g)].map((x) => x[1] ?? '')
    if (campi.length < 3) continue
    const nome = (campi[0] ?? '').replace(/#\d+$/, '')
    const cpu = Number(campi[1])
    const mem = Number(campi[2])
    if (nome === '' || nome === 'Name' || nome === '_Total' || nome === 'Idle' || !Number.isFinite(cpu) || !Number.isFinite(mem)) continue
    const s = somme.get(nome) ?? { cpu: 0, mem: 0 }
    somme.set(nome, { cpu: s.cpu + cpu, mem: s.mem + mem })
  }
  return [...somme].map(([nome, s]) => ({ nome, processore: Math.round(s.cpu / Math.max(1, processori)), memoriaMb: Math.round(s.mem / (1024 * 1024)) }))
}

/** Il più pesante per la risorsa che manca. */
export function piuPesante(elenco: Programma[], per: 'processore' | 'memoria'): Programma | undefined {
  const chiave = (p: Programma): number => (per === 'processore' ? p.processore : p.memoriaMb) ?? 0
  return [...elenco].sort((x, y) => chiave(y) - chiave(x))[0]
}

/** Il comando che legge i processi: solo lettura, nessun programma si chiude. */
export const COMANDO_PROCESSI = 'Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | Select-Object Name,PercentProcessorTime,WorkingSetPrivate | ConvertTo-Csv -NoTypeInformation'

/** Il programma che consuma di più, letto davvero (Windows); altrove nessuno. */
export function cercaProgrammaReale(processori: () => number): CercaProgramma {
  return (per) => new Promise((risolvi) => {
    if (process.platform !== 'win32') { risolvi(undefined); return }
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', COMANDO_PROCESSI], { windowsHide: true, timeout: 30_000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err !== null) { risolvi(undefined); return }
      risolvi(piuPesante(leggiProcessi(String(stdout), processori()), per))
    })
  })
}

export type GuardiaPc = {
  /** Dice com'è il PC: misura adesso se la guardia non misura già da sola. */
  valuta: () => PcCarico | undefined
  /** L'ultimo giudizio, senza misurare. */
  stato: () => PcCarico | undefined
  /**
   * Aspetta che il PC si liberi prima di `cosa`: al più `ATTESA_MASSIMA_MS`,
   * dentro un hook (`dentroUnHook`) al più `ATTESA_IN_UN_HOOK_MS`.
   */
  attendi: (cosa: string) => Promise<void>
  /**
   * Appena liberato il PC parte un pesante solo (`QUIETE_DOPO_MS`): `true` se
   * adesso può partirne uno. Con `prendi` il passo si consuma.
   */
  passoLibero?: (prendi?: boolean) => boolean
  /** Comincia a misurare da sola ogni `CAMPIONE_MS`; torna la funzione che la ferma. */
  avvia?: () => () => void
}

export type OpzioniGuardia = {
  misura: () => MisuraPc
  cerca?: CercaProgramma
  ora?: () => number
  dormi?: (ms: number) => Promise<void>
  riprovaMs?: number
  attesaMassimaMs?: number
  campioneMs?: number
}

export function creaGuardiaPc(o: OpzioniGuardia): GuardiaPc {
  const ora = o.ora ?? (() => Date.now())
  const dormi = o.dormi ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const campioneMs = o.campioneMs ?? CAMPIONE_MS
  let stato: StatoGuardia = {}
  let attuale: PcCarico | undefined
  let programma: { per: Risorsa; testo?: string; letto: number } | undefined
  let cercando = false
  /** Misura da sola (`avvia`): `valuta` non rimisura a ogni chiamata. */
  let daSola = false
  let ultimoCampione: number | undefined
  /** Dopo il rilascio: fino a quando parte un pesante solo, e se è già partito. */
  let quieteFino = 0
  let passoDato = false

  const cerca = (per: Risorsa): void => {
    if (o.cerca === undefined || cercando) return
    if (programma !== undefined && programma.per === per && ora() - programma.letto < PROGRAMMA_OGNI_MS) return
    cercando = true
    o.cerca(per)
      .then((p) => {
        programma = { per, letto: ora(), ...(p !== undefined ? { testo: rigaProgramma(p, per) } : {}) }
        if (attuale !== undefined && p !== undefined) attuale = { ...attuale, programma: rigaProgramma(p, per) }
      })
      .catch(() => { programma = { per, letto: ora() } })
      .finally(() => { cercando = false })
  }

  const campiona = (): PcCarico | undefined => {
    const t = ora()
    ultimoCampione = t
    let m: MisuraPc
    try { m = o.misura() } catch { return attuale }
    stato = giudicaMisura(m, stato, t)
    const c = stato.carico
    if (c === undefined) {
      if (attuale !== undefined) {
        console.info('[guardia-pc] il PC si è liberato: riparte un comando pesante alla volta')
        quieteFino = t + QUIETE_DOPO_MS
        passoDato = false
      }
      attuale = undefined
      return undefined
    }
    if (attuale === undefined) console.warn(`[guardia-pc] PC carico: aspetto — ${c.motivo}`)
    cerca(c.risorsa)
    const testo = programma?.per === c.risorsa ? programma.testo : undefined
    attuale = { motivo: c.motivo, dal: attuale?.dal ?? new Date(t).toISOString(), ...(testo !== undefined ? { programma: testo } : {}) }
    return attuale
  }

  const valuta = (): PcCarico | undefined => {
    if (daSola && ultimoCampione !== undefined && ora() - ultimoCampione < campioneMs) return attuale
    return campiona()
  }

  const passoLibero = (prendi = false): boolean => {
    if (attuale !== undefined) return false
    if (ora() >= quieteFino) return true
    if (passoDato) return false
    if (prendi) passoDato = true
    return true
  }

  return {
    valuta,
    stato: () => attuale,
    passoLibero,
    avvia() {
      // La prima misura al primo giro: subito, il misuratore aspetterebbe un secondo fermo.
      daSola = true
      const timer = setInterval(() => { campiona() }, campioneMs)
      timer.unref?.()
      return () => { clearInterval(timer); daSola = false }
    },
    async attendi(cosa) {
      const inizio = ora()
      let detto = false
      // 0.86.1: dentro un hook il tetto è più corto, o la fermata della chat scade.
      const massimo = Math.min(o.attesaMassimaMs ?? ATTESA_MASSIMA_MS, eDentroUnHook() ? ATTESA_IN_UN_HOOK_MS : Infinity)
      for (;;) {
        const s = valuta()
        if (s === undefined && passoLibero(true)) {
          if (detto) console.info(`[guardia-pc] parte ${cosa}: il PC si è liberato dopo ${durata(ora() - inizio)}`)
          return
        }
        if (ora() - inizio >= massimo) {
          console.warn(`[guardia-pc] parte ${cosa} anche se il PC è carico (${s?.motivo ?? 'appena liberato'}): aspettava da ${durata(ora() - inizio)}, il tetto dell'attesa`)
          return
        }
        if (!detto) {
          console.info(s !== undefined
            ? `[guardia-pc] PC carico: aspetto prima di ${cosa} — ${s.motivo}${s.programma !== undefined ? `; consuma di più ${s.programma}` : ''}`
            : `[guardia-pc] il PC si è appena liberato ed è già partito un comando pesante: aspetto prima di ${cosa}`)
          detto = true
        }
        await dormi(o.riprovaMs ?? RIPROVA_MS)
      }
    }
  }
}

/**
 * Le compilazioni dell'intero progetto con `tsc` (0.85.2): `tsc --noEmit`,
 * `tsc -p …`, `tsc -b`, `npm run typecheck`. Non `tsc --version`, né `tsc`
 * su un file solo.
 */
export function eTscIntero(comando: string): boolean {
  if (/\bnpm\s+run\s+(typecheck|type-check|tsc|check-types)\b/i.test(comando)) return true
  for (const m of comando.matchAll(/(?:^|[\s;&|(/\\])(?:vue-)?tsc(?:\.cmd|\.js)?(?=\s|$|[;&|)])([^;&|\n]*)/gi)) {
    const resto = m[1] ?? ''
    if (/(?:^|\s)(-v|--version|-h|--help|--init)\b/i.test(resto)) continue
    if (/\.(?:m|c)?tsx?(?=\s|$|["'])/i.test(resto)) continue
    return true
  }
  return false
}

/**
 * I comandi pesanti **delle chat** (0.85.2): quelli dei criteri (`ePesante`)
 * più `tsc` sull'intero progetto. Non i test di un file solo
 * (`vitest run tests/x.test.ts`): sono la cosa giusta da fare mentre si aspetta.
 */
export function ePesantePerLaChat(comando: string): boolean {
  if (eTscIntero(comando)) return true
  if (!ePesante(comando)) return false
  const unFile = /\bvitest\b|\bnpm\s+(run\s+)?test\b|\bjest\b|\bpytest\b/i.test(comando) && /[\w/\\.-]+\.(test|spec)\.[cm]?[jt]sx?\b|[\w/\\.-]+_test\.py\b|test_[\w-]+\.py\b/i.test(comando)
  return !unFile
}

/** Il comando di una richiesta dell'hook, se è una shell. */
function comandoDi(r: RichiestaStrumento): { comando: string; input: Record<string, unknown> } {
  const nome = typeof r.tool_name === 'string' ? r.tool_name : ''
  const input = (typeof r.tool_input === 'object' && r.tool_input !== null ? r.tool_input : {}) as Record<string, unknown>
  const comando = (nome === 'Bash' || nome === 'PowerShell') && typeof input.command === 'string' ? input.command : ''
  return { comando, input }
}

/**
 * Il «no» a una chat che lancia una compilazione o una suite completa mentre
 * il PC è al limite. Non è un divieto: le si dice di continuare con altro e di
 * riprovare fra qualche minuto. Il resto (leggere, scrivere, test di un file)
 * passa sempre.
 */
export function giudicaPesanteConPcCarico(r: RichiestaStrumento, carico: PcCarico | undefined): Giudizio {
  if (carico === undefined) return { ok: true }
  const { comando } = comandoDi(r)
  if (comando === '' || !ePesantePerLaChat(comando)) return { ok: true }
  return {
    ok: false,
    pcCarico: true,
    motivo: `SierraDeck rimanda questo comando: ${rigaPcCarico(carico)}. Non è un errore del tuo lavoro: intanto continua con il resto (leggere, scrivere, i test di un solo file) e riprova la compilazione o la suite completa fra qualche minuto. Non chiudere nessun programma.`
  }
}

/** Il tempo di un comando della chat se non dice il suo: quello di serie di Claude Code (2 min). */
export const TEMPO_COMANDO_CHAT_MS = 2 * 60_000
/** Il più lungo che Claude Code concede a un comando (10 min), e il turno di uno lanciato in sottofondo. */
export const TEMPO_MASSIMO_CHAT_MS = 10 * 60_000
/** Margine sul tempo del comando: avvio della shell, uscita. */
const MARGINE_MS = 15_000
/**
 * Il turno di una chat si rende al suo strumento successivo, ma non prima di
 * così: gli strumenti chiesti insieme (un Bash e un Read in parallelo)
 * arrivano a pochi millisecondi, mentre il comando gira ancora.
 */
export const RENDI_DOPO_MS = 15_000

const minuti = (ms: number): number => Math.max(1, Math.ceil(ms / 60_000))

/**
 * **I comandi pesanti delle chat passano dai turni del PC** (0.85.2), sempre:
 * non solo con la guardia che dice «carico». Prima ognuna lanciava la sua
 * suite o il suo gradle, e con quattro chat erano quattro suite insieme più i
 * criteri del servizio.
 *
 * - Il turno della chat (`chi`) si rende al suo strumento successivo (dopo
 *   `RENDI_DOPO_MS`, non per un comando lanciato in sottofondo) o allo
 *   scadere del tempo del comando: il servizio non vede quando finisce.
 * - Con il PC carico, o appena liberato e già partito un pesante, il «no»
 *   della guardia.
 * - Con il turno occupato, «un comando pesante è già in corso, riprova fra N
 *   minuti».
 * Il «no» porta `pcCarico`: non è un divieto e non va nel diario.
 */
export function giudicaPesanteDellaChat(
  r: RichiestaStrumento,
  o: { chi: string; cwd: string; turni?: TurniCriteri; guardia?: GuardiaPc; ora?: number }
): Giudizio {
  const turni = o.turni ?? TURNI_PC
  const ora = o.ora ?? Date.now()
  const tenuto = turni.prenotato()
  if (tenuto !== undefined && tenuto.chi === o.chi && !tenuto.inSottofondo && ora - tenuto.dal >= RENDI_DOPO_MS) turni.rilascia(o.chi)
  const { comando, input } = comandoDi(r)
  if (comando === '' || !ePesantePerLaChat(comando)) return { ok: true }
  const carico = giudicaPesanteConPcCarico(r, o.guardia?.stato())
  if (!carico.ok) return carico
  const giaMio = turni.prenotato()?.chi === o.chi
  if (!giaMio && o.guardia?.passoLibero !== undefined && !o.guardia.passoLibero(false)) {
    return {
      ok: false,
      pcCarico: true,
      motivo: `SierraDeck rimanda questo comando: il PC si è appena liberato ed è già partito un comando pesante, riprova fra ${minuti(QUIETE_DOPO_MS)} minuti. Non è un errore del tuo lavoro: intanto continua con il resto (leggere, scrivere, i test di un solo file). Non chiudere nessun programma.`
    }
  }
  const sottofondo = input.run_in_background === true
  const tempo = typeof input.timeout === 'number' && input.timeout > 0 ? input.timeout : TEMPO_COMANDO_CHAT_MS
  const durataMs = sottofondo ? TEMPO_MASSIMO_CHAT_MS : Math.min(TEMPO_MASSIMO_CHAT_MS, tempo) + MARGINE_MS
  const p = turni.prenota(o.chi, o.cwd, durataMs, sottofondo)
  if (!p.ok) {
    return {
      ok: false,
      pcCarico: true,
      motivo: `SierraDeck rimanda questo comando: un comando pesante è già in corso (${p.occupato}), riprova fra ${minuti(p.attesaMs)} minuti. Su questo PC le suite complete, le compilazioni e tsc sull'intero progetto girano uno alla volta. Non è un errore del tuo lavoro: intanto continua con il resto (leggere, scrivere, i test di un solo file). Non chiudere nessun programma.`
    }
  }
  if (!giaMio) o.guardia?.passoLibero?.(true)
  return { ok: true }
}

/**
 * **Il turno si rende quando il comando finisce** (0.86.1). Prima si rendeva
 * solo allo strumento dopo della stessa chat (e non prima di 15 s), o allo
 * scadere: una chat che finiva la suite e poi pensava, o si fermava, teneva il
 * turno fino a 10 minuti, e i criteri della sua stessa fermata aspettavano
 * dietro di lei. Qui, all'hook PostToolUse: un comando di shell pesante, non
 * in sottofondo, della chat che tiene il turno → il turno torna libero.
 * Torna se l'ha reso.
 */
export function rendiTurnoDopoComando(r: RichiestaStrumento, o: { chi: string; turni?: TurniCriteri }): boolean {
  const turni = o.turni ?? TURNI_PC
  const tenuto = turni.prenotato()
  if (tenuto === undefined || tenuto.chi !== o.chi || tenuto.inSottofondo) return false
  const { comando, input } = comandoDi(r)
  if (comando === '' || input.run_in_background === true || !ePesantePerLaChat(comando)) return false
  turni.rilascia(o.chi)
  return true
}
