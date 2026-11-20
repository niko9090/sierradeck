import { spacchetta } from './compressione'
import { riparaArchivio } from '@shared/workspace-riparazioni'
import type { Archivio as ArchivioDrive } from './archivio'
import { decifra } from './cifratura'
import type { Manifesto } from './incrementale'
import { aggiungiPaneA, chiaveNomeWorkspace, unaChatUnWorkspace, type Archivio as ArchivioWorkspace, type LayoutSalvato } from '@shared/workspace'

/**
 * Le unioni che salgono sul Drive al posto del file di un PC (0.25.2, 0.86.2):
 * la lista dei workspace di tutti i PC. Erano in `fusione.ts` con «Fondi con il
 * Drive», tolto con il modello «un progetto, un PC» (0.88.0).
 */

export type ModoWorkspace = 'unione' | 'pc' | 'drive'

/**
 * L'unione di due archivi dei workspace.
 *
 * Per nome: chi c'e' in uno solo entra com'e'; chi c'e' in tutti e due si
 * fonde slot per slot, chat per chat (per conversazione, senza doppioni).
 * L'ordine e' quello del PC, con i workspace del Drive in coda; l'attivo e
 * le finestre restano quelli del PC: sono cose di qui.
 */
export function fondiArchivi(
  pc: ArchivioWorkspace | undefined,
  drive: ArchivioWorkspace | undefined,
  modo: ModoWorkspace,
  escludi: string[] = [],
  /**
   * `perDrive`: il risultato e' la copia che **sale sul Drive**. Allora i
   * workspace con una lapide (`tolti`) restano fuori anche se questo PC li
   * ha ancora, e le lapidi si conservano. Senza, il risultato e' per un PC:
   * le lapidi non entrano nel suo file e un workspace che il PC ha resta suo
   * — una lapide toglie dal Drive, mai da un PC.
   */
  opzioni: { perDrive?: boolean; io?: string } = {}
): ArchivioWorkspace | undefined {
  const fuso = fondiArchiviGrezzo(pc, drive, modo, escludi, opzioni)
  // Per un PC (0.65.1): un riquadro che dal Drive arriva a guardare questo
  // stesso PC torna locale. Era il «visitafacile» del 12/10: ogni PC diceva
  // che la chat era «dell'altro», e l'altro era sé stesso.
  if (fuso === undefined || opzioni.perDrive === true || opzioni.io === undefined) return fuso
  const io = opzioni.io
  return riparaArchivio(fuso, io, { haChat: () => true, casaAltrove: () => undefined }).archivio as ArchivioWorkspace
}

