import { readFile, stat } from 'node:fs/promises'
import type { Archivio as ArchivioDrive } from './archivio'
import { cifra, decifra } from './cifratura'
import { percorsoSicuro, ripristina, type Radice } from './raccolta'
import {
  leggiManifesto, scriviManifesto, nomeDi, prefissoDi, stessaFirma, nomeCopiaConflitto, manifestoVuoto,
  type Manifesto
} from './incrementale'
import { aggiungiPaneA, unaChatUnWorkspace, type Archivio as ArchivioWorkspace, type LayoutSalvato } from '@shared/workspace'
import type { RegistroProgetti, ProgettoDrive } from '../progetti/registro'

/**
 * Fondere un PC con un Drive che ha gia' altre conversazioni.
 *
 * Finora un Drive si **ripristinava** (il Drive vince) o si **salvava** (il PC
 * vince, file per file). Un PC che ha lavorato per conto suo e un Drive che
 * ha le chat di un altro PC non stanno in nessuno dei due casi: si vuole
 * l'**unione**, e si vuole sceglierla — cosa portare su, cosa giu', cosa
 * lasciare com'e'. Voce per voce, con un predefinito sensato.
 *
 * Tutto in due tempi: prima il **piano** (cosa c'e' di qua, di la', in
 * comune, diverso), poi l'**esecuzione** delle scelte. Il piano e' puro:
 * riceve le firme, i manifesti e gli archivi, e non tocca niente.
 */
export type Firma = { size: number; mtime: number }

export type Azione = 'carica' | 'scarica' | 'copia' | 'salta'

export type VoceFusione = {
  /** Il percorso nel manifesto: `chat/<slug>/<uuid>.jsonl`, `progetto-<id>/src/a.ts`, `sierradeck/istantanee.json`. */
  percorso: string
  /** Come la si chiama a una persona. */
  etichetta: string
  /** Un dettaglio in piu' (il workspace, la cartella). */
  sotto?: string
  dove: 'pc' | 'drive' | 'entrambi'
  /** In entrambi, ma non uguali. */
  diverse: boolean
  pc?: Firma
  drive?: Firma
  /** Per le chat: la cartella del progetto, leggibile, per raggrupparle. */
  cartella?: string
  /** Per le chat: l'ultima volta che si e' scritto, ISO. */
  quando?: string
  /** Cosa si farebbe senza dire niente: l'unione, con il piu' completo o il piu' recente a vincere. */
  predefinita: Azione
}

export type ProgettoFusione = {
  id: string
  nome: string
  cartellaPc?: string
  voci: VoceFusione[]
  soloPc: number
  soloDrive: number
  diverse: number
  uguali: number
}

export type WorkspaceFusione = {
  nome: string
  chatPc: number
  chatDrive: number
  dove: 'pc' | 'drive' | 'entrambi'
}

export type PianoFusione = {
  email?: string
  cassaforteDiversa: boolean
  chat: VoceFusione[]
  progetti: ProgettoFusione[]
  assetto: VoceFusione[]
  workspace: WorkspaceFusione[]
  totali: { soloPc: number; soloDrive: number; diverse: number; uguali: number }
}

export type ModoWorkspace = 'unione' | 'pc' | 'drive'

export type ScelteFusione = {
  /** percorso → azione. Una voce assente si salta. */
  voci: Record<string, Azione>
  workspace: { modo: ModoWorkspace; escludi: string[] }
}

export type EsitoFusione = {
  caricati: number
  scaricati: number
  copie: number
  saltati: number
  manifesto: Manifesto
}

const FILE_ASSETTO_FONDIBILI = new Set(['impostazioni.json', 'istantanee.json'])

function uuidDi(percorso: string): string {
  const nome = percorso.slice(percorso.lastIndexOf('/') + 1)
  return nome.endsWith('.jsonl') ? nome.slice(0, -'.jsonl'.length) : nome
}

function slugDi(percorso: string): string {
  const parti = percorso.split('/')
  return parti.length >= 3 ? (parti[1] ?? '') : ''
}

