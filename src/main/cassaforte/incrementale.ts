import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { cifra, decifra } from './cifratura'
import { cancellaVoci, firmaRadici, percorsoSicuro, ripristina, type Radice } from './raccolta'
import type { Voce } from './pacchetto'
import type { Archivio } from './archivio'
import type { Progresso } from './motore'

/**
 * La sincronizzazione **incrementale**: manda solo ciò che è cambiato.
 *
 * Ogni file da sincronizzare (una trascrizione, un file d'assetto) diventa un
 * file cifrato a sé nell'archivio, con un nome stabile derivato dal suo percorso.
 * Un **manifesto** cifrato tiene l'elenco: percorso → nome del file + firma
 * (dimensione, data). Al salvataggio si confronta la firma attuale con quella
 * dell'ultimo manifesto e si **caricano solo i file nuovi o modificati**, si
 * cancellano quelli spariti, si riscrive il manifesto. Per un utente con
 * migliaia di chat e un paio di GB, un salvataggio passa da minuti a secondi.
 *
 * Niente conflitto a versione unica (non c'è più un blocco solo): l'ultimo che
 * scrive vince, che per l'uso «i miei PC, uno alla volta» è quello che serve. La
 * cifratura resta end-to-end: il nome dei file è un hash del percorso, e il
 * contenuto — manifesto compreso — non si legge senza la chiave.
 */

const NOME_MANIFESTO = 'sierradeck.manifesto'

export type VoceManifesto = { nome: string; size: number; mtime: number }
export type Manifesto = {
  versione: 1
  creatoIl: string
  file: Record<string, VoceManifesto>
}

export function manifestoVuoto(): Manifesto {
  return { versione: 1, creatoIl: '', file: {} }
}

/** Il nome stabile di un file nell'archivio: un hash del suo percorso logico. */
/** Il pezzo prima della prima barra: la radice a cui il file appartiene. */
export function prefissoDi(percorso: string): string {
  const barra = percorso.indexOf('/')
  return barra === -1 ? percorso : percorso.slice(0, barra)
}

function nomeDi(percorso: string): string {
  return `f_${createHash('sha256').update(percorso).digest('hex')}`
}

/** Quanti file lavorare in parallelo: molte piccole chiamate al Drive si fanno
 * a gruppi, o il primo salvataggio (migliaia di file, uno per volta) durerebbe
 * minuti inutili. Sei è un buon compromesso senza infastidire i limiti di Drive. */
const PARALLELI = 6

/** Esegue `fn` su ogni elemento con al massimo `limite` in corso insieme. */
async function conLimite<T>(items: T[], limite: number, fn: (x: T) => Promise<void>): Promise<void> {
  let prossimo = 0
  const lavoratore = async (): Promise<void> => {
    while (prossimo < items.length) {
      const i = prossimo
      prossimo += 1
      await fn(items[i] as T)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, () => lavoratore()))
}

async function scriviManifesto(archivio: Archivio, maestra: Buffer, manifesto: Manifesto): Promise<void> {
  const blob = await cifra(maestra, Buffer.from(JSON.stringify(manifesto), 'utf8'))
  await archivio.carica(NOME_MANIFESTO, blob)
}

type EsitoManifesto =
  | { stato: 'assente' }
  | { stato: 'illeggibile' }
  | { stato: 'ok'; manifesto: Manifesto }

async function leggiManifesto(archivio: Archivio, maestra: Buffer): Promise<EsitoManifesto> {
  const blob = await archivio.scarica(NOME_MANIFESTO)
  if (blob === undefined) return { stato: 'assente' }
  const chiaro = await decifra(maestra, blob)
  if (chiaro === undefined) return { stato: 'illeggibile' }
  try {
    const m = JSON.parse(chiaro.toString('utf8')) as Manifesto
    if (m.versione !== 1 || typeof m.file !== 'object') return { stato: 'illeggibile' }
    return { stato: 'ok', manifesto: m }
  } catch {
    return { stato: 'illeggibile' }
  }
}

