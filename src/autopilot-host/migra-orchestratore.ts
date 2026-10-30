import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  idChatNuova, nuovoAutopilota,
  type Autopilota, type ChatAdottata, type ChatGovernata, type MessaggioAdottata, type MessaggioPerLaChat
} from '@shared/autopilota'
import { aggiungi, chiaveWorkspace, type Coda, type EventoCoda, type Modifica } from '@shared/coda-richieste'
import { FILE_DEL_SERVIZIO } from './archivio'

/**
 * **Il passaggio all'autopilota unico** (P4): c'è un solo autopilota per
 * workspace, sempre acceso. Al primo avvio ogni workspace che ha ancora
 * autopiloti di prima passa a lui, da solo e una volta sola:
 *
 * - nasce l'autopilota del workspace, nella cartella degli autopiloti di quel
 *   workspace, con il ramo principale e la regola di pubblicazione che avevano;
 * - le **chat vive** di ogni autopilota di prima diventano specialisti
 *   adottati: con la loro sessione, la loro copia (worktree) e il loro ramo.
 *   Prendono un id nuovo e ricordano quello di prima (`origine`): gli hook che
 *   mandano ancora con l'id vecchio arrivano a lei. I messaggi in coda per loro
 *   le seguono;
 * - le chat adottate (0.78.0) passano a lui, «solo mia» compresa;
 * - gli autopiloti di prima restano sul disco così come sono, segnati fra gli
 *   **assorbiti** del workspace (`orchestratore.json`): non si mostrano più, e
 *   `archiviaVecchiAutopiloti` li sposta nel recupero.
 *
 * I campi che servono solo qui (le richieste, i compiti in coda, l'obiettivo
 * scritto da Nicholas) l'autopilota di oggi non li ha più: si leggono dal
 * file così com'è (`campiVecchiDa`).
 */

/** Le richieste registrate dagli autopiloti di prima (0.85.0), come stanno nel loro file. */
export type RichiestaVecchia = {
  id: string
  quando: string
  testo: string
  titolo: string
  criterio: string
  compiti: string[]
  fattaIl?: string
  versione?: string
  commit?: string
}

/** I campi degli autopiloti di prima che servono al passaggio. */
export type CampiVecchi = {
  obiettivoTuo?: string
  richieste?: RichiestaVecchia[]
  compitiDaFare?: string[]
  ultimaAzioneChat?: string
}

/** Un autopilota di prima: com'è letto dall'archivio, più i campi che servono al passaggio. */
export type Vecchio = Autopilota & CampiVecchi

const testo = (x: unknown): string | undefined => (typeof x === 'string' ? x : undefined)
const testi = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : [])

/** I campi di prima dal JSON grezzo di un autopilota. Tollerante: quello che non si legge resta fuori. */
export function campiVecchi(raw: unknown): CampiVecchi {
  if (typeof raw !== 'object' || raw === null) return {}
  const o = raw as Record<string, unknown>
  const richieste = Array.isArray(o.richieste)
    ? o.richieste.flatMap((v): RichiestaVecchia[] => {
      if (typeof v !== 'object' || v === null) return []
      const r = v as Record<string, unknown>
      const id = testo(r.id)
      const quando = testo(r.quando)
      if (id === undefined || quando === undefined) return []
      const t = testo(r.testo) ?? ''
      return [{
        id, quando, testo: t,
        titolo: testo(r.titolo) ?? t.slice(0, 80),
        criterio: testo(r.criterio) ?? '',
        compiti: testi(r.compiti),
        ...(testo(r.fattaIl) !== undefined ? { fattaIl: testo(r.fattaIl)! } : {}),
        ...(testo(r.versione) !== undefined ? { versione: testo(r.versione)! } : {}),
        ...(testo(r.commit) !== undefined ? { commit: testo(r.commit)! } : {})
      }]
    })
    : []
  return {
    ...(testo(o.obiettivoTuo) !== undefined ? { obiettivoTuo: testo(o.obiettivoTuo)! } : {}),
    ...(richieste.length > 0 ? { richieste } : {}),
    ...(Array.isArray(o.compitiDaFare) ? { compitiDaFare: testi(o.compitiDaFare) } : {}),
    ...(testo(o.ultimaAzioneChat) !== undefined ? { ultimaAzioneChat: testo(o.ultimaAzioneChat)! } : {})
  }
}

