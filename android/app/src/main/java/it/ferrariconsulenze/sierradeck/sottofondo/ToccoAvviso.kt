package it.ferrariconsulenze.sierradeck.sottofondo

import android.content.Intent
import it.ferrariconsulenze.sierradeck.schermate.radice.Richiesta
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Il tocco su una notifica d'avviso: dove portare. MainActivity lo legge
 * dall'intento ([daIntento]) e lo lascia qui; chi tiene la navigazione lo
 * prende con [prendi] e apre il posto (`RadiceViewModel.verso(Richiesta)`).
 */
object ToccoAvviso {
    private val _richiesta = MutableStateFlow<Richiesta?>(null)
    val richiesta: StateFlow<Richiesta?> = _richiesta.asStateFlow()

    /** La destinazione dagli extra dell'intento, o null se non viene da un avviso. */
    fun daIntento(intent: Intent?): Destinazione? {
        val cosa = intent?.getStringExtra(Avvisatore.EXTRA_COSA) ?: return null
        return RegoleAvvisi.destinazione(cosa, intent.getStringExtra(Avvisatore.EXTRA_ID), intent.getStringExtra(Avvisatore.EXTRA_AUTOPILOTA))
    }

    /** La richiesta per la navigazione (null per i file: hanno la loro voce, senza dettaglio). */
    fun richiestaDi(d: Destinazione): Richiesta? = when (d) {
        is Destinazione.Domanda -> Richiesta.Domanda(d.id)
        is Destinazione.Chat -> Richiesta.Chat(d.id)
        is Destinazione.Autopilota -> Richiesta.Autopilota(d.id)
        Destinazione.Lavori -> Richiesta.Lavori
        Destinazione.Aggiornamenti -> Richiesta.Aggiornamenti
        Destinazione.File -> null
    }

    fun chiedi(r: Richiesta?) { _richiesta.value = r }

    /** La prende chi apre il posto: una volta sola. */
    fun prendi(): Richiesta? = _richiesta.value.also { _richiesta.value = null }
}