export async function salvaIncrementale(deps: {
  radici: Radice[]
  maestra: Buffer
  archivio: Archivio
  /** L'ultimo manifesto salvato da questo PC (la sua idea di cosa c'è sul Drive). */
  manifestoPrec: Manifesto
  adesso: string
  onProgresso?: (p: Progresso) => void
}): Promise<{ manifesto: Manifesto; caricati: number; cancellati: number }> {
  const firma = await firmaRadici(deps.radici)

  const cambiati: string[] = []
  for (const [percorso, f] of firma) {
    const prec = deps.manifestoPrec.file[percorso]
    if (prec === undefined || prec.size !== f.size || prec.mtime !== f.mtime) cambiati.push(percorso)
  }
  // Si cancella dal Drive solo cio' che **questa** macchina ha smesso di avere,
  // cioe' i file sotto un prefisso che qui esiste. Un prefisso che qui non c'e'
  // — il progetto di un altro PC, mai ripristinato su questo — non e' «sparito»:
  // semplicemente non e' nostro, e toccarlo cancellerebbe il lavoro di un
  // altro computer dal salvataggio di tutti.
  const prefissiNostri = new Set(deps.radici.map((r) => r.prefisso))
  const cancellati = Object.keys(deps.manifestoPrec.file)
    .filter((p) => !firma.has(p) && prefissiNostri.has(prefissoDi(p)))

  const nuovo: Manifesto = { versione: 1, creatoIl: deps.adesso, file: { ...deps.manifestoPrec.file } }

  // Niente cambi? Non si tocca nemmeno il manifesto: salvataggio a costo zero.
  if (cambiati.length === 0 && cancellati.length === 0) {
    return { manifesto: deps.manifestoPrec, caricati: 0, cancellati: 0 }
  }

  let fatto = 0
  await conLimite(cambiati, PARALLELI, async (percorso) => {
    const f = firma.get(percorso)
    if (f === undefined) { fatto += 1; return }
    const contenuto = await readFile(f.disco).catch(() => undefined)
    if (contenuto === undefined) { fatto += 1; return }
    const nome = nomeDi(percorso)
    const blob = await cifra(deps.maestra, contenuto)
    await deps.archivio.carica(nome, blob)
    // Mutazione fra due `await`: JS è a thread singolo, non c'è corsa vera.
    nuovo.file[percorso] = { nome, size: f.size, mtime: f.mtime }
    fatto += 1
    deps.onProgresso?.({ fase: 'carico', fatto, totale: cambiati.length, unita: 'file' })
  })

  await conLimite(cancellati, PARALLELI, async (percorso) => {
    const prec = deps.manifestoPrec.file[percorso]
    if (prec !== undefined) await deps.archivio.cancella(prec.nome)
    delete nuovo.file[percorso]
  })

  await scriviManifesto(deps.archivio, deps.maestra, nuovo)
  return { manifesto: nuovo, caricati: cambiati.length, cancellati: cancellati.length }
}

export async function ripristinaIncrementale(deps: {
  radici: Radice[]
  maestra: Buffer
  archivio: Archivio
  onProgresso?: (p: Progresso) => void
  /**
   * Quali prefissi del manifesto ripristinare adesso. Il ripristino va in due
   * tempi: prima l'assetto (che contiene il registro dei progetti), poi i
   * progetti, che senza registro non saprebbero dove andare.
   */
  soloPrefissi?: (prefisso: string) => boolean
  /**
   * Cio' che questo PC sapeva del Drive. Un file uguale nel manifesto di
   * allora e in quello di adesso, e presente sul disco, non si riscarica: e'
   * quello che rende leggero un ripristino ripetuto — e il passaggio di
   * testimone, che ripristina un progetto ogni volta che cambia mano.
   */
  manifestoPrec?: Manifesto
  /** Togliere dal disco i file che il Drive non ha piu' (rispetto a `manifestoPrec`). */
  elimina?: boolean
}): Promise<{
  trovato: boolean; scritti: number; saltati: string[]; manifesto?: Manifesto; illeggibile?: boolean
  invariati: number; eliminati: number
}> {
  const esito = await leggiManifesto(deps.archivio, deps.maestra)
  if (esito.stato === 'assente') return { trovato: false, scritti: 0, saltati: [], invariati: 0, eliminati: 0 }
  if (esito.stato === 'illeggibile') return { trovato: false, scritti: 0, saltati: [], illeggibile: true, invariati: 0, eliminati: 0 }
  const manifesto = esito.manifesto
  const scelto = (p: string): boolean => deps.soloPrefissi === undefined || deps.soloPrefissi(prefissoDi(p))
  const perPrefisso = new Map(deps.radici.map((r) => [r.prefisso, r]))

  let invariati = 0
  const percorsi = Object.keys(manifesto.file).filter(scelto).filter((p) => {
    const prec = deps.manifestoPrec?.file[p]
    const voce = manifesto.file[p]
    if (prec === undefined || voce === undefined) return true
    if (prec.nome !== voce.nome || prec.size !== voce.size || prec.mtime !== voce.mtime) return true
    const r = perPrefisso.get(prefissoDi(p))
    if (r === undefined) return true
    const dest = percorsoSicuro(r.cartella, p.slice(prefissoDi(p).length + 1))
    if (dest === undefined || !existsSync(dest)) return true
    invariati += 1
    return false
  })
  const voci: Voce[] = []
  let fatto = 0
  await conLimite(percorsi, PARALLELI, async (percorso) => {
    const voce = manifesto.file[percorso]
    if (voce === undefined) return
    const blob = await deps.archivio.scarica(voce.nome)
    fatto += 1
    deps.onProgresso?.({ fase: 'scarico', fatto, totale: percorsi.length, unita: 'file' })
    if (blob === undefined) return
    const chiaro = await decifra(deps.maestra, blob)
    if (chiaro === undefined) return
    voci.push({ percorso, contenuto: chiaro })
  })

  const { scritti, saltati } = await ripristina(
    voci, deps.radici,
    (f, t) => deps.onProgresso?.({ fase: 'ripristino', fatto: f, totale: t })
  )
  let eliminati = 0
  if (deps.elimina === true && deps.manifestoPrec !== undefined) {
    const spariti = Object.keys(deps.manifestoPrec.file)
      .filter((p) => manifesto.file[p] === undefined && scelto(p) && perPrefisso.has(prefissoDi(p)))
    eliminati = await cancellaVoci(spariti, deps.radici)
  }
  return { trovato: true, scritti, saltati, manifesto, invariati, eliminati }
}