/** I campi di prima dal file `<cartella>/<id>.json`; vuoti se il file non si legge. */
export function campiVecchiDa(cartella: string, id: string): CampiVecchi {
  try {
    return campiVecchi(JSON.parse(readFileSync(join(cartella, `${id}.json`), 'utf8')) as unknown)
  } catch {
    return {}
  }
}

export type Adozione = { da: string; chat: string; nuova: string }

export type EsitoPassaggio = {
  unico: Autopilota
  /** Gli id degli autopiloti di prima passati all'unico. */
  assorbiti: string[]
  adottate: Adozione[]
}

/** La chat è viva: non finita, non in chiusura, non conclusa. */
const viva = (c: ChatGovernata): boolean => c.stato !== 'finita' && c.fine === undefined && c.conclusa === undefined && c.nelRecupero === undefined

/** Un autopilota «a chat sola» con la sua chat accesa: la chat è lui. */
const chatSola = (a: Autopilota): boolean => a.chats.length === 0 && a.sessionId !== undefined && (a.stato === 'lavoro' || a.stato === 'attesa')

/** La cartella del workspace: quella dell'autopilota più recente fra quelli non archiviati (o di tutti). */
export function cartellaDelWorkspace(autopiloti: Autopilota[]): string | undefined {
  const ordinati = [...autopiloti].sort((a, b) => b.iniziatoIl.localeCompare(a.iniziatoIl))
  return (ordinati.find((a) => a.archiviato !== true) ?? ordinati[0])?.cwd
}

/** La stessa cartella di progetto: senza badare a barre, maiuscole e barra finale. */
export function stessaCartella(a: string, b: string): boolean {
  const n = (x: string): string => x.replace(/\\/gu, '/').replace(/\/+$/u, '').toLowerCase()
  return n(a) === n(b)
}

export function nomeUnico(ws: string): string {
  const nome = ws.startsWith('cartella:') ? ws.slice('cartella:'.length).split(/[\\/]/u).filter((x) => x !== '').pop() ?? 'workspace' : ws
  return `Autopilota · ${nome}`.slice(0, 60)
}

export const OBIETTIVO_UNICO = 'Portare a termine le richieste di Nicholas nella coda di questo workspace, una per una, con specialisti e criteri verificati.'

/** L'autopilota del workspace, nuovo: senza chat, al lavoro (aspetta i messaggi). */
export function nuovoUnico(p: { id: string; ws: string; cwd: string; adesso: string; base?: Partial<Pick<Autopilota, 'ramoBase' | 'commitBase' | 'pubblicazione' | 'vaSulCloud' | 'consegna' | 'cloud'>> }): Autopilota {
  const a = nuovoAutopilota({
    id: p.id,
    nome: nomeUnico(p.ws),
    obiettivo: OBIETTIVO_UNICO,
    cwd: p.cwd,
    ...(p.ws.startsWith('cartella:') ? {} : { workspace: p.ws }),
    iniziatoIl: p.adesso,
    tettoChat: 4,
    stato: 'lavoro',
    ...(p.base?.pubblicazione !== undefined ? { pubblicazione: p.base.pubblicazione } : {}),
    ...(p.base?.vaSulCloud === true ? { vaSulCloud: true } : {})
  })
  return {
    ...a,
    ...(p.base?.ramoBase !== undefined ? { ramoBase: p.base.ramoBase } : {}),
    ...(p.base?.commitBase !== undefined ? { commitBase: p.base.commitBase } : {}),
    ...(p.base?.consegna !== undefined ? { consegna: p.base.consegna } : {}),
    ...(p.base?.cloud !== undefined ? { cloud: p.base.cloud } : {})
  }
}

