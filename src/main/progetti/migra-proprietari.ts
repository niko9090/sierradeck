import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  FILE_REGISTRO_PROGETTI, apriRegistroProgetti, normalizzaPercorso, parseRegistro,
  type ProgettoDrive, type RegistroProgetti
} from './registro'
import { FILE_PC } from './pc'

/**
 * La migrazione al modello semplice (0.88.0): **un progetto, un PC**.
 *
 * Una volta sola (la chiama il riassetto del primo avvio), e di nuovo senza
 * danni: chi ha già un proprietario lo tiene.
 *
 * 1. Toglie dal registro le voci che non sono progetti (copie degli
 *    autopiloti, cartelle generiche come Desktop o Downloads, nomi strani).
 *    Solo la voce del registro: **mai un file**.
 * 2. Unisce i doppioni con lo stesso nome (maiuscole e spazi non contano) in
 *    un id solo, e restituisce la mappa vecchio id → nuovo id per chi li cita.
 * 3. Dà a ogni progetto il suo proprietario per nome del PC, secondo la tabella
 *    decisa da Nicholas (`TABELLA_PROPRIETARI`). I PC si riconoscono per nome
 *    dai battiti: nessun id scritto nel codice. Un nome che la tabella non
 *    conosce va al PC predefinito.
 * 4. Toglie i campi del modello di prima (`percorsi`, `origini`, `unitoIn`).
 *
 * Pura: `migraAProprietari`. Il disco: `migraRegistroSuDisco`.
 */

/**
 * Chi possiede cosa, per **nome del PC** (decisione di Nicholas, 30/10). Il
 * solo posto con questi nomi: niente id, niente percorsi.
 */
export const TABELLA_PROPRIETARI: {
  /** Dove va un progetto che la tabella non nomina. */
  predefinito: string
  /** PC → i nomi dei suoi progetti. */
  proprietari: Record<string, string[]>
  /** Voci che sono parte di un altro progetto (sottocartelle registrate a sé): si uniscono a quello. */
  alias: Record<string, string>
} = {
  predefinito: 'PC-Fisso',
  proprietari: {
    'PC-Fisso': [
      'SierraDeck', 'Wdeck', 'VisitaFacile', 'Portfolio', 'DDJ-Dj_Deck', 'NAS-film', 'HomeAssistant', 'FLUX',
      'NexoraOS', 'Game_ascensore', 'gestionale-dev', 'convertitore', 'X'
    ],
    'LAPTOP-E60QM2D1': ['Trading', 'Money', 'ServerDSM', 'Desk_remoto'],
    'DESKTOP-G24D499': [
      'GLOS', 'Upcolori', 'PROGRAMMA VECCHIO SARDI', 'casa-rodriguez', 'Ship_game', 'Gestore_sessioni_ClaudeCode',
      'Home assistant', 'Server_home', 'fionda apl', 'adesivi'
    ]
  },
  alias: { gen: 'FLUX' }
}

export type TabellaProprietari = typeof TABELLA_PROPRIETARI

/** Un PC come lo si conosce: il suo id e i nomi con cui può comparire. */
export type PcNoto = { id: string; nome: string; host?: string; nomeScelto?: string }

/** Il nome per confrontare: maiuscole e spazi in più non contano (trattini e trattini bassi sì). */
export function nomeNormale(nome: string): string {
  return nome.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
}

/** Nomi di cartelle che non sono progetti: la casa dell'utente e le sue cartelle di sempre. */
const CARTELLE_GENERICHE = new Set([
  'desktop', 'documents', 'documenti', 'downloads', 'download', 'inbox', 'snap', '_tool', 'web',
  'users', 'utenti', 'home', 'onedrive', 'pictures', 'immagini', 'music', 'musica', 'videos', 'video'
])

export type MotivoNonProgetto = 'copia-autopilota' | 'cartella-generica' | 'casa-utente' | 'nome-strano' | 'radice-condivisa'

/**
 * Una voce del registro che non è un progetto, e perché; `undefined` se lo è.
 * I nomi della tabella sono sempre progetti.
 */
