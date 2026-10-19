package it.ferrariconsulenze.sierradeck

import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first

/**
 * L'app è davanti agli occhi o no (2.80.0).
 *
 * I controlli delle schermate (chat ogni 2 s, domande, autopiloti, consumi…)
 * sono `LaunchedEffect`, che non sanno niente dello schermo spento: con l'app
 * dietro continuavano a chiedere al PC una o due volte al secondo, e la
 * batteria pagava. Solo `/api/stato` rallentava (vedi `PolsoApp`). Le notizie
 * da annunciare passano comunque da `/api/stato` e dalla guardia, non da qui.
 *
 * Lo imposta `MainActivity` (onStart/onStop).
 */
object Davanti {
    private val stato = MutableStateFlow(true)

    val adesso: Boolean get() = stato.value

    fun imposta(davanti: Boolean) { stato.value = davanti }

    /** Il passo di un controllo che serve solo a chi guarda: aspetta `ms`, poi, se l'app è dietro, finché torna davanti. */
    suspend fun pausa(ms: Long) {
        delay(ms)
        stato.first { it }
    }
}