/**
 * Il passaggio: l'unico (nuovo, o quello che c'è già) adotta le chat vive e
 * le adottate degli autopiloti di prima del workspace. Le chat di un altro
 * progetto dello stesso workspace non si adottano (il cancello dell'unico
 * unirebbe i loro rami nel repository sbagliato): il loro autopilota passa
 * all'unico lo stesso, e quelle chat restano ferme dove sono.
 */
export function passaAllUnico(p: { ws: string; autopiloti: Autopilota[]; id: string; adesso: string; unico?: Autopilota }): EsitoPassaggio {
  const delWs = p.autopiloti.filter((a) => a.id !== p.unico?.id)
  const cwd = p.unico?.cwd ?? cartellaDelWorkspace(delWs) ?? ''
  const stessa = delWs.filter((a) => stessaCartella(a.cwd, cwd))
  const conBase = [...stessa].sort((a, b) => b.iniziatoIl.localeCompare(a.iniziatoIl)).find((a) => a.ramoBase !== undefined)
  let unico: Autopilota = p.unico ?? nuovoUnico({
    id: p.id, ws: p.ws, cwd, adesso: p.adesso,
    base: {
      ...(conBase?.ramoBase !== undefined ? { ramoBase: conBase.ramoBase } : {}),
      ...(conBase?.commitBase !== undefined ? { commitBase: conBase.commitBase } : {}),
      ...(conBase?.pubblicazione !== undefined ? { pubblicazione: conBase.pubblicazione } : {}),
      ...(conBase?.vaSulCloud === true ? { vaSulCloud: true } : {}),
      ...(conBase?.consegna !== undefined ? { consegna: conBase.consegna } : {}),
      ...(conBase?.cloud !== undefined ? { cloud: conBase.cloud } : {})
    }
  })
  const adottate: Adozione[] = []
  for (const a of [...stessa].sort((x, y) => x.iniziatoIl.localeCompare(y.iniziatoIl)) as Vecchio[]) {
    const nuoveId = new Map<string, string>()
    const nuove: ChatGovernata[] = []
    for (const c of a.chats) {
      if (!viva(c) || unico.chats.some((y) => y.origine?.autopilota === a.id && y.origine.chat === c.id)) continue
      const id = idChatNuova(unico, nuove.length)
      nuoveId.set(c.id, id)
      nuove.push({ ...c, id, origine: { autopilota: a.id, chat: c.id } })
    }
    if (chatSola(a) && !unico.chats.some((y) => y.origine?.autopilota === a.id && y.origine.chat === a.id)) {
      const id = idChatNuova(unico, nuove.length)
      nuoveId.set(a.id, id)
      nuove.push({
        id, compito: a.obiettivoTuo ?? a.obiettivo, stato: 'lavoro', cicli: a.cicli, sessionId: a.sessionId!,
        ...(a.cwd !== unico.cwd ? { cartella: a.cwd } : {}),
        ...(a.ultimaAzioneChat !== undefined ? { ultimaAzione: a.ultimaAzioneChat } : {}),
        origine: { autopilota: a.id, chat: a.id }
      })
    }
    for (const [da, nuova] of nuoveId) adottate.push({ da: a.id, chat: da, nuova })
    // I messaggi in coda per le chat adottate le seguono, con l'id nuovo.
    const seguono: MessaggioPerLaChat[] = [...a.daConsegnare, ...(a.inVolo ?? []).flatMap((v) => v.messaggi)].flatMap((m) => {
      const chats = m.chats.flatMap((k) => (nuoveId.has(k) ? [nuoveId.get(k)!] : []))
      return chats.length > 0 && !unico.daConsegnare.some((x) => x.id === m.id) ? [{ ...m, chats }] : []
    })
    const adottateDiPrima: ChatAdottata[] = (a.adottate ?? []).filter((x) => !(unico.adottate ?? []).some((y) => y.sessionId === x.sessionId))
    const perAdottate: MessaggioAdottata[] = (a.perAdottate ?? []).filter((x) => !(unico.perAdottate ?? []).some((y) => y.id === x.id))
    unico = {
      ...unico,
      chats: [...unico.chats, ...nuove],
      daConsegnare: [...unico.daConsegnare, ...seguono],
      ...(adottateDiPrima.length > 0 || (unico.adottate ?? []).length > 0 ? { adottate: [...(unico.adottate ?? []), ...adottateDiPrima] } : {}),
      ...(perAdottate.length > 0 || (unico.perAdottate ?? []).length > 0 ? { perAdottate: [...(unico.perAdottate ?? []), ...perAdottate] } : {}),
      decisioni: [
        ...unico.decisioni,
        ...nuove.map((c) => ({ quando: p.adesso, cosa: `adotto ${c.origine!.chat} di «${a.nome}» come specialista ${c.id}${c.ramo !== undefined ? ` (ramo ${c.ramo})` : ''}: ${c.compito.slice(0, 120)}`, traguardo: { chat: c.id, esito: 'aperta' as const } }))
      ]
    }
  }
  return { unico, assorbiti: delWs.map((a) => a.id), adottate }
}

