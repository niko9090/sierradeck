import { existsSync, readFileSync } from 'node:fs'
import { basename, join, sep } from 'node:path'
import { randomBytes } from 'node:crypto'
import { scriviAtomico } from '@shared/scrittura-atomica'
import type { LayoutSalvato, WorkspaceSalvato } from '@shared/workspace'

/**
 * I progetti «sul Drive»: quali cartelle viaggiano con le chat, e dove stanno
 * su ogni PC.
 *
 * Fino alla 0.12.55 la cassaforte portava sull'altro PC le conversazioni e
 * l'assetto, ma non il codice: una chat senza la sua cartella si riapre in una
 * cartella che non c'e', e non si lavora. Da qui in poi un progetto si puo'
 * mettere sul Drive, e da quel momento la sua cartella si sincronizza come il
 * resto, cifrata.
 *
 * Il registro e' **condiviso** (viaggia in `sierradeck/progetti-drive.json`),
 * i percorsi no: ogni PC ha il suo, sotto il proprio id. E' cio' che permette
 * di rimappare la `cwd` di una chat nata altrove sulla cartella di qui.
 */
export type ProgettoDrive = {
  id: string
  nome: string
  /** Dove sta il progetto su ogni PC: id del PC → percorso assoluto. */
  percorsi: Record<string, string>
  aggiuntoIl: string
}

export type RegistroProgetti = { versione: 1; progetti: ProgettoDrive[] }

export const FILE_REGISTRO_PROGETTI = 'progetti-drive.json'

export function registroVuoto(): RegistroProgetti {
  return { versione: 1, progetti: [] }
}

/** Legge senza mai sollevare: un file di un'altra versione non deve fermare l'avvio. */
export function parseRegistro(raw: unknown): RegistroProgetti {
  if (typeof raw !== 'object' || raw === null) return registroVuoto()
  const o = raw as { progetti?: unknown }
  if (!Array.isArray(o.progetti)) return registroVuoto()
  const progetti: ProgettoDrive[] = []
  const visti = new Set<string>()
  for (const p of o.progetti) {
    if (typeof p !== 'object' || p === null) continue
    const q = p as Record<string, unknown>
    if (typeof q.id !== 'string' || q.id === '' || typeof q.nome !== 'string' || q.nome === '') continue
    if (visti.has(q.id)) continue
    visti.add(q.id)
    const percorsi: Record<string, string> = {}
    if (typeof q.percorsi === 'object' && q.percorsi !== null) {
      for (const [pc, percorso] of Object.entries(q.percorsi as Record<string, unknown>)) {
        if (typeof percorso === 'string' && percorso !== '') percorsi[pc] = percorso
      }
    }
    progetti.push({
      id: q.id, nome: q.nome, percorsi,
      aggiuntoIl: typeof q.aggiuntoIl === 'string' ? q.aggiuntoIl : ''
    })
  }
  return { versione: 1, progetti }
}

export function nuovoId(): string {
  return randomBytes(6).toString('hex')
}

export function nomeDaCartella(percorso: string): string {
  const nome = basename(percorso.replace(/[\\/]+$/, ''))
  return nome === '' ? percorso : nome
}

/** Il prefisso con cui i file del progetto stanno nel manifesto. */
export function prefissoProgetto(id: string): string {
  return `progetto-${id}`
}

export const PREFISSO_PROGETTI = 'progetto-'

export function idDaPrefisso(prefisso: string): string | undefined {
  return prefisso.startsWith(PREFISSO_PROGETTI) ? prefisso.slice(PREFISSO_PROGETTI.length) : undefined
}

