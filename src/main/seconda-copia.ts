/**
 * Una seconda copia del programma è stata lanciata: cosa fare con le finestre.
 *
 * Fino alla 0.120.1 la risposta era sempre «apri un'altra finestra», e su un
 * portatile si aprivano **sempre due** SierraDeck. Il giro, letto nel codice:
 *
 * 1. la X dell'ultima finestra la **nasconde** nell'area di notifica (il
 *    programma resta vivo, la finestra pure);
 * 2. un doppio clic sul collegamento lancia una seconda copia, e la prima apriva
 *    una finestra **nuova** accanto a quella nascosta;
 * 3. il numero delle finestre vive (2) finisce in `workspaces.json`, e da lì ogni
 *    avvio — anche il riavvio dopo un aggiornamento — ne riapre due.
 *
 * Adesso «un'altra finestra» resta solo quando è chiaramente voluta: tutte le
 * finestre sono già a schermo, il programma è in piedi da un po', e il lancio non
 * viene da un riavvio o da un aggiornamento. Negli altri casi si mostra quello
 * che c'è.
 */

/** Entro questi secondi dall'avvio un secondo lancio è un doppio clic o un rilancio, non una richiesta. */
export const SECONDI_DI_GRAZIA = 20

/**
 * I segni lasciati da chi rilancia il programma da sé.
 *
 * `--updated` lo mette l'installer di electron-builder quando riapre dopo
 * un'installazione; `--riavvio` lo mettiamo noi in `app.relaunch`, `--aggiornato`
 * SierraDeck Update quando riapre la versione nuova.
 */
export const SEGNI_DI_RILANCIO = ['--updated', '--riavvio', '--aggiornato'] as const

export type AzioneSecondaCopia = 'nuova' | 'mostra' | 'niente'

export interface SecondaCopia {
  /** L'argv della seconda copia, così come Electron lo consegna. */
  argv: readonly string[]
  /** Secondi da quando è partito questo processo. */
  secondiDaAvvio: number
  /** Le finestre di avvio sono già state aperte? Prima, ci pensa l'avvio. */
  avvioFinito: boolean
  /** Finestre di chat vive. */
  finestre: number
  /** Quante di quelle sono nascoste o ridotte a icona. */
  nonAVista: number
}

/** Solo i nomi dei flag: niente percorsi, niente valori (`--x=…` diventa `--x`). */
export function flagDi(argv: readonly string[]): string[] {
  return argv
    .filter((a) => a.startsWith('--'))
    .map((a) => a.split('=')[0]!)
}

export function decidiSecondaCopia(p: SecondaCopia): { azione: AzioneSecondaCopia; perche: string } {
  // Mentre si aprono le finestre salvate, una in più sarebbe una di troppo.
  if (!p.avvioFinito) return { azione: 'niente', perche: 'avvio in corso: le finestre le apre l avvio' }
  if (p.finestre === 0) return { azione: 'nuova', perche: 'nessuna finestra aperta' }
  if (p.nonAVista > 0) return { azione: 'mostra', perche: 'c e una finestra nascosta o ridotta a icona' }
  const flag = flagDi(p.argv)
  const segno = SEGNI_DI_RILANCIO.find((s) => flag.includes(s))
  if (segno !== undefined) return { azione: 'mostra', perche: `lancio con ${segno}` }
  if (p.secondiDaAvvio < SECONDI_DI_GRAZIA) return { azione: 'mostra', perche: `entro ${SECONDI_DI_GRAZIA} s dall avvio` }
  return { azione: 'nuova', perche: 'finestre tutte a schermo: ne vuoi un altra' }
}

/** La riga del registro: abbastanza per capire la causa la prossima volta, senza percorsi. */
export function rigaSecondaCopia(p: SecondaCopia, esito: { azione: AzioneSecondaCopia; perche: string }): string {
  const flag = flagDi(p.argv)
  return `[finestre] seconda copia lanciata (argv: ${flag.length > 0 ? flag.join(' ') : 'nessun flag'}, da avvio ${Math.round(p.secondiDaAvvio)} s, finestre ${p.finestre}, non a vista ${p.nonAVista}): ${esito.azione} — ${esito.perche}`
}
