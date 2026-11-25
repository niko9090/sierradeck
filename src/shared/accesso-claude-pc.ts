import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileAccesso, fileCredenzialiClaude, statoAccesso } from './accesso-claude'
import { nomeDaMostrare } from './nome-pc'
import { scriviJsonAtomico } from './scrittura-atomica'

/**
 * **L'accesso a Claude di ogni PC, adesso** (25/11).
 *
 * Il 25/11 Nicholas ha premuto «Rinnova l'accesso a Claude» sul PC fisso, ma
 * l'accesso scaduto era quello del portatile: l'accesso è **per PC**. Dopo, il
 * programma continuava a dirgli «rinnova l'accesso sul portatile» da errori
 * arrivati vecchi: nessuno sapeva se il portatile era ancora scaduto.
 *
 * Qui:
 * - il servizio di ogni PC segna su disco quando un turno fallisce per
 *   l'accesso (`segnaTurnoScaduto`) e quando l'accesso torna
 *   (`segnaAccessoTornato`), in un file solo per quel PC, accanto a
 *   `accesso-claude.json`;
 * - il programma ne ricava lo stato di adesso (`accessoClaudePc`) e lo mette
 *   nel battito sul Drive: `ok`, `scaduto` (da quando), rinnovato (quando);
 * - chi legge gli errori degli altri PC guarda quel battito
 *   (`verdettoAccesso`): rinnovato dopo l'errore = niente da dire; ancora
 *   scaduto = si dice quale PC, e che si rinnova **sul suo schermo**; un
 *   battito senza il campo (versione vecchia) = «non so», mai «scaduto».
 *
 * Solo date e stati, mai gettoni.
 */

export const FILE_TURNI_ACCESSO = 'accesso-claude-turni.json'
/** Un turno fallito di nuovo riscrive il file al più così spesso (il servizio riprova ogni 10 minuti). */
export const RISCRIVI_SCADUTO_MS = 5 * 60_000

/** Il file su disco: solo date (ISO). */
export type RegistroAccessoPc = {
  /** Il primo turno fallito per l'accesso di questa serie. */
  scadutoDal?: string
  /** L'ultimo turno fallito per l'accesso. */
  ultimoIl?: string
  /** L'ultima volta che l'accesso è tornato (rinnovato, login rifatto, turno riuscito). */
  rinnovatoIl?: string
}

/** Lo stato che va nel battito. Niente orari che cambiano a ogni giro: il battito si riscrive solo se cambia. */
export type AccessoClaudePc =
  | { stato: 'ok'; rinnovatoIl?: string }
  | { stato: 'scaduto'; dal: string }

export function fileTurniAccesso(env: NodeJS.ProcessEnv = process.env): string {
  return join(dirname(fileAccesso(env)), FILE_TURNI_ACCESSO)
}

const isoValida = (x: unknown): x is string => typeof x === 'string' && !Number.isNaN(Date.parse(x))

export function leggiRegistroAccesso(file: string = fileTurniAccesso()): RegistroAccessoPc {
  try {
    if (!existsSync(file)) return {}
    const o = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown> | null
    if (o === null || typeof o !== 'object') return {}
    return {
      ...(isoValida(o.scadutoDal) ? { scadutoDal: o.scadutoDal } : {}),
      ...(isoValida(o.ultimoIl) ? { ultimoIl: o.ultimoIl } : {}),
      ...(isoValida(o.rinnovatoIl) ? { rinnovatoIl: o.rinnovatoIl } : {})
    }
  } catch { return {} }
}

/** Pura: il registro dopo un turno fallito per l'accesso, o `undefined` se non serve riscriverlo. */
export function dopoTurnoScaduto(r: RegistroAccessoPc, adesso: number): RegistroAccessoPc | undefined {
  const ora = new Date(adesso).toISOString()
  if (r.scadutoDal === undefined) return { ...r, scadutoDal: ora, ultimoIl: ora }
  const ultimo = Date.parse(r.ultimoIl ?? r.scadutoDal)
  if (adesso - ultimo < RISCRIVI_SCADUTO_MS) return undefined
  return { ...r, ultimoIl: ora }
}