/** Per confrontare percorsi di Windows: maiuscole e barre non contano. */
export function normalizzaPercorso(p: string): string {
  return p.replace(/\//g, '\\').replace(/[\\]+$/, '').toLowerCase()
}

/** Se `cwd` e' la radice o una sua sottocartella. */
export function staDentro(cwd: string, radice: string): boolean {
  return sottoCartella(cwd, radice) !== undefined
}

function sottoCartella(cwd: string, radice: string): string | undefined {
  const c = normalizzaPercorso(cwd)
  const r = normalizzaPercorso(radice)
  if (c === r) return ''
  if (c.startsWith(`${r}\\`)) return cwd.replace(/\//g, '\\').slice(r.length + 1)
  return undefined
}

/**
 * Mette una cartella sul Drive per questo PC.
 *
 * Se quella cartella e' gia' un progetto di qui, non cambia niente. Se esiste
 * un progetto con lo stesso nome che su questo PC non ha ancora una cartella —
 * e' arrivato da un altro PC — la cartella scelta diventa la sua: e' il modo
 * di dire «il mio SierraDeck sta qui».
 */
export function aggiungiProgetto(
  reg: RegistroProgetti,
  p: { pcId: string; percorso: string; nome?: string; adesso: string; id?: string }
): { registro: RegistroProgetti; progetto: ProgettoDrive } {
  const gia = reg.progetti.find((x) => {
    const mio = x.percorsi[p.pcId]
    return mio !== undefined && normalizzaPercorso(mio) === normalizzaPercorso(p.percorso)
  })
  if (gia !== undefined) return { registro: reg, progetto: gia }
  const nome = p.nome ?? nomeDaCartella(p.percorso)
  const orfano = reg.progetti.find((x) => x.percorsi[p.pcId] === undefined && x.nome === nome)
  if (orfano !== undefined) {
    const collegato = { ...orfano, percorsi: { ...orfano.percorsi, [p.pcId]: p.percorso } }
    return {
      registro: { ...reg, progetti: reg.progetti.map((x) => (x.id === orfano.id ? collegato : x)) },
      progetto: collegato
    }
  }
  const nuovo: ProgettoDrive = { id: p.id ?? nuovoId(), nome, percorsi: { [p.pcId]: p.percorso }, aggiuntoIl: p.adesso }
  return { registro: { ...reg, progetti: [...reg.progetti, nuovo] }, progetto: nuovo }
}

/** Da' a un progetto arrivato da un altro PC la sua cartella su questo. */
export function collegaProgetto(reg: RegistroProgetti, id: string, pcId: string, percorso: string): RegistroProgetti {
  return {
    ...reg,
    progetti: reg.progetti.map((x) => (x.id === id ? { ...x, percorsi: { ...x.percorsi, [pcId]: percorso } } : x))
  }
}

export function rimuoviProgetto(reg: RegistroProgetti, id: string): RegistroProgetti {
  return { ...reg, progetti: reg.progetti.filter((x) => x.id !== id) }
}

/**
 * Dove sta un progetto su questo PC: il percorso registrato, oppure — se non
 * e' mai arrivato qui — la cartella dei progetti piu' il suo nome.
 */
export function percorsoLocale(p: ProgettoDrive, pcId: string, cartellaProgetti: string): { percorso: string; nuovo: boolean } {
  const mio = p.percorsi[pcId]
  if (mio !== undefined) return { percorso: mio, nuovo: false }
  return { percorso: join(cartellaProgetti, p.nome), nuovo: true }
}

/** Il progetto in cui sta una cartella di questo PC, se ce n'e' uno. */
export function progettoDiCwd(reg: RegistroProgetti, cwd: string, pcId: string): ProgettoDrive | undefined {
  return reg.progetti.find((p) => {
    const mio = p.percorsi[pcId]
    return mio !== undefined && sottoCartella(cwd, mio) !== undefined
  })
}

export type Rimappatura = { cwd: string; progetto?: ProgettoDrive; nuovo?: boolean }

/**
 * La `cwd` di una chat, portata su questo PC.
 *
 * Se la cartella c'e', resta com'e'. Se non c'e' ed e' dentro un progetto sul
 * Drive **secondo il percorso di un altro PC**, diventa la stessa sottocartella
 * dentro il progetto di qui. Altrimenti resta com'e' — una chat di una cartella
 * che non conosciamo non si tocca.
 */
export function rimappaCwd(
  cwd: string,
  reg: RegistroProgetti,
  pcId: string,
  cartellaProgetti: string,
  esiste: (percorso: string) => boolean
): Rimappatura {
  if (esiste(cwd)) return { cwd }
  for (const p of reg.progetti) {
    for (const [pc, percorso] of Object.entries(p.percorsi)) {
      if (pc === pcId) continue
      const resto = sottoCartella(cwd, percorso)
      if (resto === undefined) continue
      const locale = percorsoLocale(p, pcId, cartellaProgetti)
      const nuovo = resto === '' ? locale.percorso : join(locale.percorso, ...resto.split(sep))
      return { cwd: nuovo, progetto: p, nuovo: locale.nuovo }
    }
  }
  return { cwd }
}

export type CambioCwd = { sessione: string; da: string; a: string }

function rimappaLayout(
  l: LayoutSalvato,
  rimappa: (cwd: string) => string,
  cambi: CambioCwd[]
): LayoutSalvato {
  let toccato = false
  const panes = l.panes.map((p) => {
    const a = rimappa(p.cwd)
    if (a === p.cwd) return p
    toccato = true
    cambi.push({ sessione: p.sessionUuid, da: p.cwd, a })
    return { ...p, cwd: a }
  })
  return toccato ? { ...l, panes } : l
}

/**
 * L'archivio dei workspace con le `cwd` portate su questo PC.
 *
 * Puro: chi lo chiama scrive l'archivio solo se `cambi` non e' vuoto, e con
 * l'elenco dei cambi copia anche le trascrizioni sotto il nuovo slug.
 */
export function rimappaWorkspace<T extends { workspace: WorkspaceSalvato[] }>(
  archivio: T,
  rimappa: (cwd: string) => string
): { archivio: T; cambi: CambioCwd[] } {
  const cambi: CambioCwd[] = []
  const workspace = archivio.workspace.map((w) => {
    const perSlot: Record<string, LayoutSalvato> = {}
    for (const [slot, l] of Object.entries(w.perSlot)) perSlot[slot] = rimappaLayout(l, rimappa, cambi)
    return { ...w, perSlot }
  })
  return cambi.length === 0 ? { archivio, cambi } : { archivio: { ...archivio, workspace }, cambi }
}

export type RegistroProgettiStore = {
  leggi: () => RegistroProgetti
  scrivi: (r: RegistroProgetti) => void
}

export function apriRegistroProgetti(dati: string): RegistroProgettiStore {
  const percorso = join(dati, FILE_REGISTRO_PROGETTI)
  return {
    leggi() {
      if (!existsSync(percorso)) return registroVuoto()
      try {
        return parseRegistro(JSON.parse(readFileSync(percorso, 'utf8')))
      } catch (err) {
        console.error('[progetti] registro illeggibile:', err)
        return registroVuoto()
      }
    },
    scrivi(r) {
      scriviAtomico(percorso, JSON.stringify(r, null, 2), 'progetti')
    }
  }
}
