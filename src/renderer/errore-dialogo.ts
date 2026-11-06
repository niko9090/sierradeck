/**
 * Il testo che legge Nicholas quando un messaggio all'autopilota non va
 * (k-42): senza il prefisso di Electron («Error invoking remote method …») e,
 * se il servizio non ha risposto in tempo, in italiano semplice.
 */
const PREFISSO_IPC = /^Error invoking remote method '[^']+': (Error: )?/

export const SERVIZIO_OCCUPATO =
  'Il servizio dell’autopilota è occupato e non ha confermato il messaggio. Aspetta qualche secondo e controlla la conversazione: se non c’è, riscrivilo.'

export function testoErroreDialogo(e: unknown): string {
  const testo = (e instanceof Error ? e.message : String(e)).replace(PREFISSO_IPC, '')
  if (/non risponde sulla porta \d+/u.test(testo) || /TimeoutError|operation was aborted/u.test(testo)) return SERVIZIO_OCCUPATO
  return testo
}
