import type { EsitoPreferenze, ImpostazioniStore } from './impostazioni-store'
import type { Preferenze } from '@shared/preferenze'

/**
 * Il corpo del gestore IPC `preferenze:imposta`.
 *
 * Non solleva mai: se il disco rifiuta, lo store tiene il valore in memoria e
 * riprova da solo (l'errore è già nel registro, una volta). Chi chiama riceve
 * l'esito per dirlo all'utente; la scelta vale comunque, quindi `suCambiate`
 * parte sempre col valore in memoria.
 */
export function impostaPreferenzeIpc(
  store: Pick<ImpostazioniStore, 'impostaPreferenze' | 'preferenze'>,
  raw: unknown,
  suCambiate: (nuove: Preferenze) => void
): EsitoPreferenze {
  let esito: EsitoPreferenze
  try {
    esito = store.impostaPreferenze(raw)
  } catch (err) {
    // Non dovrebbe succedere (lo store non solleva): se succede, una riga sola.
    console.warn('[impostazioni] salvataggio delle preferenze non riuscito:', err)
    esito = { preferenze: store.preferenze(), salvato: false }
  }
  suCambiate(esito.preferenze)
  return esito
}
