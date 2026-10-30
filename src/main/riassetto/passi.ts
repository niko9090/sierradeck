import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readdirSync, readFileSync, statfsSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { CARTELLA_QUADERNO, SOTTOCARTELLA } from '@shared/quaderno'
import { RESTANO } from '@shared/quaderno-riordino'
import {
  ETA_MINIMA_MS, ETA_MINIMA_STATO_MS, mb,
  type EsitoPassoServizio, type PassoDelServizio
} from '@shared/riassetto'
import { CARTELLA_COPIE, copieDaPotare } from '../copie-di-versione'
import { RimandaPasso, type ContestoPasso, type Passo } from './motore'
import { misuraAlbero } from './recupero'

/**
 * **I passi del riassetto**, costruiti in un posto solo (`costruisciPassi`).
 *
 * Fase A (prima delle finestre, senza attese): file della cartella dei dati
 * che nessuno ha ancora aperto. Fase B (dopo, con il servizio degli
 * autopiloti alla versione nuova): quello che è suo — la cartella degli
 * autopiloti, git, le trascrizioni — passa da `POST /riassetto/passo`; il
 * resto (quaderni, indice, cache) lo fa il programma.
 *
 * Chi integra aggiunge i suoi con `passiAggiunti` (vedi `passoDaFunzione`):
 * entrano dopo quelli della loro fase, nell'ordine dato.
 */

export type EsitoGitRiassetto = { codice: number; uscita: string }

export type DipendenzePassi = {
  /** Spazio libero minimo per cominciare. Di serie 500 MB. */
  spazioMinimo?: number
  /** Lo spazio libero sul disco dei dati; di serie `statfsSync`. */
  spazioLibero?: (dati: string) => number | undefined
  /** C'è la copia di versione di questo aggiornamento? Senza, il riassetto aspetta. */
  copiaDiVersione: () => boolean
  /**
   * I segni delle migrazioni il cui codice non c'è più (`migrazione-*.json`):
   * spostarne uno con il codice ancora presente la farebbe ripartire, quindi
   * l'elenco lo dà chi integra, dopo aver tolto il codice. Di serie nessuno.
   */
  marcatoriSenzaCodice?: readonly string[]
  /**
   * Le cartelle dei dati che il programma non usa più (stato di funzioni
   * tolte): si spostano intere se nessuno le tocca da 7 giorni.
   */
  cartelleDismesse?: readonly string[]
  /** I file di stato delle funzioni tolte. Di serie `FILE_DISMESSI`. */
  fileDismessi?: readonly string[]
  /**
   * Lo storico degli errori del programma, compattato (fase A): le voci tolte
   * si scrivono in `cartellaRecupero`. Torna quante voci e quanti byte.
   */
  compattaErroriApp?: (cartellaRecupero: () => string) => { tolte: number; byte: number }
  /** Una richiesta al servizio degli autopiloti. Assente: i passi del servizio aspettano. */
  servizio?: (passo: PassoDelServizio, corpo: Record<string, unknown>) => Promise<EsitoPassoServizio>
  /** Le cartelle dei progetti del programma (dove c'erano le vecchie copie `ap-…-c-N`). */
  cartelleProgetti?: () => string[]
  /** Le trascrizioni andate nel recupero escono dall'indice; poi `VACUUM`. Torna i byte liberati. */
  pulisciIndice?: (sessioni: string[]) => number
  /** Le cartelle dei progetti con un quaderno (le cartelle degli autopiloti e dei workspace). */
  progetti?: () => Promise<string[]>
  git?: (args: string[], cwd: string) => Promise<EsitoGitRiassetto>
  /** Il riordino P2 del quaderno (`riordinaQuaderno`). */
  riordinaQuaderno?: (cwd: string) => { ok: boolean; spostate: number; messaggio: string }
  /** Svuota le cache di Chromium. Torna i byte liberati, se li sa. */
  svuotaCache?: () => Promise<number>
  /** I passi di chi integra: la migrazione dei proprietari, l'archivio dei vecchi autopiloti. */
  passiAggiunti?: readonly Passo[]
}