/**
 * Gli obiettivi degli autopiloti mai partiti (in preparazione, o pronti ad
 * aspettare il via) che non hanno richieste: entrano nella coda con le loro
 * parole. Una volta sola: un obiettivo già fra gli originali non rientra.
 */
export function obiettiviInCoda(coda: Coda, autopiloti: Vecchio[]): Modifica {
  let c = coda
  const eventi: EventoCoda[] = []
  const gia = new Set(coda.richieste.flatMap((r) => r.originali.map((o) => o.testo.trim())))
  for (const a of autopiloti) {
    if ((a.stato !== 'intervista' && a.stato !== 'pronto') || (a.richieste ?? []).length > 0) continue
    const t = (a.obiettivoTuo ?? a.obiettivo).trim()
    if (t === '' || gia.has(t)) continue
    gia.add(t)
    const m = aggiungi(c, { testo: t, quando: a.iniziatoIl, collegate: [{ autopilota: a.id }] })
    c = m.coda
    eventi.push(...m.eventi)
  }
  return { coda: c, eventi }
}

/** Dove va un hook che arriva con l'id di prima: l'unico e la chat adottata, se c'è. */
export function hookAdottato(unici: Autopilota[], id: string, chatId: string | undefined): { id: string; chat: string } | undefined {
  const chi = chatId ?? id
  for (const u of unici) {
    const c = u.chats.find((x) => x.origine?.autopilota === id && x.origine.chat === chi)
    if (c !== undefined) return { id: u.id, chat: c.id }
  }
  return undefined
}

// ---------------------------------------------------------------- il recupero

export type RapportoArchiviazione = {
  /** Dove sono finiti i file, se qualcosa si è spostato. */
  recupero: string
  /** Gli autopiloti di prima spostati (gli id). */
  autopiloti: string[]
  /** Gli altri file e cartelle spostati, relativi alla cartella degli autopiloti. */
  altri: string[]
  /** Gli autopiloti di prima lasciati dove sono: non ancora passati all'unico del loro workspace. */
  tenuti: string[]
  errori: string[]
}

const ID_FILE = /^([A-Za-z0-9_-]{1,64})\.json$/u

