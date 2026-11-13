import { confrontaVersioni } from '@shared/novita'
import { noteDaNovita, PAGINA_VERSIONI, type NoteAggiornamento } from '@shared/note-aggiornamento'

/**
 * **Le novità dell'Aiutante per la finestra degli aggiornamenti** (13/11, 1.0.3).
 *
 * La fonte è una sola, `src/aiutante/novita-aiutante.txt` (la stessa che
 * `allega-aiutante.mjs` mette nelle note della release): un blocco per
 * versione, la riga col numero e sotto le righe fra apici singoli. Quella di
 * questa versione è dentro il programma (le schede «installata» e «prima»);
 * quella della versione nuova si legge dal repository pubblico, perché questo
 * Aiutante non la può avere.
 */

/** Dove leggere le novità aggiornate (il repository è pubblico, come le release). */
export const NOVITA_AIUTANTE_URL = 'https://raw.githubusercontent.com/niko9090/sierradeck/main/src/aiutante/novita-aiutante.txt'

export type NovitaAiutante = { versione: string; righe: string[] }

/** Dal testo del file: le versioni con le loro righe, dalla più nuova. Le righe di commento in testa non contano. */
export function novitaDaTesto(sorgente: string): NovitaAiutante[] {
  const out: NovitaAiutante[] = []
  let attuale: NovitaAiutante | undefined
  for (const riga of sorgente.split(/\r?\n/u)) {
    const v = /^\s*versione:\s*'([0-9]+\.[0-9]+\.[0-9]+)'\s*$/u.exec(riga)
    if (v !== null) { attuale = { versione: v[1] as string, righe: [] }; out.push(attuale); continue }
    const r = /^\s*'((?:[^'\\]|\\.)*)',?\s*$/u.exec(riga)
    if (r !== null && attuale !== undefined) attuale.righe.push((r[1] as string).replace(/\\(.)/gu, '$1'))
  }
  return out.sort((a, b) => confrontaVersioni(b.versione, a.versione))
}

/**
 * Le note per la finestra: le versioni dopo la installata fino alla nuova
 * (la nuova e quelle saltate), dalla fonte letta; se non c'è, un avviso che
 * dice dove leggerle (la finestra non resta mai vuota, e si installa lo stesso).
 */
export function noteAiutante(p: { sorgente: string | undefined; installata: string; nuova: string }): NoteAggiornamento {
  const tutte = p.sorgente !== undefined ? novitaDaTesto(p.sorgente) : []
  const fra = tutte.filter((n) => confrontaVersioni(n.versione, p.installata) > 0 && confrontaVersioni(n.versione, p.nuova) <= 0)
  const avviso = p.sorgente === undefined
    ? `Non sono riuscito a leggere le novità della ${p.nuova}: le trovi nella pagina delle versioni, ${PAGINA_VERSIONI}. Puoi installare lo stesso.`
    : !fra.some((n) => n.versione === p.nuova) ? `Della ${p.nuova} non ho trovato le novità scritte: le trovi nella pagina delle versioni, ${PAGINA_VERSIONI}.` : undefined
  return {
    versione: p.nuova,
    installata: p.installata,
    note: noteDaNovita(fra),
    fonte: fra.length > 0 ? 'github' : 'nessuna',
    dove: PAGINA_VERSIONI,
    ...(avviso !== undefined ? { avviso } : {})
  }
}