/**
 * Le cartelle dismesse di serie: unioni, traslochi e riordini di «una casa»,
 * le copie di lavoro dei trasferimenti SFTP (`modifiche/`) e lo scambio col
 * telefono, tolti nella 0.88. Con dentro file dell'utente: nel recupero 30
 * giorni e «Annulla», come tutto il resto.
 */
export const CARTELLE_DISMESSE: readonly string[] = ['unioni', 'traslochi', 'riordini', 'modifiche', 'scambio']
/** I file di stato delle funzioni tolte nella 0.88: il fornitore dell'API, le destinazioni SFTP. */
export const FILE_DISMESSI: readonly string[] = ['provider.json', 'destinazioni.json']
/** Cartelle che si spostano solo vuote: lì dentro possono esserci file dell'utente. */
export const CARTELLE_SE_VUOTE: readonly string[] = ['allegati-in-arrivo']
/** Note del quaderno oltre le quali il riordino P2 gira da solo (quaderni fuori da git). */
export const NOTE_PER_RIORDINO = 40
const SPAZIO_MINIMO = 500 * 1024 * 1024

/** I file di stato di scorta nella cartella dei dati che si possono spostare. */
const FILE_DI_SCORTA: readonly RegExp[] = [
  /^workspaces\.prima-.*\.json$/,
  /^workspaces\.json\.bak-recupero$/,
  /^workspaces\.json\.prima-del-recupero-.*$/,
  /^sync-manifesto\.precedente-.*\.json$/,
  /^cassaforte\.messa-da-parte-.*\.json$/
]

function voci(dir: string): string[] {
  try { return readdirSync(dir) } catch { return [] }
}

function impronta(file: string): string | undefined {
  try { return createHash('sha1').update(readFileSync(file)).digest('hex') } catch { return undefined }
}

/** C'è una copia uguale (stesso contenuto) di `nome` in una copia di versione? */
function inUnaCopiaDiVersione(dati: string, nome: string): boolean {
  const radice = join(dati, CARTELLA_COPIE)
  const mia = impronta(join(dati, nome))
  if (mia === undefined) return false
  return voci(radice).some((c) => existsSync(join(radice, c, nome)) && impronta(join(radice, c, nome)) === mia)
}

const eta = (p: string, ora: number): number => {
  try { return ora - lstatSync(p).mtimeMs } catch { return 0 }
}

// ── Fase A ───────────────────────────────────────────────────────────────

function passoControllo(d: DipendenzePassi): Passo {
  return {
    id: 'controllo', titolo: 'Controllo prima di cominciare', fase: 'A', peso: 1,
    esegui: (c) => {
      const libero = (d.spazioLibero ?? spazioLiberoVero)(c.dati)
      const minimo = d.spazioMinimo ?? SPAZIO_MINIMO
      if (libero !== undefined && libero < minimo) throw new RimandaPasso(`spazio libero ${mb(libero)}, ne servono almeno ${mb(minimo)}: riprovo al prossimo avvio`, true)
      if (!d.copiaDiVersione()) throw new RimandaPasso('la copia di versione di questo aggiornamento non c’è: riprovo al prossimo avvio', true)
    }
  }
}

export function spazioLiberoVero(dati: string): number | undefined {
  try { const s = statfsSync(dati); return Number(s.bavail) * Number(s.bsize) } catch { return undefined }
}

