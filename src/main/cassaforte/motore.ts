/**
 * Il progresso dei lavori con il Drive (caricare, scaricare, ripristinare),
 * per l'interfaccia.
 *
 * Qui c'era il motore a blocco unico (`caricaStato` / `ripristinaStato`):
 * dalla sincronizzazione incrementale non lo chiamava più nessuno, se non le
 * sue prove, e la 0.86.2 l'ha tolto. Resta il tipo del progresso, che usano
 * `incrementale.ts`, `lavoro.ts`, `sincronia.ts` e il main.
 */

/**
 * A che punto è un caricamento o un ripristino, per l'interfaccia. Le fasi con
 * `fatto`/`totale` hanno una percentuale vera (leggere/scrivere file); le altre —
 * comprimere, cifrare, la rete — sono passaggi singoli, si mostrano come «in
 * corso», non come una barra che finge di avanzare.
 */
export type Progresso =
  | { fase: 'raccolgo'; fatto: number; totale: number }
  | { fase: 'comprimo'; fatto?: number; totale?: number; unita?: UnitaProgresso }
  | { fase: 'cifro'; fatto?: number; totale?: number; unita?: UnitaProgresso }
  | { fase: 'carico'; fatto?: number; totale?: number; unita?: UnitaProgresso; dettaglio?: string; verso?: 'su' | 'giu'; caricati?: number; scaricati?: number; saltati?: number }
  | { fase: 'scarico'; fatto?: number; totale?: number; unita?: UnitaProgresso; dettaglio?: string; verso?: 'su' | 'giu' }
  | { fase: 'decifro'; fatto?: number; totale?: number; unita?: UnitaProgresso }
  | { fase: 'ripristino'; fatto: number; totale: number }

/**
 * In cosa sono contati `fatto` e `totale`.
 *
 * Il blocco unico di prima contava i **byte**, e il pannello li mostrava in
 * MB. La sincronizzazione incrementale conta i **file** — un file alla volta,
 * cifrato e caricato — e usava le stesse fasi: il pannello divideva «3 di 40
 * file» per un milione e scriveva «0,0 MB / 0,0 MB» con la barra che
 * avanzava. Senza l'unita' non c'e' modo di distinguere i due casi.
 */
export type UnitaProgresso = 'byte' | 'file'