export function nonProgetto(p: { nome: string; percorsi?: string[] }, tabella: TabellaProprietari = TABELLA_PROPRIETARI): MotivoNonProgetto | undefined {
  const nome = p.nome.trim()
  const n = nomeNormale(nome)
  if (nomiDellaTabella(tabella).has(n)) return undefined
  if (/^ap-[0-9a-f]+-c-\d+$/i.test(nome)) return 'copia-autopilota'
  if (nome === '' || nome.length > 60 || /[.?!:;,]$/.test(nome) || nome.split(/\s+/).length >= 5) return 'nome-strano'
  if (CARTELLE_GENERICHE.has(n) || /^downloads?-/.test(n)) return 'cartella-generica'
  for (const percorso of p.percorsi ?? []) {
    const x = normalizzaPercorso(percorso)
    // C:\Users\<qualcuno>: la casa dell'utente intera, non un progetto.
    if (/^[a-z]:\\(users|utenti)\\[^\\]+$/.test(x) || /^[a-z]:\\(users|utenti)$/.test(x)) return 'casa-utente'
    // \\server\condivisione: la radice di una condivisione di rete.
    if (/^\\\\[^\\]+\\[^\\]+$/.test(x)) return 'radice-condivisa'
  }
  return undefined
}

function nomiDellaTabella(t: TabellaProprietari): Set<string> {
  const s = new Set<string>()
  for (const nomi of Object.values(t.proprietari)) for (const n of nomi) s.add(nomeNormale(n))
  for (const [a, b] of Object.entries(t.alias)) { s.add(nomeNormale(a)); s.add(nomeNormale(b)) }
  return s
}

/** Il nome del PC che, secondo la tabella, possiede quel progetto. */
export function pcDellaTabella(nome: string, t: TabellaProprietari = TABELLA_PROPRIETARI): string {
  const n = nomeNormale(t.alias[nome] ?? Object.entries(t.alias).find(([a]) => nomeNormale(a) === nomeNormale(nome))?.[1] ?? nome)
  for (const [pc, nomi] of Object.entries(t.proprietari)) if (nomi.some((x) => nomeNormale(x) === n)) return pc
  return t.predefinito
}

/** Il PC con quel nome fra quelli noti (nome mostrato, hostname o nome scelto). */
export function pcPerNome(nome: string, pc: PcNoto[]): PcNoto | undefined {
  const n = nomeNormale(nome)
  return pc.find((p) => [p.nome, p.host, p.nomeScelto].some((x) => x !== undefined && nomeNormale(x) === n))
}

export type RapportoMigrazione = {
  /** A chi è andato ogni progetto. */
  proprietari: { id: string; nome: string; pc: string; pcNome: string; percorso?: string }[]
  /** Le voci tolte dal registro (mai i file), con il motivo. */
  tolti: { id: string; nome: string; motivo: MotivoNonProgetto }[]
  /** I doppioni uniti: il nome, l'id che resta e quelli che si sono uniti a lui. */
  uniti: { nome: string; id: string; da: string[] }[]
  /** Progetti il cui PC (secondo la tabella) non si conosce ancora: restano senza proprietario, si riprova. */
  senzaPc: { id: string; nome: string; pcNome: string }[]
  /** Progetti con il proprietario, ma senza una cartella nota su di lui. */
  senzaCartella: { id: string; nome: string; pcNome: string }[]
}

export type EsitoMigrazione = {
  registro: RegistroProgetti
  /** Vecchio id → id che resta, per le voci unite (e gli alias). */
  rimappa: Record<string, string>
  rapporto: RapportoMigrazione
  /** Il registro è cambiato. */
  cambiato: boolean
  /**
   * Dove stava ogni progetto su ogni PC nel modello di prima (id che resta →
   * PC → cartelle): serve alla pulizia delle copie che non sono di quel PC
   * (`copieNonMie` in `sposta.ts`), dopo che i campi di prima sono spariti.
   */
  percorsiDiPrima: Record<string, Record<string, string[]>>
}

/** Tutti i percorsi noti di una voce, vecchi e nuovi. */
const percorsiDi = (p: ProgettoDrive): string[] =>
  [...(p.percorso !== undefined ? [p.percorso] : []), ...Object.values(p.vecchio?.percorsi ?? {}), ...(p.vecchio?.origini ?? [])]

/** Dove sta un gruppo sul PC proprietario, se qualcuno lo sa. */
function percorsoSu(gruppo: ProgettoDrive[], pcId: string): string | undefined {
  for (const p of gruppo) if (p.proprietario === pcId && p.percorso !== undefined) return p.percorso
  for (const p of gruppo) { const v = p.vecchio?.percorsi[pcId]; if (v !== undefined) return v }
  return undefined
}

/**
 * La migrazione, pura. `pcNoti`: i PC di cui si conosce il nome (questo e gli
 * altri dai battiti). `opzioni.io`: questo PC, per dare la cartella a un
 * progetto suo che il registro non sapeva dove fosse.
 */
