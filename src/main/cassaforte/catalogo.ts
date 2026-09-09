import type { Manifesto } from './incrementale'
import { prefissoDi } from './incrementale'
import type { Archivio as ArchivioWorkspace } from '@shared/workspace'
import type { RegistroProgetti, ProgettoDrive } from '../progetti/registro'
import { normalizzaPercorso } from '../progetti/registro'

/**
 * Il catalogo del Drive: cosa c'e' lassu', raggruppato per progetto, e come
 * sta rispetto a questo PC.
 *
 * ## Perche'
 *
 * Nicholas (2026-09-09): «non c'e' una vera sezione dove io posso navigare
 * sui progetti presenti nel Drive e importarli o gestirli da questo PC».
 * «Fondi con il Drive» e' un motore di sincronizzazione con sopra un piano da
 * tecnico; qui invece c'e' un magazzino da sfogliare: per ogni progetto la
 * cartella, da dove viene, quante chat, quando e' stato toccato, e per ogni
 * chat il nome vero e lo stato — gia' qui, indietro, solo sul Drive, solo qui.
 *
 * Puro: prende in mano il manifesto del Drive, i file di qui, i workspace di
 * qua e di la', l'indice delle conversazioni e i registri dei progetti, e
 * restituisce il catalogo. Si prova senza Drive.
 */

export type StatoVoce = 'uguale' | 'indietro' | 'avanti' | 'soloDrive' | 'soloQui'

export type ChatCatalogo = {
  sessione: string
  percorso: string
  titolo: string
  quando?: string
  messaggi?: number
  /** Il workspace in cui sta, qui o sul Drive. */
  workspace?: string
  stato: StatoVoce
  /** Quanto pesa sul Drive (o qui, se e' solo qui). */
  byte?: number
  /**
   * La stessa conversazione sta gia' qui, ma sotto un'altra cartella.
   *
   * Sul Drive una chat vive sotto la cartella del PC che l'ha salvata, e la
   * stessa conversazione puo' starci due volte (una per PC). Se qui c'e' gia',
   * anche sotto un'altra cartella, non e' «solo sul Drive» e non si riporta.
   */
  altroveQui?: string
}

export type FileProgettoCatalogo = { percorso: string; stato: StatoVoce }

export type ProgettoCatalogo = {
  /** L'id del registro se e' un progetto sul Drive, altrimenti la cartella d'origine. */
  chiave: string
  nome: string
  /** Dove lavorano le sue chat, sul PC dove sono nate. */
  cartellaOrigine: string
  /** L'id del progetto sul Drive, se la cartella viaggia con le chat. */
  id?: string
  /** Dove sta su questo PC, se ci sta (dal registro, o perche' la cartella esiste). */
  cartellaQui?: string
  /** La cartella esiste su questo PC. */
  quiEsiste: boolean
  /** Ha i file della cartella sul Drive (progetto registrato), non solo le chat. */
  cartellaSulDrive: boolean
  /** E' nato qui (la cartella e' di questo PC) o altrove. */
  origine: 'qui' | 'altrove' | 'entrambi'
  chat: ChatCatalogo[]
  /** I file della cartella sul Drive, riassunti per stato. */
  file: { totale: number; soloDrive: number; indietro: number; avanti: number; soloQui: number; uguali: number }
  conti: { uguali: number; indietro: number; avanti: number; soloDrive: number; soloQui: number }
  /** Il giudizio in una parola, per il colore e il tasto. */
  stato: 'allineato' | 'daPortare' | 'daAggiornare' | 'soloQui' | 'misto'
  ultimoTocco?: string
}

/** Una chat vista dal suo workspace: porta con se' il progetto (cartella) in cui lavora. */
export type ChatDiWorkspace = ChatCatalogo & { progetto: string; chiaveProgetto: string }

