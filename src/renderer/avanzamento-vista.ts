import type { Avanzamento } from '@shared/types'

export type VistaAvanzamento = {
  /** Che cosa sta succedendo, in parole. */
  titolo: string
  /** Da 0 a 100, oppure assente quando non si sa ancora quanto c'è da fare. */
  percento: number | undefined
  /** «50 di 200»: la percentuale da sola non dice quanto manca davvero. */
  conteggio: string | undefined
  /** Il progetto che si sta leggendo: dice che il lavoro avanza. */
  dove: string | undefined
  /** Una riga in più, quando c'è qualcosa da aggiungere. */
  dettaglio: string | undefined
}

/**
 * L'avanzamento in parole e numeri da mostrare.
 *
 * Il primo avvio dura minuti — 776 MB di trascrizioni da leggere — e un'attesa
 * senza numeri non si distingue da un programma bloccato. Gli avvii successivi
 * durano un istante perché quasi tutto viene ripreso dall'indice, e dirlo con
 * le stesse parole della prima volta darebbe l'idea sbagliata di quello che sta
 * succedendo.
 */
export function descriviAvanzamento(a: Avanzamento): VistaAvanzamento {
  const percento =
    a.total <= 0 ? undefined : Math.max(0, Math.min(100, Math.round((a.done / a.total) * 100)))

  const titolo =
    a.fase === 'scansione'
      ? 'Cerco le conversazioni'
      : a.fase === 'pulizia'
        ? 'Tolgo le conversazioni sparite'
        : a.fase === 'fine'
          ? 'Pronto'
          : // Se ne sono già state riprese dall'indice, questa non è la prima
            // lettura: è un aggiornamento, e dura un istante.
            a.riusate > 0
            ? 'Aggiorno l’elenco'
            : 'Leggo le conversazioni'

  const pezzi = (a.progetto ?? '').split(/[\\/]/).filter((x) => x.trim() !== '')

  return {
    titolo,
    percento,
    conteggio: a.total > 0 ? `${a.done} di ${a.total}` : undefined,
    dove: pezzi.at(-1),
    dettaglio: a.riusate > 0 ? `${a.riusate} già note` : undefined
  }
}
