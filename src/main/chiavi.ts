import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'

/**
 * La parola d'ordine, per chi la vuole.
 *
 * **Cosa protegge davvero.** Chiude l'accesso all'interfaccia: chi si siede al
 * computer non apre le tue chat e non comanda i tuoi autopiloti. Non cifra
 * niente: i file restano sul disco leggibili da chi ha accesso al tuo utente di
 * Windows, e le conversazioni di Claude Code stanno comunque in `~/.claude`,
 * fuori da questo programma. Dirlo è parte del lavoro — una serratura che
 * promette più di quanto tiene è peggio di nessuna serratura, perché cambia il
 * comportamento di chi ci conta.
 *
 * **Facoltativa davvero.** Chi non ne ha bisogno non deve incontrare nessuna
 * richiesta: senza parola impostata il programma si apre come sempre.
 */

/** Il costo di scrypt: alto abbastanza da rendere lento chi prova a indovinare. */
const N = 16_384
const LUNGHEZZA = 64

export type Chiave = {
  /** Casuale per ogni parola: due parole uguali non producono lo stesso segno. */
  sale: string
  /** Il segno della parola, mai la parola. */
  segno: string
}

export type StatoChiavi = {
  /** C'è una parola per aprire il programma. */
  allAvvio: boolean
  /** I workspace chiusi a chiave, per nome. */
  workspace: string[]
}

export type Chiavi = {
  stato: () => StatoChiavi
  /** Imposta o cambia la parola d'avvio. Vuota: la toglie. */
  impostaAvvio: (parola: string) => StatoChiavi
  /** Chiude o apre un workspace. Parola vuota: toglie la chiusura. */
  impostaWorkspace: (nome: string, parola: string) => StatoChiavi
  /** `true` se la parola è quella giusta. Su un nome di workspace, la sua. */
  verifica: (parola: string, workspace?: string) => boolean
}

export function calcolaSegno(parola: string, sale: string): string {
  return scryptSync(parola, sale, LUNGHEZZA, { N }).toString('hex')
}

export function nuovaChiave(parola: string): Chiave {
  const sale = randomBytes(16).toString('hex')
  return { sale, segno: calcolaSegno(parola, sale) }
}

/**
 * Confronto a tempo costante.
 *
 * Un `===` impiega più tempo quanto più i due segni si somigliano, e quel tempo
 * si misura: è il modo con cui una parola si indovina un carattere per volta,
 * senza mai vederla.
 */
export function segnoCorrisponde(parola: string, chiave: Chiave): boolean {
  const atteso = Buffer.from(chiave.segno, 'hex')
  const dato = Buffer.from(calcolaSegno(parola, chiave.sale), 'hex')
  if (atteso.length !== dato.length || atteso.length === 0) return false
  return timingSafeEqual(atteso, dato)
}

type SuDisco = {
  versione: number
  avvio?: Chiave
  workspace: Record<string, Chiave>
}

const VERSIONE = 1
const VUOTO: SuDisco = { versione: VERSIONE, workspace: {} }

function leggiChiave(raw: unknown): Chiave | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const o = raw as Record<string, unknown>
  const sale = typeof o.sale === 'string' ? o.sale : ''
  const segno = typeof o.segno === 'string' ? o.segno : ''
  return sale === '' || segno === '' ? undefined : { sale, segno }
}

export function apriChiavi(cartella: string): Chiavi {
  mkdirSync(cartella, { recursive: true })
  const percorso = join(cartella, 'chiavi.json')

  const leggi = (): SuDisco => {
    if (!existsSync(percorso)) return { ...VUOTO, workspace: {} }
    try {
      const grezzo = JSON.parse(readFileSync(percorso, 'utf8')) as Record<string, unknown>
      const workspace: Record<string, Chiave> = {}
      const ws = grezzo.workspace
      if (typeof ws === 'object' && ws !== null) {
        for (const [nome, v] of Object.entries(ws as Record<string, unknown>)) {
          const chiave = leggiChiave(v)
          if (chiave !== undefined) workspace[nome] = chiave
        }
      }
      const avvio = leggiChiave(grezzo.avvio)
      return { versione: VERSIONE, ...(avvio !== undefined ? { avvio } : {}), workspace }
    } catch (err) {
      // Un file di chiavi illeggibile non deve chiudere fuori il proprietario:
      // si torna al programma aperto e lo si dice. La serratura vale finché
      // funziona; rotta, non deve diventare un muro.
      console.error(`[chiavi] ${percorso} non e leggibile, nessuna parola attiva:`, err)
      return { ...VUOTO, workspace: {} }
    }
  }

  const salva = (d: SuDisco): void => {
    // Permessi stretti dalla nascita: dentro non c'è la parola, ma il segno di
    // una parola è comunque materiale su cui si lavora offline.
    scriviJsonAtomico(percorso, d, 'chiavi', { mode: 0o600 })
  }

  const stato = (): StatoChiavi => {
    const d = leggi()
    return { allAvvio: d.avvio !== undefined, workspace: Object.keys(d.workspace).sort() }
  }

  return {
    stato,

    impostaAvvio(parola) {
      const d = leggi()
      const pulita = parola.trim()
      if (pulita === '') delete d.avvio
      else d.avvio = nuovaChiave(pulita)
      salva(d)
      return stato()
    },

    impostaWorkspace(nome, parola) {
      const d = leggi()
      const pulita = parola.trim()
      if (pulita === '') delete d.workspace[nome]
      else d.workspace[nome] = nuovaChiave(pulita)
      salva(d)
      return stato()
    },

    verifica(parola, workspace) {
      const d = leggi()
      const chiave = workspace === undefined ? d.avvio : d.workspace[workspace]
      // Niente chiave, niente serratura: rispondere «no» chiuderebbe fuori da
      // una porta che non esiste.
      if (chiave === undefined) return true
      // Gli spazi si tolgono qui come si tolgono quando la parola si imposta: se
      // solo una delle due parti li togliesse, chi ne lascia uno alla fine —
      // incollando, o per abitudine — non rientrerebbe mai più.
      return segnoCorrisponde(parola.trim(), chiave)
    }
  }
}
