import { join } from 'node:path'
import {
  appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync
} from 'node:fs'
import { scriviAtomico } from '@shared/scrittura-atomica'
import { parseAutopilota, VERSIONE_AUTOPILOTA, type Autopilota, type Decisione } from '@shared/autopilota'

export type Archivio = {
  cartella: string
  elenca: () => Autopilota[]
  leggi: (id: string) => Autopilota | undefined
  scrivi: (a: Autopilota) => void
  elimina: (id: string) => void
  /**
   * Le decisioni uscite dal file dell'autopilota (0.85.2), dalla più vecchia:
   * quelle in `<id>.decisioni.jsonl`. Si rileggono solo se il file è cambiato.
   */
  decisioniVecchie?: (id: string) => Decisione[]
}

/**
 * **Il diario nel file, al più 600 voci** (0.85.2). Il 27/10 un autopilota
 * aveva 18.635 decisioni, 5 MB di JSON indentato, riletti e riscritti a ogni
 * hook di ogni chat. Oltre `DECISIONI_SOGLIA` voci il file torna alle ultime
 * `DECISIONI_TENUTE`; le più vecchie vanno in coda a `<id>.decisioni.jsonl`
 * (una per riga, solo aggiunte, mai riscritto). Il margine fra le due evita
 * di scrivere nel jsonl a ogni salvataggio. Un file grande di prima si
 * accorcia alla prima scrittura.
 */
export const DECISIONI_TENUTE = 500
export const DECISIONI_SOGLIA = 600

/**
 * Un file per autopilota, non un archivio solo.
 *
 * Con un unico file, due autopiloti che salvano nello stesso momento si
 * sovrascriverebbero a vicenda — e qui i salvataggi sono frequenti, uno per
 * ciclo. File separati eliminano il problema invece di gestirlo con un lock.
 */

/** Gli id che il servizio emette; qualunque altra forma non entra in un percorso. */
const ID_VALIDO = /^[A-Za-z0-9_-]{1,64}$/

function validaId(id: string): string {
  if (!ID_VALIDO.test(id)) {
    throw new Error(`id di autopilota non valido: ${JSON.stringify(id)}`)
  }
  return id
}

/**
 * Sposta di lato un file che non siamo riusciti a interpretare, invece di
 * cancellarlo: contiene il lavoro di un autopilota e nessuna sorgente può
 * rigenerarlo.
 *
 * Il suffisso numerato evita che un secondo avvio con lo stesso problema
 * sovrascriva il salvataggio del primo.
 */
/**
 * I file del servizio che stanno accanto agli autopiloti e non sono
 * autopiloti (0.69.0). Il 12/10 `elenca` leggeva anche `consegne-numero.json`,
 * lo rifiutava e lo metteva da parte come «illeggibile» a ogni giro (47 copie):
 * il contatore delle consegne ripartiva da c-1 e il Gestore confermava consegne
 * di altri — gli ordini degli autopiloti non arrivavano alle chat.
 */
export const FILE_DEL_SERVIZIO = new Set(['consegne-numero.json'])

/**
 * Il numero più alto fra il contatore e le sue copie messe da parte per
 * sbaglio (`consegne-numero.json.illeggibile-N`): si riparte da lì.
 */
export function ultimoNumeroConsegne(cartella: string): number {
  let massimo = 0
  let nomi: string[] = []
  try { nomi = readdirSync(cartella) } catch { return 0 }
  for (const nome of nomi) {
    if (nome !== 'consegne-numero.json' && !nome.startsWith('consegne-numero.json.illeggibile-')) continue
    try {
      const n = Number((JSON.parse(readFileSync(join(cartella, nome), 'utf8')) as { ultimo?: unknown }).ultimo)
      if (Number.isFinite(n) && n > massimo) massimo = Math.floor(n)
    } catch { /* non è un contatore */ }
  }
  return massimo
}

/** Le decisioni di un `<id>.decisioni.jsonl`; una riga rotta (scrittura interrotta) si salta. */
function leggiJsonl(percorso: string): Decisione[] {
  let testo: string
  try { testo = readFileSync(percorso, 'utf8') } catch { return [] }
  const fuori: Decisione[] = []
  for (const riga of testo.split('\n')) {
    if (riga.trim() === '') continue
    try {
      const d = JSON.parse(riga) as Partial<Decisione>
      if (typeof d.quando === 'string' && typeof d.cosa === 'string') fuori.push(d as Decisione)
    } catch { /* riga interrotta */ }
  }
  return fuori
}

function mettiDaParte(percorso: string): void {
  for (let n = 1; n < 1000; n += 1) {
    const destinazione = `${percorso}.illeggibile-${n}`
    if (existsSync(destinazione)) continue
    try {
      renameSync(percorso, destinazione)
      console.error(`[autopilota] file illeggibile conservato in ${destinazione}`)
    } catch (err) {
      console.error(`[autopilota] impossibile conservare ${percorso}:`, err)
    }
    return
  }
  console.error(`[autopilota] troppi file .illeggibile accanto a ${percorso}: non ne creo altri`)
}

