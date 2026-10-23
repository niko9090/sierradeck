import { copyFileSync, existsSync, lstatSync, symlinkSync, unlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { EsitoVerifica } from './decisione'

/**
 * L'ambiente della copia di una chat (0.84.4).
 *
 * Le copie delle chat (`SierraDeck.sierradeck-wt/<ramo>`) hanno solo i file
 * tracciati: niente `node_modules`, niente `android/local.properties`. Il 23/10
 * la Revisione ha rimandato indietro c-95 e c-106 quattro e cinque volte con «il
 * ramo rompe quello che sul ramo principale passava»: nella copia `tsc non è
 * riconosciuto`, `npx vitest` scaricava una vitest diversa che non legge
 * `vitest.config.ts`, gradle non trovava l'SDK. Il codice era uguale a main e
 * verde; Nicholas ha dovuto rispondere tre volte «rifallo ancora».
 *
 * Le regole:
 * 1. Prima di misurare in una copia si rimette quello che manca, **in modo
 *    temporaneo**: un collegamento (junction) a `node_modules` della cartella
 *    principale, e una copia di `android/local.properties`.
 * 2. Il collegamento si toglie solo dopo l'unione, o prima di togliere la
 *    copia: toglierlo prima faceva rimisurare la copia vuota (c-95, 23/10).
 *    Si toglie con `unlink` e solo se è un collegamento: mai si cancella dentro.
 * 3. Un criterio che fallisce perché il comando non parte è un **problema di
 *    ambiente**, non un difetto del ramo: non si rimanda indietro e non si
 *    chiede a Nicholas.
 */

/** Il file di Android che git non porta nelle copie (dice dov'è l'SDK). */
const PROPRIETA_ANDROID = join('android', 'local.properties')

export type Preparazione = {
  /** Cosa è stato rimesso adesso, a parole («node_modules collegato», …). */
  messi: string[]
  /** Cosa manca anche nella cartella principale: lì non si può fare niente. */
  mancano: string[]
}

const eCollegamento = (p: string): boolean => {
  try { return lstatSync(p).isSymbolicLink() } catch { return false }
}

const esiste = (p: string): boolean => {
  try { lstatSync(p); return true } catch { return false }
}

/**
 * Rimette nella copia quello che serve per misurare. Non tocca mai la cartella
 * principale, e non fa niente se la copia è la cartella principale o non c'è.
 */
export function preparaCopia(copia: string, principale: string): Preparazione {
  const messi: string[] = []
  const mancano: string[] = []
  if (resolve(copia) === resolve(principale) || !existsSync(copia)) return { messi, mancano }
  const moduli = join(copia, 'node_modules')
  const moduliVeri = join(principale, 'node_modules')
  if (existsSync(join(copia, 'package.json')) && !esiste(moduli)) {
    if (!existsSync(moduliVeri)) mancano.push('node_modules')
    else {
      try { symlinkSync(moduliVeri, moduli, 'junction'); messi.push('node_modules collegato') } catch (err) { mancano.push(`node_modules (${String(err).slice(0, 80)})`) }
    }
  }
  const prop = join(copia, PROPRIETA_ANDROID)
  const propVero = join(principale, PROPRIETA_ANDROID)
  if (existsSync(join(copia, 'android')) && !esiste(prop) && existsSync(propVero)) {
    try { copyFileSync(propVero, prop); messi.push('android/local.properties copiato') } catch { mancano.push('android/local.properties') }
  }
  return { messi, mancano }
}

/**
 * Toglie il collegamento a `node_modules` messo da `preparaCopia`. Solo se è un
 * collegamento: una cartella vera (installata a mano nella copia) resta.
 * `local.properties` resta: è ignorato da git e se ne va con la copia.
 */
export function togliCollegamenti(copia: string): string[] {
  const moduli = join(copia, 'node_modules')
  if (!eCollegamento(moduli)) return []
  try { unlinkSync(moduli); return ['node_modules'] } catch { return [] }
}

/**
 * Il criterio è fallito per l'ambiente, non per il codice? Il motivo a parole,
 * o `undefined` se il fallimento va preso sul serio.
 *
 * Attenzione ai difetti veri che si somigliano: `error TS2307: Cannot find
 * module './x'` e un `import` di un file tolto sono colpa del ramo, e restano
 * tali. Contano come ambiente solo i programmi e i pacchetti che mancano.
 */
export function problemaDiAmbiente(e: Pick<EsitoVerifica, 'passato' | 'uscita'> & { misurato?: boolean }): string | undefined {
  if (e.passato) return undefined
  const u = e.uscita
  if (/SDK location not found|sdk\.dir/i.test(u)) return 'gradle non trova l’SDK di Android (manca android/local.properties)'
  if (/Need to install the following packages|could not determine executable to run|following package was not found and will be installed/i.test(u)) return 'npx non trova il programma nella copia e lo scaricherebbe (manca node_modules)'
  if (/Cannot find module ['"][^'"\n]*node_modules[\\/]/i.test(u)) return 'manca un pacchetto in node_modules'
  if (/Cannot find package ['"](?![./])[^'"\n]+['"]/i.test(u)) return 'manca un pacchetto in node_modules'
  if (e.misurato === false || /\b(tsc|vitest|vite|electron-vite|eslint|tsx|gradle)['"]?\s*(:\s*)?(command not found|not found|is not recognized|non è riconosciuto)/i.test(u)) return 'il comando non è partito nella copia'
  return undefined
}


/**
 * I criteri che passano sul ramo principale e non sul ramo rivisto, divisi fra
 * quelli che il ramo rompe davvero e quelli che falliscono per l'ambiente della
 * copia (con il motivo). Una copia sparita o che non è più un repository git
 * (c-82, c-97, c-99, c-109 il 23/10: «Lista dei lavori» rossa ovunque) non dice
 * niente sul ramo: tutto quello che fallisce lì è ambiente.
 */
export function peggioratiDelRamo(
  base: Pick<EsitoVerifica, 'descrizione' | 'passato'>[],
  ramo: (Pick<EsitoVerifica, 'descrizione' | 'passato' | 'uscita'> & { misurato?: boolean })[],
  copiaSana: boolean
): { delRamo: string[]; ambiente: string[] } {
  const passaPrima = new Set(base.filter((e) => e.passato).map((e) => e.descrizione))
  const delRamo: string[] = []
  const ambiente: string[] = []
  for (const e of ramo) {
    if (e.passato || !passaPrima.has(e.descrizione)) continue
    const motivo = copiaSana ? problemaDiAmbiente(e) : 'la copia del ramo non c’è più o non è un repository git'
    if (motivo !== undefined) ambiente.push(`${e.descrizione} (${motivo})`)
    else delRamo.push(e.descrizione)
  }
  return { delRamo, ambiente }
}
