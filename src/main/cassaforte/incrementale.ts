import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { cifra, decifra } from './cifratura'
import { firmaRadici, ripristina, type Radice } from './raccolta'
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
function nomeDi(percorso: string): string {
  return `f_${createHash('sha256').update(percorso).digest('hex')}`
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
  const cancellati = Object.keys(deps.manifestoPrec.file).filter((p) => !firma.has(p))

  const nuovo: Manifesto = { versione: 1, creatoIl: deps.adesso, file: { ...deps.manifestoPrec.file } }

  // Niente cambi? Non si tocca nemmeno il manifesto: salvataggio a costo zero.
  if (cambiati.length === 0 && cancellati.length === 0) {
    return { manifesto: deps.manifestoPrec, caricati: 0, cancellati: 0 }
  }

  let fatto = 0
  for (const percorso of cambiati) {
    const f = firma.get(percorso)
    if (f === undefined) { fatto += 1; continue }
    const contenuto = await readFile(f.disco).catch(() => undefined)
    if (contenuto === undefined) { fatto += 1; continue }
    const nome = nomeDi(percorso)
    const blob = await cifra(deps.maestra, contenuto)
    await deps.archivio.carica(nome, blob)
    nuovo.file[percorso] = { nome, size: f.size, mtime: f.mtime }
    fatto += 1
    deps.onProgresso?.({ fase: 'comprimo', fatto, totale: cambiati.length })
  }

  for (const percorso of cancellati) {
    const prec = deps.manifestoPrec.file[percorso]
    if (prec !== undefined) await deps.archivio.cancella(prec.nome)
    delete nuovo.file[percorso]
  }

  await scriviManifesto(deps.archivio, deps.maestra, nuovo)
  return { manifesto: nuovo, caricati: cambiati.length, cancellati: cancellati.length }
}

export async function ripristinaIncrementale(deps: {
  radici: Radice[]
  maestra: Buffer
  archivio: Archivio
  onProgresso?: (p: Progresso) => void
}): Promise<{ trovato: boolean; scritti: number; saltati: string[]; manifesto?: Manifesto; illeggibile?: boolean }> {
  const esito = await leggiManifesto(deps.archivio, deps.maestra)
  if (esito.stato === 'assente') return { trovato: false, scritti: 0, saltati: [] }
  if (esito.stato === 'illeggibile') return { trovato: false, scritti: 0, saltati: [], illeggibile: true }
  const manifesto = esito.manifesto

  const percorsi = Object.keys(manifesto.file)
  const voci: Voce[] = []
  let fatto = 0
  for (const percorso of percorsi) {
    const voce = manifesto.file[percorso]
    if (voce === undefined) continue
    const blob = await deps.archivio.scarica(voce.nome)
    fatto += 1
    deps.onProgresso?.({ fase: 'scarico', fatto, totale: percorsi.length })
    if (blob === undefined) continue
    const chiaro = await decifra(deps.maestra, blob)
    if (chiaro === undefined) continue
    voci.push({ percorso, contenuto: chiaro })
  }

  const { scritti, saltati } = await ripristina(
    voci, deps.radici,
    (f, t) => deps.onProgresso?.({ fase: 'ripristino', fatto: f, totale: t })
  )
  return { trovato: true, scritti, saltati, manifesto }
}
