import { copyFileSync, existsSync, readFileSync, readdirSync } from 'node:fs'
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
/**
 * Questo PC, per la migrazione: la sua cartella dei progetti e le altre radici
 * dove di solito stanno i progetti (i Documenti), per trovare la cartella vera.
 */
export type IoMigrazione = { id: string; cartellaProgetti: string; radici?: string[] }

/** Dove potrebbe stare un progetto su questo PC, oltre alle cartelle note: `<radice>/<nome>`. */
const sottoLeRadici = (io: IoMigrazione, nome: string): string[] => [io.cartellaProgetti, ...(io.radici ?? [])].filter((r) => r !== '').map((r) => join(r, nome))

export function migraAProprietari(
  registro: RegistroProgetti,
  pcNoti: PcNoto[],
  tabella: TabellaProprietari = TABELLA_PROPRIETARI,
  opzioni: { adesso?: string; io?: IoMigrazione; esiste?: (percorso: string) => boolean; valuta?: (percorso: string) => number } = {}
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
    // Dove sta la cartella. Il registro di prima non è affidabile: spesso il
    // percorso «suo» era una cartella vuota in «Progetti SierraDeck», e quella
    // vera stava fra le origini. Sul proprietario si guarda (`sceltaCartella`);
    // per gli altri PC si tengono i candidati, e sceglie lui quando li vede.
    let percorso = percorsoSu(ordinati, proprietario)
    let candidati: string[] | undefined = capo.proprietario === undefined ? candidatiDi(ordinati, percorso) : undefined
    if (opzioni.io !== undefined && opzioni.io.id === proprietario) {
      const tutti = [...(percorso !== undefined ? [percorso] : []), ...(candidati ?? []), ...sottoLeRadici(opzioni.io, capo.nome)]
      const scelta = sceltaCartella(tutti, opzioni.valuta ?? (opzioni.esiste !== undefined ? ((x) => opzioni.esiste?.(x) === true ? 1 : 0) : valutaCartella))
      if (scelta !== undefined) percorso = scelta
      candidati = undefined
    }
    const nuovo: ProgettoDrive = {
      ...pulito, proprietario,
      ...(percorso !== undefined ? { percorso } : {}),
      ...(candidati !== undefined && candidati.length > 0 ? { candidati } : {}),
      proprietarioDal: capo.proprietarioDal ?? adesso
    }
    if (percorso === undefined) rapporto.senzaCartella.push({ id: capo.id, nome: capo.nome, pcNome })
    if (capo.proprietario === undefined) rapporto.proprietari.push({ id: capo.id, nome: capo.nome, pc: proprietario, pcNome, ...(percorso !== undefined ? { percorso } : {}) })
    progetti.push(nuovo)
  }

  const fuori: RegistroProgetti = { versione: 1, progetti, ...(Object.keys(tolti).length > 0 ? { tolti } : {}) }
  return { registro: fuori, rimappa, rapporto, percorsiDiPrima, cambiato: JSON.stringify(fuori) !== JSON.stringify(registro) }
}

/** Tutte le cartelle note di un gruppo, tranne quella già scelta: percorsi di ogni PC e origini. */
function candidatiDi(gruppo: ProgettoDrive[], scelto: string | undefined): string[] {
  const visti = new Set<string>(scelto !== undefined ? [normalizzaPercorso(scelto)] : [])
  const fuori: string[] = []
  for (const p of gruppo) {
    for (const c of [...Object.values(p.vecchio?.percorsi ?? {}), ...(p.vecchio?.origini ?? [])]) {
      const k = normalizzaPercorso(c)
      if (!visti.has(k)) { visti.add(k); fuori.push(c) }
    }
  }
  return fuori
}

/** File che ci sono anche in una cartella appena creata, senza il progetto dentro. */
const SOLO_GUSCIO = new Set(['.git', '.gitignore', '.gitattributes', 'readme.md', 'desktop.ini', '.sierradeck', '.claude', 'thumbs.db'])

