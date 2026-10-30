import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, unlinkSync } from 'node:fs'
import { basename, dirname, join, parse, resolve } from 'node:path'
import { cancellaSicura } from '@shared/cancella-sicura'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import {
  CARTELLA_RECUPERO_ACCANTO, CARTELLA_RECUPERO_RIASSETTO, ETA_MINIMA_MS, GIORNI_RECUPERO_RIASSETTO,
  type ManifestoRiassetto, type VoceManifesto
} from '@shared/riassetto'

/**
 * Il recupero del riassetto: **mai cancellare**, solo spostare.
 *
 * Ogni cosa va in `<dati>/recupero-riassetto/<versione>/<passo>/` con una
 * riga nel `manifesto.json` del passo (dove stava, quanto pesa, perché). Una
 * cosa su un altro disco va accanto a sé, in `.sierradeck-recupero/` (come la
 * rimozione sicura): una rinomina sullo stesso disco, mai una copia a metà.
 *
 * La riga si scrive **prima** della rinomina, «in corso»: se il programma
 * muore in mezzo, al giro dopo si guarda dov'è davvero. Dopo 30 giorni il
 * giro delle sei ore svuota il recupero, sempre dalla guardia
 * (`cancellaSicura`), dopo aver staccato i collegamenti senza seguirli.
 */

export type OpzioniSposta = {
  motivo: string
  /** Sotto quest'età non si tocca. Di serie 72 ore; 0 = qualunque età. */
  etaMinimaMs?: number
  /** Per una cartella: si sposta solo se dentro non c'è nessun file. */
  soloSeVuota?: boolean
}

export type EsitoSposta =
  | { esito: 'spostato'; byte: number; dove: string }
  | { esito: 'non-c-era'; byte: 0 }
  | { esito: 'saltato'; byte: 0; perche: string }

export type RecuperoPasso = {
  /** La cartella del passo nel recupero (sul disco dei dati). */
  cartella: string
  sposta: (percorso: string, o: OpzioniSposta) => EsitoSposta
  manifesto: () => ManifestoRiassetto
  /** La cartella del passo con il suo manifesto (e quindi la sua scadenza), anche senza niente spostato. */
  assicura: () => string
}

/** Il peso e l'ultima modifica di un albero, senza seguire i collegamenti. Si ferma oltre `tetto` voci. */
export function misuraAlbero(percorso: string, tetto = 50_000): { byte: number; file: number; ultimaMs: number; collegamenti: number; troppo: boolean } {
  const m = { byte: 0, file: 0, ultimaMs: 0, collegamenti: 0, troppo: false }
  let visti = 0
  const giro = (p: string): void => {
    if (visti > tetto) { m.troppo = true; return }
    visti += 1
    let st
    try { st = lstatSync(p) } catch { return }
    m.ultimaMs = Math.max(m.ultimaMs, st.mtimeMs)
    if (st.isSymbolicLink()) { m.collegamenti += 1; return }
    if (st.isDirectory()) {
      let nomi: string[] = []
      try { nomi = readdirSync(p) } catch { return }
      for (const n of nomi) giro(join(p, n))
      return
    }
    m.file += 1
    m.byte += st.size
  }
  giro(percorso)
  return m
}

/** Toglie i collegamenti (giunzioni, link) dentro una cartella, **senza entrarci**. Torna quelli non staccati. */
export function staccaCollegamentiSync(cartella: string): string[] {
  const falliti: string[] = []
  const giro = (dir: string): void => {
    let nomi: string[]
    try { nomi = readdirSync(dir) } catch { return }
    for (const n of nomi) {
      const p = join(dir, n)
      let st
      try { st = lstatSync(p) } catch { continue }
      if (st.isSymbolicLink()) {
        try { unlinkSync(p) } catch {
          try { rmdirSync(p) } catch (err) { falliti.push(`${p}: ${String(err).slice(0, 80)}`) }
        }
      } else if (st.isDirectory()) giro(p)
    }
  }
  try {
    const st = lstatSync(cartella)
    if (st.isSymbolicLink()) return [`${cartella} è essa stessa un collegamento`]
    if (!st.isDirectory()) return []
  } catch { return [] }
  giro(cartella)
  return falliti
}

