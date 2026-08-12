import type { LayoutSalvato } from '@shared/workspace'

export type CodaLayout = {
  /**
   * Mette un layout in attesa della prossima finestra che si aprirà.
   *
   * `finestreDiAllora` sono gli id delle finestre già aperte in questo momento:
   * a loro il layout non spetta. Senza, una finestra esistente che si ricarica
   * — Ctrl+R, o un renderer che riparte — chiederebbe il proprio layout e si
   * ritroverebbe dentro le chat destinate alla finestra nuova, in doppio.
   */
  accoda: (layout: LayoutSalvato, adesso: number, finestreDiAllora?: number[]) => void
  /** Lo consegna alla finestra che lo chiede, una volta sola. */
  preleva: (adesso: number, finestraId?: number) => LayoutSalvato | undefined
}

/**
 * Quanto un layout resta in attesa di una finestra.
 *
 * Le finestre di un ripristino si aprono nel giro di un secondo. Oltre questo,
 * un layout ancora in coda vuol dire che qualcosa è andato storto — e la
 * prossima finestra che l'utente apre a mano non deve ritrovarsi dentro le chat
 * di un ripristino di cui non sa niente.
 */
const VALIDITA_MS = 15_000

/**
 * I layout che aspettano la finestra a cui appartengono.
 *
 * Ripristinare un salvataggio con più finestre vuol dire aprirle: ognuna, appena
 * pronta, chiede al Core il proprio layout — è già il modo in cui una finestra
 * ritrova le sue chat all'avvio — e trova qui quello che le spetta. La coda
 * evita un canale in più verso il renderer e, soprattutto, evita di dover
 * indovinare *quando* una finestra è pronta a riceverlo.
 */
export function creaCodaLayout(validitaMs = VALIDITA_MS): CodaLayout {
  const attesa: { layout: LayoutSalvato; scadeIl: number; escluse: Set<number> }[] = []

  return {
    accoda(layout, adesso, finestreDiAllora) {
      attesa.push({
        layout,
        scadeIl: adesso + validitaMs,
        escluse: new Set(finestreDiAllora ?? [])
      })
    },
    preleva(adesso, finestraId) {
      // Gli scaduti si buttano man mano, senza fermare quelli buoni dietro.
      // Una finestra che c'era già lascia la coda com'è: il layout non è suo, e
      // toglierlo dalla fila lo farebbe sparire per la finestra a cui spetta.
      for (let i = 0; i < attesa.length; i += 1) {
        const voce = attesa[i]
        if (voce === undefined) continue
        if (voce.scadeIl <= adesso) {
          attesa.splice(i, 1)
          i -= 1
          continue
        }
        if (finestraId !== undefined && voce.escluse.has(finestraId)) return undefined
        attesa.splice(i, 1)
        return voce.layout
      }
      return undefined
    }
  }
}
