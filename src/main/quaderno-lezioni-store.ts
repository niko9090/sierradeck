import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { cancellaSicura } from '@shared/cancella-sicura'
import { CARTELLA_QUADERNO, SOTTOCARTELLA, leggiScheda, type Scheda } from '@shared/quaderno'
import {
  annotaVoci, componiFileQuaderno, FILE_DECISIONI, FILE_LEZIONI, fileVuoto, indiceQuaderno, leggiFileQuaderno, TAG_DECISIONI,
  type FileQuaderno
} from '@shared/quaderno-lezioni'
import { distilla, fraseRiordino, type EsitoDistilla } from '@shared/quaderno-riordino'
import { scriviAtomico, scriviJsonAtomico } from '@shared/scrittura-atomica'

/**
 * **Lezioni e decisioni sul disco** (P2, 30/10): `lezioni.md` e `decisioni.md`
 * nella cartella del quaderno del progetto. Le regole stanno in
 * `@shared/quaderno-lezioni`; qui si legge e si scrive, sempre atomico.
 *
 * Lo usano il servizio degli autopiloti (le righe `LEZIONI:` a fine turno, le
 * decisioni di Nicholas) e il Gestore (il tasto «Riordina il quaderno»).
 */

export type QuadernoLezioni = {
  leggi: (cwd: string) => { lezioni: FileQuaderno; decisioni: FileQuaderno }
  /** Annota lezioni senza doppioni; torna quante nuove e quante confermate. */
  annota: (cwd: string, voci: readonly { tag?: string; testo: string }[], quando?: string) => { nuove: number; confermate: number }
  /** Annota una decisione di Nicholas. */
  decidi: (cwd: string, testo: string, quando?: string) => void
  /** Le decisioni come le voleva la memoria dell'autopilota: dalla meno recente. */
  decisioni: (cwd: string) => { testo: string; quando: string }[]
  /** L'indice per le chat (≤ ~1.5k token). */
  indice: (cwd: string) => string
}

const cartellaDi = (cwd: string): string => join(cwd, CARTELLA_QUADERNO, SOTTOCARTELLA)

function leggiFile(f: string): FileQuaderno {
  if (!existsSync(f)) return fileVuoto()
  try { return leggiFileQuaderno(readFileSync(f, 'utf8')) } catch { return fileVuoto() }
}

export function apriQuadernoLezioni(adesso: () => string = () => new Date().toISOString()): QuadernoLezioni {
  const leggi = (cwd: string): { lezioni: FileQuaderno; decisioni: FileQuaderno } => ({
    lezioni: leggiFile(join(cartellaDi(cwd), FILE_LEZIONI)),
    decisioni: leggiFile(join(cartellaDi(cwd), FILE_DECISIONI))
  })
  const scrivi = (cwd: string, tipo: 'lezioni' | 'decisioni', f: FileQuaderno): void => {
    const dir = cartellaDi(cwd)
    mkdirSync(dir, { recursive: true })
    if (!scriviAtomico(join(dir, tipo === 'lezioni' ? FILE_LEZIONI : FILE_DECISIONI), componiFileQuaderno(tipo, f), 'quaderno')) {
      throw new Error(`${tipo}.md non salvato`)
    }
  }
  return {
    leggi,
    annota(cwd, voci, quando = adesso()) {
      if (voci.length === 0) return { nuove: 0, confermate: 0 }
      const r = annotaVoci(leggi(cwd).lezioni, voci, quando)
      scrivi(cwd, 'lezioni', r.file)
      return { nuove: r.nuove, confermate: r.confermate }
    },
    decidi(cwd, testo, quando = adesso()) {
      if (testo.trim() === '') return
      const r = annotaVoci(leggi(cwd).decisioni, [{ tag: TAG_DECISIONI, testo: testo.slice(0, 400) }], quando)
      scrivi(cwd, 'decisioni', r.file)
    },
    decisioni(cwd) {
      return [...leggi(cwd).decisioni.voci]
        .sort((a, b) => a.ultima.localeCompare(b.ultima))
        .map((v) => ({ testo: v.testo, quando: v.ultima }))
    },
    indice(cwd) {
      const q = leggi(cwd)
      return indiceQuaderno(q.lezioni, q.decisioni)
    }
  }
}

// ---------------------------------------------------------------------------
// «Riordina il quaderno»: una volta sola, su richiesta di Nicholas.
// ---------------------------------------------------------------------------

/** Quanti giorni gli originali restano nel recupero. */
export const GIORNI_RECUPERO_QUADERNO = 30
const CARTELLA_RECUPERO = 'recupero-quaderno'
const FILE_REGISTRO = 'recupero-quaderno.json'

export type VoceRecuperoQuaderno = { id: string; cwd: string; quando: string; scadeIl: string; file: string[]; svuotataIl?: string }

function leggiRegistro(dati: string): VoceRecuperoQuaderno[] {
  const f = join(dati, FILE_REGISTRO)
  if (!existsSync(f)) return []
  try {
    const x = JSON.parse(readFileSync(f, 'utf8')) as { voci?: unknown }
    return Array.isArray(x.voci) ? x.voci.filter((v): v is VoceRecuperoQuaderno => typeof v === 'object' && v !== null && typeof (v as VoceRecuperoQuaderno).id === 'string' && typeof (v as VoceRecuperoQuaderno).scadeIl === 'string') : []
  } catch { return [] }
}

