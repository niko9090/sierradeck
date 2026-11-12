import type { Preferenze } from '@shared/preferenze'

/** L'avviso breve quando il disco non ha accettato le preferenze (la scelta vale, il file si riscrive da solo). */
export const TESTO_PREFERENZE_NON_SALVATE = 'Preferenze non salvate sul disco: riprovo da solo'
export const EVENTO_PREFERENZE_NON_SALVATE = 'sierradeck:preferenze-non-salvate'

type ApiPreferenze = {
  leggi: () => Promise<Preferenze>
  imposta: (p: Preferenze) => Promise<{ preferenze: Preferenze; salvato: boolean }>
}

/** Chiede al fumetto in App di mostrare l'avviso. */
export function segnalaPreferenzeNonSalvate(): void {
  window.dispatchEvent(new CustomEvent(EVENTO_PREFERENZE_NON_SALVATE))
}

/**
 * Rilegge le preferenze, applica la modifica e le salva. Con l'esito «non
 * salvato» fa comparire l'avviso (la scelta vale comunque: il PC la tiene in
 * memoria e riprova). Non rifiuta mai: se il PC non risponde lo scrive nel
 * registro del renderer e restituisce `false`.
 */
export async function salvaPreferenze(
  modifica: (p: Preferenze) => Preferenze,
  api: ApiPreferenze = window.gestore.preferenze,
  segnala: () => void = segnalaPreferenzeNonSalvate
): Promise<boolean> {
  try {
    const esito = await api.imposta(modifica(await api.leggi()))
    if (!esito.salvato) segnala()
    return esito.salvato
  } catch (err) {
    console.warn('[preferenze] il salvataggio non ha avuto risposta:', err)
    return false
  }
}