function fondiArchiviGrezzo(
  pc: ArchivioWorkspace | undefined,
  drive: ArchivioWorkspace | undefined,
  modo: ModoWorkspace,
  escludi: string[],
  opzioni: { perDrive?: boolean }
): ArchivioWorkspace | undefined {
  const perDrive = opzioni.perDrive === true
  const tolti = drive?.tolti ?? {}
  const conLapide = (nome: string): boolean => Object.prototype.hasOwnProperty.call(tolti, nome)
  const senzaLapidi = (a: ArchivioWorkspace | undefined): ArchivioWorkspace | undefined => {
    // Lo stesso oggetto quando non c'e' niente da togliere: chi confronta per
    // identita' deve poter dire «non si e' mosso niente».
    if (a === undefined || a.tolti === undefined) return a
    const { tolti: _t, ...resto } = a
    return resto
  }
  if (modo === 'pc') return perDrive ? (pc ?? drive) : senzaLapidi(pc ?? drive)
  if (modo === 'drive') {
    if (perDrive) return drive ?? pc
    // Per un PC «tieni quelli del Drive» vale per i workspace che ci sono da
    // tutte e due le parti: quelli che ha solo questo PC restano (0.65.1). La
    // lista di un PC non si sostituisce mai con quella di un altro.
    if (pc === undefined || drive === undefined) return senzaLapidi(drive ?? pc)
    const soloQui = pc.workspace.filter((w) => !drive.workspace.some((x) => chiaveNomeWorkspace(x.nome) === chiaveNomeWorkspace(w.nome)))
    const d = senzaLapidi(drive) as ArchivioWorkspace
    return { ...d, workspace: [...d.workspace, ...soloQui] }
  }
  if (pc === undefined) return perDrive ? drive : senzaLapidi(drive)
  if (drive === undefined) return perDrive ? pc : senzaLapidi(pc)
  const fuori = new Set(escludi)
  // Lo stesso workspace e' lo stesso nome senza spazi e maiuscole di troppo:
  // «Lavoro» e «lavoro » non diventano due voci.
  const k = chiaveNomeWorkspace
  const chiaviPc = pc.workspace.map((w) => k(w.nome))
  const chiavi = [...new Set([...chiaviPc, ...drive.workspace.map((w) => k(w.nome))])]
  // Quale ordine vale: quello deciso piu' di recente (a parita', il Drive, che e'
  // uguale per tutti); se nessuno ha mai riordinato, PC e poi coda del Drive.
  const oP = pc.ordine
  const oD = drive.ordine
  const ordine = oP !== undefined && (oD === undefined || oP.quando > oD.quando) ? oP : oD
  const posizione = (chiave: string): number => {
    const i = ordine?.nomi.findIndex((n) => k(n) === chiave) ?? -1
    return i < 0 ? Number.MAX_SAFE_INTEGER : i
  }
  const ordinate = ordine === undefined ? chiavi : chiavi.map((c, i) => ({ c, i })).sort((a, b) => posizione(a.c) - posizione(b.c) || a.i - b.i).map((x) => x.c)
  const lapideNormalizzate = new Set(Object.keys(tolti).map(k))
  const fuoriNormalizzati = new Set([...fuori].map(k))
  const workspace = ordinate.flatMap((chiave) => {
    // Sul Drive un workspace con la lapide non sale, nemmeno da un PC che ce
    // l'ha ancora: e' cio' che rende «Togli dal Drive» definitivo finche'
    // qualcuno non lo rimette.
    if (perDrive && (lapideNormalizzate.has(chiave) || conLapide(chiave))) return []
    const wp = pc.workspace.find((w) => k(w.nome) === chiave)
    const wd = drive.workspace.find((w) => k(w.nome) === chiave)
    if (fuoriNormalizzati.has(chiave)) return wp !== undefined ? [wp] : []
    if (wp === undefined) return wd !== undefined ? [wd] : []
    if (wd === undefined) return [wp]
    // Il nome resta quello gia' sul Drive: e' lo stesso su tutti i PC.
    const nome = wd.nome
    const perSlot: Record<string, LayoutSalvato> = { ...wp.perSlot }
    for (const [slot, l] of Object.entries(wd.perSlot)) {
      let unito: LayoutSalvato = perSlot[slot] ?? { root: undefined, panes: [] }
      for (const pane of l.panes) unito = aggiungiPaneA(unito, pane)
      perSlot[slot] = unito
    }
    return [{ nome, perSlot }]
  })
  const { tolti: _lapidiPc, ...pcSenza } = pc
  const attivoPc = workspace.find((w) => k(w.nome) === k(pc.attivo))?.nome ?? pc.attivo
  return {
    ...pcSenza,
    attivo: pc.attivo !== '' ? attivoPc : drive.attivo,
    workspace: unaChatUnWorkspace(workspace, attivoPc),
    ...(ordine !== undefined ? { ordine } : {}),
    ...(perDrive && Object.keys(tolti).length > 0 ? { tolti } : {})
  }
}

/** Il file di un archivio (o registro) letto dal Drive e decifrato, se c'e'. */
export async function leggiJsonDalDrive(
  archivio: ArchivioDrive, maestra: Buffer, manifesto: Manifesto, percorso: string
): Promise<unknown> {
  const v = manifesto.file[percorso]
  if (v === undefined) return undefined
  const blob = await archivio.scarica(v.nome)
  if (blob === undefined) return undefined
  const chiaro = spacchetta(await decifra(maestra, blob))
  if (chiaro === undefined) return undefined
  try { return JSON.parse(chiaro.toString('utf8')) } catch { return undefined }
}
