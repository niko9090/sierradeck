import { PROGRAMMI_NOTI } from './aiuto-risorse'

/**
 * **Cosa sa fare un PC** (k-166n1): la rete deve saperlo PRIMA di affidargli un
 * compito, non scoprirlo all'arrivo del progetto (`verificaRisorse`).
 *
 * Tutto puro: `ricavaCapacita` guarda un PATH con una funzione `esiste`
 * iniettata (testabile con un PATH finto); `haCapacita` legge il risultato
 * dal battito. Un PC di versione vecchia non porta il campo: per lui la
 * risposta è «sconosciuto», mai «no».
 */

export type CapacitaPc = {
  /** I programmi trovati nel PATH (nomi senza estensione). */
  programmi: string[]
  /** Un telefono collegato (adb). */
  telefono: boolean
  /** Percorsi o host di rete che quel PC raggiunge, se noti. */
  rete?: string[]
  /** È SierraDeck Aiutante. */
  aiutante: boolean
  /** Quando è stato calcolato, ISO. */
  il: string
}

/** I programmi da cercare nel PATH: quelli noti più gli strumenti di sviluppo. */
export const PROGRAMMI_CAPACITA: readonly string[] = [...new Set([...PROGRAMMI_NOTI, 'gh', 'adb', 'java', 'git', 'node', 'docker', 'python'])]

/** Ogni quanto si ricalcolano: il PATH cambia di rado. */
export const CAPACITA_VALIDA_MS = 10 * 60_000

export type OpzioniCapacita = {
  telefono?: boolean
  rete?: readonly string[]
  aiutante?: boolean
  /** ms dal 1970 (per i test). */
  adesso?: number
  /** Le estensioni eseguibili; predefinite: quelle di Windows se il PATH usa `;`, nessuna altrimenti. */
  estensioni?: readonly string[]
  programmi?: readonly string[]
}

/** I programmi di `programmi` presenti in almeno una cartella del PATH. */
export function ricavaCapacita(path: string, esiste: (percorso: string) => boolean, opz: OpzioniCapacita = {}): CapacitaPc {
  const windows = path.includes(';')
  const cartelle = path.split(windows ? ';' : ':').map((c) => c.trim().replace(/^"(.*)"$/u, '$1')).filter((c) => c !== '')
  const estensioni = opz.estensioni ?? (windows ? ['.exe', '.cmd', '.bat', '.com'] : [''])
  const sep = windows ? '\\' : '/'
  const trovati: string[] = []
  for (const nome of opz.programmi ?? PROGRAMMI_CAPACITA) {
    const c = cartelle.some((d) => {
      const base = /[\\/]$/u.test(d) ? d : d + sep
      return estensioni.some((e) => { try { return esiste(base + nome + e) } catch { return false } })
    })
    if (c) trovati.push(nome)
  }
  const rete = [...new Set((opz.rete ?? []).filter((r) => r !== ''))]
  return {
    programmi: trovati,
    telefono: opz.telefono === true,
    ...(rete.length > 0 ? { rete } : {}),
    aiutante: opz.aiutante === true,
    il: new Date(opz.adesso ?? Date.now()).toISOString()
  }
}

/**
 * Il PC ha quella capacità? `nome` è un programma, `telefono`, `aiutante`
 * o un percorso/host di rete. Senza il campo (PC vecchio): `sconosciuto`.
 */
export function haCapacita(c: CapacitaPc | null | undefined, nome: string): 'si' | 'no' | 'sconosciuto' {
  if (c === undefined || c === null || typeof c !== 'object' || !Array.isArray(c.programmi)) return 'sconosciuto'
  const n = nome.trim().toLowerCase()
  if (n === 'telefono') return c.telefono === true ? 'si' : 'no'
  if (n === 'aiutante') return c.aiutante === true ? 'si' : 'no'
  if (c.programmi.some((p) => p.toLowerCase() === n)) return 'si'
  if (Array.isArray(c.rete) && c.rete.some((r) => r.toLowerCase() === n)) return 'si'
  return 'no'
}

/** `capacita` da fuori (battito, risposta): la forma giusta o niente. */
export function capacitaValida(x: unknown): CapacitaPc | undefined {
  if (typeof x !== 'object' || x === null) return undefined
  const o = x as Record<string, unknown>
  if (!Array.isArray(o.programmi) || typeof o.il !== 'string') return undefined
  const rete = Array.isArray(o.rete) ? o.rete.filter((r): r is string => typeof r === 'string').slice(0, 50) : []
  return {
    programmi: o.programmi.filter((p): p is string => typeof p === 'string').slice(0, 100),
    telefono: o.telefono === true,
    ...(rete.length > 0 ? { rete } : {}),
    aiutante: o.aiutante === true,
    il: o.il
  }
}