const stessoDisco = (a: string, b: string): boolean => parse(resolve(a)).root.toLowerCase() === parse(resolve(b)).root.toLowerCase()

/** La radice del recupero del riassetto, nella cartella dei dati. */
export function radiceRecupero(dati: string): string { return join(dati, CARTELLA_RECUPERO_RIASSETTO) }

/** La cartella del recupero di una versione. */
export function cartellaVersione(dati: string, versione: string): string { return join(radiceRecupero(dati), nomeSicuro(versione)) }

function nomeSicuro(s: string): string { return s.replace(/[^A-Za-z0-9._-]+/g, '-') || 'x' }

function leggiManifesto(file: string): ManifestoRiassetto | undefined {
  try {
    const o = JSON.parse(readFileSync(file, 'utf8')) as ManifestoRiassetto
    if (typeof o !== 'object' || o === null || !Array.isArray(o.voci)) return undefined
    return o
  } catch { return undefined }
}

/**
 * Il recupero di un passo. Rilegge il manifesto e sistema le righe «in
 * corso» lasciate da un avvio interrotto: la cosa è arrivata (spostata), o è
 * ancora al suo posto (la riga esce e si rifà).
 */
export function apriRecuperoPasso(p: { dati: string; versione: string; passo: string; ora?: () => number; rinomina?: (da: string, a: string) => void }): RecuperoPasso {
  const ora = p.ora ?? Date.now
  const rinomina = p.rinomina ?? renameSync
  const cartella = join(cartellaVersione(p.dati, p.versione), nomeSicuro(p.passo))
  const fileManifesto = join(cartella, 'manifesto.json')
  const creato = new Date(ora()).toISOString()
  let m: ManifestoRiassetto = leggiManifesto(fileManifesto) ?? {
    versione: p.versione,
    passo: p.passo,
    creato,
    scadeIl: new Date(ora() + GIORNI_RECUPERO_RIASSETTO * 86_400_000).toISOString(),
    voci: []
  }
  m = {
    ...m,
    voci: m.voci.flatMap((v) => {
      if (v.stato !== 'in-corso') return [v]
      if (existsSync(v.dove)) return [{ ...v, stato: 'spostato' as const }]
      return []
    })
  }
  const salva = (): boolean => {
    try { mkdirSync(cartella, { recursive: true }) } catch { /* lo dice la scrittura */ }
    return scriviJsonAtomico(fileManifesto, m, 'riassetto')
  }

  const sposta = (percorso: string, o: OpzioniSposta): EsitoSposta => {
    const origine = resolve(percorso)
    let st
    try { st = lstatSync(origine) } catch { return { esito: 'non-c-era', byte: 0 } }
    if (st.isSymbolicLink()) return { esito: 'saltato', byte: 0, perche: 'è un collegamento: non lo seguo' }
    const misura = st.isDirectory() ? misuraAlbero(origine) : { byte: st.size, file: 1, ultimaMs: st.mtimeMs, collegamenti: 0, troppo: false }
    if (misura.troppo) return { esito: 'saltato', byte: 0, perche: 'troppi file per spostarla in sicurezza' }
    if (o.soloSeVuota === true && misura.file > 0) return { esito: 'saltato', byte: 0, perche: 'non è vuota' }
    const eta = o.etaMinimaMs ?? ETA_MINIMA_MS
    if (eta > 0 && ora() - misura.ultimaMs < eta) return { esito: 'saltato', byte: 0, perche: 'toccata da poco' }
    // Il posto: nel recupero dei dati se è lo stesso disco, se no accanto a sé.
    const base = stessoDisco(origine, p.dati)
      ? cartella
      : join(dirname(origine), CARTELLA_RECUPERO_ACCANTO, `riassetto-${nomeSicuro(p.versione)}`, nomeSicuro(p.passo))
    const dove = join(base, `${String(m.voci.length + 1).padStart(4, '0')}-${basename(origine)}`)
    if (existsSync(dove)) return { esito: 'saltato', byte: 0, perche: `al suo posto nel recupero c'è già ${dove}` }
    const voce: VoceManifesto = {
      origine, dove, byte: misura.byte, motivo: o.motivo, tipo: st.isDirectory() ? 'cartella' : 'file', quando: new Date(ora()).toISOString(), stato: 'in-corso'
    }
    m = { ...m, voci: [...m.voci, voce] }
    if (!salva()) {
      m = { ...m, voci: m.voci.filter((v) => v !== voce) }
      return { esito: 'saltato', byte: 0, perche: 'il manifesto del recupero non si scrive' }
    }
    try {
      mkdirSync(base, { recursive: true })
      rinomina(origine, dove)
    } catch (err) {
      m = { ...m, voci: m.voci.filter((v) => v !== voce) }
      salva()
      const codice = (err as { code?: string }).code ?? ''
      if (codice === 'EBUSY' || codice === 'EPERM' || codice === 'EACCES') return { esito: 'saltato', byte: 0, perche: `in uso o bloccata (${codice})` }
      if (codice === 'ENOENT' && !existsSync(origine)) return { esito: 'non-c-era', byte: 0 }
      if (codice === 'EXDEV') return { esito: 'saltato', byte: 0, perche: 'su un altro disco: non la copio' }
      return { esito: 'saltato', byte: 0, perche: `non spostata: ${String(err).slice(0, 100)}` }
    }
    m = { ...m, voci: m.voci.map((v) => (v === voce ? { ...v, stato: 'spostato' as const } : v)) }
    salva()
    return { esito: 'spostato', byte: misura.byte, dove }
  }

  return {
    cartella,
    sposta,
    manifesto: () => m,
    assicura: () => { if (!existsSync(fileManifesto)) salva(); return cartella }
  }
}