export function migraAProprietari(
  registro: RegistroProgetti,
  pcNoti: PcNoto[],
  tabella: TabellaProprietari = TABELLA_PROPRIETARI,
  opzioni: { adesso?: string; io?: { id: string; cartellaProgetti: string }; esiste?: (percorso: string) => boolean } = {}
): EsitoMigrazione {
  const adesso = opzioni.adesso ?? new Date().toISOString()
  const rapporto: RapportoMigrazione = { proprietari: [], tolti: [], uniti: [], senzaPc: [], senzaCartella: [] }
  const rimappa: Record<string, string> = {}
  const tolti: Record<string, string> = { ...(registro.tolti ?? {}) }

  // 1. Le voci che non sono progetti.
  const restano: ProgettoDrive[] = []
  for (const p of registro.progetti) {
    const motivo = p.proprietario !== undefined ? undefined : nonProgetto({ nome: p.nome, percorsi: percorsiDi(p) }, tabella)
    if (motivo === undefined) { restano.push(p); continue }
    rapporto.tolti.push({ id: p.id, nome: p.nome, motivo })
    tolti[p.id] = adesso
  }

  // 2. I gruppi: stesso nome normalizzato, gli alias nel loro progetto, le unioni di prima nel principale.
  const perId = new Map(restano.map((p) => [p.id, p]))
  const chiaveDi = (p: ProgettoDrive, visti = new Set<string>()): string => {
    const unito = p.vecchio?.unitoIn
    if (unito !== undefined && unito !== p.id && !visti.has(unito)) {
      const principale = perId.get(unito)
      if (principale !== undefined) return chiaveDi(principale, new Set([...visti, p.id]))
    }
    const alias = Object.entries(tabella.alias).find(([a]) => nomeNormale(a) === nomeNormale(p.nome))?.[1]
    return nomeNormale(alias ?? p.nome)
  }
  const gruppi = new Map<string, ProgettoDrive[]>()
  for (const p of restano) {
    const k = chiaveDi(p)
    gruppi.set(k, [...(gruppi.get(k) ?? []), p])
  }

  const progetti: ProgettoDrive[] = []
  const percorsiDiPrima: Record<string, Record<string, string[]>> = {}
  for (const gruppo of gruppi.values()) {
    // Resta chi ha già un proprietario (una migrazione fatta, uno «Sposta»), poi
    // il nome che non è un alias, poi il più vecchio, poi l'id.
    const ordinati = [...gruppo].sort((a, b) =>
      Number(b.proprietario !== undefined) - Number(a.proprietario !== undefined) ||
      Number(tabella.alias[a.nome] !== undefined) - Number(tabella.alias[b.nome] !== undefined) ||
      (a.aggiuntoIl || '9').localeCompare(b.aggiuntoIl || '9') || a.id.localeCompare(b.id))
    const capo = ordinati[0] as ProgettoDrive
    const altri = ordinati.slice(1)
    for (const x of ordinati) {
      for (const [pc, c] of Object.entries(x.vecchio?.percorsi ?? {})) {
        const per = (percorsiDiPrima[capo.id] ??= {})
        per[pc] = [...new Set([...(per[pc] ?? []), c])]
      }
    }
    if (altri.length > 0) {
      rapporto.uniti.push({ nome: capo.nome, id: capo.id, da: altri.map((x) => x.id) })
      for (const x of altri) { rimappa[x.id] = capo.id; tolti[x.id] = adesso }
    }

    // 3. Il proprietario: quello che c'è già, o quello della tabella.
    const { vecchio: _v, ...pulito } = capo
    let proprietario = capo.proprietario
    let pcNome = proprietario !== undefined ? (pcNoti.find((x) => x.id === proprietario)?.nome ?? proprietario) : ''
    if (proprietario === undefined) {
      pcNome = pcDellaTabella(capo.nome, tabella)
      const pc = pcPerNome(pcNome, pcNoti)
      if (pc === undefined) {
        // Il PC della tabella non si conosce ancora (nessun battito): la voce
        // resta com'era, con i campi di prima, e si riprova al prossimo giro.
        rapporto.senzaPc.push({ id: capo.id, nome: capo.nome, pcNome })
        progetti.push(altri.length > 0 ? { ...capo, vecchio: unisciVecchi(gruppo) } : capo)
        continue
      }
      proprietario = pc.id
    }
    let percorso = percorsoSu(ordinati, proprietario)
    if (percorso === undefined && opzioni.io !== undefined && opzioni.io.id === proprietario) {
      const candidato = join(opzioni.io.cartellaProgetti, capo.nome)
      if (opzioni.esiste?.(candidato) === true) percorso = candidato
    }
    const nuovo: ProgettoDrive = {
      ...pulito, proprietario,
      ...(percorso !== undefined ? { percorso } : {}),
      proprietarioDal: capo.proprietarioDal ?? adesso
    }
    if (percorso === undefined) rapporto.senzaCartella.push({ id: capo.id, nome: capo.nome, pcNome })
    if (capo.proprietario === undefined) rapporto.proprietari.push({ id: capo.id, nome: capo.nome, pc: proprietario, pcNome, ...(percorso !== undefined ? { percorso } : {}) })
    progetti.push(nuovo)
  }

  const fuori: RegistroProgetti = { versione: 1, progetti, ...(Object.keys(tolti).length > 0 ? { tolti } : {}) }
  return { registro: fuori, rimappa, rapporto, percorsiDiPrima, cambiato: JSON.stringify(fuori) !== JSON.stringify(registro) }
}