/** Le note del quaderno, lette come schede (solo i `.md` in cima alla cartella). */
function schedeDi(cwd: string): Scheda[] {
  const dir = cartellaDi(cwd)
  if (!existsSync(dir)) return []
  const fuori: Scheda[] = []
  for (const nome of readdirSync(dir)) {
    if (!nome.toLowerCase().endsWith('.md')) continue
    try {
      if (!statSync(join(dir, nome)).isFile()) continue
      fuori.push(leggiScheda(nome, readFileSync(join(dir, nome), 'utf8')))
    } catch { /* illeggibile: resta dov'è */ }
  }
  return fuori
}

export type AnteprimaRiordino = Pick<EsitoDistilla, 'note' | 'voci' | 'regole'> & { frase: string }

/** Cosa farebbe «Riordina il quaderno», senza toccare niente. */
export function anteprimaRiordino(cwd: string, oggi: string = new Date().toISOString()): AnteprimaRiordino {
  const q = apriQuadernoLezioni().leggi(cwd)
  const e = distilla(schedeDi(cwd), q, oggi)
  return { note: e.note, voci: e.voci, regole: e.regole, frase: fraseRiordino(e) }
}

/** Sposta un file: rinomina, o copia e poi toglie l'originale (disco diverso). */
function sposta(da: string, a: string, cartellaDa: string): void {
  try { renameSync(da, a); return } catch (err) {
    if ((err as { code?: string }).code !== 'EXDEV') throw err
  }
  copyFileSync(da, a)
  cancellaSicura(da, { dentro: [cartellaDa] })
}

export type EsitoRiordino = AnteprimaRiordino & { ok: boolean; spostate: number; nonSpostate: string[]; recupero?: string; messaggio: string }

/**
 * **Riordina il quaderno**: scrive `lezioni.md` e `decisioni.md` distillati,
 * poi sposta le note originali nel recupero per 30 giorni
 * (`<dati>/recupero-quaderno/<id>/`). Prima si scrive, poi si sposta: se la
 * scrittura non riesce non si sposta niente. Gira solo quando Nicholas preme il
 * tasto.
 */
export function riordinaQuaderno(cwd: string, dati: string, adesso: () => string = () => new Date().toISOString()): EsitoRiordino {
  const quando = adesso()
  const lez = apriQuadernoLezioni(adesso)
  const dir = cartellaDi(cwd)
  const e = distilla(schedeDi(cwd), lez.leggi(cwd), quando)
  const base = { note: e.note, voci: e.voci, regole: e.regole, frase: fraseRiordino(e) }
  if (e.note === 0) return { ...base, ok: true, spostate: 0, nonSpostate: [], messaggio: base.frase }
  mkdirSync(dir, { recursive: true })
  const lezioniOk = scriviAtomico(join(dir, FILE_LEZIONI), componiFileQuaderno('lezioni', e.lezioni), 'quaderno')
  const decisioniOk = lezioniOk && scriviAtomico(join(dir, FILE_DECISIONI), componiFileQuaderno('decisioni', e.decisioni), 'quaderno')
  if (!lezioniOk || !decisioniOk) return { ...base, ok: false, spostate: 0, nonSpostate: e.daSpostare, messaggio: 'Non sono riuscito a scrivere lezioni.md e decisioni.md: non ho spostato niente.' }
  const id = `${quando.slice(0, 10)}-${randomBytes(4).toString('hex')}`
  const recupero = join(dati, CARTELLA_RECUPERO, id)
  mkdirSync(recupero, { recursive: true })
  const spostate: string[] = []
  const nonSpostate: string[] = []
  for (const nome of e.daSpostare) {
    try { sposta(join(dir, nome), join(recupero, nome), dir); spostate.push(nome) } catch { nonSpostate.push(nome) }
  }
  const scade = new Date(Date.parse(quando) + GIORNI_RECUPERO_QUADERNO * 86_400_000).toISOString()
  scriviJsonAtomico(join(dati, FILE_REGISTRO), { versione: 1, voci: [...leggiRegistro(dati), { id, cwd, quando, scadeIl: scade, file: spostate }] }, 'recupero-quaderno')
  return {
    ...base, ok: nonSpostate.length === 0, spostate: spostate.length, nonSpostate, recupero,
    messaggio: `${base.frase} Le ${spostate.length} note originali sono nel recupero fino al ${scade.slice(0, 10)}${nonSpostate.length > 0 ? `; ${nonSpostate.length} non si sono spostate e restano dove sono` : ''}.`
  }
}

/** Svuota le note del recupero oltre i 30 giorni, sempre attraverso la guardia, solo dentro la cartella del recupero. */
export function svuotaRecuperoQuaderno(dati: string, ora: number = Date.now()): number {
  const voci = leggiRegistro(dati)
  const radice = join(dati, CARTELLA_RECUPERO)
  let tolte = 0
  const dopo = voci.map((v) => {
    if (v.svuotataIl !== undefined || Date.parse(v.scadeIl) > ora) return v
    try { cancellaSicura(join(radice, v.id), { dentro: [radice] }); tolte += 1; return { ...v, svuotataIl: new Date(ora).toISOString() } } catch { return v }
  })
  if (tolte > 0) scriviJsonAtomico(join(dati, FILE_REGISTRO), { versione: 1, voci: dopo }, 'recupero-quaderno')
  return tolte
}
