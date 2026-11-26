/**
 * Il nome di un autopilota, a prova di dati storti (k-351a).
 *
 * Un autopilota letto da un altro PC (`/api/autopilota`, versione diversa) o
 * salvato da una versione vecchia può non avere `nome`, o averlo di un altro
 * tipo: `a.nome.trim()` allora rompeva la Panoramica intera. Il tipo dice
 * `string`, ma qui i dati non passano da un validatore: la difesa sta in un
 * posto solo.
 */

/** Una stringa com'è, altrimenti vuota: il valore di un campo che può mancare o essere storto. */
export function testoOVuoto(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/**
 * Il nome da mostrare: quello dell'autopilota se c'è (non vuoto), altrimenti la
 * riserva. Accetta anche un autopilota senza `nome` o con `nome` non stringa.
 */
export function nomeODi(a: { nome?: unknown }, riserva: string): string {
  const n = testoOVuoto(a.nome)
  return n.trim() !== '' ? n : riserva
}

/**
 * Un autopilota arrivato da fuori (altro PC, versione diversa) con i campi
 * di testo sistemati: `nome` e `obiettivo` mancanti o non stringa diventano ''.
 * Il resto passa com'è.
 */
export function conNomeSicuro<T extends object>(a: T): T & { nome: string; obiettivo: string } {
  const o = a as { nome?: unknown; obiettivo?: unknown }
  return { ...a, nome: testoOVuoto(o.nome), obiettivo: testoOVuoto(o.obiettivo) }
}
