package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** «I PC girano lenti» (12/10): con l'app dietro, lo stato si chiede ogni 15 secondi invece di 2. */
class PolsoAppTest {
    @Test
    fun `davanti sempre, dietro ogni 15 secondi`() {
        assertTrue(PolsoApp.tocca(true, 1_000, 2_000))
        assertFalse(PolsoApp.tocca(false, 1_000, 3_000))
        assertTrue(PolsoApp.tocca(false, 1_000, 16_000))
    }
}
