package it.ferrariconsulenze.sierradeck

import it.ferrariconsulenze.sierradeck.nucleo.AggiornamentoRemoto
import it.ferrariconsulenze.sierradeck.nucleo.PcRemoto
import it.ferrariconsulenze.sierradeck.nucleo.StatoPcVista
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Test

/** Le parole dell'elenco «Computer»: come sul PC (acceso, spento, in aggiornamento). */
class StatoPcVistaTest {
    private val adesso = 1_700_000_000_000L
    private fun aggiorna(da: Long) = buildJsonObject { put("versione", "0.110.0"); put("da", da) }

    @Test
    fun `acceso e spento`() {
        val acceso = StatoPcVista.parola(PcRemoto(pcId = "a", vivo = true), adesso)
        assertEquals("acceso" to StatoPcVista.Colore.VERDE, acceso.testo to acceso.colore)
        val spento = StatoPcVista.parola(PcRemoto(pcId = "b", vivo = false, battito = "2026-11-01T10:00:00Z"), adesso)
        assertEquals(StatoPcVista.Colore.QUIETO, spento.colore)
        assertEquals("spento, ultimo segno 2026-11-01 10:00", spento.testo)
    }

    @Test
    fun `chi si aggiorna non e spento`() {
        val p = PcRemoto(pcId = "c", vivo = false, versione = "0.109.0", aggiornando = aggiorna(adesso - 60_000))
        val x = StatoPcVista.parola(p, adesso)
        assertEquals(AggiornamentoRemoto.TESTO, x.testo)
        assertEquals(StatoPcVista.Colore.BLU, x.colore)
        // Scaduto: torna spento.
        val vecchio = p.copy(aggiornando = aggiorna(adesso - 20 * 60_000))
        assertEquals(StatoPcVista.Colore.QUIETO, StatoPcVista.parola(vecchio, adesso).colore)
        // Battito fresco: resta acceso.
        assertEquals("acceso", StatoPcVista.parola(p.copy(vivo = true), adesso).testo)
    }
}
