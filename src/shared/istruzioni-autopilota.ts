/**
 * L'esito di una consegna, dai passi che il PC scrive nel registro (0.38.2).
 *
 * P4: la linguetta «Istruzioni» degli autopiloti di prima non c'è più; resta
 * solo la lettura dell'esito, che il PC manda al servizio (`/consegne/esito`)
 * perché una consegna non partita torni in coda.
 */

/**
 * Dai passi del registro all'esito: `consegna c-5: partita` e `consegna c-5:
 * non partita (…)`. Solo quelli finali; gli altri passi (ritirata, invio…)
 * non cambiano niente.
 */
export function esitoDaPasso(passo: string): { consegna: string; esito: 'partita' | 'non-partita' | 'non-consegnata'; nonNata?: true; perche?: string } | undefined {
  const m = /consegna (\S+): (partita|non partita|non consegnata)\b/.exec(passo)
  if (m === null || m[1] === undefined || m[1] === '') return undefined
  // «non consegnata» (0.56.4): la finestra ha smesso di provare; il servizio
  // rimette in coda i messaggi che quella consegna portava.
  const esito = m[2] === 'partita' ? 'partita' : m[2] === 'non consegnata' ? 'non-consegnata' : 'non-partita'
  // «non consegnata (non nata: …)» (0.84.4): il terminale della chat non è
  // nato. Il servizio passa il compito a una chat nuova, senza domande.
  const nata = esito === 'non-consegnata' ? /\(non nata: ([^)]*)\)/.exec(passo.slice(m.index)) : null
  return { consegna: m[1], esito, ...(nata !== null ? { nonNata: true as const, perche: (nata[1] ?? '').trim() } : {}) }
}
