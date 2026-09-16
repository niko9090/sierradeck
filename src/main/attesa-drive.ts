/**
 * Cosa fare di un lavoro con il Drive quando si sta per chiudere il programma
 * (per un aggiornamento o un riavvio), e come raccontarlo.
 *
 * Il 16 settembre «Installa e riavvia» non faceva niente: dietro c'era un
 * «Arrivo dal Drive» di 639 chat, e l'installazione lo aspettava in silenzio,
 * fino a dieci minuti, senza una riga sullo schermo. Le pressioni successive
 * venivano ignorate. Da qui due regole:
 *
 * - **un lavoro automatico si annulla**, non si aspetta: l'arrivo delle chat e
 *   il salvataggio ogni cinque minuti si rifanno da soli al giro dopo, e
 *   quello che avevano già portato resta (il manifesto impara solo alla fine,
 *   quindi al massimo si riscarica o si ricarica qualcosa). Un lavoro chiesto
 *   da chi usa il programma (Fondi, Ripristina) invece si lascia finire, ma
 *   dicendolo, con il numero dei file e la strada per annullarlo.
 * - **si dice sempre cosa si sta aspettando**, nella striscia, con la stessa
 *   fase `attendo` delle chat.
 *
 * Puro: niente Electron, si prova con vitest.
 */
import type { LavoroInCorso, TipoLavoro } from './cassaforte/lavoro-in-corso'
import { ETICHETTA_LAVORO } from './cassaforte/lavoro-in-corso'

/** I lavori che partono da soli e si rifanno da soli: si possono annullare per uscire. */
export function lavoroAutomatico(tipo: TipoLavoro): boolean {
  return tipo === 'arrivo' || tipo === 'salvataggio'
}

/** Quanto si aspetta al massimo: poco per un lavoro annullato, dieci minuti per uno voluto. */
export function attesaMassimaMs(tipo: TipoLavoro): number {
  return lavoroAutomatico(tipo) ? 90_000 : 10 * 60_000
}

/**
 * La frase da mettere dopo «Aspetto che finisca …, poi installo».
 *
 * Con i numeri quando ci sono («312 di 639 file»), e la strada: se l'abbiamo
 * annullato noi lo si dice, altrimenti si indica il fumetto da cui annullarlo.
 */
export function descriviAttesaDrive(l: LavoroInCorso): string {
  const nome = `«${ETICHETTA_LAVORO[l.tipo]}»`
  const conto = l.fatto !== undefined && l.totale !== undefined && l.totale > 0
    ? ` (${l.fatto} di ${l.totale} ${l.unita === 'byte' ? 'byte' : 'file'})`
    : ''
  const coda = l.annullamento
    ? 'l’ho annullato, si ferma appena finisce il file in corso'
    : lavoroAutomatico(l.tipo)
      ? 'lo annullo'
      : 'puoi annullarlo dal fumetto in basso a destra'
  return `il lavoro con il Drive ${nome}${conto}: ${coda}`
}

/** Perché non si è installato, quando il lavoro non finisce entro il tetto. */
export function percheNonFinito(l: LavoroInCorso): string {
  const tetto = lavoroAutomatico(l.tipo) ? 'un minuto e mezzo' : 'dieci minuti'
  return `il lavoro con il Drive «${ETICHETTA_LAVORO[l.tipo]}» non si è fermato in ${tetto}. Annullalo dal fumetto in basso a destra e riprova.`
}
