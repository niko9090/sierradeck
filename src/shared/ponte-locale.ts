/**
 * Il ponte fra il servizio degli autopiloti e il programma principale, sul
 * computer stesso (k-166n11). Il servizio è un processo a parte e può restare
 * acceso quando il programma si riavvia: porta e gettone stanno quindi in un
 * piccolo file nella cartella dei dati (solo per chi lo apre), riscritto dal
 * programma a ogni avvio e riletto dal servizio a ogni richiesta.
 */

export const FILE_PONTE_LOCALE = 'ponte-locale.json'
export const ROTTA_AZIONE_LOCALE = '/api/azione-locale'

export type PonteLocale = { porta: number; gettone: string }

/** Il contenuto del file, se è fatto bene. */
export function leggiPonteLocale(testo: string): PonteLocale | undefined {
  let x: unknown
  try { x = JSON.parse(testo) } catch { return undefined }
  if (typeof x !== 'object' || x === null) return undefined
  const o = x as Record<string, unknown>
  const porta = o.porta
  if (typeof porta !== 'number' || !Number.isInteger(porta) || porta < 1 || porta > 65535) return undefined
  if (typeof o.gettone !== 'string' || o.gettone.length < 20 || o.gettone.length > 200) return undefined
  return { porta, gettone: o.gettone }
}
