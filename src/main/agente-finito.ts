import type { EsitoAzioni } from '@shared/gestione-chat'
import type { RichiestaAzione } from './gestione-chat'

/**
 * **Agente finito** (0.84.0): l'autopilota ha chiuso una chat che ha fatto il
 * suo compito e il cui ramo è unito o tolto. Qui la sua conversazione esce
 * dall'elenco e va nel recupero di 30 giorni, con «Elimina dal PC» della
 * gestione delle chat: sempre `cancellaSicura`, mai cancellata subito, e si
 * rimette con «Ripristina».
 *
 * La chiusura del riquadro arriva alla finestra un attimo dopo: finché la
 * gestione risponde che la chat è ancora aperta, si riprova. Le stesse regole
 * della gestione valgono anche qui: una chat che lavora, che chiede, o che
 * vive su un altro PC non si tocca.
 */

/** Quante volte si riprova, e ogni quanto: un minuto in tutto. */
export const TENTATIVI_RECUPERO = 12
export const PASSO_RECUPERO_MS = 5000

export type DipendenzeAgenteFinito = {
  azione: (r: RichiestaAzione) => Promise<EsitoAzioni>
  attendi: (ms: number) => Promise<void>
  log: (riga: string) => void
}

/** Il motivo che dice «non c'è niente da fare qui»: non si riprova. */
const SENZA_FILE = /non ha file su questo PC|vive su «/

export async function nelRecuperoQuandoChiusa(
  sessione: string,
  deps: DipendenzeAgenteFinito,
  opz: { tentativi?: number; passoMs?: number } = {}
): Promise<{ ok: boolean; motivo?: string }> {
  const tentativi = opz.tentativi ?? TENTATIVI_RECUPERO
  let motivo: string | undefined
  for (let i = 0; i < tentativi; i++) {
    if (i > 0) await deps.attendi(opz.passoMs ?? PASSO_RECUPERO_MS)
    let e: EsitoAzioni
    try {
      e = await deps.azione({ azione: 'elimina', sessioni: [sessione], da: 'autopilota: aveva finito' })
    } catch (err) {
      motivo = err instanceof Error ? err.message : String(err)
      continue
    }
    const mia = e.esiti.find((x) => x.sessione === sessione)
    if (mia?.ok === true) {
      deps.log(`[agente finito] ${sessione.slice(0, 8)}: conversazione nel recupero per 30 giorni`)
      return { ok: true }
    }
    motivo = mia?.motivo ?? e.messaggio
    if (SENZA_FILE.test(motivo)) break
  }
  deps.log(`[agente finito] ${sessione.slice(0, 8)}: non va nel recupero (${motivo ?? 'motivo sconosciuto'}), resta fra le chiuse`)
  return { ok: false, ...(motivo !== undefined ? { motivo } : {}) }
}
