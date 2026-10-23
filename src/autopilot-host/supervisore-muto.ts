import type { Interrogazione } from './supervisore'
import { rigaAllarme, type SupervisoreMuto } from '@shared/indicatore-autopilota'

export { rigaAllarme, type SupervisoreMuto }

/**
 * Il supervisore muto (0.85.1).
 *
 * Il 23/10 il supervisore è fallito 239 volte in un giorno, 124 di fila, con
 * «spawn ENAMETOOLONG», e nessuno lo vedeva: ogni chiamata ripiegava in
 * silenzio sulla sua strada di riserva, e da fuori si vedevano solo blocchi e
 * domande sbagliate. Qui si contano i fallimenti **di fila**: dal terzo c'è un
 * allarme, con il motivo, che l'indicatore mostra e il registro tiene. Una
 * risposta buona lo spegne.
 */
export const ALLARME_DOPO = 3

/** Il motivo in una riga corta: dell'errore conta la prima frase. */
export function motivoBreve(err: unknown): string {
  const testo = err instanceof Error ? err.message : String(err)
  const riga = testo.replace(/^interrogazione del supervisore fallita:\s*/, '').split('\n')[0]!.trim()
  return riga.length > 160 ? `${riga.slice(0, 159)}…` : riga
}

export function conAllarme(
  interroga: Interrogazione,
  adesso: () => string,
  /** Chiamata una volta, quando i fallimenti di fila arrivano a `ALLARME_DOPO`. */
  allarme: (stato: SupervisoreMuto) => void
): { interroga: Interrogazione; stato: () => SupervisoreMuto | undefined } {
  let volte = 0
  let motivo = ''
  let dal = ''
  return {
    interroga: async (...args) => {
      try {
        const r = await interroga(...args)
        volte = 0
        return r
      } catch (err) {
        if (volte === 0) dal = adesso()
        volte += 1
        motivo = motivoBreve(err)
        if (volte === ALLARME_DOPO) allarme({ volte, motivo, dal })
        throw err
      }
    },
    stato: () => (volte >= ALLARME_DOPO ? { volte, motivo, dal } : undefined)
  }
}
