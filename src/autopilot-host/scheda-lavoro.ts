import type { Autopilota } from '@shared/autopilota'

/**
 * La scheda che un autopilota lascia quando ha finito.
 *
 * È il momento in cui il lavoro è ancora tutto lì e nessuno l'ha ancora
 * dimenticato: obiettivo, criteri raggiunti, mosse fatte. Domani quella stessa
 * ricostruzione costerebbe una rilettura della chat — token pagati per sapere
 * una cosa che si poteva scrivere in dieci righe.
 *
 * Scritta per una persona, non per una macchina: niente identificatori, niente
 * campi tecnici, e le decisioni raccontate come sono andate.
 */

/** Quante mosse riportare: oltre, la scheda diventa il registro che non vuole essere. */
const MOSSE_MAX = 12

export function titoloScheda(a: Autopilota): string {
  const nome = a.nome.trim()
  return nome !== '' ? nome : a.obiettivo.slice(0, 80)
}

export function corpoScheda(a: Autopilota): string {
  const criteri = a.criteri.length === 0
    ? '_Nessun criterio: il lavoro è stato giudicato a mano._'
    : a.criteri.map((c) => `- ${c.soddisfatto ? '✅' : '⬜'} ${c.descrizione}`).join('\n')

  // Le tracce sono l'esito dei comandi, ripetuto identico a ogni giro: qui
  // conta cosa è stato *deciso*, non quante volte si è visto lo stesso errore.
  const mosse = a.decisioni
    .filter((d) => !d.cosa.startsWith('proseguito: '))
    .slice(-MOSSE_MAX)
    .map((d) => `- **${d.quando.slice(0, 16).replace('T', ' ')}** — ${d.cosa}`)

  const raccontoMosse = mosse.length === 0
    ? '_Nessuna mossa fuori dall’ordinario: è andato dritto._'
    : mosse.join('\n')

  return [
    `## Obiettivo\n\n${a.obiettivo}`,
    `\n## Come è finita\n\n${criteri}`,
    `\n## Le mosse che contano\n\n${raccontoMosse}`,
    `\n## In numeri\n\n- interventi: ${a.cicli}\n- cartella: \`${a.cwd}\``
  ].join('\n')
}

export function tagScheda(a: Autopilota): string[] {
  const tag = ['autopilota']
  if (a.stato === 'finito') tag.push('finito')
  if (a.criteri.some((c) => !c.soddisfatto)) tag.push('incompleto')
  return tag
}
