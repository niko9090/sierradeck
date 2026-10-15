package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * 2.73.0: la lista degli autopiloti chiara e uguale al PC. Un autopilota «al
 * lavoro» con una domanda aperta è «aspetta te» (la vista del PC): in alto
 * nell'elenco e contato fra chi aspetta, non fra chi lavora.
 */
class ElencoAutopilotiTest {
    private fun ap(id: String, stato: String, vista: String? = null) =
        AutopilotaBreve(id = id, stato = stato, vista = vista?.let { VistaAutopilotaApp(stato = StatoVistaDrive(id = it, parola = it)) })

    @Test
    fun `l'ordine segue la vista del PC quando c'è`() {
        val lista = listOf(ap("finito", "finito"), ap("lavora", "lavoro", "al-lavoro"), ap("chiede", "lavoro", "aspetta"), ap("vecchio", "attesa"))
        assertEquals(listOf("chiede", "vecchio", "lavora", "finito"), lista.sortedBy { urgenzaAp(it) }.map { it.id })
    }

    @Test
    fun `il riassunto conta la domanda aperta fra chi aspetta`() {
        assertEquals("1 aspetta una risposta · 1 al lavoro", riassuntoLavori(listOf(ap("a", "lavoro", "aspetta"), ap("b", "lavoro", "al-lavoro"))))
    }

    @Test
    fun `le parole sono quelle del PC`() {
        assertEquals("pronto", statoInParole("pronto"))
        assertEquals("guasto", statoInParole("fallito"))
    }
}
