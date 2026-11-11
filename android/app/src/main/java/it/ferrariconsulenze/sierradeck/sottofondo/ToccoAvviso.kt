package it.ferrariconsulenze.sierradeck.sottofondo

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import it.ferrariconsulenze.sierradeck.schermate.radice.Richiesta

/**
 * GUSCIO (ramo m-app-schermate): l'interfaccia minima del tocco su una
 * notifica. Quello vero sta nel ramo delle notifiche (m-app-notifiche), che
 * all'unione sostituisce questo file.
 */
object ToccoAvviso {
    var richiesta by mutableStateOf<Richiesta?>(null)

    /** Prende la richiesta e la toglie, così non si ripete. */
    fun prendi(): Richiesta? = richiesta.also { richiesta = null }
}
