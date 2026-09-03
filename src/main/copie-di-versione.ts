import { join, basename } from 'node:path'
import {
  existsSync, mkdirSync, readdirSync, readFileSync, copyFileSync, rmSync, statSync
} from 'node:fs'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'

/**
 * Al primo avvio di una versione nuova, **una copia di tutto lo stato** prima
 * che qualcuno lo legga.
 *
 * Ogni aggiornamento è una versione nuova che rilegge file scritti da una
 * vecchia, e ogni volta che un campo cambia nome — `perMonitor` diventato
 * `perSlot`, per dirne una — il lettore nuovo può trovare un vuoto dove c'era
 * del lavoro, e riscriverlo vuoto alla prima occasione. Le migrazioni alla
 * lettura sono la cura vera; questa è la rete sotto: qualunque cosa sbagli la
 * versione nuova, com'erano i file **prima** è ancora sul disco, in una
 * cartella col nome della versione da cui si veniva.
 *
 * Si scatta **prima** di aprire qualunque archivio, così la copia è quella
 * scritta dall'ultima versione che ha girato, non una già toccata da questa.
 * Un solo giro per versione: lo stampo `versione-installata.json` dice quale
 * versione ha già fatto la sua copia. Le copie si tengono in numero fisso, le
 * più vecchie si tolgono — servono a tornare indietro di un aggiornamento o
 * due, non a fare un archivio.
 */

/** Il file che ricorda quale versione ha già messo al sicuro lo stato. */
export const NOME_STAMPO = 'versione-installata.json'
/** La cartella delle copie, dentro quella dei dati. */
export const CARTELLA_COPIE = 'copie-di-versione'
/** Quante copie si tengono: le più recenti. */
export const COPIE_DA_TENERE = 3

export type Stampo = {
  versione: string
  /** Quando questa versione ha fatto la sua copia (ISO). */
  quando: string
  /** La versione da cui si veniva; assente al primissimo avvio. */
  precedente?: string
}

export type EsitoCopia = {
  /** `false` se questa versione aveva già la sua copia: non si è fatto niente. */
  fatta: boolean
  /** La versione da cui si viene; `'sconosciuta'` se nessuno stampo era stato scritto. */
  da: string
  a: string
  /** La cartella scritta, se `fatta`. */
  cartella?: string
  /** Quanti file sono stati copiati. */
  file: number
  /** Le cartelle di copie tolte perché in eccesso. */
  potate: string[]
  /** Un file che non si è potuto copiare non ferma gli altri: si annota. */
  errori: string[]
}

/**
 * Cosa si mette al sicuro: i file di stato veri, non le cache.
 *
 * Tutti i `.json` in cima alla cartella dei dati più la cartella degli
 * autopiloti; fuori `index.db` (rigenerabile dalle trascrizioni), i log, le
 * copie stesse e tutto quello che Chromium tiene nella cartella.
 */
export function daCopiare(dati: string): string[] {
  const scelti: string[] = []
  let voci: string[]
  try {
    voci = readdirSync(dati)
  } catch {
    return scelti
  }
  for (const nome of voci) {
    if (nome === NOME_STAMPO || nome === CARTELLA_COPIE) continue
    const intero = join(dati, nome)
    let st: ReturnType<typeof statSync>
    try {
      st = statSync(intero)
    } catch {
      continue
    }
    if (st.isFile() && nome.endsWith('.json')) scelti.push(nome)
    if (st.isDirectory() && nome === 'autopiloti') {
      for (const figlio of readdirSync(intero)) {
        if (figlio.endsWith('.json')) scelti.push(join('autopiloti', figlio))
      }
    }
  }
  return scelti.sort()
}

/** Lo stampo, se c'è ed è leggibile. */
export function leggiStampo(dati: string): Stampo | undefined {
  const percorso = join(dati, NOME_STAMPO)
  if (!existsSync(percorso)) return undefined
  try {
    const o = JSON.parse(readFileSync(percorso, 'utf8')) as Record<string, unknown>
    if (typeof o.versione !== 'string' || o.versione === '') return undefined
    return {
      versione: o.versione,
      quando: typeof o.quando === 'string' ? o.quando : new Date(0).toISOString(),
      ...(typeof o.precedente === 'string' ? { precedente: o.precedente } : {})
    }
  } catch {
    return undefined
  }
}

/** Il nome della cartella di una copia: la versione da cui si viene, e quando. */
export function nomeCopia(da: string, adesso: Date): string {
  const t = adesso.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '').replace('T', '-')
  return `${da}-${t}`
}

/**
 * Le cartelle di copie da togliere, tenendone `tieni`: si tengono le più
 * recenti, e «recente» è l'ordine dei nomi, che finiscono con la data.
 */
export function copieDaPotare(nomi: string[], tieni = COPIE_DA_TENERE): string[] {
  const ordinate = [...nomi].sort((a, b) => a.slice(-15).localeCompare(b.slice(-15)))
  return ordinate.slice(0, Math.max(0, ordinate.length - tieni))
}

/**
 * Mette al sicuro lo stato se questa versione non l'ha ancora fatto.
 *
 * Non solleva mai: un avvio non si ferma perché una copia non è riuscita — ma
 * lo si racconta nell'esito, perché una copia mancata è proprio ciò che si
 * vorrebbe sapere il giorno in cui serve.
 */
export function mettiAlSicuroLoStato(dati: string, versione: string, adesso = new Date()): EsitoCopia {
  const stampo = leggiStampo(dati)
  const da = stampo?.versione ?? 'sconosciuta'
  if (stampo !== undefined && stampo.versione === versione) {
    return { fatta: false, da, a: versione, file: 0, potate: [], errori: [] }
  }

  const errori: string[] = []
  const radice = join(dati, CARTELLA_COPIE)
  const cartella = join(radice, nomeCopia(da, adesso))
  let file = 0
  const elenco = daCopiare(dati)
  if (elenco.length > 0) {
    try {
      mkdirSync(join(cartella, 'autopiloti'), { recursive: true })
    } catch (err) {
      errori.push(`cartella ${cartella}: ${String(err)}`)
    }
    for (const rel of elenco) {
      try {
        copyFileSync(join(dati, rel), join(cartella, rel))
        file += 1
      } catch (err) {
        errori.push(`${rel}: ${String(err)}`)
      }
    }
  }

  const potate: string[] = []
  try {
    const presenti = existsSync(radice)
      ? readdirSync(radice).filter((n) => statSync(join(radice, n)).isDirectory())
      : []
    for (const nome of copieDaPotare(presenti)) {
      try {
        rmSync(join(radice, nome), { recursive: true, force: true })
        potate.push(nome)
      } catch (err) {
        errori.push(`potatura ${nome}: ${String(err)}`)
      }
    }
  } catch (err) {
    errori.push(`potatura: ${String(err)}`)
  }

  const nuovo: Stampo = {
    versione,
    quando: adesso.toISOString(),
    ...(stampo !== undefined ? { precedente: stampo.versione } : {})
  }
  if (!scriviJsonAtomico(join(dati, NOME_STAMPO), nuovo, 'versione')) {
    errori.push(`stampo ${NOME_STAMPO} non scritto`)
  }

  return {
    fatta: true,
    da,
    a: versione,
    ...(elenco.length > 0 ? { cartella: basename(cartella) } : {}),
    file,
    potate,
    errori
  }
}
