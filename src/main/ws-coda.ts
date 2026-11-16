// Validazione del workspace per i canali IPC «autopilota:coda/orchestratore/specialista/…».
// Funzione pura, senza Electron, per poterla provare nei test.

/** Il workspace pulito, o undefined se non è valido (vuoto, non stringa, troppo lungo, caratteri di controllo). */
export function workspaceValido(ws: unknown): string | undefined {
  // eslint-disable-next-line no-control-regex
  if (typeof ws !== 'string' || ws.trim() === '' || ws.length > 1000 || /[\u0000-\u001f\u007f]/.test(ws)) return undefined
  return ws.trim()
}

/** Per le scritture: un workspace non valido è un rifiuto. */
export function wsCodaScrittura(ws: unknown): string {
  const v = workspaceValido(ws)
  if (v === undefined) throw new Error('richiesta IPC non valida')
  return v
}

/** Per le letture: un workspace non valido risponde undefined, senza lanciare. */
export async function leggiConWorkspace<T>(ws: unknown, leggi: (ws: string) => Promise<T>): Promise<T | undefined> {
  const v = workspaceValido(ws)
  if (v === undefined) return undefined
  return leggi(v).catch(() => undefined)
}