function passoFileDiStato(d: DipendenzePassi): Passo {
  return {
    id: 'file-di-stato', titolo: 'File di stato di scorta', fase: 'A', peso: 3,
    esegui: (c) => {
      const ora = c.ora()
      const nomi = voci(c.dati)
      const marcatori = new Set(d.marcatoriSenzaCodice ?? [])
      const daSpostare = nomi.filter((n) => FILE_DI_SCORTA.some((re) => re.test(n)) || marcatori.has(n))
      let i = 0
      for (const n of daSpostare) {
        i += 1
        c.avanza(i / (daSpostare.length + 3))
        const p = join(c.dati, n)
        if (c.fatto(p)) continue
        // Un `.json` deve stare anche in una copia di versione: là la riparazione dei workspace lo ritrova.
        if (n.endsWith('.json') && !marcatori.has(n) && eta(p, ora) >= ETA_MINIMA_STATO_MS && !inUnaCopiaDiVersione(c.dati, n)) {
          c.salta(p, 'non è in una copia di versione')
          continue
        }
        c.sposta(p, { motivo: marcatori.has(n) ? 'segno di una migrazione il cui codice non c’è più' : 'copia di scorta di un file di stato', etaMinimaMs: ETA_MINIMA_STATO_MS })
      }
      // I file e le cartelle delle funzioni tolte.
      for (const n of d.fileDismessi ?? FILE_DISMESSI) {
        c.sposta(join(c.dati, n), { motivo: 'file di una funzione che non c’è più', etaMinimaMs: ETA_MINIMA_STATO_MS })
      }
      for (const n of d.cartelleDismesse ?? CARTELLE_DISMESSE) {
        c.sposta(join(c.dati, n), { motivo: 'cartella di una funzione che non c’è più', etaMinimaMs: ETA_MINIMA_STATO_MS })
      }
      for (const n of CARTELLE_SE_VUOTE) {
        const p = join(c.dati, n)
        if (existsSync(p) && misuraAlbero(p).file === 0) c.sposta(p, { motivo: 'cartella vuota', etaMinimaMs: ETA_MINIMA_STATO_MS, soloSeVuota: true })
      }
      c.avanza(0.8)
      // Le sottocartelle vuote del recupero dei workspace.
      const cartelleWs = join(c.dati, 'workspaces-recupero-cartelle')
      for (const n of voci(cartelleWs)) {
        const p = join(cartelleWs, n)
        try { if (!lstatSync(p).isDirectory()) continue } catch { continue }
        if (misuraAlbero(p).file > 0) continue
        c.sposta(p, { motivo: 'cartella vuota del recupero dei workspace', etaMinimaMs: ETA_MINIMA_STATO_MS, soloSeVuota: true })
      }
      // Il recupero dei progetti: le cartelle che il suo elenco non conosce (resti di collaudo).
      const recProgetti = join(c.dati, 'recupero-progetti')
      const conosciute = new Set<string>()
      try {
        const elenco = JSON.parse(readFileSync(join(recProgetti, 'elenco.json'), 'utf8')) as unknown
        if (Array.isArray(elenco)) {
          for (const x of elenco as Array<{ id?: unknown; dove?: unknown }>) {
            if (typeof x.id === 'string') conosciute.add(x.id.toLowerCase())
            if (typeof x.dove === 'string') conosciute.add(basename(x.dove).toLowerCase())
          }
        }
      } catch {
        // Un elenco che non si legge: non si tocca niente, potrebbero essere tutte sue.
        if (existsSync(recProgetti)) c.salta(recProgetti, 'l’elenco del recupero dei progetti non si legge')
        return
      }
      for (const n of voci(recProgetti)) {
        if (n === 'elenco.json' || conosciute.has(n.toLowerCase())) continue
        const p = join(recProgetti, n)
        try { if (!lstatSync(p).isDirectory()) continue } catch { continue }
        c.sposta(p, { motivo: 'resto di un collaudo, fuori dall’elenco del recupero dei progetti (senza scadenza)', etaMinimaMs: ETA_MINIMA_STATO_MS })
      }
      c.avanza(1)
    }
  }
}

function passoRecuperoRiordino(): Passo {
  return {
    id: 'recupero-riordino', titolo: 'Recupero del vecchio riordino', fase: 'A', peso: 4,
    esegui: (c) => {
      // Scritto da «una casa» senza scadenza: nel recupero del riassetto ne ha una, 30 giorni.
      c.sposta(join(c.dati, 'recupero-riordino'), { motivo: 'recupero del vecchio riordino «una casa», senza scadenza', etaMinimaMs: 24 * 60 * 60_000 })
    }
  }
}

