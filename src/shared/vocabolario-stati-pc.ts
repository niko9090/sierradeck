/**
 * Il vocabolario unico degli stati di un PC: una parola italiana, un colore e
 * la classe del led per ciascuno. Le liste dei PC (altri computer, salute,
 * posta, riquadro remoto) lo usano tutte, così lo stesso stato ha sempre la
 * stessa parola e lo stesso colore.
 *
 * Le chiavi sono quelle di `statoPc` (stato-pc.ts: dal battito) e di
 * `titoloDopoIlBussare` (scoperta-pc.ts: dopo il bussare). Le soglie non stanno
 * qui: vengono solo da stato-pc.ts.
 *
 * Puro: nessun orologio, nessuna rete.
 */
import { TESTO_IN_AGGIORNAMENTO } from './aggiornamento-remoto'

export type ChiaveStatoPc =
  | 'acceso' | 'spento' | 'in-aggiornamento' | 'da-rimuovere'
  | 'non-so' | 'irraggiungibile' | 'chiave' | 'rifiutato' | 'altro' | 'senza-indirizzi' | 'versione-vecchia' | 'solo-aiutante'

export type ColoreStatoPc = 'verde' | 'ambra' | 'rosso' | 'blu' | 'quieto'

export type VoceStatoPc = {
  /** La parola italiana per chi guarda l'elenco. */
  etichetta: string
  colore: ColoreStatoPc
  /** La classe del led nelle liste (`led led--lavoro`…). */
  led: 'led--lavoro' | 'led--attesa' | 'led--fermo' | 'led--finito'
  /** Una classe per lo stato (`stato-pc--acceso`), per chi vuole colorare altro. */
  classe: string
  /** Vero se il PC è raggiungibile per lavorare (acceso, anche solo con l'Aiutante). */
  vivo: boolean
}

const voce = (etichetta: string, colore: ColoreStatoPc, led: VoceStatoPc['led'], chiave: ChiaveStatoPc, vivo = false): VoceStatoPc => ({
  etichetta, colore, led, classe: `stato-pc--${chiave}`, vivo
})

export const STATI_PC: Readonly<Record<ChiaveStatoPc, VoceStatoPc>> = {
  'acceso': voce('acceso', 'verde', 'led--lavoro', 'acceso', true),
  'spento': voce('spento', 'quieto', 'led--finito', 'spento'),
  'in-aggiornamento': voce(TESTO_IN_AGGIORNAMENTO, 'blu', 'led--attesa', 'in-aggiornamento'),
  'da-rimuovere': voce('da rimuovere', 'rosso', 'led--finito', 'da-rimuovere'),
  'non-so': voce('non so se è acceso', 'ambra', 'led--attesa', 'non-so'),
  'irraggiungibile': voce('acceso, ma non risponde', 'ambra', 'led--attesa', 'irraggiungibile'),
  'chiave': voce('non riconosce la chiave', 'rosso', 'led--fermo', 'chiave'),
  'rifiutato': voce('rifiuta questo indirizzo', 'rosso', 'led--fermo', 'rifiutato'),
  'altro': voce('non è più a quell’indirizzo', 'ambra', 'led--attesa', 'altro'),
  'senza-indirizzi': voce('indirizzo sconosciuto', 'ambra', 'led--attesa', 'senza-indirizzi'),
  'versione-vecchia': voce('versione troppo vecchia', 'ambra', 'led--attesa', 'versione-vecchia', true),
  'solo-aiutante': voce('acceso, lavora solo l’Aiutante', 'verde', 'led--lavoro', 'solo-aiutante', true)
}

/** La voce di uno stato; una chiave che non si conosce vale «non so se è acceso». */
export function vocePc(stato: string): VoceStatoPc {
  return (STATI_PC as Record<string, VoceStatoPc | undefined>)[stato] ?? STATI_PC['non-so']
}

/** La parola di uno stato: `etichettaStatoPc('da-rimuovere')` → «da rimuovere». */
export function etichettaStatoPc(stato: string): string {
  return vocePc(stato).etichetta
}