/** Pura: il registro quando l'accesso torna, o `undefined` se non era scaduto (niente da scrivere). */
export function dopoAccessoTornato(r: RegistroAccessoPc, adesso: number): RegistroAccessoPc | undefined {
  if (r.scadutoDal === undefined) return undefined
  return { rinnovatoIl: new Date(adesso).toISOString() }
}

/** Il servizio: un turno è fallito per l'accesso. Non solleva. */
export function segnaTurnoScaduto(p: { file?: string; adesso?: number } = {}): boolean {
  const file = p.file ?? fileTurniAccesso()
  const nuovo = dopoTurnoScaduto(leggiRegistroAccesso(file), p.adesso ?? Date.now())
  return nuovo !== undefined && scriviJsonAtomico(file, nuovo, 'accesso-claude')
}

/** Il servizio: l'accesso è tornato (gettone salvato, login rifatto, turno riuscito). Non solleva. */
export function segnaAccessoTornato(p: { file?: string; adesso?: number } = {}): boolean {
  const file = p.file ?? fileTurniAccesso()
  const nuovo = dopoAccessoTornato(leggiRegistroAccesso(file), p.adesso ?? Date.now())
  return nuovo !== undefined && scriviJsonAtomico(file, nuovo, 'accesso-claude')
}

/**
 * Pura: lo stato di adesso. `cambiatoIl` è l'ultima volta che l'accesso è
 * cambiato su questo PC (gettone di un anno valido salvato, credenziali di
 * Claude Code riscritte da un login): se è dopo l'ultimo turno fallito,
 * l'accesso è tornato anche se il servizio non l'ha ancora segnato.
 */
export function accessoClaudePc(r: RegistroAccessoPc, cambiatoIl?: number): AccessoClaudePc {
  if (r.scadutoDal !== undefined) {
    const ultimo = Date.parse(r.ultimoIl ?? r.scadutoDal)
    if (cambiatoIl !== undefined && cambiatoIl > ultimo) return { stato: 'ok', rinnovatoIl: new Date(cambiatoIl).toISOString() }
    return { stato: 'scaduto', dal: r.scadutoDal }
  }
  return { stato: 'ok', ...(r.rinnovatoIl !== undefined ? { rinnovatoIl: r.rinnovatoIl } : {}) }
}

/**
 * Lo stato di questo PC, per il battito: il registro del servizio, più i
 * cambi d'accesso visti su disco (gettone valido salvato, credenziali di
 * Claude Code riscritte). Gratis: date di file, niente da decifrare.
 */
export function accessoClaudeQui(p: { fileTurni?: string; fileGettone?: string; fileCredenziali?: string; adesso?: number } = {}): AccessoClaudePc {
  const r = leggiRegistroAccesso(p.fileTurni ?? fileTurniAccesso())
  if (r.scadutoDal === undefined) return accessoClaudePc(r)
  const cambi: number[] = []
  try {
    const g = statoAccesso({ ...(p.fileGettone !== undefined ? { file: p.fileGettone } : {}), ...(p.adesso !== undefined ? { adesso: p.adesso } : {}) })
    if (g.stato === 'valido' || g.stato === 'in-scadenza') cambi.push(g.creatoIl)
  } catch { /* non si sa: resta il registro */ }
  try { cambi.push(statSync(p.fileCredenziali ?? fileCredenzialiClaude()).mtimeMs) } catch { /* niente login normale */ }
  return accessoClaudePc(r, cambi.length > 0 ? Math.max(...cambi) : undefined)
}

/** Il campo del battito di un altro PC: viene dal Drive, si tiene solo se ha la forma giusta. */
export function accessoDalBattito(x: unknown): AccessoClaudePc | undefined {
  if (x === null || typeof x !== 'object') return undefined
  const o = x as Record<string, unknown>
  if (o.stato === 'scaduto' && isoValida(o.dal)) return { stato: 'scaduto', dal: o.dal }
  if (o.stato === 'ok') return { stato: 'ok', ...(isoValida(o.rinnovatoIl) ? { rinnovatoIl: o.rinnovatoIl } : {}) }
  return undefined
}

