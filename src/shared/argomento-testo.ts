/**
 * L'argomento riconosciuto di un testo (0.81.0, spostato qui da
 * `autopilot-host/domande-doppie.ts` per la coda delle richieste, P1):
 * installare o pubblicare quali versioni del programma.
 */

/**
 * Una versione del programma: «la 0.80.0», «versione 0.80.0», «v0.80.0»,
 * «SierraDeck 0.80.0», «the 0.80.0». Un numero qualunque no: «installo vitest
 * 0.34.6?» parla di un pacchetto, e non va confusa (Revisione 0.81.0).
 * Dal 0.82.0 anche «una 0.81.1» e «pubblico (adesso) la 0.81.1».
 */
const VERSIONE = /(?:(?<![\p{L}])(?:la|alla|della|una|versione|release|sierradeck|the|pubblic[\p{L}]*|publish[\p{L}]*|rilasci[\p{L}]*)\s+(?:(?:adesso|ora|subito|now)\s+)?(?:(?:una|la|the|a)\s+)?v?|(?<![\p{L}\d.])v)(\d+\.\d+\.\d+)(?![\d.])/giu
/** Installare (non disinstallare): «installi», «installo», «install», «installa». */
const INSTALLA = /(?<![\p{L}])install/iu
/** Pubblicare (0.82.0): «pubblico», «pubblicata», «publish», «rilascio», «release». */
const PUBBLICA = /(?<![\p{L}])(?:pubblic|publish|rilasc|release)/iu

export type Argomento = { installa: boolean; pubblica: boolean; versioni: string[] }

export function argomentoDi(testo: string): Argomento {
  const versioni = [...new Set([...testo.matchAll(VERSIONE)].map((m) => m[1]!))]
  return { installa: INSTALLA.test(testo), pubblica: PUBBLICA.test(testo), versioni }
}

/**
 * Due testi sullo stesso argomento riconosciuto: installare **le stesse**
 * versioni. «La 0.80.0 o la 0.80.1?» non è «la 0.80.1?».
 */
export function stessoArgomento(a: string, b: string): boolean {
  const x = argomentoDi(a)
  const y = argomentoDi(b)
  return x.installa && y.installa && x.versioni.length > 0 &&
    x.versioni.length === y.versioni.length && x.versioni.every((v) => y.versioni.includes(v))
}