function passoCopieDiVersione(): Passo {
  return {
    id: 'copie-di-versione', titolo: 'Copie di versione', fase: 'A', peso: 1,
    esegui: (c) => {
      const radice = join(c.dati, CARTELLA_COPIE)
      const cartelle = voci(radice).filter((n) => { try { return lstatSync(join(radice, n)).isDirectory() } catch { return false } })
      // La regola di sempre (le più recenti, `COPIE_DA_TENERE`): quella appena fatta resta sempre.
      for (const n of copieDaPotare(cartelle)) c.sposta(join(radice, n), { motivo: 'copia di versione oltre quelle da tenere', etaMinimaMs: 0 })
    }
  }
}

function passoErroriApp(d: DipendenzePassi): Passo {
  return {
    id: 'errori-programma', titolo: 'Storico degli errori del programma', fase: 'A', peso: 1,
    esegui: (c) => {
      if (c.fatto('compattato') || d.compattaErroriApp === undefined) return
      const e = d.compattaErroriApp(c.cartellaRecupero)
      c.liberati(e.byte)
      if (e.tolte > 0) c.log(`[riassetto] storico degli errori del programma: ${e.tolte} errori di versioni passate, non più visti da 72 ore, tolti`)
      c.segna('compattato')
    }
  }
}

// ── Fase B ───────────────────────────────────────────────────────────────

/** Riporta nel giornale quello che ha fatto il servizio. */
function applicaEsito(c: ContestoPasso, e: EsitoPassoServizio): void {
  for (const f of e.fatti) c.segna(f)
  for (const s of e.saltati) c.salta(s.cosa, s.perche)
  for (const x of e.errori) c.errore(x)
  for (const p of e.proposte) c.proponi(p)
  c.liberati(e.byteLiberati)
  c.inRecupero(e.byteInRecupero)
}

async function chiedi(d: DipendenzePassi, passo: PassoDelServizio, corpo: Record<string, unknown>): Promise<EsitoPassoServizio> {
  if (d.servizio === undefined) throw new RimandaPasso('il servizio degli autopiloti non è collegato')
  let e: EsitoPassoServizio
  try { e = await d.servizio(passo, corpo) } catch (err) { throw new RimandaPasso(`il servizio degli autopiloti non risponde (${String(err).slice(0, 80)})`) }
  if (e.rimandato !== undefined) throw new RimandaPasso(e.rimandato)
  return e
}

function passoServizio(d: DipendenzePassi, id: string, titolo: string, peso: number, passo: PassoDelServizio): Passo {
  return {
    id, titolo, fase: 'B', peso,
    esegui: async (c) => {
      const e = await chiedi(d, passo, { cartelleProgetti: d.cartelleProgetti?.() ?? [] })
      applicaEsito(c, e)
      if (passo === 'trascrizioni' && (e.sessioniTolte?.length ?? 0) > 0 && d.pulisciIndice !== undefined) {
        try { c.liberati(d.pulisciIndice(e.sessioniTolte ?? [])) } catch (err) { c.errore(`indice: ${String(err).slice(0, 120)}`) }
      }
    }
  }
}

/** Le note di un quaderno: i `.md` tranne quelli che restano (lezioni, decisioni, lista). */
export function noteDelQuaderno(dir: string): string[] {
  return voci(dir).filter((n) => n.toLowerCase().endsWith('.md') && !RESTANO.has(n) && (() => { try { return statSync(join(dir, n)).isFile() } catch { return false } })())
}

/** Le copie `-N.md` di una nota con lo stesso contenuto dell'originale. */
export function doppioniIdentici(dir: string, note: readonly string[]): Array<{ copia: string; di: string }> {
  const fuori: Array<{ copia: string; di: string }> = []
  const tutte = new Set(note)
  for (const n of note) {
    const m = /^(.*)-(\d+)\.md$/i.exec(n)
    if (m === null) continue
    const base = `${m[1]}.md`
    if (!tutte.has(base)) continue
    const a = impronta(join(dir, n))
    if (a !== undefined && a === impronta(join(dir, base))) fuori.push({ copia: n, di: base })
  }
  return fuori
}

