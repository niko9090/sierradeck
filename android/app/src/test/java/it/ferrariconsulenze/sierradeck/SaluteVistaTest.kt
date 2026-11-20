package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Test
import it.ferrariconsulenze.sierradeck.nucleo.StatoVistaDrive
import it.ferrariconsulenze.sierradeck.schermate.altro.SaluteVista
import it.ferrariconsulenze.sierradeck.schermate.altro.VoceSalute
import it.ferrariconsulenze.sierradeck.nucleo.chiave

/** PC 0.70: la Salute a gruppi, con la parola di ogni voce. */
class SaluteVistaTest {
    private val voci = listOf(
        VoceSalute(chiave = "drive", gruppo = "drive", tono = "guasto", titolo = "Drive scollegato", stato = StatoVistaDrive("scollegato", "scollegato", "rosso")),
        VoceSalute(chiave = "pc:x", gruppo = "pc", tono = "ok", titolo = "PORTATILE"),
        VoceSalute(chiave = "e", gruppo = "errori", tono = "attenzione", titolo = "errore")
    )

    @Test
    fun `gruppi, conti e parola`() {
        // I PC non stanno in Salute: hanno la voce Computer.
        val senza = SaluteVista.senzaPc(voci)
        assertEquals(2, senza.size)
        assertEquals(mapOf("sistemare" to 2, "drive" to 1, "errori" to 1, "tutto" to 2), SaluteVista.conti(senza))
        assertEquals("sistemare", SaluteVista.iniziale(senza))
        assertEquals("scollegato" to "rosso", SaluteVista.parola(voci[0]))
        // Un PC di prima: la parola dal tono.
        assertEquals("a posto" to "verde", SaluteVista.parola(voci[1]))
    }
}
