package it.ferrariconsulenze.sierradeck.nucleo

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * I messaggi che non si sono potuti mettere in coda: per casella, il motivo da
 * dire all'utente («Non inviato: …»). Il testo resta nella casella/bozza, quindi
 * «Riprova» basta rimandare quello. Si pulisce da solo al primo invio riuscito.
 */
class ErroriInvio {
    private val _motivi = MutableStateFlow<Map<String, String>>(emptyMap())
    val motivi: StateFlow<Map<String, String>> = _motivi.asStateFlow()

    fun segna(casella: String, motivo: String) { _motivi.value = _motivi.value + (casella to motivo) }
    fun togli(casella: String) { if (casella in _motivi.value) _motivi.value = _motivi.value - casella }

    companion object {
        /** Quello dell'app: uno solo, le schermate lo leggono per casella. */
        val unico = ErroriInvio()
    }
}

object MessaInCoda {
    const val CODA_NON_PRONTA = "l’app si sta avviando"
    const val TELEFONO_NON_PRONTO = "il telefono non è pronto"
    const val PC_IN_AGGIORNAMENTO = "il PC si sta aggiornando"
    const val NON_SALVATO = "non riesco a salvarlo sul telefono"

    /** La frase intera da mostrare, con il motivo. */
    fun frase(motivo: String) = "Non inviato: $motivo"

    /** Il motivo per cui non si può partire, o null se si può. */
    fun motivo(codaPronta: Boolean, telefonoPronto: Boolean, aggiornando: Boolean = false): String? = when {
        !codaPronta -> CODA_NON_PRONTA
        !telefonoPronto -> TELEFONO_NON_PRONTO
        aggiornando -> PC_IN_AGGIORNAMENTO
        else -> null
    }

    /**
     * Prova a mettere in coda: se non si può, o se la messa in coda lancia un
     * errore (disco pieno…), lo segna in [errori] e dà false. Mai silenzio.
     */
    fun tenta(
        errori: ErroriInvio, casella: String,
        codaPronta: Boolean, telefonoPronto: Boolean, aggiornando: Boolean = false,
        metti: () -> Unit
    ): Boolean {
        val m = motivo(codaPronta, telefonoPronto, aggiornando)
        if (m != null) { errori.segna(casella, m); return false }
        try { metti() } catch (e: Exception) { errori.segna(casella, NON_SALVATO); return false }
        errori.togli(casella)
        return true
    }
}
