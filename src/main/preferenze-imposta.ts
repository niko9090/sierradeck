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

/**
 * Manda alle finestre le preferenze nuove. Solo `Preferenze`, mai l'esito del
 * salvataggio: il 12/11 quattro punti mandavano `{ preferenze, salvato }` e
 * l'interfaccia crollava («reading 'includes'» su `workspaceElenco`) appena si
 * eliminava o rinominava un workspace.
 */
export function mandaPreferenze(
  finestre: readonly { isDestroyed(): boolean; webContents: { isDestroyed(): boolean; send(canale: string, ...a: unknown[]): void } }[],
  p: Preferenze
): void {
  for (const w of finestre) if (!w.isDestroyed() && !w.webContents.isDestroyed()) w.webContents.send('preferenze:cambiate', p)
}
