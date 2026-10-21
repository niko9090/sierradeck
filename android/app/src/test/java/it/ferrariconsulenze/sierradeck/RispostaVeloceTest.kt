package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 0.84.0: rispondendo dalla notifica, la domanda intera resta visibile con la
 * risposta sotto, come nella conversazione su PC, pagina e app.
 */
class RispostaVeloceTest {

    @Test
    fun `la domanda intera sta sopra la risposta`() {
        val domanda = "«App Android» ti chiede:\n\nMando la mappa adesso o dopo le foto?\n\nLe scelte:\n• adesso (consigliata) → la mando subito"
        val t = RispostaVeloce.testoDopoRisposta("  $domanda\n", " adesso ")
        assertEquals("$domanda\n\nHai risposto: adesso", t)
    }

    @Test
    fun `una domanda lunga non si taglia`() {
        val lunga = (1..200).joinToString("\n") { "riga $it della domanda" }
        val t = RispostaVeloce.testoDopoRisposta(lunga, "sì")
        assertTrue(t.startsWith(lunga))
        assertTrue(t.endsWith("Hai risposto: sì"))
    }
}