/**
 * Quanto è credibile una cartella come quella del progetto: 0 non c'è, 1 c'è
 * ma è un guscio (vuota, o solo `.git` e README: il 30/10 Game_ascensore aveva
 * così la copia in «Progetti SierraDeck», e la vera in Documenti), 2 ha dei
 * file, 3 ha dei file ed è un repository git con dei commit.
 */
export function valutaCartella(percorso: string): number {
  let voci: string[]
  try { voci = readdirSync(percorso) } catch { return 0 }
  if (!voci.some((v) => !SOLO_GUSCIO.has(v.toLowerCase()))) return 1
  if (!voci.includes('.git')) return 2
  let git: string[] = []
  try { git = readdirSync(join(percorso, '.git')) } catch { /* `.git` file di un worktree: conta come git */ return 3 }
  return git.includes('HEAD') && (git.includes('packed-refs') || git.includes('refs')) ? 3 : 2
}

/** La cartella migliore fra le candidate (a parità vince la prima); nessuna se non ce n'è una che esiste. */
export function sceltaCartella(candidate: string[], valuta: (percorso: string) => number): string | undefined {
  let meglio: string | undefined
  let punti = 0
  for (const c of candidate) {
    const v = valuta(c)
    if (v > punti) { meglio = c; punti = v }
  }
  return meglio
}

/**
 * Sul proprietario: per i progetti suoi che hanno ancora dei candidati (la
 * migrazione l'ha fatta un altro PC), sceglie la cartella vera e toglie i
 * candidati. Si può chiamare a ogni avvio: senza candidati non cambia niente.
 */
export function risolviPercorsiMiei(
  reg: RegistroProgetti,
  io: IoMigrazione,
  valuta: (percorso: string) => number = valutaCartella
): { registro: RegistroProgetti; cambiati: string[] } {
  const cambiati: string[] = []
  const progetti = reg.progetti.map((p) => {
    if (p.proprietario !== io.id || p.candidati === undefined) return p
    const { candidati, ...senza } = p
    const scelta = sceltaCartella([...(p.percorso !== undefined ? [p.percorso] : []), ...candidati, ...sottoLeRadici(io, p.nome)], valuta)
    cambiati.push(p.nome)
    return scelta !== undefined ? { ...senza, percorso: scelta } : senza
  })
  return { registro: cambiati.length > 0 ? { ...reg, progetti } : reg, cambiati }
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
  io?: IoMigrazione
  esiste?: (percorso: string) => boolean
  valuta?: (percorso: string) => number
}): EsitoMigrazione {
  const file = join(p.dati, FILE_REGISTRO_PROGETTI)
  const store = apriRegistroProgetti(p.dati)
  let registro: RegistroProgetti
  try { registro = parseRegistro(JSON.parse(readFileSync(file, 'utf8'))) } catch { registro = store.leggi() }
  const migrato = migraAProprietari(registro, p.pcNoti ?? pcNotiDaDisco(p.dati), p.tabella ?? TABELLA_PROPRIETARI, {
    ...(p.adesso !== undefined ? { adesso: p.adesso } : {}),
    ...(p.io !== undefined ? { io: p.io } : {}),
    ...(p.esiste !== undefined ? { esiste: p.esiste } : {}),
    ...(p.valuta !== undefined ? { valuta: p.valuta } : {})
  })
  // I progetti di questo PC migrati da un altro: qui si sceglie la cartella vera.
  const risolto = p.io !== undefined ? risolviPercorsiMiei(migrato.registro, p.io, p.valuta ?? valutaCartella) : { registro: migrato.registro, cambiati: [] }
  const esito: EsitoMigrazione = { ...migrato, registro: risolto.registro, cambiato: migrato.cambiato || risolto.cambiati.length > 0 }
  if (esito.cambiato) {
    const copia = join(p.dati, 'progetti-drive.prima-dei-proprietari.json')
    if (existsSync(file) && !existsSync(copia)) copyFileSync(file, copia)
    store.scrivi(esito.registro)
  }
  return esito
}