function passoQuaderno(d: DipendenzePassi): Passo {
  return {
    id: 'quaderno', titolo: 'Quaderni dei progetti', fase: 'B', peso: 3,
    esegui: async (c) => {
      const progetti = [...new Set((await (d.progetti?.() ?? Promise.resolve([]))).map((x) => x))]
      let i = 0
      for (const cwd of progetti) {
        i += 1
        c.avanza(i / Math.max(1, progetti.length))
        if (c.fatto(`quaderno:${cwd}`)) continue
        const dir = join(cwd, CARTELLA_QUADERNO, SOTTOCARTELLA)
        if (!existsSync(dir)) { c.segna(`quaderno:${cwd}`); continue }
        const note = noteDelQuaderno(dir)
        const copie = note.filter((n) => /-\d+\.md$/i.test(n))
        let tracciato = false
        if (d.git !== undefined) {
          const r = await d.git(['ls-files', '--', `${CARTELLA_QUADERNO}/${SOTTOCARTELLA}`], cwd).catch(() => ({ codice: 1, uscita: '' }))
          tracciato = r.codice === 0 && r.uscita.trim() !== ''
        }
        const doppi = doppioniIdentici(dir, note)
        if (tracciato) {
          // Nel repository: spostare note è un commit, e lo decide Nicholas.
          if (note.length > NOTE_PER_RIORDINO || copie.length > 0) {
            c.proponi(`Il quaderno di ${basename(cwd)} è nel repository: ${note.length} note, ${copie.length} copie «-N.md» (${doppi.length} identiche all’originale). Non l’ho toccato: «Riordina il quaderno» lo distilla, con un commit.`)
          }
          c.segna(`quaderno:${cwd}`)
          continue
        }
        for (const x of doppi) c.sposta(join(dir, x.copia), { motivo: `copia identica di ${x.di}`, etaMinimaMs: ETA_MINIMA_MS })
        const rimaste = noteDelQuaderno(dir)
        if (rimaste.length > NOTE_PER_RIORDINO && d.riordinaQuaderno !== undefined) {
          const r = d.riordinaQuaderno(cwd)
          if (r.ok) c.log(`[riassetto] quaderno di ${basename(cwd)}: ${r.messaggio}`)
          else c.errore(`quaderno di ${basename(cwd)}: ${r.messaggio}`)
        }
        c.segna(`quaderno:${cwd}`)
      }
    }
  }
}

function passoCache(d: DipendenzePassi): Passo {
  return {
    id: 'cache', titolo: 'Cache del programma', fase: 'B', peso: 1,
    esegui: async (c) => {
      if (c.fatto('svuotata') || d.svuotaCache === undefined) return
      c.liberati(await d.svuotaCache())
      c.segna('svuotata')
    }
  }
}

/** Tutti i passi, in ordine: quelli di chi integra dopo quelli della loro fase. */
export function costruisciPassi(d: DipendenzePassi): Passo[] {
  const aggiunti = d.passiAggiunti ?? []
  return [
    passoControllo(d),
    passoFileDiStato(d),
    passoRecuperoRiordino(),
    passoCopieDiVersione(),
    passoErroriApp(d),
    ...aggiunti.filter((p) => p.fase === 'A'),
    passoServizio(d, 'consegne', 'Contatore delle consegne', 1, 'consegne'),
    // Prima delle trascrizioni: le chat degli autopiloti di prima non le tengono più.
    passoServizio(d, 'autopiloti', 'Autopiloti di prima', 1, 'autopiloti'),
    passoServizio(d, 'worktree', 'Copie delle chat e rami', 3, 'worktree'),
    passoServizio(d, 'trascrizioni', 'Trascrizioni delle copie finite', 6, 'trascrizioni'),
    passoServizio(d, 'errori-servizio', 'Storico degli errori del servizio', 1, 'errori'),
    passoQuaderno(d),
    passoCache(d),
    ...aggiunti.filter((p) => p.fase === 'B')
  ]
}
