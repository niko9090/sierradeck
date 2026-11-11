package it.ferrariconsulenze.sierradeck.rete

import java.io.IOException

/**
 * Com'è andata una chiamata al PC (11/11): un valore, mai un'eccezione per le
 * cose che capitano davvero. Prima ogni schermata aveva il suo `catch` e
 * metà ingoiava tutto, compreso «questa rotta su quel PC non c'è».
 *
 * - [Riuscito]: il PC ha risposto bene.
 * - [Rifiuto]: il PC ha risposto di no, col suo motivo; 401 = non riconosce più
 *   questo telefono.
 * - [MancaSulPc]: la rotta su quel PC non c'è, è più vecchio; si dice con la
 *   versione invece di mostrare un vuoto.
 * - [Rete]: nessuna risposta (spento, rete sbagliata, troppo lento).
 */
sealed interface Esito<out T> {
    data class Riuscito<T>(val valore: T) : Esito<T>

    data class Rifiuto(val codice: Int, val motivo: String, val corpo: String = "") : Esito<Nothing> {
        /** Il PC non riconosce più la chiave di questo telefono. */
        val chiaveRifiutata: Boolean get() = codice == 401
    }

    data class MancaSulPc(val rotta: String, val versionePc: String? = null) : Esito<Nothing> {
        val motivo: String get() = if (versionePc.isNullOrBlank()) "Su quel computer questa cosa non c'è ancora: va aggiornato."
        else "Su quel computer (versione $versionePc) questa cosa non c'è ancora: va aggiornato."
    }

    data class Rete(val motivo: String) : Esito<Nothing>
}

inline fun <T, R> Esito<T>.mappa(f: (T) -> R): Esito<R> = when (this) {
    is Esito.Riuscito -> Esito.Riuscito(f(valore))
    is Esito.Rifiuto -> this
    is Esito.MancaSulPc -> this
    is Esito.Rete -> this
}

fun <T> Esito<T>.valoreONull(): T? = (this as? Esito.Riuscito)?.valore

/** La frase per lo schermo, se non è riuscita. */
fun Esito<*>.motivo(): String? = when (this) {
    is Esito.Riuscito -> null
    is Esito.Rifiuto -> motivo
    is Esito.MancaSulPc -> motivo
    is Esito.Rete -> motivo
}

/**
 * Per il codice di prima, che ragiona a eccezioni (`Api`, le schermate vecchie):
 * le stesse eccezioni di sempre, così i loro `catch` restano veri.
 */
fun <T> Esito<T>.oLancia(): T = when (this) {
    is Esito.Riuscito -> valore
    is Esito.Rifiuto -> throw Api.Errore(codice, corpo.ifBlank { motivo })
    is Esito.MancaSulPc -> throw Api.Errore(404, "{\"errore\":\"non trovato\",\"rotta\":\"$rotta\"}")
    is Esito.Rete -> throw IOException(motivo)
}
