/**
 * **La chat dell'autopilota davanti a Nicholas** (0.96.0): i workspace che il
 * programma dice «visti» al servizio, che così sa se una domanda nata in chat
 * è stata letta prima di passarla nelle Domande.
 *
 * Sul PC: una finestra di SierraDeck in primo piano (a fuoco, non ridotta a
 * icona) che mostra quel workspace. Sul telefono: la scheda dell'autopilota
 * aperta (la pagina e l'app la rileggono ogni due secondi, `/api/autopilota`).
 */

/** Per quanto tempo una scheda aperta sul telefono conta, dopo l'ultima lettura. */
export const TELEFONO_VISTO_MS = 30_000

export type FinestraVista = { workspace?: string | undefined; inPrimoPiano: boolean }

export function workspaceVisti(p: { finestre: FinestraVista[]; telefono: ReadonlyMap<string, number>; ora: number }): string[] {
  const visti = new Set<string>()
  for (const f of p.finestre) if (f.inPrimoPiano && f.workspace !== undefined && f.workspace !== '') visti.add(f.workspace)
  for (const [ws, quando] of p.telefono) if (p.ora - quando <= TELEFONO_VISTO_MS) visti.add(ws)
  return [...visti]
}