/** Tutti i manifesti del riassetto: `{ file, manifesto }`, di tutte le versioni o di una. */
export function manifesti(dati: string, versione?: string): Array<{ file: string; cartella: string; manifesto: ManifestoRiassetto }> {
  const fuori: Array<{ file: string; cartella: string; manifesto: ManifestoRiassetto }> = []
  const radice = radiceRecupero(dati)
  let versioni: string[] = []
  try { versioni = readdirSync(radice) } catch { return fuori }
  for (const v of versioni) {
    if (versione !== undefined && v !== nomeSicuro(versione)) continue
    let passi: string[] = []
    try { passi = readdirSync(join(radice, v)) } catch { continue }
    for (const passo of passi) {
      const cartella = join(radice, v, passo)
      const file = join(cartella, 'manifesto.json')
      const m = leggiManifesto(file)
      if (m !== undefined) fuori.push({ file, cartella, manifesto: m })
    }
  }
  return fuori
}

/** Il peso di quello che è ancora nel recupero (spostato, non ripristinato). */
export function pesoNelRecupero(dati: string, versione?: string): number {
  return manifesti(dati, versione).reduce((s, x) => s + x.manifesto.voci.filter((v) => v.stato === 'spostato' && existsSync(v.dove)).reduce((t, v) => t + v.byte, 0), 0)
}

/**
 * «Annulla»: ogni cosa spostata torna dov'era, in ordine inverso. Mai sopra
 * una cosa che nel frattempo è nata al suo posto: quella si dice e resta.
 */
export function ripristinaRiassetto(dati: string, versione: string, ora: () => number = Date.now): { ripristinati: number; nonRipristinati: string[] } {
  const esito = { ripristinati: 0, nonRipristinati: [] as string[] }
  for (const { file, manifesto } of manifesti(dati, versione).reverse()) {
    const voci = [...manifesto.voci]
    for (let i = voci.length - 1; i >= 0; i -= 1) {
      const v = voci[i]!
      if (v.stato !== 'spostato') continue
      if (!existsSync(v.dove)) { esito.nonRipristinati.push(`${v.origine}: nel recupero non c'è più`); continue }
      if (existsSync(v.origine)) { esito.nonRipristinati.push(`${v.origine}: al suo posto adesso c'è altro, non lo sovrascrivo`); continue }
      try {
        mkdirSync(dirname(v.origine), { recursive: true })
        renameSync(v.dove, v.origine)
        voci[i] = { ...v, stato: 'ripristinato', quando: new Date(ora()).toISOString() }
        esito.ripristinati += 1
      } catch (err) {
        esito.nonRipristinati.push(`${v.origine}: ${String(err).slice(0, 100)}`)
      }
    }
    scriviJsonAtomico(file, { ...manifesto, voci }, 'riassetto')
  }
  return esito
}