/** Gli autopiloti dei workspace (`autopilota`) e quelli già passati a loro (`assorbiti`), da `orchestratori/*\/orchestratore.json`. */
function legamiOrchestratori(cartellaOrchestratori: string): { unici: Set<string>; assorbiti: Set<string> } {
  const unici = new Set<string>()
  const assorbiti = new Set<string>()
  let ws: string[] = []
  try { ws = readdirSync(cartellaOrchestratori) } catch { return { unici, assorbiti } }
  for (const d of ws) {
    try {
      const o = JSON.parse(readFileSync(join(cartellaOrchestratori, d, 'orchestratore.json'), 'utf8')) as Record<string, unknown>
      if (typeof o.autopilota === 'string') unici.add(o.autopilota)
      for (const x of testi(o.assorbiti)) assorbiti.add(x)
    } catch { /* un workspace senza orchestratore.json non lega niente */ }
  }
  return { unici, assorbiti }
}

/**
 * **I file degli autopiloti di prima, nel recupero** (P4). Li chiama il
 * riassetto del primo avvio, dopo che il servizio li ha fatti passare
 * all'autopilota unico del loro workspace. Non cancella niente: sposta in
 * `recupero` (creata se serve)
 * - `<id>.json` e i suoi file accanto (`<id>.decisioni.jsonl`, i
 *   `.illeggibile`) di ogni autopilota già **assorbito** e che non è
 *   l'autopilota di un workspace;
 * - `istruzioni/` (la linguetta «Istruzioni» di prima);
 * - `servizio/tempi.jsonl` (i tempi dei giri di prima).
 * Un autopilota di prima non ancora assorbito resta dov'è (`tenuti`): lo
 * assorbe il servizio al suo prossimo avvio. `cartellaOrchestratori` di serie
 * è `<cartellaAutopiloti>/../orchestratori`.
 */
export function archiviaVecchiAutopiloti(
  cartellaAutopiloti: string,
  recupero: string,
  cartellaOrchestratori: string = join(cartellaAutopiloti, '..', 'orchestratori'),
  // Il riassetto passa il suo: con il manifesto, così «Annulla» li rimette a posto.
  spostaFuori?: (da: string, rel: string) => boolean
): RapportoArchiviazione {
  const r: RapportoArchiviazione = { recupero, autopiloti: [], altri: [], tenuti: [], errori: [] }
  if (!existsSync(cartellaAutopiloti)) return r
  const { unici, assorbiti } = legamiOrchestratori(cartellaOrchestratori)
  let nomi: string[] = []
  try { nomi = readdirSync(cartellaAutopiloti) } catch (err) { r.errori.push(String(err)); return r }
  const sposta = (rel: string): boolean => {
    const da = join(cartellaAutopiloti, rel)
    if (spostaFuori !== undefined) return spostaFuori(da, rel)
    const a = join(recupero, rel)
    try {
      mkdirSync(join(a, '..'), { recursive: true })
      if (existsSync(a)) throw new Error(`nel recupero c'è già ${rel}`)
      renameSync(da, a)
      return true
    } catch (err) {
      r.errori.push(`${rel}: ${err instanceof Error ? err.message : String(err)}`)
      return false
    }
  }
  const ids = nomi.flatMap((n) => { const m = FILE_DEL_SERVIZIO.has(n) ? null : ID_FILE.exec(n); return m !== null ? [m[1]!] : [] })
  for (const id of ids) {
    if (unici.has(id)) continue
    if (!assorbiti.has(id)) { r.tenuti.push(id); continue }
    if (!sposta(`${id}.json`)) continue
    r.autopiloti.push(id)
    for (const n of nomi) if (n !== `${id}.json` && n.startsWith(`${id}.`) && sposta(n)) r.altri.push(n)
  }
  for (const rel of ['istruzioni', join('servizio', 'tempi.jsonl')]) {
    const p = join(cartellaAutopiloti, rel)
    try { statSync(p) } catch { continue }
    if (sposta(rel)) r.altri.push(rel.replace(/\\/gu, '/'))
  }
  return r
}

/** Il workspace di un autopilota, come lo chiama la coda. */
export const wsDi = (a: Pick<Autopilota, 'cwd' | 'workspace'>): string => chiaveWorkspace(a)
