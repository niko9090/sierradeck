package it.ferrariconsulenze.sierradeck

import it.ferrariconsulenze.sierradeck.sottofondo.Avvisi
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Un giro della ronda (PC senza /api/eventi): il primo avviso suona, il vicino no. */
class RondaSuonoTest {
    @Test fun `due avvisi ravvicinati nello stesso giro il secondo non suona`() {
        var ultimo: Long? = null
        val (primo, u1) = Avvisi.decidiSuono(ultimo, 1_000_000L)
        ultimo = u1
        assertTrue(primo)
        assertEquals(1_000_000L, ultimo)
        val (secondo, u2) = Avvisi.decidiSuono(ultimo, 1_005_000L)
        ultimo = u2
        assertFalse(secondo)
        assertEquals(1_000_000L, ultimo)
        val (terzo, _) = Avvisi.decidiSuono(ultimo, 1_021_000L)
        assertTrue(terzo)
    }
}
