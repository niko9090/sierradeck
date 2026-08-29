/**
 * Cosa è più nuovo di qua e cosa di là.
 *
 * È la ragione per cui si riapre un client SFTP la seconda volta. La prima si
 * carica tutto; dalla seconda in poi la domanda è sempre la stessa — *questo
 * file l'ho già mandato? quello sul server è più recente del mio?* — e senza
 * una risposta si finisce per ricaricare tutto «per sicurezza», che è il modo
 * più comune di sovrascrivere una correzione fatta direttamente sul server.
 *
 * ## La tolleranza sui tempi
 *
 * Due copie identiche quasi mai hanno lo stesso millisecondo. I tempi SFTP
 * arrivano al **secondo**, alcuni filesystem arrotondano a due, e il caricamento
 * non conserva la data d'origine. Senza una tolleranza ogni singolo file
 * risulterebbe «diverso», che è come non dire niente — solo più rumoroso.
 *
 * Sulla dimensione invece nessuna tolleranza: un byte di differenza è una
 * differenza vera.
 */

export type LatoFile = { nome: string; cartella: boolean; dimensione: number; quando: number }

export type Confronto =
  /** Non c'è dall'altra parte. */
  | 'solo-qui'
  /** C'è, ed è uguale: stessa dimensione, stessa ora a meno della tolleranza. */
  | 'uguale'
  /** Questo è più recente di quello dall'altra parte. */
  | 'piu-nuovo'
  /** Quello dall'altra parte è più recente di questo. */
  | 'piu-vecchio'
  /** Stessa ora ma dimensione diversa: qualcosa non torna, e va detto. */
  | 'diverso'

/** Quanto possono discostarsi due date prima di chiamarle diverse. */
export const TOLLERANZA_MS = 2000

export function confronta(qui: LatoFile, la: LatoFile | undefined): Confronto {
  if (la === undefined) return 'solo-qui'
  // Due cartelle con lo stesso nome sono «la stessa cartella»: quello che c'è
  // dentro lo dice l'elenco, non una data che su una cartella non vuol dire
  // quasi niente.
  if (qui.cartella || la.cartella) return 'uguale'
  const scarto = qui.quando - la.quando
  if (Math.abs(scarto) <= TOLLERANZA_MS) {
    return qui.dimensione === la.dimensione ? 'uguale' : 'diverso'
  }
  return scarto > 0 ? 'piu-nuovo' : 'piu-vecchio'
}

/** Il confronto di un elenco intero contro l'altro, per nome. */
export function confrontaElenchi(
  qui: LatoFile[],
  la: LatoFile[]
): Map<string, Confronto> {
  const altri = new Map(la.map((v) => [v.nome, v]))
  return new Map(qui.map((v) => [v.nome, confronta(v, altri.get(v.nome))]))
}

/** Come si mostra, in una riga stretta: un segno, non una frase. */
export function segnoDi(c: Confronto): string {
  if (c === 'piu-nuovo') return '↑ più nuovo qui'
  if (c === 'piu-vecchio') return '↓ più nuovo di là'
  if (c === 'diverso') return '≠ diverso'
  if (c === 'uguale') return '= uguale'
  return ''
}
