import type { EsitoAzioni } from '@shared/gestione-chat'
import { RECUPERO_AUTOPILOTA_ORE } from '@shared/gestione-chat'
import type { RichiestaAzione } from './gestione-chat'

/**
 * **Agente finito** (0.84.0; P2, 30/10): l'autopilota ha chiuso una chat che
 * ha finito. Qui la sua conversazione esce dall'elenco con «Elimina dal PC»
 * della gestione delle chat — sempre `cancellaSicura`, sempre con la voce nel
 * registro del recupero (così l'arrivo dal Drive sa che l'hai tolta tu):
 * - **unita** (il suo lavoro è nel principale): esce subito dal recupero, cioè
 *   si cancella. Quello che va ricordato è nel quaderno.
 * - **abbandonata** o fallita (e le consegne di prima della P2, senza `fine`):
 *   resta nel recupero **72 ore**, e si rimette con «Ripristina».
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
  /** Svuota dal recupero le voci scadute (la gestione delle chat, `giro`): per la chat unita, subito. */
  svuotaScadute?: () => Promise<void>
}

/** Il motivo che dice «non c'è niente da fare qui»: non si riprova. */
const SENZA_FILE = /non ha file su questo PC|vive su «/

export async function nelRecuperoQuandoChiusa(
  sessione: string,
  deps: DipendenzeAgenteFinito,
  opz: { tentativi?: number; passoMs?: number; fine?: 'unita' | 'abbandonata' } = {}
): Promise<{ ok: boolean; motivo?: string }> {
  const tentativi = opz.tentativi ?? TENTATIVI_RECUPERO
  const unita = opz.fine === 'unita'
  let motivo: string | undefined
  for (let i = 0; i < tentativi; i++) {
    if (i > 0) await deps.attendi(opz.passoMs ?? PASSO_RECUPERO_MS)
    let e: EsitoAzioni
    try {
      e = await deps.azione({
        azione: 'elimina', sessioni: [sessione],
        da: unita ? 'autopilota: unita, si elimina' : 'autopilota: abbandonata',
        scadenzaOre: unita ? 0 : RECUPERO_AUTOPILOTA_ORE
      })
    } catch (err) {
      motivo = err instanceof Error ? err.message : String(err)
      continue
    }
    const mia = e.esiti.find((x) => x.sessione === sessione)
    if (mia?.ok === true) {
      if (unita) {
        try { await deps.svuotaScadute?.() } catch (err) { deps.log(`[agente finito] ${sessione.slice(0, 8)}: svuotamento rimandato al prossimo giro (${err instanceof Error ? err.message : String(err)})`) }
        deps.log(`[agente finito] ${sessione.slice(0, 8)}: il lavoro è unito, la conversazione è eliminata`)
      } else {
        deps.log(`[agente finito] ${sessione.slice(0, 8)}: conversazione nel recupero per ${RECUPERO_AUTOPILOTA_ORE} ore`)
      }
      return { ok: true }
    }
    motivo = mia?.motivo ?? e.messaggio
    if (SENZA_FILE.test(motivo)) break
  }
  deps.log(`[agente finito] ${sessione.slice(0, 8)}: non si toglie (${motivo ?? 'motivo sconosciuto'}), resta fra le chiuse`)
  return { ok: false, ...(motivo !== undefined ? { motivo } : {}) }
}