/** Dal nome della cartella di Claude Code (`E--Users-nikof-Documents-SierraDeck`) a qualcosa di leggibile. */
function cartellaDaSlug(slug: string): string {
  const m = /^([A-Za-z])--(.*)$/.exec(slug)
  if (m === null) return slug
  return `${m[1]}:\\${(m[2] ?? '').split('-').join('\\')}`
}

function titoli(archivio: ArchivioWorkspace | undefined): Map<string, { titolo: string; workspace: string }> {
  const fuori = new Map<string, { titolo: string; workspace: string }>()
  if (archivio === undefined) return fuori
  for (const w of archivio.workspace) {
    for (const l of Object.values(w.perSlot)) {
      for (const p of l.panes) {
        if (!fuori.has(p.sessionUuid)) fuori.set(p.sessionUuid, { titolo: p.title, workspace: w.nome })
      }
    }
  }
  return fuori
}

function contaChat(w: { perSlot: Record<string, LayoutSalvato> } | undefined): number {
  if (w === undefined) return 0
  const viste = new Set<string>()
  for (const l of Object.values(w.perSlot)) for (const p of l.panes) viste.add(p.sessionUuid)
  return viste.size
}

function voce(
  percorso: string,
  pc: Firma | undefined,
  drive: Firma | undefined,
  etichetta: string,
  sotto: string | undefined,
  vince: (pc: Firma, drive: Firma) => 'carica' | 'scarica'
): VoceFusione {
  const dove = pc !== undefined && drive !== undefined ? 'entrambi' : pc !== undefined ? 'pc' : 'drive'
  const diverse = dove === 'entrambi' && !stessaFirma(pc, drive)
  const predefinita: Azione =
    dove === 'pc' ? 'carica'
      : dove === 'drive' ? 'scarica'
        : diverse ? vince(pc as Firma, drive as Firma) : 'salta'
  return {
    percorso, etichetta, ...(sotto !== undefined ? { sotto } : {}), dove, diverse,
    ...(pc !== undefined ? { pc } : {}), ...(drive !== undefined ? { drive } : {}), predefinita
  }
}

/** Una chat e' un registro che cresce: la copia piu' lunga e' quella piu' completa. */
const VINCE_PIU_LUNGA = (pc: Firma, drive: Firma): 'carica' | 'scarica' => (pc.size >= drive.size ? 'carica' : 'scarica')
/** Un file di progetto: vince il piu' recente. */
const VINCE_PIU_RECENTE = (pc: Firma, drive: Firma): 'carica' | 'scarica' => (pc.mtime >= drive.mtime ? 'carica' : 'scarica')

/**
 * Il piano: cosa c'e' di qua, di la', in comune, e cosa si farebbe.
 */
/** Cio' che l'indice delle conversazioni sa di una chat: il titolo vero, la cartella, quando. */
export type TitoloIndice = { titolo?: string; cwd?: string; quando?: string; messaggi?: number }