/**
 * Svuota il recupero di un passo: prima le cose finite accanto a sé su un
 * altro disco, poi la cartella del passo. Sempre dalla guardia, dopo aver
 * staccato i collegamenti.
 */
function svuotaPasso(dati: string, cartella: string, m: ManifestoRiassetto): { byte: number; errori: string[] } {
  const esito = { byte: 0, errori: [] as string[] }
  let byteDentro = 0
  const conSep = (p: string): string => `${resolve(p).toLowerCase()}${resolve(p).includes('\\') ? '\\' : '/'}`
  for (const v of m.voci) {
    if (v.stato !== 'spostato' || !existsSync(v.dove)) continue
    const dentroDati = resolve(v.dove).toLowerCase().startsWith(conSep(cartella))
    if (dentroDati) { byteDentro += v.byte; continue }
    const radiceAccanto = join(dirname(dirname(dirname(v.dove))))
    if (basename(radiceAccanto) !== CARTELLA_RECUPERO_ACCANTO) { esito.errori.push(`${v.dove}: non è in un recupero, non lo tocco`); continue }
    const falliti = staccaCollegamentiSync(v.dove)
    if (falliti.length > 0) { esito.errori.push(falliti[0]!); continue }
    try { cancellaSicura(v.dove, { dentro: [radiceAccanto] }); esito.byte += v.byte } catch (err) { esito.errori.push(`${v.dove}: ${String(err).slice(0, 120)}`) }
  }
  const falliti = staccaCollegamentiSync(cartella)
  if (falliti.length > 0) { esito.errori.push(falliti[0]!); return esito }
  try {
    cancellaSicura(cartella, { dentro: [radiceRecupero(dati)] })
    esito.byte += byteDentro
  } catch (err) { esito.errori.push(`${cartella}: ${String(err).slice(0, 120)}`) }
  return esito
}

/** «Libera subito»: il recupero di una versione svuotato adesso. */
export function liberaRecuperoRiassetto(dati: string, versione: string): { byte: number; errori: string[] } {
  const esito = { byte: 0, errori: [] as string[] }
  for (const { cartella, manifesto } of manifesti(dati, versione)) {
    const e = svuotaPasso(dati, cartella, manifesto)
    esito.byte += e.byte
    esito.errori.push(...e.errori)
  }
  togliCartelleVersioneVuote(dati)
  return esito
}

/** Il giro delle sei ore: i passi oltre i 30 giorni escono dal recupero. Torna quanti. */
export function scadenzeRecuperoRiassetto(dati: string, ora: number = Date.now()): { passi: number; byte: number; errori: string[] } {
  const esito = { passi: 0, byte: 0, errori: [] as string[] }
  for (const { cartella, manifesto } of manifesti(dati)) {
    const scade = Date.parse(manifesto.scadeIl)
    if (!Number.isFinite(scade) || scade > ora) continue
    const e = svuotaPasso(dati, cartella, manifesto)
    esito.passi += 1
    esito.byte += e.byte
    esito.errori.push(...e.errori)
  }
  togliCartelleVersioneVuote(dati)
  return esito
}

function togliCartelleVersioneVuote(dati: string): void {
  const radice = radiceRecupero(dati)
  let versioni: string[] = []
  try { versioni = readdirSync(radice) } catch { return }
  for (const v of versioni) {
    const c = join(radice, v)
    try { if (readdirSync(c).length === 0) rmdirSync(c) } catch { /* resta */ }
  }
}
