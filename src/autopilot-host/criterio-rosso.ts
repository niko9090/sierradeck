import type { CompitoPiano as Compito } from '@shared/piano-orchestratore'

/**
 * **Il criterio rosso non resta lì** (06/11). L'autopilota deve portare a
 * termine da solo: dopo un'unione con il criterio rosso affida subito la
 * correzione. Se chiude il turno senza farlo, e nessuno specialista lavora a
 * quel compito, il programma lo risveglia con un promemoria esplicito: una
 * volta dopo `ROSSO_PRIMO_MS` di quiete, un'altra dopo `ROSSO_SECONDO_MS`.
 * Mai un messaggio a Nicholas.
 *
 * 11/11: senza tetto. Dopo il secondo, un promemoria ogni `ROSSO_POI_MS`
 * finché il compito resta rosso e nessuno ci lavora: con due soli promemoria
 * un compito rosso poteva restare lì per sempre, in silenzio.
 */

export const ROSSO_PRIMO_MS = 90_000
export const ROSSO_SECONDO_MS = 20 * 60_000
export const ROSSO_POI_MS = 30 * 60_000

export type RossoVisto = { firma: string; /** da quando il compito è rosso e l'autopilota è quieto */ dal: number; mandati: number; ultimo: number }

const corto = (t: string, n: number): string => {
  const x = t.replace(/\s+/gu, ' ').trim()
  return x.length > n ? `${x.slice(0, n - 1)}…` : x
}

/**
 * Un giro di controllo (ogni minuto) per un workspace. Aggiorna `visti` e dice,
 * se serve, il testo del promemoria. `compitiConSpecialista`: i compiti con
 * uno specialista al lavoro; `occupato`: un turno dell'autopilota è in corso
 * (o ha messaggi/eventi in attesa), cioè sta già decidendo.
 */
export function promemoriaRosso(
  visti: Map<string, RossoVisto>,
  p: { compiti: readonly Compito[]; compitiConSpecialista: ReadonlySet<string>; richiesteAperte: ReadonlySet<string>; occupato: boolean; ora: number }
): string | undefined {
  const rossi = p.compiti.filter((c) => c.stato === 'unito' && c.criterioVerde !== true && p.richiesteAperte.has(c.richiesta) && !p.compitiConSpecialista.has(c.id))
  const ids = new Set(rossi.map((c) => c.id))
  for (const id of [...visti.keys()]) if (!ids.has(id)) visti.delete(id)
  const dovuti: Compito[] = []
  for (const c of rossi) {
    const firma = c.esito ?? ''
    const v = visti.get(c.id)
    if (v === undefined || v.firma !== firma) { visti.set(c.id, { firma, dal: p.ora, mandati: 0, ultimo: 0 }); continue }
    // L'autopilota sta decidendo: la quiete riparte da quando ha finito.
    if (p.occupato) { v.dal = p.ora; continue }
    const dovuto = v.mandati === 0 ? p.ora - v.dal >= ROSSO_PRIMO_MS : p.ora - v.ultimo >= (v.mandati === 1 ? ROSSO_SECONDO_MS : ROSSO_POI_MS)
    if (!dovuto) continue
    v.mandati += 1
    v.ultimo = p.ora
    dovuti.push(c)
  }
  if (dovuti.length === 0) return undefined
  return [
    'Promemoria: dopo l’unione il criterio è rosso e nessuno specialista sta lavorando alla correzione.',
    ...dovuti.map((c) => `- ${c.id} «${corto(c.titolo, 100)}»${c.esito !== undefined ? `: ${corto(c.esito, 200)}` : ''}`),
    'Affida la correzione adesso, nello stesso turno, a uno specialista (dì cosa non va e qual è il criterio da far passare). Non scrivere a Nicholas e non chiedergli di fare niente: la correzione è lavoro tuo.'
  ].join('\n')
}