export function pianifica(p: {
  firmaPc: Map<string, Firma>
  manifestoDrive: Manifesto
  archivioPc?: ArchivioWorkspace
  archivioDrive?: ArchivioWorkspace
  /** L'indice delle conversazioni di questo PC: per chiamare le chat col loro nome. */
  titoliIndice?: Map<string, TitoloIndice>
  registroPc: RegistroProgetti
  registroDrive: RegistroProgetti
  pcId: string
  email?: string
  cassaforteDiversa: boolean
}): PianoFusione {
  const drive = new Map<string, Firma>()
  for (const [percorso, v] of Object.entries(p.manifestoDrive.file)) drive.set(percorso, { size: v.size, mtime: v.mtime })
  const percorsi = new Set<string>([...p.firmaPc.keys(), ...drive.keys()])
  const titoliPc = titoli(p.archivioPc)
  const titoliDrive = titoli(p.archivioDrive)

  const chat: VoceFusione[] = []
  const assetto: VoceFusione[] = []
  const perProgetto = new Map<string, VoceFusione[]>()
  for (const percorso of [...percorsi].sort()) {
    const prefisso = prefissoDi(percorso)
    const pc = p.firmaPc.get(percorso)
    const d = drive.get(percorso)
    if (prefisso === 'chat') {
      // Il nome che una persona riconosce: il titolo dell'indice (che legge le
      // trascrizioni), poi quello dei workspace, poi «Conversazione» con la
      // data. Mai il codice: nessuno riconosce una chat da otto lettere a caso.
      const uuid = uuidDi(percorso)
      const indice = p.titoliIndice?.get(uuid)
      const noto = titoliPc.get(uuid) ?? titoliDrive.get(uuid)
      const cartella = indice?.cwd ?? cartellaDaSlug(slugDi(percorso))
      const quandoMs = pc?.mtime ?? d?.mtime
      const quando = indice?.quando ?? (quandoMs !== undefined ? new Date(quandoMs).toISOString() : undefined)
      const titolo = (indice?.titolo ?? '').trim() !== '' ? (indice?.titolo as string).trim()
        : noto !== undefined && noto.titolo.trim() !== '' ? noto.titolo.trim()
          : 'Conversazione'
      const pezzi: string[] = []
      if (indice?.messaggi !== undefined && indice.messaggi > 0) pezzi.push(`${indice.messaggi} messaggi`)
      if (noto !== undefined) pezzi.push(`workspace «${noto.workspace}»`)
      const v = voce(percorso, pc, d, titolo, pezzi.length > 0 ? pezzi.join(' · ') : undefined, VINCE_PIU_LUNGA)
      chat.push({ ...v, cartella, ...(quando !== undefined ? { quando } : {}) })
    } else if (prefisso.startsWith('progetto-')) {
      const id = prefisso.slice('progetto-'.length)
      const rel = percorso.slice(prefisso.length + 1)
      const elenco = perProgetto.get(id) ?? []
      elenco.push(voce(percorso, pc, d, rel, undefined, VINCE_PIU_RECENTE))
      perProgetto.set(id, elenco)
    } else if (prefisso === 'sierradeck') {
      const rel = percorso.slice(prefisso.length + 1)
      if (!FILE_ASSETTO_FONDIBILI.has(rel)) continue
      // L'assetto di questo PC vale piu' di quello del Drive: se ci sono tutti e
      // due si tiene il proprio, e si sceglie apposta se si vuole l'altro.
      const v = voce(percorso, pc, d, rel === 'impostazioni.json' ? 'Impostazioni' : 'Salvataggi (istantanee)', undefined, () => 'carica')
      assetto.push(v.diverse ? { ...v, predefinita: 'salta' } : v)
    }
  }

  const registri = fondiRegistri(p.registroPc, p.registroDrive)
  const progetti: ProgettoFusione[] = []
  const nomi = new Map(registri.progetti.map((x) => [x.id, x]))
  for (const [id, voci] of perProgetto) {
    const reg = nomi.get(id)
    const cartellaPc = reg?.percorsi[p.pcId]
    progetti.push({
      id,
      nome: reg?.nome ?? id,
      ...(cartellaPc !== undefined ? { cartellaPc } : {}),
      voci,
      soloPc: voci.filter((v) => v.dove === 'pc').length,
      soloDrive: voci.filter((v) => v.dove === 'drive').length,
      diverse: voci.filter((v) => v.diverse).length,
      uguali: voci.filter((v) => v.dove === 'entrambi' && !v.diverse).length
    })
  }
  progetti.sort((a, b) => a.nome.localeCompare(b.nome))

  const workspace: WorkspaceFusione[] = []
  const nomiWs = new Set<string>([
    ...(p.archivioPc?.workspace.map((w) => w.nome) ?? []),
    ...(p.archivioDrive?.workspace.map((w) => w.nome) ?? [])
  ])
  for (const nome of nomiWs) {
    const wp = p.archivioPc?.workspace.find((w) => w.nome === nome)
    const wd = p.archivioDrive?.workspace.find((w) => w.nome === nome)
    workspace.push({
      nome, chatPc: contaChat(wp), chatDrive: contaChat(wd),
      dove: wp !== undefined && wd !== undefined ? 'entrambi' : wp !== undefined ? 'pc' : 'drive'
    })
  }

  const tutte = [...chat, ...assetto, ...progetti.flatMap((x) => x.voci)]
  return {
    ...(p.email !== undefined ? { email: p.email } : {}),
    cassaforteDiversa: p.cassaforteDiversa,
    chat, progetti, assetto, workspace,
    totali: {
      soloPc: tutte.filter((v) => v.dove === 'pc').length,
      soloDrive: tutte.filter((v) => v.dove === 'drive').length,
      diverse: tutte.filter((v) => v.diverse).length,
      uguali: tutte.filter((v) => v.dove === 'entrambi' && !v.diverse).length
    }
  }
}

