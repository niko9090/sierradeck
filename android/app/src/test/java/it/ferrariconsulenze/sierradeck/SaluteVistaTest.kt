package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Test

/** PC 0.70: la Salute a gruppi, con la parola di ogni voce. */
class SaluteVistaTest {
    private val voci = listOf(
        VoceSalute(chiave = "drive", gruppo = "drive", tono = "guasto", titolo = "Drive scollegato", stato = StatoVistaDrive("scollegato", "scollegato", "rosso")),
        VoceSalute(chiave = "pc:x", gruppo = "pc", tono = "ok", titolo = "PORTATILE"),
        VoceSalute(chiave = "e", gruppo = "errori", tono = "attenzione", titolo = "errore")
    )

    @Test
    fun `gruppi, conti e parola`() {
        assertEquals(mapOf("sistemare" to 2, "computer" to 1, "drive" to 1, "errori" to 1, "tutto" to 3), SaluteVista.conti(voci))
        assertEquals("sistemare", SaluteVista.iniziale(voci))
        assertEquals("scollegato" to "rosso", SaluteVista.parola(voci[0]))
        // Un PC di prima: la parola dal tono.
        assertEquals("a posto" to "verde", SaluteVista.parola(voci[1]))
    }
}
