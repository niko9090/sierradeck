/**
 * **Un orologio che non passa la mezzanotte** (0.85.1, suite ripetibile).
 *
 * I test che davano al servizio `adesso: () => Date.now()` dipendevano dal
 * giorno vero: dopo mezzanotte (o in un altro fuso) cambiavano il giorno delle
 * battute, il «stamattina», le scadenze, e il test falliva senza un difetto.
 * Questo parte da un istante fisso e avanza col tempo vero: le attese e le
 * scadenze di pochi secondi funzionano come prima, la data resta quella.
 */
export interface Orologio {
  /** Millisecondi, come `Date.now()`. */
  ms: () => number
  /** Lo stesso istante in ISO, come `new Date().toISOString()`. */
  iso: () => string
}

export function orologioDa(inizio: string): Orologio {
  const base = Date.parse(inizio)
  if (Number.isNaN(base)) throw new Error(`orologioDa: data non valida «${inizio}»`)
  const partito = performance.now()
  const ms = (): number => base + Math.floor(performance.now() - partito)
  return { ms, iso: () => new Date(ms()).toISOString() }
}
