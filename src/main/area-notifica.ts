import { APP_NAME } from '@shared/version'

/** Cosa fare quando si preme la X di una finestra. */
export type AzioneChiusura = 'nascondi' | 'chiudi'

export type VoceArea =
  | { tipo: 'comando'; etichetta: string; azione: 'apri' | 'esci' }
  | { tipo: 'separatore' }

/**
 * Chiudere la finestra non è dire «smetti».
 *
 * Gli autopiloti stanno lavorando, e la X in alto a destra è il gesto con cui
 * si toglie di mezzo una finestra, non quello con cui si spegne un programma.
 * Il programma continua nell'area di notifica, e da lì lo si chiude davvero.
 *
 * `areaDisponibile` non è una formalità: se l'icona non è stata creata —
 * risorsa mancante, un sistema che non ne vuole sapere — nascondere la finestra
 * lascerebbe un programma vivo, invisibile e irraggiungibile, che si chiude
 * solo dal Task Manager. In quel caso la X torna a chiudere: meglio perdere il
 * comportamento nuovo che intrappolare chi lo usa.
 *
 * `inUscita` è l'uscita vera, quella chiesta dal menu dell'area: da lì in poi
 * ogni finestra deve poter chiudersi, altrimenti il programma non uscirebbe
 * mai.
 */
export function decidiChiusura(p: { inUscita: boolean; areaDisponibile: boolean }): AzioneChiusura {
  if (p.inUscita || !p.areaDisponibile) return 'chiudi'
  return 'nascondi'
}

/**
 * Il menu del tasto destro sull'icona.
 *
 * Due voci e un separatore. La prima dice la verità su cosa succederà —
 * «mostra» quando la finestra c'è ed è solo nascosta, «apri» quando non c'è
 * più nessuna finestra da mostrare — e l'ultima è l'uscita vera, che da qui in
 * poi è l'**unico** modo di chiudere davvero il programma: se sparisse, non
 * resterebbe nessuna strada che non passi dal Task Manager.
 */
export function vociArea(p: { finestreNascoste: number }): VoceArea[] {
  return [
    {
      tipo: 'comando',
      etichetta: p.finestreNascoste > 0 ? `Mostra ${APP_NAME}` : `Apri ${APP_NAME}`,
      azione: 'apri'
    },
    { tipo: 'separatore' },
    { tipo: 'comando', etichetta: `Esci da ${APP_NAME}`, azione: 'esci' }
  ]
}

/**
 * Il testo che compare passandoci sopra col mouse.
 *
 * Dice la cosa che chi ha appena chiuso la finestra si sta chiedendo: sta
 * ancora lavorando? Il numero degli autopiloti risponde meglio di qualunque
 * frase, e quando sono zero la frase non serve.
 */
export function suggerimentoArea(p: { autopilotiAlLavoro: number }): string {
  if (p.autopilotiAlLavoro === 1) return `${APP_NAME} — 1 autopilota al lavoro`
  if (p.autopilotiAlLavoro > 1) return `${APP_NAME} — ${p.autopilotiAlLavoro} autopiloti al lavoro`
  return `${APP_NAME} — in funzione`
}