export function apriArchivio(cartella: string): Archivio {
  mkdirSync(cartella, { recursive: true })

  const percorsoDi = (id: string): string => join(cartella, `${validaId(id)}.json`)

  /** Gli avvisi già dati, per non ripeterli a ogni rilettura. */
  const gia = new Set<string>()

  /**
   * L'elenco viene chiesto ogni pochi secondi (la pagina del telefono sonda lo
   * stato ogni 2s, la guardia ogni 60s): senza cache, ogni giro rileggeva e
   * ri-parsava da disco **tutti** i file autopilota, anche quando nessuno era
   * cambiato — l'I/O sincrono più caldo dell'app. Qui si tiene il parsed di ogni
   * file e lo si riusa finché `mtime`+`size` non cambiano; un `statSync` (syscall
   * economica) al posto di `readFileSync`+`JSON.parse`+`parseAutopilota`. Poiché
   * i salvataggi sono atomici (scrittura su temp + rename → l'mtime cambia), la
   * cache si invalida da sola: nessun rischio di stato stantìo, e regge anche una
   * modifica esterna al file. È lo stesso schema dell'indexer.
   */
  const cache = new Map<string, { mtimeMs: number; size: number; auto: Autopilota }>()

  const leggiFile = (percorso: string): Autopilota | undefined => {
    let testo: string
    try {
      testo = readFileSync(percorso, 'utf8')
    } catch (err) {
      console.error(`[autopilota] lettura di ${percorso} fallita:`, err)
      return undefined
    }

    let grezzo: unknown
    try {
      grezzo = JSON.parse(testo)
    } catch (err) {
      console.error(`[autopilota] ${percorso} non e JSON valido:`, err)
      mettiDaParte(percorso)
      return undefined
    }

    const { autopilota, scartati } = parseAutopilota(grezzo)
    // L'elenco viene riletto ogni pochi secondi finché il pannello è aperto: un
    // file che il parser corregge scriverebbe la stessa riga per sempre, e un
    // log che ripete non è più il posto dove si guarda quando qualcosa non va.
    // Solo lo stesso avviso sullo stesso file tace: se il file cambia e il
    // motivo con lui, torna a parlare.
    for (const motivo of scartati) {
      const chiave = `${percorso}|${motivo}`
      if (gia.has(chiave)) continue
      gia.add(chiave)
      console.warn(`[autopilota] ${percorso}: ${motivo}`)
    }
    // Uno stato che il parser rifiuta e' indistinguibile, per l'utente, da un
    // file corrotto: in entrambi i casi il suo autopilota non c'e' piu'.
    if (autopilota === undefined) mettiDaParte(percorso)
    return autopilota
  }

  const percorsoDecisioniDi = (id: string): string => join(cartella, `${validaId(id)}.decisioni.jsonl`)

  /**
   * Per autopilota: quante decisioni sono nel jsonl e le chiavi delle ultime
   * `RICORDATE`, per non rimetterci quelle che una fotografia vecchia
   * (letta prima dell'ultimo accorciamento) porta ancora in testa.
   */
  const RICORDATE = 2 * DECISIONI_SOGLIA
  const archivioDecisioni = new Map<string, { n: number; chiavi: string[]; viste: Set<string> }>()
  const vecchieLette = new Map<string, { size: number; mtimeMs: number; decisioni: Decisione[] }>()
  const chiaveDecisione = (d: Decisione): string => `${d.quando}|${d.cosa}`

  const statoArchivio = (id: string): { n: number; chiavi: string[]; viste: Set<string> } => {
    let s = archivioDecisioni.get(id)
    if (s === undefined) {
      // Una volta per autopilota e per vita del servizio: il jsonl si legge solo qui.
      const tutte = existsSync(percorsoDecisioniDi(id)) ? leggiJsonl(percorsoDecisioniDi(id)) : []
      const chiavi = tutte.slice(-RICORDATE).map(chiaveDecisione)
      s = { n: tutte.length, chiavi, viste: new Set(chiavi) }
      archivioDecisioni.set(id, s)
    }
    return s
  }

  /** Le decisioni da tenere nel file, e quante ne stanno nel jsonl dopo questa scrittura. */
  const accorcia = (a: Autopilota): { decisioni: Decisione[]; archiviate: number } => {
    const s = statoArchivio(a.id)
    if (a.decisioni.length <= DECISIONI_SOGLIA) return { decisioni: a.decisioni, archiviate: s.n }
    const taglio = a.decisioni.length - DECISIONI_TENUTE
    const nuove = a.decisioni.slice(0, taglio).filter((d) => !s.viste.has(chiaveDecisione(d)))
    if (nuove.length > 0) {
      try {
        appendFileSync(percorsoDecisioniDi(a.id), nuove.map((d) => `${JSON.stringify(d)}\n`).join(''), 'utf8')
      } catch (err) {
        // Meglio un file lungo che un diario perso: si riprova alla prossima scrittura.
        console.error(`[autopilota] decisioni vecchie di ${a.id} non archiviate:`, err)
        return { decisioni: a.decisioni, archiviate: s.n }
      }
      s.n += nuove.length
      for (const d of nuove) { const k = chiaveDecisione(d); s.chiavi.push(k); s.viste.add(k) }
      if (s.chiavi.length > RICORDATE) for (const k of s.chiavi.splice(0, s.chiavi.length - RICORDATE)) s.viste.delete(k)
    }
    return { decisioni: a.decisioni.slice(taglio), archiviate: s.n }
  }

  return {
    cartella,

    elenca() {
      const trovati: Autopilota[] = []
      const vistiOra = new Set<string>()
      for (const nome of readdirSync(cartella)) {
        // Solo i file che abbiamo scritto noi: accanto possono esserci i
        // .illeggibile messi da parte, e non vanno riletti a ogni giro.
        if (!nome.endsWith('.json') || FILE_DEL_SERVIZIO.has(nome)) continue
        const percorso = join(cartella, nome)
        vistiOra.add(percorso)
        let st
        try {
          st = statSync(percorso)
        } catch {
          // Sparito fra il readdir e lo stat: lo si salta, la cache lo perde sotto.
          continue
        }
        const voce = cache.get(percorso)
        if (voce !== undefined && voce.mtimeMs === st.mtimeMs && voce.size === st.size) {
          trovati.push(voce.auto)
          continue
        }
        const a = leggiFile(percorso)
        if (a !== undefined) {
          cache.set(percorso, { mtimeMs: st.mtimeMs, size: st.size, auto: a })
          trovati.push(a)
        } else {
          // File illeggibile (già messo da parte da leggiFile): via dalla cache.
          cache.delete(percorso)
        }
      }
      // I file spariti (eliminati, o rinominati in .illeggibile) escono dalla cache,
      // o crescerebbe per tutta la vita del servizio.
      for (const p of cache.keys()) if (!vistiOra.has(p)) cache.delete(p)
      return trovati
    },

    leggi(id) {
      // 0.85.2: con la stessa cache dell'elenco. Lo chiede ogni hook di ogni
      // chat (PreToolUse, a ogni strumento): rileggeva e ri-parsava il file
      // intero ogni volta, anche identico.
      const percorso = percorsoDi(id)
      let st
      try {
        st = statSync(percorso)
      } catch {
        cache.delete(percorso)
        return undefined
      }
      const voce = cache.get(percorso)
      if (voce !== undefined && voce.mtimeMs === st.mtimeMs && voce.size === st.size) return voce.auto
      const a = leggiFile(percorso)
      if (a !== undefined) cache.set(percorso, { mtimeMs: st.mtimeMs, size: st.size, auto: a })
      else cache.delete(percorso)
      return a
    },

    scrivi(a) {
      // Lo stato di un autopilota cambia a ogni giro di lavoro e si scrive
      // ogni volta: e' cio' che permette di riprenderlo dopo un riavvio, e una
      // scrittura interrotta non deve lasciare un troncone al posto suo.
      const percorso = percorsoDi(a.id)
      const { decisioni, archiviate } = accorcia(a)
      // Il conto delle archiviate è dell'archivio: quello che arriva può venire da una fotografia vecchia.
      const { decisioniArchiviate: _vecchio, ...resto } = a
      let testo: string
      try {
        // Senza rientri (0.85.2): un terzo dei byte, e nessuno lo legge a mano.
        testo = JSON.stringify({ ...resto, decisioni, ...(archiviate > 0 ? { decisioniArchiviate: archiviate } : {}), versione: VERSIONE_AUTOPILOTA })
      } catch (err) {
        console.error(`[autopilota] salvataggio in ${percorso} fallito:`, err)
        return
      }
      // La propria scrittura invalida la cache: la prossima lettura è dal disco.
      cache.delete(percorso)
      scriviAtomico(percorso, testo, 'autopilota')
    },

    elimina(id) {
      const percorso = percorsoDi(id)
      cache.delete(percorso)
      archivioDecisioni.delete(id)
      for (const p of [percorso, percorsoDecisioniDi(id)]) {
        try {
          if (existsSync(p)) unlinkSync(p)
        } catch (err) {
          console.error(`[autopilota] eliminazione di ${p} fallita:`, err)
        }
      }
    },

    decisioniVecchie(id) {
      const p = percorsoDecisioniDi(id)
      let st
      try { st = statSync(p) } catch { return [] }
      const voce = vecchieLette.get(id)
      if (voce !== undefined && voce.size === st.size && voce.mtimeMs === st.mtimeMs) return voce.decisioni
      const decisioni = leggiJsonl(p)
      vecchieLette.set(id, { size: st.size, mtimeMs: st.mtimeMs, decisioni })
      return decisioni
    }
  }
}