/** I campi di prima di più voci, insieme: per non perdere un percorso di una voce unita finché non c'è un proprietario. */
function unisciVecchi(gruppo: ProgettoDrive[]): ProgettoDrive['vecchio'] {
  const percorsi: Record<string, string> = {}
  const origini: string[] = []
  for (const p of gruppo) {
    for (const [pc, x] of Object.entries(p.vecchio?.percorsi ?? {})) if (percorsi[pc] === undefined) percorsi[pc] = x
    for (const o of p.vecchio?.origini ?? []) if (!origini.includes(o)) origini.push(o)
  }
  return { percorsi, ...(origini.length > 0 ? { origini } : {}) }
}

/** Il nuovo id di un progetto citato con un id di prima (unito in un altro). */
export function idDopoMigrazione(id: string, rimappa: Record<string, string>): string {
  let x = id
  for (let i = 0; i < 10 && rimappa[x] !== undefined; i += 1) x = rimappa[x] as string
  return x
}

/** I PC noti a questo: lui (`pc.json`) e gli altri dai battiti ricordati (`pc-altrui.json`). */
export function pcNotiDaDisco(dati: string): PcNoto[] {
  const fuori: PcNoto[] = []
  const leggi = (f: string): unknown => { try { return JSON.parse(readFileSync(join(dati, f), 'utf8')) as unknown } catch { return undefined } }
  const io = leggi(FILE_PC) as { id?: unknown; nome?: unknown; nomeScelto?: unknown } | undefined
  if (io !== undefined && typeof io.id === 'string' && typeof io.nome === 'string') {
    fuori.push({ id: io.id, nome: io.nome, ...(typeof io.nomeScelto === 'string' ? { nomeScelto: io.nomeScelto } : {}) })
  }
  const altri = leggi('pc-altrui.json')
  if (Array.isArray(altri)) {
    for (const b of altri as { pcId?: unknown; nome?: unknown; host?: unknown; nomeScelto?: unknown }[]) {
      if (typeof b?.pcId !== 'string' || typeof b.nome !== 'string' || fuori.some((x) => x.id === b.pcId)) continue
      fuori.push({ id: b.pcId, nome: b.nome, ...(typeof b.host === 'string' ? { host: b.host } : {}), ...(typeof b.nomeScelto === 'string' ? { nomeScelto: b.nomeScelto } : {}) })
    }
  }
  return fuori
}

/**
 * La migrazione sul disco: legge `progetti-drive.json`, ne tiene una copia
 * (`progetti-drive.prima-dei-proprietari.json`, solo la prima volta), migra e
 * riscrive solo se è cambiato. Mai un file dei progetti toccato.
 */
export function migraRegistroSuDisco(p: {
  dati: string
  pcNoti?: PcNoto[]
  tabella?: TabellaProprietari
  adesso?: string
  io?: { id: string; cartellaProgetti: string }
  esiste?: (percorso: string) => boolean
}): EsitoMigrazione {
  const file = join(p.dati, FILE_REGISTRO_PROGETTI)
  const store = apriRegistroProgetti(p.dati)
  let registro: RegistroProgetti
  try { registro = parseRegistro(JSON.parse(readFileSync(file, 'utf8'))) } catch { registro = store.leggi() }
  const esito = migraAProprietari(registro, p.pcNoti ?? pcNotiDaDisco(p.dati), p.tabella ?? TABELLA_PROPRIETARI, {
    ...(p.adesso !== undefined ? { adesso: p.adesso } : {}),
    ...(p.io !== undefined ? { io: p.io } : {}),
    esiste: p.esiste ?? existsSync
  })
  if (esito.cambiato) {
    const copia = join(p.dati, 'progetti-drive.prima-dei-proprietari.json')
    if (existsSync(file) && !existsSync(copia)) copyFileSync(file, copia)
    store.scrivi(esito.registro)
  }
  return esito
}
