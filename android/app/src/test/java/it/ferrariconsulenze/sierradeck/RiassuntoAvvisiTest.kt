package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Test

/** Gli avvisi raggruppati (0.43.0): il riassunto della pila. */
class RiassuntoAvvisiTest {
    @Test
    fun `il riassunto conta e elenca, al massimo cinque titoli`() {
        assertEquals("3 cose aspettano te" to listOf("a", "b", "c"), riassuntoAvvisi(listOf("a", "b", "c")))
        val sette = riassuntoAvvisi((1..7).map { "chat $it" })
        assertEquals("7 cose aspettano te", sette.first)
        assertEquals(listOf("chat 1", "chat 2", "chat 3", "chat 4", "chat 5", "e altre 2"), sette.second)
    }
}
