import { basename, join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { scriviAtomico } from '@shared/scrittura-atomica'
import { normalizzaPercorso, staDentro } from '@shared/percorsi'
import { memoriaDiFile } from '../memoria-di-file'

/**
 * I progetti, condivisi fra i PC (`sierradeck/progetti-drive.json` sul Drive).
 *
 * **Il modello semplice (0.88.0, scelto da Nicholas il 30/10).** Ogni progetto
 * vive su **un solo PC**, il suo proprietario, più la copia di sicurezza sul
 * Drive. Nessun altro PC ne tiene una copia di lavoro: dagli altri PC e dal
 * telefono lo si apre dal vivo (o gli si scrive con la posta, se è spento). Il
 * proprietario cambia solo con «Sposta su questo PC» (vedi `sposta.ts`).
 *
 * Prima ogni PC aveva il suo percorso (`percorsi`), con origini, unioni e case
 * delle chat: la migrazione (`migra-proprietari.ts`) li legge una volta e li
 * toglie. Fino ad allora restano in `vecchio`, così nessuna scrittura del
 * registro li perde prima che la migrazione li abbia letti.
 */
export type ProgettoDrive = {
  id: string
  nome: string
  aggiuntoIl: string
  /** L'id del PC proprietario: l'unico che ha la cartella. Assente solo prima della migrazione. */
  proprietario?: string
  /** Dove sta la cartella sul proprietario. */
  percorso?: string
  /** Quando è cambiato il proprietario: fra due copie del registro vince il più recente. */
  proprietarioDal?: string
  /**
   * Le cartelle dove il progetto potrebbe stare sul proprietario, finché lui
   * non ha guardato (la migrazione fatta da un altro PC non può saperlo): il
   * proprietario sceglie quella vera (`risolviPercorsiMiei`) e le toglie.
   */
  candidati?: string[]
  /** I campi del modello di prima, finché la migrazione non li ha letti. */
  vecchio?: { percorsi: Record<string, string>; origini?: string[]; unitoIn?: string }
}

export type RegistroProgetti = {
  versione: 1
  progetti: ProgettoDrive[]
  /**
   * Gli id tolti di proposito (la migrazione: doppioni uniti, cartelle che non
   * erano progetti), con quando. L'unione con il registro di un altro PC non
   * li fa tornare.
   */
  tolti?: Record<string, string>
}

export const FILE_REGISTRO_PROGETTI = 'progetti-drive.json'

export function registroVuoto(): RegistroProgetti {
  return { versione: 1, progetti: [] }
}

const stringa = (x: unknown): string | undefined => (typeof x === 'string' && x !== '' ? x : undefined)

/** Legge senza mai sollevare: un file di un'altra versione non deve fermare l'avvio. */
export function parseRegistro(raw: unknown): RegistroProgetti {
  if (typeof raw !== 'object' || raw === null) return registroVuoto()
  const o = raw as { progetti?: unknown }
  if (!Array.isArray(o.progetti)) return registroVuoto()
  const tolti: Record<string, string> = {}
  const t = (raw as { tolti?: unknown }).tolti
  if (typeof t === 'object' && t !== null && !Array.isArray(t)) {
    for (const [id, quando] of Object.entries(t as Record<string, unknown>)) if (typeof quando === 'string') tolti[id] = quando
  }
  const progetti: ProgettoDrive[] = []
  const visti = new Set<string>()
  for (const p of o.progetti) {
    if (typeof p !== 'object' || p === null) continue
    const q = p as Record<string, unknown>
    const id = stringa(q.id)
    const nome = stringa(q.nome)
    if (id === undefined || nome === undefined || visti.has(id) || tolti[id] !== undefined) continue
    visti.add(id)
    // Il modello di prima: `percorsi` (e origini, unioni) sul progetto, oppure già in `vecchio`.
    const v = (typeof q.vecchio === 'object' && q.vecchio !== null ? q.vecchio : q) as Record<string, unknown>
    const percorsi: Record<string, string> = {}
    if (typeof v.percorsi === 'object' && v.percorsi !== null) {
      for (const [pc, percorso] of Object.entries(v.percorsi as Record<string, unknown>)) {
        if (typeof percorso === 'string' && percorso !== '') percorsi[pc] = percorso
      }
    }
    const origini = Array.isArray(v.origini) ? v.origini.filter((x): x is string => typeof x === 'string' && x !== '') : []
    const unitoIn = stringa(v.unitoIn)
    const haVecchio = Object.keys(percorsi).length > 0 || origini.length > 0 || unitoIn !== undefined
    const proprietario = stringa(q.proprietario)
    const percorso = stringa(q.percorso)
    const proprietarioDal = stringa(q.proprietarioDal)
    const candidati = Array.isArray(q.candidati) ? q.candidati.filter((x): x is string => typeof x === 'string' && x !== '') : []
    progetti.push({
      id, nome,
      aggiuntoIl: typeof q.aggiuntoIl === 'string' ? q.aggiuntoIl : '',
      ...(proprietario !== undefined ? { proprietario } : {}),
      ...(percorso !== undefined ? { percorso } : {}),
      ...(proprietarioDal !== undefined ? { proprietarioDal } : {}),
      ...(candidati.length > 0 ? { candidati } : {}),
      ...(haVecchio ? { vecchio: { percorsi, ...(origini.length > 0 ? { origini } : {}), ...(unitoIn !== undefined ? { unitoIn } : {}) } } : {})
    })
  }
  return { versione: 1, progetti, ...(Object.keys(tolti).length > 0 ? { tolti } : {}) }
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

// La regola dei percorsi sta in `@shared/percorsi`; si riesporta per chi la prende da qui.
export { normalizzaPercorso, staDentro }

/** I progetti di cui questo PC è il proprietario. */
export function progettiDi(reg: RegistroProgetti, pcId: string): ProgettoDrive[] {
  return reg.progetti.filter((p) => p.proprietario === pcId && p.percorso !== undefined)
}

/** Il progetto **di questo PC** in cui sta una cartella, se ce n'è uno. */
export function progettoDiCwd(reg: RegistroProgetti, cwd: string, pcId: string): ProgettoDrive | undefined {
  return progettiDi(reg, pcId).find((p) => staDentro(cwd, p.percorso as string))
}

/**
 * Il progetto, di **qualunque** proprietario, la cui cartella contiene `cwd`.
 * Serve a dire «questa chat è di un progetto che vive su un altro PC».
 */
export function progettoDiCartella(reg: RegistroProgetti, cwd: string): ProgettoDrive | undefined {
  return reg.progetti.find((p) => p.percorso !== undefined && staDentro(cwd, p.percorso))
}

/**
 * Mette una cartella di questo PC fra i progetti, con questo PC proprietario.
 * Se è già un progetto (stessa cartella, stesso proprietario) non cambia niente.
 */
export function aggiungiProgetto(
  reg: RegistroProgetti,
  p: { pcId: string; percorso: string; nome?: string; adesso: string; id?: string }
): { registro: RegistroProgetti; progetto: ProgettoDrive } {
  const gia = reg.progetti.find((x) => x.proprietario === p.pcId && x.percorso !== undefined && normalizzaPercorso(x.percorso) === normalizzaPercorso(p.percorso))
  if (gia !== undefined) return { registro: reg, progetto: gia }
  const nuovo: ProgettoDrive = {
    id: p.id ?? nuovoId(), nome: p.nome ?? nomeDaCartella(p.percorso), aggiuntoIl: p.adesso,
    proprietario: p.pcId, percorso: p.percorso, proprietarioDal: p.adesso
  }
  return { registro: { ...reg, progetti: [...reg.progetti, nuovo] }, progetto: nuovo }
}

/** Il proprietario nuovo, dopo «Sposta su questo PC» verificato. */
export function cambiaProprietario(reg: RegistroProgetti, id: string, pcId: string, percorso: string, quando: string): RegistroProgetti {
  return {
    ...reg,
    progetti: reg.progetti.map((x) => (x.id === id ? { ...x, proprietario: pcId, percorso, proprietarioDal: quando } : x))
  }
}

/** Toglie un progetto dal registro (mai i suoi file). Con `quando`, resta tolto anche nell'unione con gli altri PC. */
export function rimuoviProgetto(reg: RegistroProgetti, id: string, quando?: string): RegistroProgetti {
  return {
    ...reg,
    progetti: reg.progetti.filter((x) => x.id !== id),
    ...(quando !== undefined ? { tolti: { ...(reg.tolti ?? {}), [id]: quando } } : {})
  }
}

/** Dove andrebbe un progetto su questo PC se ci arrivasse: la cartella dei progetti più il suo nome. */
export function percorsoNuovo(p: Pick<ProgettoDrive, 'nome'>, cartellaProgetti: string): string {
  return join(cartellaProgetti, p.nome)
}

/**
 * L'unione di due copie del registro (questo PC e il Drive). Per id: chi c'è
 * in una sola entra com'è; chi c'è in tutte e due prende il proprietario
 * cambiato più di recente (`proprietarioDal`). A parità vince `a`.
 */
export function fondiRegistri(a: RegistroProgetti, b: RegistroProgetti): RegistroProgetti {
  const tolti: Record<string, string> = { ...(b.tolti ?? {}), ...(a.tolti ?? {}) }
  const perId = new Map<string, ProgettoDrive>()
  for (const p of a.progetti) if (tolti[p.id] === undefined) perId.set(p.id, p)
  for (const p of b.progetti) {
    if (tolti[p.id] !== undefined) continue
    const qui = perId.get(p.id)
    if (qui === undefined) { perId.set(p.id, p); continue }
    const dalB = p.proprietarioDal ?? ''
    const dalA = qui.proprietarioDal ?? ''
    const stesso = qui.proprietario !== undefined && qui.proprietario === p.proprietario
    // Lo stesso proprietario: vince la copia in cui lui ha già scelto la cartella (senza candidati).
    const vince = qui.proprietario === undefined && p.proprietario !== undefined ? p
      : stesso && qui.candidati === undefined && p.candidati !== undefined ? qui
      : stesso && p.candidati === undefined && qui.candidati !== undefined ? p
      : dalB > dalA ? p : qui
    const altro = vince === p ? qui : p
    // Lo stesso proprietario, ma uno dei due non sa dove sta la cartella: si tiene quella nota.
    const percorso = vince.percorso ?? (altro.proprietario === vince.proprietario ? altro.percorso : undefined)
    perId.set(p.id, percorso !== undefined && vince.percorso === undefined ? { ...vince, percorso } : vince)
  }
  return { versione: 1, progetti: [...perId.values()], ...(Object.keys(tolti).length > 0 ? { tolti } : {}) }
}

export type RegistroProgettiStore = {
  leggi: () => RegistroProgetti
  scrivi: (r: RegistroProgetti) => void
}

export function apriRegistroProgetti(dati: string): RegistroProgettiStore {
  const percorso = join(dati, FILE_REGISTRO_PROGETTI)
  // Letto per ogni chat a ogni /api/stato (0.80.0): si tiene finché il file non
  // cambia. Il riferimento è condiviso, come in `workspace-store`: nessuno cambia
  // il registro letto (le operazioni ne creano uno nuovo e lo scrivono).
  const memoria = memoriaDiFile(percorso, (t) => parseRegistro(JSON.parse(t)))
  return {
    leggi() {
      try {
        return memoria.leggi() ?? registroVuoto()
      } catch (err) {
        console.error('[progetti] registro illeggibile:', err)
        return registroVuoto()
      }
    },
    scrivi(r) {
      scriviAtomico(percorso, JSON.stringify(r, null, 2), 'progetti')
      memoria.dimentica()
    }
  }
}