export type VerdettoAccesso =
  | { esito: 'ok'; rinnovatoIl?: string }
  | { esito: 'scaduto'; dal: string }
  | { esito: 'non-so'; perche: string }

/**
 * Pura: un errore d'accesso arrivato da un PC (ultima volta `erroreIl`), e il
 * battito di quel PC. Il battito dice `ok` dopo l'errore → è tornato. Dice
 * `scaduto` → lo è ancora. Senza battito, senza il campo o con un battito più
 * vecchio dell'errore → non si sa.
 */
export function verdettoAccesso(erroreIl: string, battito: { battito?: string; accessoClaude?: unknown } | undefined): VerdettoAccesso {
  if (battito === undefined) return { esito: 'non-so', perche: 'nessun battito sul Drive' }
  const a = accessoDalBattito(battito.accessoClaude)
  if (a === undefined) return { esito: 'non-so', perche: 'il suo battito non lo dice (versione vecchia)' }
  if (a.stato === 'scaduto') return { esito: 'scaduto', dal: a.dal }
  const quando = Date.parse(battito.battito ?? '')
  const errore = Date.parse(erroreIl)
  if (!Number.isNaN(errore) && !Number.isNaN(quando) && quando < errore) return { esito: 'non-so', perche: 'il suo ultimo battito è di prima dell’errore' }
  return { esito: 'ok', ...(a.rinnovatoIl !== undefined ? { rinnovatoIl: a.rinnovatoIl } : {}) }
}

const breve = (iso: string): string => {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso
  const d = new Date(t)
  const z = (n: number): string => String(n).padStart(2, '0')
  return `${z(d.getDate())}/${z(d.getMonth() + 1)} ${z(d.getHours())}:${z(d.getMinutes())}`
}

/** Una riga per l'autopilota: quale PC, com'è adesso, dove si rinnova. */
export function fraseAccessoPc(nome: string, v: VerdettoAccesso): string {
  if (v.esito === 'ok') return `Accesso a Claude di ${nome}: va, secondo il suo battito${v.rinnovatoIl !== undefined ? ` (rinnovato il ${breve(v.rinnovatoIl)})` : ''}. Niente da chiedere a Nicholas.`
  if (v.esito === 'scaduto') return `Accesso a Claude di ${nome}: scaduto dal ${breve(v.dal)}, secondo il suo battito. Si rinnova solo sullo schermo di ${nome} («Rinnova l’accesso a Claude» lì): premerlo su un altro PC non serve.`
  return `Accesso a Claude di ${nome}: non so se è ancora scaduto (${v.perche}). Non dire a Nicholas di rinnovarlo finché non lo sai; se serve, si fa sullo schermo di ${nome}.`
}

type BattitoConNome = { pcId?: string; nome?: string; host?: string; nomeScelto?: string; battito?: string; accessoClaude?: unknown; aiutante?: unknown }

/**
 * Il battito di SierraDeck del PC che ha mandato un errore (`da`: il nome con
 * cui l'ha mandato, che può essere quello scelto, quello mostrato o
 * l'hostname). Senza maiuscole; un Aiutante non conta (non ha l'accesso del
 * programma). Il più recente, se più di uno.
 */
export function battitoPerNome<T extends BattitoConNome>(battiti: readonly T[], da: string): T | undefined {
  const n = da.trim().toLowerCase()
  if (n === '') return undefined
  return battiti
    .filter((b) => b.aiutante !== true && [nomeDaMostrare(b), b.nome, b.host, b.nomeScelto].some((x) => typeof x === 'string' && x.trim().toLowerCase() === n))
    .sort((a, b) => (b.battito ?? '').localeCompare(a.battito ?? ''))[0]
}
