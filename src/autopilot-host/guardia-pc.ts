import { execFile } from 'node:child_process'
import { durata } from '@shared/adesso'
import type { MisuraPc } from '@shared/posti-chat'
import { rigaPcCarico, type PcCarico } from '@shared/indicatore-autopilota'
import { ePesante } from './criteri-veloci'
import type { Giudizio, RichiestaStrumento } from './divieti'

export { rigaPcCarico }

/**
 * **La guardia del PC** (0.85.1).
 *
 * Il 23/10 sera il processore era al 100%, con 15 processi `claude` e un
 * programma esterno pesante: i posti delle chat (0.82.0) scendevano, ma ogni
 * chat che si fermava faceva comunque partire la sua suite, e quelle aperte
 * lanciavano gradle e vitest per conto loro. Adesso, prima di aprire una chat
 * nuova, di far girare un comando pesante dei criteri (gradle, vitest,
 * electron-builder…) o di lasciarlo lanciare a una chat, l'autopilota guarda
 * il PC:
 * - processore sopra l'85% **per un minuto** (un picco di pochi secondi no);
 * - oppure memoria libera sotto il 15%.
 * Se è così rimanda il passo e lo scrive nell'indicatore, «PC carico:
 * aspetto», con il programma che consuma di più.
 *
 * **Guarda e basta**: non chiude, non abbassa, non tocca nessun programma
 * (meno che mai quelli di Nicholas). Il programma più pesante si legge solo
 * per dirlo.
 */

export const SOGLIA_PROCESSORE = 85
export const PROCESSORE_PER_MS = 60_000
export const MEMORIA_LIBERA_MIN = 0.15
/** Ogni quanto si rimisura mentre un passo aspetta. */
export const RIPROVA_MS = 15_000
/**
 * Oltre così un passo che aspetta parte lo stesso, detto nel registro:
 * l'autopilota non resta mai fermo per sempre su un PC che un programma
 * esterno tiene sempre pieno.
 */
export const ATTESA_MASSIMA_MS = 15 * 60_000
/** Il programma più pesante si rilegge al più così spesso. */
const PROGRAMMA_OGNI_MS = 2 * 60_000

/** Il giudizio su una misura: il motivo se il PC è carico, e da quando il processore è sopra soglia. */
export function giudicaMisura(m: MisuraPc, sopraDal: number | undefined, ora: number): { motivo?: string; risorsa?: 'processore' | 'memoria'; sopraDal?: number } {
  const sopra = m.caricoPercento > SOGLIA_PROCESSORE ? (sopraDal ?? ora) : undefined
  if (m.memoriaTotaleMb > 0 && m.memoriaLiberaMb / m.memoriaTotaleMb < MEMORIA_LIBERA_MIN) {
    const pct = Math.round((m.memoriaLiberaMb / m.memoriaTotaleMb) * 100)
    return { motivo: `memoria libera al ${pct}% (${m.memoriaLiberaMb} MB su ${m.memoriaTotaleMb})`, risorsa: 'memoria', ...(sopra !== undefined ? { sopraDal: sopra } : {}) }
  }
  if (sopra !== undefined && ora - sopra >= PROCESSORE_PER_MS) {
    return { motivo: `processore al ${m.caricoPercento}% da ${durata(ora - sopra)}`, risorsa: 'processore', sopraDal: sopra }
  }
  return sopra !== undefined ? { sopraDal: sopra } : {}
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
  /** Misura adesso e dice com'è il PC. */
  valuta: () => PcCarico | undefined
  /** L'ultimo giudizio, senza misurare. */
  stato: () => PcCarico | undefined
  /** Aspetta che il PC si liberi (al più `ATTESA_MASSIMA_MS`) prima di `cosa`. */
  attendi: (cosa: string) => Promise<void>
}

export type OpzioniGuardia = {
  misura: () => MisuraPc
  cerca?: CercaProgramma
  ora?: () => number
  dormi?: (ms: number) => Promise<void>
  riprovaMs?: number
  attesaMassimaMs?: number
}

export function creaGuardiaPc(o: OpzioniGuardia): GuardiaPc {
  const ora = o.ora ?? (() => Date.now())
  const dormi = o.dormi ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  let sopraDal: number | undefined
  let attuale: PcCarico | undefined
  let programma: { per: 'processore' | 'memoria'; testo?: string; letto: number } | undefined
  let cercando = false

  const cerca = (per: 'processore' | 'memoria'): void => {
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

  const valuta = (): PcCarico | undefined => {
    const t = ora()
    const g = giudicaMisura(o.misura(), sopraDal, t)
    sopraDal = g.sopraDal
    if (g.motivo === undefined || g.risorsa === undefined) {
      if (attuale !== undefined) console.info('[guardia-pc] il PC si è liberato: si riparte')
      attuale = undefined
      return undefined
    }
    if (attuale === undefined) console.warn(`[guardia-pc] PC carico: aspetto — ${g.motivo}`)
    cerca(g.risorsa)
    const testo = programma?.per === g.risorsa ? programma.testo : undefined
    attuale = { motivo: g.motivo, dal: attuale?.dal ?? new Date(t).toISOString(), ...(testo !== undefined ? { programma: testo } : {}) }
    return attuale
  }

  return {
    valuta,
    stato: () => attuale,
    async attendi(cosa) {
      const inizio = ora()
      let detto = false
      for (;;) {
        const s = valuta()
        if (s === undefined) {
          if (detto) console.info(`[guardia-pc] parte ${cosa}: il PC si è liberato dopo ${durata(ora() - inizio)}`)
          return
        }
        if (ora() - inizio >= (o.attesaMassimaMs ?? ATTESA_MASSIMA_MS)) {
          console.warn(`[guardia-pc] parte ${cosa} anche se il PC è carico (${s.motivo}): aspettava da ${durata(ora() - inizio)}`)
          return
        }
        if (!detto) {
          console.info(`[guardia-pc] PC carico: aspetto prima di ${cosa} — ${s.motivo}${s.programma !== undefined ? `; consuma di più ${s.programma}` : ''}`)
          detto = true
        }
        await dormi(o.riprovaMs ?? RIPROVA_MS)
      }
    }
  }
}

/**
 * Il «no» a una chat che lancia una compilazione o una suite completa mentre
 * il PC è al limite. Non è un divieto: le si dice di continuare con altro e di
 * riprovare fra qualche minuto. Il resto (leggere, scrivere, test di un file)
 * passa sempre.
 */
export function giudicaPesanteConPcCarico(r: RichiestaStrumento, carico: PcCarico | undefined): Giudizio {
  if (carico === undefined) return { ok: true }
  const nome = typeof r.tool_name === 'string' ? r.tool_name : ''
  const input = (typeof r.tool_input === 'object' && r.tool_input !== null ? r.tool_input : {}) as Record<string, unknown>
  const comando = (nome === 'Bash' || nome === 'PowerShell') && typeof input.command === 'string' ? input.command : ''
  if (comando === '' || !ePesante(comando)) return { ok: true }
  return {
    ok: false,
    pcCarico: true,
    motivo: `SierraDeck rimanda questo comando: ${rigaPcCarico(carico)}. Non è un errore del tuo lavoro: intanto continua con il resto (leggere, scrivere, i test di un solo file) e riprova la compilazione o la suite completa fra qualche minuto. Non chiudere nessun programma.`
  }
}