/**
 * Un workspace com'e' salvato sul Drive: le sue chat, i progetti che tocca,
 * quante chat mancano qui. «Porta qui il workspace» scarica quelle chat con
 * le cartelle che servono e ricrea il workspace qui, con dentro le chat.
 */
export type WorkspaceCatalogo = {
  nome: string
  /** Esiste gia' un workspace con questo nome su questo PC. */
  quiEsiste: boolean
  chat: ChatDiWorkspace[]
  /** Le chiavi dei progetti (cartelle) in cui lavorano le sue chat. */
  progetti: string[]
  daPortare: number
  quiUguali: number
}

export type Catalogo = {
  progetti: ProgettoCatalogo[]
  /** I workspace salvati sul Drive, con le loro chat. */
  workspace: WorkspaceCatalogo[]
  totali: { progetti: number; chat: number; daPortare: number; daAggiornare: number; soloQui: number; uguali: number }
  /** I workspace che esistono solo sul Drive, con quante chat. */
  workspaceSoloDrive: { nome: string; chat: number }[]
  letto: string
}

export type TitoloIndice = { titolo?: string; cwd?: string; quando?: string; messaggi?: number }
type Firma = { size: number; mtime: number }

function uuidDi(percorso: string): string {
  const nome = percorso.slice(percorso.lastIndexOf('/') + 1)
  return nome.endsWith('.jsonl') ? nome.slice(0, -'.jsonl'.length) : nome
}

function slugDi(percorso: string): string {
  const parti = percorso.split('/')
  return parti.length >= 3 ? (parti[1] ?? '') : ''
}

/** Dal nome della cartella di Claude Code (`E--Users-nikof-Documents-SierraDeck`) al percorso. */
export function cartellaDaSlug(slug: string): string {
  const m = /^([A-Za-z])--(.*)$/.exec(slug)
  if (m === null) return slug
  return `${m[1]}:\\${(m[2] ?? '').split('-').join('\\')}`
}

/** Lo stato di un file che sta qui e/o sul Drive. Tolleranza sulla data come nella sincronia. */
export function statoDi(pc: Firma | undefined, drive: Firma | undefined): StatoVoce {
  if (pc === undefined && drive === undefined) return 'uguale'
  if (pc === undefined) return 'soloDrive'
  if (drive === undefined) return 'soloQui'
  if (pc.size === drive.size && Math.abs(pc.mtime - drive.mtime) <= 1.5) return 'uguale'
  return drive.mtime > pc.mtime ? 'indietro' : 'avanti'
}

function titoliDeiWorkspace(archivio: ArchivioWorkspace | undefined): Map<string, { titolo: string; workspace: string }> {
  const fuori = new Map<string, { titolo: string; workspace: string }>()
  if (archivio === undefined) return fuori
  for (const w of archivio.workspace) {
    for (const l of Object.values(w.perSlot)) {
      for (const p of l.panes) if (!fuori.has(p.sessionUuid)) fuori.set(p.sessionUuid, { titolo: p.title, workspace: w.nome })
    }
  }
  return fuori
}

function cwdDeiWorkspace(archivio: ArchivioWorkspace | undefined): Map<string, string> {
  const fuori = new Map<string, string>()
  if (archivio === undefined) return fuori
  for (const w of archivio.workspace) {
    for (const l of Object.values(w.perSlot)) {
      for (const p of l.panes) if (!fuori.has(p.sessionUuid)) fuori.set(p.sessionUuid, p.cwd)
    }
  }
  return fuori
}

function staDentro(cwd: string, radice: string): boolean {
  const c = normalizzaPercorso(cwd)
  const r = normalizzaPercorso(radice)
  return c === r || c.startsWith(`${r}\\`)
}

/** Il progetto del registro in cui sta una cartella, guardando i percorsi di tutti i PC e le origini. */
function progettoDi(reg: RegistroProgetti, cwd: string): ProgettoDrive | undefined {
  return reg.progetti.find((p) =>
    Object.values(p.percorsi).some((r) => staDentro(cwd, r)) || (p.origini ?? []).some((r) => staDentro(cwd, r))
  )
}