/** Le scelte che il piano farebbe da solo: l'unione. */
export function sceltePredefinite(piano: PianoFusione): ScelteFusione {
  const voci: Record<string, Azione> = {}
  for (const v of [...piano.chat, ...piano.assetto, ...piano.progetti.flatMap((x) => x.voci)]) {
    if (v.predefinita !== 'salta') voci[v.percorso] = v.predefinita
  }
  return { voci, workspace: { modo: 'unione', escludi: [] } }
}

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
  escludi: string[] = []
): ArchivioWorkspace | undefined {
  if (modo === 'pc') return pc ?? drive
  if (modo === 'drive') return drive ?? pc
  if (pc === undefined) return drive
  if (drive === undefined) return pc
  const fuori = new Set(escludi)
  const nomi = [...pc.workspace.map((w) => w.nome), ...drive.workspace.filter((w) => !pc.workspace.some((x) => x.nome === w.nome)).map((w) => w.nome)]
  const workspace = nomi.flatMap((nome) => {
    const wp = pc.workspace.find((w) => w.nome === nome)
    const wd = drive.workspace.find((w) => w.nome === nome)
    if (fuori.has(nome)) return wp !== undefined ? [wp] : []
    if (wp === undefined) return wd !== undefined ? [wd] : []
    if (wd === undefined) return [wp]
    const perSlot: Record<string, LayoutSalvato> = { ...wp.perSlot }
    for (const [slot, l] of Object.entries(wd.perSlot)) {
      let unito: LayoutSalvato = perSlot[slot] ?? { root: undefined, panes: [] }
      for (const pane of l.panes) unito = aggiungiPaneA(unito, pane)
      perSlot[slot] = unito
    }
    return [{ nome, perSlot }]
  })
  return {
    ...pc,
    attivo: pc.attivo !== '' ? pc.attivo : drive.attivo,
    workspace: unaChatUnWorkspace(workspace, pc.attivo)
  }
}

/** L'unione di due registri dei progetti: per id, con i percorsi di tutti i PC. */
export function fondiRegistri(a: RegistroProgetti, b: RegistroProgetti): RegistroProgetti {
  const perId = new Map<string, ProgettoDrive>()
  for (const p of [...a.progetti, ...b.progetti]) {
    const gia = perId.get(p.id)
    perId.set(p.id, gia === undefined ? p : { ...gia, percorsi: { ...p.percorsi, ...gia.percorsi } })
  }
  return { versione: 1, progetti: [...perId.values()] }
}

function discoDi(radici: Map<string, Radice>, percorso: string): string | undefined {
  const r = radici.get(prefissoDi(percorso))
  if (r === undefined) return undefined
  return percorsoSicuro(r.cartella, percorso.slice(prefissoDi(percorso).length + 1))
}

/**
 * Esegue le scelte: carica, scarica, copia. Parte dal manifesto del Drive e
 * ci applica solo quello che si e' scelto; il resto del Drive resta com'e'.
 */
