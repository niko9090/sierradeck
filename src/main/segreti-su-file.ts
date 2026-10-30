import { existsSync, readFileSync, statSync, utimesSync } from 'node:fs'
import { scriviAtomico } from '@shared/scrittura-atomica'

/**
 * I token su disco, cifrati con il portachiavi del sistema (0.86.2, audit I5).
 *
 * `google-drive-token.json` e `accesso-supabase.json` erano JSON in chiaro, e
 * altre tre copie di ciascuno stavano in `copie-di-versione\`. Adesso si
 * scrivono cifrati con `safeStorage` di Electron (DPAPI su Windows, legata a
 * questo utente).
 *
 * - Un file in chiaro (scritto da una versione di prima) si legge lo stesso e,
 *   se il portachiavi c'è, si riscrive cifrato alla prima lettura.
 * - Senza portachiavi (non disponibile, o non passato: le prove) si fa come
 *   prima: in chiaro. Un file cifrato senza portachiavi non si legge e **non
 *   si riscrive** (S3): è «portachiavi non pronto», non «non collegato», e si
 *   riprova più tardi.
 *
 * Il modulo non conosce Electron: il portachiavi arriva da fuori, come la
 * `Cassetta` delle destinazioni.
 */
export type Portachiavi = {
  disponibile: () => boolean
  /** Dal testo in chiaro a una stringa (base64) che fuori da questo utente non vale niente. */
  cifra: (chiaro: string) => string
  decifra: (cifrato: string) => string
}

/** Il segno della busta cifrata, dentro il file (resta JSON valido). */
export const SEGNO_CIFRATO = 'sierradeckCifrato'
type Busta = { [SEGNO_CIFRATO]: 1; dati: string }

function bustaDi(testo: string): Busta | undefined {
  try {
    const o = JSON.parse(testo) as Partial<Busta> | null
    return o !== null && typeof o === 'object' && o[SEGNO_CIFRATO] === 1 && typeof o.dati === 'string' ? (o as Busta) : undefined
  } catch { return undefined }
}

function usabile(p: Portachiavi | undefined): p is Portachiavi {
  if (p === undefined) return false
  try { return p.disponibile() } catch { return false }
}

/** Il file è già nella busta cifrata? */
export function eCifrato(file: string): boolean {
  try { return bustaDi(readFileSync(file, 'utf8')) !== undefined } catch { return false }
}

/** Il contenuto da scrivere: la busta se il portachiavi c'è, se no il testo com'è (come prima). */
function contenutoPer(chiaro: string, p: Portachiavi | undefined): string {
  if (!usabile(p)) return chiaro
  try {
    return JSON.stringify({ [SEGNO_CIFRATO]: 1, dati: p.cifra(chiaro) } satisfies Busta)
  } catch (err) {
    console.error('[segreti] cifratura non riuscita, scrivo come prima:', err)
    return chiaro
  }
}

/**
 * Scrive un segreto: cifrato se si può, in chiaro se no. Restituisce se ha scritto.
 *
 * **Mai sopra un file cifrato quando il portachiavi non è pronto** (S3): il
 * segreto che c'è dentro non si leggerebbe più, e chi scrive (un rinnovo, la
 * sessione di Supabase che si crede scollegata) lo sostituirebbe con niente.
 */
export function scriviSegreto(file: string, chiaro: string, p: Portachiavi | undefined, etichetta: string): boolean {
  if (!usabile(p) && eCifrato(file)) {
    console.warn(`[${etichetta}] ${file}: è cifrato e il portachiavi non è pronto, non lo riscrivo`)
    return false
  }
  return scriviAtomico(file, contenutoPer(chiaro, p), etichetta)
}

/**
 * Com'è andata la lettura di un segreto (S3). `portachiavi-non-pronto`: il
 * file è cifrato e il portachiavi non risponde ancora (succede appena
 * avviato): **non** vuol dire scollegato, si riprova più tardi.
 */
export type LetturaSegreto =
  | { stato: 'ok'; testo: string }
  | { stato: 'assente' }
  | { stato: 'portachiavi-non-pronto' }
  | { stato: 'non-si-decifra' }

/**
 * Cifra sul posto un file in chiaro, tenendo la data di modifica: chi sceglie
 * fra le copie per data (il rinnovo di prova del Drive) deve trovare le stesse
 * date di prima.
 */
function cifraSulPosto(file: string, chiaro: string, p: Portachiavi, etichetta: string): void {
  let date: { atime: Date; mtime: Date } | undefined
  try { const st = statSync(file); date = { atime: st.atime, mtime: st.mtime } } catch { /* senza date */ }
  const contenuto = contenutoPer(chiaro, p)
  if (contenuto === chiaro) return
  if (!scriviAtomico(file, contenuto, etichetta)) return
  if (date !== undefined) { try { utimesSync(file, date.atime, date.mtime) } catch { /* la data cambia, il segreto e' al sicuro */ } }
}

/**
 * Legge un segreto. Un file in chiaro si migra (si riscrive cifrato) se il
 * portachiavi c'è e `migra` non è `false`. `undefined` se manca, non si legge,
 * o è cifrato e il portachiavi non c'è.
 */
export function leggiSegreto(file: string, p: Portachiavi | undefined, etichetta: string, opzioni: { migra?: boolean } = {}): string | undefined {
  const l = leggiSegretoConStato(file, p, etichetta, opzioni)
  return l.stato === 'ok' ? l.testo : undefined
}

/** Come `leggiSegreto`, ma dice perché non c'è (S3): il portachiavi non pronto non è un «scollegato». */
export function leggiSegretoConStato(file: string, p: Portachiavi | undefined, etichetta: string, opzioni: { migra?: boolean } = {}): LetturaSegreto {
  let testo: string
  try {
    if (!existsSync(file)) return { stato: 'assente' }
    testo = readFileSync(file, 'utf8')
  } catch { return { stato: 'assente' } }
  const busta = bustaDi(testo)
  if (busta !== undefined) {
    if (!usabile(p)) return { stato: 'portachiavi-non-pronto' }
    try { return { stato: 'ok', testo: p.decifra(busta.dati) } } catch (err) {
      console.error(`[${etichetta}] ${file}: non si decifra (un altro utente Windows, o un altro PC):`, err)
      return { stato: 'non-si-decifra' }
    }
  }
  if (opzioni.migra !== false && usabile(p)) cifraSulPosto(file, testo, p, etichetta)
  return { stato: 'ok', testo }
}

// Le copie di versione (`copie-di-versione/<versione>/<nome>`) **non si
// cifrano** (S3): sono le copie con cui una versione di prima riparte dopo un
// ritorno indietro, e la 0.86.1 non sa leggere la busta: si ritrovava il Drive
// scollegato senza rimedio. Restano come sono; le copie nuove non hanno più i
// token (vedi `copie-di-versione`).