function nomeDaCartella(cwd: string): string {
  const pulita = cwd.replace(/[\\/]+$/, '')
  const ultimo = pulita.split(/[\\/]/).pop() ?? ''
  return ultimo === '' ? cwd : ultimo
}

export function costruisciCatalogo(p: {
  manifestoDrive: Manifesto
  firmaPc: Map<string, Firma>
  archivioPc?: ArchivioWorkspace
  archivioDrive?: ArchivioWorkspace
  titoliIndice?: Map<string, TitoloIndice>
  registroPc: RegistroProgetti
  registroDrive: RegistroProgetti
  pcId: string
  cartellaEsiste: (percorso: string) => boolean
  adesso?: string
}): Catalogo {
  const drive = new Map<string, Firma>()
  for (const [percorso, v] of Object.entries(p.manifestoDrive.file)) drive.set(percorso, { size: v.size, mtime: v.mtime })
  const percorsi = new Set<string>([...p.firmaPc.keys(), ...drive.keys()])
  const titoliPc = titoliDeiWorkspace(p.archivioPc)
  const titoliDrive = titoliDeiWorkspace(p.archivioDrive)
  const cwdPc = cwdDeiWorkspace(p.archivioPc)
  const cwdDrive = cwdDeiWorkspace(p.archivioDrive)
  // Il registro fuso: id → progetto, con i percorsi di tutti i PC.
  const perId = new Map<string, ProgettoDrive>()
  for (const x of [...p.registroPc.progetti, ...p.registroDrive.progetti]) {
    const gia = perId.get(x.id)
    perId.set(x.id, gia === undefined ? x : {
      ...gia,
      percorsi: { ...x.percorsi, ...gia.percorsi },
      ...(gia.origini !== undefined || x.origini !== undefined ? { origini: [...new Set([...(gia.origini ?? []), ...(x.origini ?? [])])] } : {})
    })
  }
  const registro: RegistroProgetti = { versione: 1, progetti: [...perId.values()] }

  // Le chat, raggruppate per cartella d'origine.
  const gruppi = new Map<string, ProgettoCatalogo>()
  const gruppoPer = (cartella: string, reg: ProgettoDrive | undefined): ProgettoCatalogo => {
    const chiave = reg?.id ?? normalizzaPercorso(cartella)
    let g = gruppi.get(chiave)
    if (g !== undefined) return g
    const cartellaQui = reg?.percorsi[p.pcId] ?? (p.cartellaEsiste(cartella) ? cartella : undefined)
    g = {
      chiave,
      nome: reg?.nome ?? nomeDaCartella(cartella),
      cartellaOrigine: reg !== undefined ? (Object.values(reg.percorsi)[0] ?? cartella) : cartella,
      ...(reg !== undefined ? { id: reg.id } : {}),
      ...(cartellaQui !== undefined ? { cartellaQui } : {}),
      quiEsiste: cartellaQui !== undefined && p.cartellaEsiste(cartellaQui),
      cartellaSulDrive: false,
      origine: 'altrove',
      chat: [],
      file: { totale: 0, soloDrive: 0, indietro: 0, avanti: 0, soloQui: 0, uguali: 0 },
      conti: { uguali: 0, indietro: 0, avanti: 0, soloDrive: 0, soloQui: 0 },
      stato: 'allineato'
    }
    gruppi.set(chiave, g)
    return g
  }

  for (const percorso of [...percorsi].sort()) {
    const prefisso = prefissoDi(percorso)
    const pc = p.firmaPc.get(percorso)
    const d = drive.get(percorso)
    if (prefisso === 'chat') {
      const uuid = uuidDi(percorso)
      const indice = p.titoliIndice?.get(uuid)
      const noto = titoliPc.get(uuid) ?? titoliDrive.get(uuid)
      const cartella = indice?.cwd ?? cwdPc.get(uuid) ?? cwdDrive.get(uuid) ?? cartellaDaSlug(slugDi(percorso))
      const reg = progettoDi(registro, cartella)
      const g = gruppoPer(cartella, reg)
      const quandoMs = Math.max(pc?.mtime ?? 0, d?.mtime ?? 0)
      const quando = indice?.quando ?? (quandoMs > 0 ? new Date(quandoMs).toISOString() : undefined)
      const titolo = (indice?.titolo ?? '').trim() !== '' ? (indice?.titolo as string).trim()
        : noto !== undefined && noto.titolo.trim() !== '' ? noto.titolo.trim() : 'Conversazione'
      const stato = statoDi(pc, d)
      g.chat.push({
        sessione: uuid, percorso, titolo, stato,
        ...(quando !== undefined ? { quando } : {}),
        ...(indice?.messaggi !== undefined ? { messaggi: indice.messaggi } : {}),
        ...(noto !== undefined ? { workspace: noto.workspace } : {}),
        ...((d?.size ?? pc?.size) !== undefined ? { byte: (d?.size ?? pc?.size) as number } : {})
      })
      if (quando !== undefined && (g.ultimoTocco === undefined || quando > g.ultimoTocco)) g.ultimoTocco = quando
    } else if (prefisso.startsWith('progetto-')) {
      const id = prefisso.slice('progetto-'.length)
      const reg = perId.get(id)
      const g = gruppoPer(reg?.percorsi[p.pcId] ?? Object.values(reg?.percorsi ?? {})[0] ?? id, reg ?? { id, nome: id, percorsi: {}, aggiuntoIl: '' })
      g.cartellaSulDrive = true
      const stato = statoDi(pc, d)
      g.file.totale += 1
      g.file[stato === 'uguale' ? 'uguali' : stato] += 1
    }
  }

  // La stessa conversazione sotto due cartelle: se qui c'e' gia' da una
  // parte, dall'altra non e' «solo sul Drive».
  const doveStaQui = new Map<string, string>()
  for (const g of gruppi.values()) {
    for (const c of g.chat) if (c.stato !== 'soloDrive' && !doveStaQui.has(c.sessione)) doveStaQui.set(c.sessione, g.cartellaQui ?? g.cartellaOrigine)
  }
  for (const g of gruppi.values()) {
    g.chat = g.chat.map((c) => {
      const altrove = c.stato === 'soloDrive' ? doveStaQui.get(c.sessione) : undefined
      return altrove === undefined ? c : { ...c, stato: 'uguale', altroveQui: altrove }
    })
    for (const c of g.chat) g.conti[c.stato === 'uguale' ? 'uguali' : c.stato] += 1
  }

  // L'origine, detta bene: le chat che stanno qui (file locale) sono «qui»;
  // un gruppo con chat sia qui sia solo sul Drive e' «entrambi».
  for (const g of gruppi.values()) {
    const qui = g.chat.some((c) => c.stato !== 'soloDrive')
    const la = g.chat.some((c) => c.stato === 'soloDrive' || c.stato === 'indietro')
    g.origine = qui && la ? 'entrambi' : qui ? 'qui' : 'altrove'
    const daPortare = g.conti.soloDrive + g.file.soloDrive
    const daAggiornare = g.conti.indietro + g.file.indietro
    const soloQui = g.conti.soloQui + g.conti.avanti + g.file.soloQui + g.file.avanti
    g.stato = daPortare > 0 && daAggiornare === 0 && soloQui === 0 ? 'daPortare'
      : daAggiornare > 0 && daPortare === 0 && soloQui === 0 ? 'daAggiornare'
        : daPortare === 0 && daAggiornare === 0 && soloQui > 0 ? 'soloQui'
          : daPortare === 0 && daAggiornare === 0 && soloQui === 0 ? 'allineato'
            : 'misto'
    g.chat.sort((a, b) => (b.quando ?? '').localeCompare(a.quando ?? ''))
  }

  const progetti = [...gruppi.values()].sort((a, b) => (b.ultimoTocco ?? '').localeCompare(a.ultimoTocco ?? ''))
  const nomiPc = new Set(p.archivioPc?.workspace.map((w) => w.nome) ?? [])
  const workspaceSoloDrive = (p.archivioDrive?.workspace ?? [])
    .filter((w) => !nomiPc.has(w.nome))
    .map((w) => ({ nome: w.nome, chat: Object.values(w.perSlot).reduce((t, l) => t + l.panes.length, 0) }))

  // I workspace del Drive con le loro chat: e' cosi' che si porta qui «quel
  // workspace del portatile» invece di cercare le sue chat progetto per progetto.
  const perUuid = new Map<string, { chat: ChatCatalogo; progetto: ProgettoCatalogo }>()
  for (const g of progetti) for (const c of g.chat) if (!perUuid.has(c.sessione)) perUuid.set(c.sessione, { chat: c, progetto: g })
  const workspace: WorkspaceCatalogo[] = (p.archivioDrive?.workspace ?? []).map((w) => {
    const uuids = [...new Set(Object.values(w.perSlot).flatMap((l) => l.panes.map((x) => x.sessionUuid)))]
    const voci = uuids.map((u) => perUuid.get(u)).filter((v): v is { chat: ChatCatalogo; progetto: ProgettoCatalogo } => v !== undefined)
    const chat: ChatDiWorkspace[] = voci.map((v) => ({ ...v.chat, progetto: v.progetto.nome, chiaveProgetto: v.progetto.chiave }))
    return {
      nome: w.nome,
      quiEsiste: nomiPc.has(w.nome),
      chat,
      progetti: [...new Set(voci.map((v) => v.progetto.chiave))],
      daPortare: chat.filter((c) => c.stato === 'soloDrive' || c.stato === 'indietro').length,
      quiUguali: chat.filter((c) => c.stato === 'uguale' || c.stato === 'avanti' || c.stato === 'soloQui').length
    }
  }).sort((a, b) => b.daPortare - a.daPortare || a.nome.localeCompare(b.nome))

  const totali = {
    progetti: progetti.length,
    chat: progetti.reduce((t, g) => t + g.chat.length, 0),
    daPortare: progetti.reduce((t, g) => t + g.conti.soloDrive, 0),
    daAggiornare: progetti.reduce((t, g) => t + g.conti.indietro, 0),
    soloQui: progetti.reduce((t, g) => t + g.conti.soloQui + g.conti.avanti, 0),
    uguali: progetti.reduce((t, g) => t + g.conti.uguali, 0)
  }
  return { progetti, workspace, totali, workspaceSoloDrive, letto: p.adesso ?? new Date().toISOString() }
}

/**
 * Le scelte di fusione per portare qui un progetto: le sue chat che mancano o
 * sono indietro, e i file della sua cartella se viaggia con lui.
 */
export function scelteDiPortaQui(g: ProgettoCatalogo, manifestoDrive: Manifesto, firmaPc: Map<string, Firma>, soloChat?: Set<string>): Record<string, 'scarica'> {
  const voci: Record<string, 'scarica'> = {}
  for (const c of g.chat) {
    if (soloChat !== undefined && !soloChat.has(c.sessione)) continue
    if (c.stato === 'soloDrive' || c.stato === 'indietro') voci[c.percorso] = 'scarica'
  }
  if (g.id !== undefined) {
    const prefisso = `progetto-${g.id}`
    for (const [percorso, v] of Object.entries(manifestoDrive.file)) {
      if (prefissoDi(percorso) !== prefisso) continue
      const stato = statoDi(firmaPc.get(percorso), { size: v.size, mtime: v.mtime })
      if (stato === 'soloDrive' || stato === 'indietro') voci[percorso] = 'scarica'
    }
  }
  return voci
}