export async function eseguiFusione(deps: {
  maestra: Buffer
  archivio: ArchivioDrive
  radici: Radice[]
  scelte: ScelteFusione
  pcNome: string
  adesso: string
  onProgresso?: (fatto: number, totale: number) => void
}): Promise<EsitoFusione> {
  const esito = await leggiManifesto(deps.archivio, deps.maestra)
  if (esito.stato === 'illeggibile') throw new Error('Il manifesto sul Drive non si apre con questa chiave.')
  const base = esito.stato === 'ok' ? esito.manifesto : manifestoVuoto()
  const nuovo: Manifesto = { versione: 1, creatoIl: deps.adesso, file: { ...base.file } }
  const perPrefisso = new Map(deps.radici.map((r) => [r.prefisso, r]))
  const voci = Object.entries(deps.scelte.voci).filter(([, a]) => a !== 'salta')
  let caricati = 0
  let scaricati = 0
  let copie = 0
  let saltati = 0
  let fatto = 0

  const carica = async (percorso: string, contenuto: Buffer, firma: Firma): Promise<void> => {
    const nome = nomeDi(percorso)
    await deps.archivio.carica(nome, await cifra(deps.maestra, contenuto))
    nuovo.file[percorso] = { nome, size: firma.size, mtime: firma.mtime }
  }
  const leggiLocale = async (percorso: string): Promise<{ contenuto: Buffer; firma: Firma } | undefined> => {
    const disco = discoDi(perPrefisso, percorso)
    if (disco === undefined) return undefined
    try {
      const [contenuto, s] = await Promise.all([readFile(disco), stat(disco)])
      return { contenuto, firma: { size: s.size, mtime: Math.round(s.mtimeMs) } }
    } catch {
      return undefined
    }
  }
  const scaricaChiaro = async (percorso: string): Promise<{ contenuto: Buffer; mtime: number } | undefined> => {
    const v = base.file[percorso]
    if (v === undefined) return undefined
    const blob = await deps.archivio.scarica(v.nome)
    if (blob === undefined) return undefined
    const chiaro = await decifra(deps.maestra, blob)
    return chiaro === undefined ? undefined : { contenuto: chiaro, mtime: v.mtime }
  }

  for (const [percorso, azione] of voci) {
    fatto += 1
    deps.onProgresso?.(fatto, voci.length)
    if (azione === 'carica') {
      const mio = await leggiLocale(percorso)
      if (mio === undefined) { saltati += 1; continue }
      await carica(percorso, mio.contenuto, mio.firma)
      caricati += 1
    } else if (azione === 'scarica') {
      const loro = await scaricaChiaro(percorso)
      if (loro === undefined) { saltati += 1; continue }
      const { scritti } = await ripristina([{ percorso, contenuto: loro.contenuto, mtime: loro.mtime }], deps.radici)
      if (scritti === 0) { saltati += 1; continue }
      scaricati += 1
    } else if (azione === 'copia') {
      // Tutte e due: la mia diventa il file, quella del Drive resta accanto
      // come copia, e la copia sale anche lei.
      const loro = await scaricaChiaro(percorso)
      const mio = await leggiLocale(percorso)
      if (mio === undefined) { saltati += 1; continue }
      if (loro !== undefined) {
        const copia = nomeCopiaConflitto(percorso, 'drive', deps.adesso)
        await ripristina([{ percorso: copia, contenuto: loro.contenuto, mtime: loro.mtime }], deps.radici)
        await carica(copia, loro.contenuto, { size: loro.contenuto.length, mtime: loro.mtime })
        copie += 1
      }
      await carica(percorso, mio.contenuto, mio.firma)
      caricati += 1
    }
  }

  await scriviManifesto(deps.archivio, deps.maestra, nuovo)
  return { caricati, scaricati, copie, saltati, manifesto: nuovo }
}

/** Il file di un archivio (o registro) letto dal Drive e decifrato, se c'e'. */
export async function leggiJsonDalDrive(
  archivio: ArchivioDrive, maestra: Buffer, manifesto: Manifesto, percorso: string
): Promise<unknown> {
  const v = manifesto.file[percorso]
  if (v === undefined) return undefined
  const blob = await archivio.scarica(v.nome)
  if (blob === undefined) return undefined
  const chiaro = await decifra(maestra, blob)
  if (chiaro === undefined) return undefined
  try { return JSON.parse(chiaro.toString('utf8')) } catch { return undefined }
}

/** Dove sta sul disco un file di una radice: per chi deve rileggere cio' che ha appena scritto. */
export function discoDiPercorso(radici: Radice[], percorso: string): string | undefined {
  return discoDi(new Map(radici.map((r) => [r.prefisso, r])), percorso)
}
